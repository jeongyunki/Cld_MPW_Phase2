// master_items 초기 데이터 — 프론트 src/lib/masterStore.svelte.js의 초기값을 그대로 옮긴 것이다.
// sort_order는 그 배열 안의 순서(index)다.
// field_name은 DB 규칙(snake_case)에 맞춰 chipSize → chip_size, pkgType → pkg_type으로 쓴다.
//
// `npx knex seed:run`으로 실행한다. 매번 전부 지우고 다시 넣으므로 여러 번 실행해도 중복되지 않는다.

const ITEMS = {
	status: ['new', 'checked', 'approved', 'requested'],
	category: [
		'조립비 (Package)',
		'개발비 (Design Charge)',
		'개발비 (PCB Tooling)',
		'산학',
		'Sawing'
	],
	assembler: ['Amkor (광주)', 'chippac(영종도)', '조립처3', '조립처4', '조립처5'],
	chip_size: ['8인치', '12인치', 'ETC'],
	pkg_type: ['p-type1', 'p-type2', 'p-type3']
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
	const rows = Object.entries(ITEMS).flatMap(([fieldName, names]) =>
		names.map((itemName, index) => ({
			field_name: fieldName,
			item_name: itemName,
			sort_order: index
		}))
	);

	await knex('master_items').del();
	await knex('master_items').insert(rows);
};
