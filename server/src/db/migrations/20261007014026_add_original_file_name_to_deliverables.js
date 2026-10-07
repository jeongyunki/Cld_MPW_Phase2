// deliverables에 업로드한 원본 파일명 컬럼을 추가한다 (BE-4).
// 서버 디스크에는 `{id}.xlsx`처럼 id로만 저장하므로(경로 조작 방지), 사용자가 올린 이름은 여기에 따로 보관하고
// 다운로드할 때 파일명으로 돌려준다. 기존 행에는 값이 없으므로 nullable이다.
// (이미 적용된 초기 migration은 수정하지 않고, 이렇게 새 migration으로 컬럼을 덧붙인다)

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
	await knex.schema.alterTable('deliverables', (table) => {
		table.string('original_file_name', 255);
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
	await knex.schema.alterTable('deliverables', (table) => {
		table.dropColumn('original_file_name');
	});
};
