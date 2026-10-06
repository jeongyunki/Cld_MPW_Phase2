// 초기 스키마 migration — database/schema.sql(참고용 DDL)을 Knex 코드로 그대로 옮긴 것이다.
// 스키마를 새로 설계하지 않는다. 컬럼/타입/제약/인덱스 이름은 schema.sql과 1:1로 맞춘다.
//
// Knex migration은 up()(적용)과 down()(되돌리기) 한 쌍으로 이루어진다.
// (Git 커밋과 revert의 관계와 비슷하다 — `knex migrate:latest`가 up을, `knex migrate:rollback`이 down을 실행)
//
// 주의: Knex의 timestamp()는 PostgreSQL에서 기본이 timestamptz라서,
// schema.sql의 `timestamp`(타임존 없음)와 맞추려고 { useTz: false }를 붙인다.
//
// updated_at 자동 갱신 트리거(schema.sql 맨 아래 "선택사항")는 넣지 않는다.
// 이유: BE-5에서 PATCH 성공 시 service가 version+1과 함께 updated_at/updated_by를 직접 갱신하기로
// 이미 정했으므로(docs/7 BE-5), 트리거까지 두면 같은 일을 두 곳에서 하게 된다(오버엔지니어링 금지).

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
	// gen_random_uuid()를 쓰기 위한 extension
	await knex.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');

	const uuidPk = (table) => table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

	// 모든 테이블 공통 컬럼: created_at / updated_at / version(낙관적 잠금)
	const auditColumns = (table) => {
		table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.raw('now()'));
		table.timestamp('updated_at', { useTz: false });
		table.integer('version').notNullable().defaultTo(1);
	};

	await knex.schema.createTable('users', (table) => {
		uuidPk(table);
		table.string('name', 255);
		table.string('email', 255);
		table.string('password_hash', 255);
		table.string('role', 50);
		auditColumns(table);
		table.unique(['email'], { indexName: 'users_email_key' });
	});

	await knex.schema.createTable('deliverables', (table) => {
		uuidPk(table);
		table.string('mpw_round', 255);
		table.string('process_name', 255);
		table.string('file_path', 1024);
		table
			.uuid('registered_by')
			.references('id')
			.inTable('users')
			.onDelete('SET NULL')
			.withKeyName('deliverables_registered_by_fkey');
		auditColumns(table);
		table.index(['mpw_round', 'process_name'], 'idx_deliverables_mpw_round_process_name');
	});

	await knex.schema.createTable('imgagong_plans', (table) => {
		uuidPk(table);
		table.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.raw('now()'));
		table.string('status', 50);
		table.string('category', 255).notNullable();
		table.string('assembler', 255).notNullable();
		table.string('chip_size', 255).notNullable();
		table.string('module', 255);
		table.string('project_name', 255);
		table.string('gcm_code', 255);
		table.string('pkg_type', 255).notNullable();
		table.string('customer', 255);
		table.integer('lot_count');
		table.integer('pkg_qty');
		table.string('owner', 255).notNullable();
		table
			.uuid('updated_by')
			.references('id')
			.inTable('users')
			.onDelete('SET NULL')
			.withKeyName('imgagong_plans_updated_by_fkey');
		table.timestamp('updated_at', { useTz: false });
		table.integer('version').notNullable().defaultTo(1);
		table.index(['created_at'], 'idx_imgagong_plans_created_at');
	});

	await knex.schema.createTable('master_items', (table) => {
		uuidPk(table);
		table.string('field_name', 50);
		table.string('item_name', 255);
		table.integer('sort_order');
		auditColumns(table);
		table.index(['field_name'], 'idx_master_items_field_name');
	});
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
	// up()의 역순: 테이블(FK로 users를 참조하는 쪽 먼저) → extension
	await knex.schema.dropTableIfExists('master_items');
	await knex.schema.dropTableIfExists('imgagong_plans');
	await knex.schema.dropTableIfExists('deliverables');
	await knex.schema.dropTableIfExists('users');
	await knex.raw('DROP EXTENSION IF EXISTS pgcrypto');
};
