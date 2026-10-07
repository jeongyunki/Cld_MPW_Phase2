// 임가공 Plan DB 접근 — Knex 쿼리와 snake_case ↔ camelCase 변환만 담당한다.

const db = require('../db/connection');

// API 필드명(camelCase) → DB 컬럼명(snake_case)
const COLUMN_NAMES = {
	status: 'status',
	category: 'category',
	assembler: 'assembler',
	chipSize: 'chip_size',
	module: 'module',
	projectName: 'project_name',
	gcmCode: 'gcm_code',
	pkgType: 'pkg_type',
	customer: 'customer',
	lotCount: 'lot_count',
	pkgQty: 'pkg_qty',
	owner: 'owner'
};

// { chipSize: 'x' } → { chip_size: 'x' }
const toColumns = (fields) =>
	Object.fromEntries(Object.entries(fields).map(([key, value]) => [COLUMN_NAMES[key], value]));

// DB 행(snake_case) → API 응답(camelCase)
function toImgagongPlan(row) {
	return {
		id: row.id,
		createdAt: row.created_at,
		status: row.status,
		category: row.category,
		assembler: row.assembler,
		chipSize: row.chip_size,
		module: row.module,
		projectName: row.project_name,
		gcmCode: row.gcm_code,
		pkgType: row.pkg_type,
		customer: row.customer,
		lotCount: row.lot_count,
		pkgQty: row.pkg_qty,
		owner: row.owner,
		updatedBy: row.updated_by,
		updatedAt: row.updated_at,
		version: row.version
	};
}

// 기간 조건 [start 이상, end 미만]. 날짜는 'YYYY-MM-DD' 문자열 그대로 넘긴다(타임존 변환 방지).
function applyPeriod(query, { start, end }) {
	let q = query;
	if (start) q = q.where('created_at', '>=', start);
	if (end) q = q.where('created_at', '<', end);
	return q;
}

// 최신순. created_at이 같을 때도 순서가 흔들리지 않도록 id를 보조 정렬 키로 쓴다(페이지네이션 안정성).
async function findPage({ start, end, limit, offset }) {
	const rows = await applyPeriod(db('imgagong_plans'), { start, end })
		.orderBy([
			{ column: 'created_at', order: 'desc' },
			{ column: 'id', order: 'desc' }
		])
		.limit(limit)
		.offset(offset);
	return rows.map(toImgagongPlan);
}

// PostgreSQL의 count는 bigint라 문자열로 오므로 Number로 바꾼다.
async function countMatching({ start, end }) {
	const row = await applyPeriod(db('imgagong_plans'), { start, end }).count('* as count').first();
	return Number(row.count);
}

async function findById(id) {
	const row = await db('imgagong_plans').where({ id }).first();
	return row ? toImgagongPlan(row) : null;
}

// id·created_at·version은 DB 기본값에 맡긴다. returning('*')로 방금 만든 행을 한 번에 받는다.
async function insert(fields) {
	const [row] = await db('imgagong_plans').insert(toColumns(fields)).returning('*');
	return toImgagongPlan(row);
}

// 낙관적 잠금의 핵심: WHERE id = ? AND version = ? 와 "version = version + 1"을 한 번의 UPDATE로 실행한다.
// version이 이미 올라가 있으면 WHERE에 걸리는 행이 없어 0행이 갱신되고(returning이 빈 배열) null을 돌려준다.
// db.raw('version + 1')은 JS에서 계산하지 않고 DB가 현재 값에 1을 더하게 한다.
async function updateIfVersion(id, version, changes, updatedBy) {
	const [row] = await db('imgagong_plans')
		.where({ id, version })
		.update({
			...toColumns(changes),
			version: db.raw('version + 1'),
			updated_at: db.fn.now(),
			updated_by: updatedBy
		})
		.returning('*');
	return row ? toImgagongPlan(row) : null;
}

// 여러 행의 status를 한 번의 UPDATE로 바꾼다. WHERE status = fromStatus 때문에 조건에 안 맞는 행은 갱신되지 않고,
// returning에는 실제로 바뀐 행만 담긴다. version은 낙관적 잠금과 같은 방식으로 DB가 1 올린다.
async function updateStatusByIds(ids, fromStatus, toStatus, updatedBy) {
	const rows = await db('imgagong_plans')
		.whereIn('id', ids)
		.where({ status: fromStatus })
		.update({
			status: toStatus,
			version: db.raw('version + 1'),
			updated_at: db.fn.now(),
			updated_by: updatedBy
		})
		.returning('*');
	return rows.map(toImgagongPlan);
}

async function deleteById(id) {
	return db('imgagong_plans').where({ id }).del();
}

module.exports = {
	findPage,
	countMatching,
	findById,
	insert,
	updateIfVersion,
	updateStatusByIds,
	deleteById
};
