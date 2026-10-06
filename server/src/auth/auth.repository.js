// users 테이블 조회 (Knex). DB 컬럼명(snake_case) → API 필드명(camelCase) 변환은 이 계층에서만 한다.
// 비밀번호 해시는 로그인 검증에만 쓰므로 user 객체에는 넣지 않고 따로 돌려준다.

const db = require('../db/connection');

// DB 행 → API 응답용 User. password_hash는 일부러 매핑하지 않는다 (응답에 새어 나가면 안 됨).
function toUser(row) {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		role: row.role,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		version: row.version
	};
}

// 로그인용: 이메일로 찾아 { user, passwordHash }를 돌려준다. 없으면 null.
async function findByEmail(email) {
	const row = await db('users').where({ email }).first();
	if (!row) return null;
	return { user: toUser(row), passwordHash: row.password_hash };
}

// 세션 복원용: id로 찾아 user만 돌려준다. 없으면 null.
async function findById(id) {
	const row = await db('users').where({ id }).first();
	return row ? toUser(row) : null;
}

module.exports = { toUser, findByEmail, findById };
