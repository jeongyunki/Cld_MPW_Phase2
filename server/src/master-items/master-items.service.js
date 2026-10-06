// Master 항목 비즈니스 로직 — 중복 검사, 정렬 순번 계산, 삭제 영향 건수 계산.
// 업무 규칙 위반(404/409)은 status를 붙인 Error를 던진다. errorHandler가 4xx 메시지를 그대로 응답한다.

const masterItemsRepository = require('./master-items.repository');

// API에서 허용하는 fieldName 5개 (controller도 입력 검사에 사용)
const FIELD_NAMES = ['status', 'category', 'assembler', 'chipSize', 'pkgType'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND_MESSAGE = 'Master 항목을 찾을 수 없습니다';
const DUPLICATE_MESSAGE = '같은 필드에 이미 등록된 항목입니다';

// 전체 항목을 fieldName별 "서랍"에 나눠 담는다. 항목이 없는 필드도 빈 서랍([])으로 항상 포함한다.
async function listGrouped() {
	const items = await masterItemsRepository.findAll();
	const grouped = Object.fromEntries(FIELD_NAMES.map((f) => [f, []]));
	for (const item of items) {
		grouped[item.fieldName].push(item);
	}
	return grouped;
}

// 항목 추가. (fieldName, itemName)은 controller에서 검증·trim을 마친 값이다.
async function createItem(fieldName, itemName) {
	if (await masterItemsRepository.findByFieldAndName(fieldName, itemName)) {
		throw Object.assign(new Error(DUPLICATE_MESSAGE), { status: 409 });
	}
	// 새 항목은 해당 필드의 맨 뒤에 붙인다 (비어 있으면 0번부터)
	const max = await masterItemsRepository.findMaxSortOrder(fieldName);
	return masterItemsRepository.insert({
		fieldName,
		itemName,
		sortOrder: max === null ? 0 : max + 1
	});
}

// 항목 삭제. 이미 Plan에서 쓰는 값이어도 막지 않고, 영향받는 Plan 행 수를 알려준다.
async function deleteItem(id) {
	// uuid 모양이 아니면 DB에 물어보기 전에 "없음"으로 처리 (DB가 형식 오류로 500을 내지 않도록)
	if (!UUID_PATTERN.test(id)) {
		throw Object.assign(new Error(NOT_FOUND_MESSAGE), { status: 404 });
	}
	const item = await masterItemsRepository.findById(id);
	if (!item) {
		throw Object.assign(new Error(NOT_FOUND_MESSAGE), { status: 404 });
	}
	const count = await masterItemsRepository.countPlansUsing(item.fieldName, item.itemName);
	await masterItemsRepository.deleteById(item.id);
	return { id: item.id, affectedImgagongPlanCount: count };
}

module.exports = { FIELD_NAMES, listGrouped, createItem, deleteItem };
