// 일반 사용자(role: 'user') 테스트 계정 1명 — server/.env의 TEST_USER_EMAIL / TEST_USER_PASSWORD /
// TEST_USER_NAME으로 만든다. 비관리자 권한 UI(예: Master Page 추가/삭제 비활성화) 확인용이다.
// 비밀번호는 bcrypt 해시로만 저장한다.
//
// `npx knex seed:run --specific=03_test_user.js`로 실행한다.
// 관리자 seed와 달리 값이 비어 있으면 에러 없이 건너뛴다 — 운영 환경에서는 .env에 넣지 않으면
// 테스트 계정이 생기지 않는다. 이메일이 같으면 갱신(upsert)하는 방식은 02_admin_user.js와 같다.

const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function (knex) {
	const { TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_USER_NAME } = process.env;
	if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD || !TEST_USER_NAME) {
		console.log('TEST_USER_* 값이 없어 테스트 계정 seed를 건너뜁니다');
		return;
	}

	const passwordHash = await bcrypt.hash(TEST_USER_PASSWORD, 10);
	await knex('users')
		.insert({
			name: TEST_USER_NAME,
			email: TEST_USER_EMAIL,
			password_hash: passwordHash,
			role: 'user'
		})
		.onConflict('email')
		.merge({
			name: TEST_USER_NAME,
			password_hash: passwordHash,
			role: 'user',
			updated_at: knex.fn.now()
		});
};
