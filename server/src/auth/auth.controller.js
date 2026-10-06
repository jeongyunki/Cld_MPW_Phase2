// 요청/응답 처리만 담당한다. 로그인·세션 처리는 middleware/auth.js가 하고, 여기서는 아무것도 import하지 않는다.

// 로그인 본문 검사 — email/password가 비어 있지 않은 문자열인지 확인한다.
// Express 5에서는 JSON이 아닌 요청이면 req.body가 undefined이므로 ?? {}로 막는다.
function validateLoginBody(req, res, next) {
	const { email, password } = req.body ?? {};
	if (typeof email !== 'string' || !email || typeof password !== 'string' || !password) {
		return res.status(400).json({ error: { message: '이메일과 비밀번호를 입력해 주세요' } });
	}
	next();
}

// 로그인 성공 / 내 정보 조회 — passport가 세션에서 복원한 req.user를 그대로 응답한다.
function sendCurrentUser(req, res) {
	res.json(req.user);
}

function sendLogoutSuccess(req, res) {
	res.json({ success: true });
}

module.exports = { validateLoginBody, sendCurrentUser, sendLogoutSuccess };
