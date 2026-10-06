// 인증 비즈니스 로직 — 비밀번호 비교는 여기서만 한다 (bcryptjs).
// 호출 시점에 authRepository.xxx로 꺼내 쓰는 이유: 테스트에서 함수를 갈아끼우기 쉽도록.

const bcrypt = require('bcryptjs');
const authRepository = require('./auth.repository');

// 이메일/비밀번호가 맞으면 user, 아니면 null.
// 없는 이메일과 틀린 비밀번호를 구분하지 않는다 (어느 쪽이 틀렸는지 알려주지 않기 위해).
async function verifyCredentials(email, password) {
	const found = await authRepository.findByEmail(email);
	if (!found || !found.passwordHash) return null;
	return (await bcrypt.compare(password, found.passwordHash)) ? found.user : null;
}

async function findUserById(id) {
	return authRepository.findById(id);
}

module.exports = { verifyCredentials, findUserById };
