// 관리자 계정 1명 — server/.env의 ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME으로 만든다.
// 비밀번호는 bcrypt 해시로만 저장한다.
//
// `npx knex seed:run --specific=02_admin_user.js`로 실행한다.
// users를 del()로 지우지 않는 이유: deliverables 등이 users를 FK로 참조하고 있어
// (삭제 시 SET NULL) 지우면 작성자 정보가 사라진다. 대신 이메일이 같으면 갱신(upsert)한다.
// 그래서 재실행하면 .env의 현재 값으로 관리자 계정이 맞춰진다.

const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
	const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
	if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_NAME) {
		throw new Error('server/.env에 ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME을 설정하세요');
	}

	const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
	await knex('users')
		.insert({ name: ADMIN_NAME, email: ADMIN_EMAIL, password_hash: passwordHash, role: 'admin' })
		.onConflict('email')
		.merge({
			name: ADMIN_NAME,
			password_hash: passwordHash,
			role: 'admin',
			updated_at: knex.fn.now()
		});
};
