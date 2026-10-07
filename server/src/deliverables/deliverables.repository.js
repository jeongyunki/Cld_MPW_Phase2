// Deliverables 데이터 접근 — Knex 쿼리와 snake_case → camelCase 변환만 담당한다.

const db = require('../db/connection');

// DB 행(snake_case) → API 응답 객체(camelCase)
function toDeliverable(row) {
	return {
		id: row.id,
		mpwRound: row.mpw_round,
		processName: row.process_name,
		originalFileName: row.original_file_name,
		filePath: row.file_path,
		registeredBy: row.registered_by,
		registeredByName: row.registered_by_name ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		version: row.version
	};
}

// LIKE에서 특별한 뜻을 갖는 문자(\ % _)를 앞에 \를 붙여 일반 문자로 만든다.
// 이걸 안 하면 검색어 "50%"의 %가 "아무 문자열"로 해석된다.
const toLikePattern = (search) => `%${search.replace(/[\\%_]/g, '\\$&')}%`;

// 검색어가 있으면 차수 또는 공정명에 (대소문자 무시) 포함된 행만 남긴다.
function applySearch(query, search) {
	if (!search) return query;
	const pattern = toLikePattern(search);
	return query
		.whereILike('deliverables.mpw_round', pattern)
		.orWhereILike('deliverables.process_name', pattern);
}

// 최신순 한 페이지. created_at이 같으면 id로 순서를 고정해 페이지가 겹치거나 빠지지 않게 한다.
// 등록자가 삭제됐어도 행은 남아야 하므로 leftJoin.
async function findPage({ search, limit, offset }) {
	const rows = await applySearch(
		db('deliverables')
			.leftJoin('users', 'deliverables.registered_by', 'users.id')
			.select('deliverables.*', 'users.name as registered_by_name'),
		search
	)
		.orderBy([
			{ column: 'deliverables.created_at', order: 'desc' },
			{ column: 'deliverables.id', order: 'desc' }
		])
		.limit(limit)
		.offset(offset);
	return rows.map(toDeliverable);
}

// 검색 조건에 맞는 전체 건수 (페이지 계산용)
async function countMatching(search) {
	const row = await applySearch(db('deliverables'), search).count('* as count').first();
	return Number(row.count); // PostgreSQL의 count는 문자열로 온다
}

async function findById(id) {
	const row = await db('deliverables')
		.leftJoin('users', 'deliverables.registered_by', 'users.id')
		.select('deliverables.*', 'users.name as registered_by_name')
		.where({ 'deliverables.id': id })
		.first();
	return row ? toDeliverable(row) : null;
}

// id는 service가 미리 만든다 (파일 이름 {id}.xlsx를 DB 저장보다 먼저 정해야 하므로)
async function insert({ id, mpwRound, processName, originalFileName, filePath, registeredBy }) {
	const [row] = await db('deliverables')
		.insert({
			id,
			mpw_round: mpwRound,
			process_name: processName,
			file_path: filePath,
			original_file_name: originalFileName,
			registered_by: registeredBy
		})
		.returning('*');
	return toDeliverable(row);
}

async function deleteById(id) {
	return db('deliverables').where({ id }).del();
}

module.exports = { findPage, countMatching, findById, insert, deleteById };
