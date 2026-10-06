// master_items 테이블(과 삭제 영향 계산용 imgagong_plans) 조회/변경 (Knex).
// DB 컬럼명(snake_case) → API 필드명(camelCase) 변환은 이 계층에서만 한다.

const db = require('../db/connection');

// "번역표": API의 fieldName → DB의 field_name (= imgagong_plans 컬럼명).
// 대부분 같지만 chipSize/pkgType만 snake_case로 달라진다.
const DB_FIELD_NAMES = {
	status: 'status',
	category: 'category',
	assembler: 'assembler',
	chipSize: 'chip_size',
	pkgType: 'pkg_type'
};
// 반대 방향 번역표 (DB → API). 위 표를 뒤집어서 만든다.
const API_FIELD_NAMES = Object.fromEntries(
	Object.entries(DB_FIELD_NAMES).map(([api, dbName]) => [dbName, api])
);

// DB 행 → API 응답용 MasterItem
function toMasterItem(row) {
	return {
		id: row.id,
		fieldName: API_FIELD_NAMES[row.field_name],
		itemName: row.item_name,
		sortOrder: row.sort_order,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		version: row.version
	};
}

// 전체 목록. 정렬 순서(sort_order, 같으면 만든 순)대로 돌려준다.
async function findAll() {
	const rows = await db('master_items').orderBy(['sort_order', 'created_at']);
	return rows.map(toMasterItem);
}

// id로 한 건 찾기. 없으면 null.
async function findById(id) {
	const row = await db('master_items').where({ id }).first();
	return row ? toMasterItem(row) : null;
}

// 같은 필드 안에 같은 이름이 이미 있는지 확인용. 없으면 null.
async function findByFieldAndName(fieldName, itemName) {
	const row = await db('master_items')
		.where({ field_name: DB_FIELD_NAMES[fieldName], item_name: itemName })
		.first();
	return row ? toMasterItem(row) : null;
}

// 필드 안에서 가장 큰 sort_order. 항목이 하나도 없으면 null.
async function findMaxSortOrder(fieldName) {
	const row = await db('master_items')
		.where({ field_name: DB_FIELD_NAMES[fieldName] })
		.max('sort_order as max')
		.first();
	return row.max;
}

// 새 항목 저장. id/created_at/version은 DB 기본값이 채운다.
async function insert({ fieldName, itemName, sortOrder }) {
	const [row] = await db('master_items')
		.insert({
			field_name: DB_FIELD_NAMES[fieldName],
			item_name: itemName,
			sort_order: sortOrder
		})
		.returning('*');
	return toMasterItem(row);
}

// 삭제. 지워진 행 수를 돌려준다.
async function deleteById(id) {
	return db('master_items').where({ id }).del();
}

// 이 항목 값을 쓰고 있는 임가공 Plan 행 수. 삭제해도 Plan 값은 그대로 남으므로 안내용 숫자다.
async function countPlansUsing(fieldName, itemName) {
	const row = await db('imgagong_plans')
		.where({ [DB_FIELD_NAMES[fieldName]]: itemName })
		.count('* as count')
		.first();
	// pg는 count를 문자열로 돌려주므로 숫자로 바꾼다
	return Number(row.count);
}

module.exports = {
	findAll,
	findById,
	findByFieldAndName,
	findMaxSortOrder,
	insert,
	deleteById,
	countPlansUsing
};
