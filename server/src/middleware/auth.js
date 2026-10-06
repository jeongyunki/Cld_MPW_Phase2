// 인증/인가 설정을 한곳에 모은 파일 — passport 호출은 전부 여기서만 한다.
// 나중에 1차 시스템 인증으로 바꿀 때 이 파일(과 auth/)만 교체하면 된다.
// (SvelteKit의 hooks.server.js에서 locals.user를 채우는 것과 비슷한 역할)

const passport = require('passport');
const { Strategy: LocalStrategy } = require('passport-local');
// 구조분해하지 않는 이유: 테스트에서 authService.verifyCredentials를 갈아끼울 수 있도록.
const authService = require('../auth/auth.service');

const ADMIN_ROLE = 'admin';

// Local 전략 = 이메일 + 비밀번호 방식. 기본 필드명은 username이라 email로 바꿔 준다.
// done(null, user) = 성공, done(null, false) = 인증 실패, done(err) = 서버 에러.
passport.use(
	new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
		authService.verifyCredentials(email, password).then((user) => done(null, user || false), done);
	})
);

// serialize = 로그인 성공 시 세션에 user 전체가 아니라 id만 저장하는 것 (쿠키 → 세션 → id).
passport.serializeUser((user, done) => done(null, user.id));

// deserialize = 요청마다 세션의 id로 DB에서 user를 다시 읽어 req.user에 채운다.
// 사용자가 삭제됐으면 false → req.user가 비어 비로그인 취급된다.
passport.deserializeUser((id, done) => {
	authService.findUserById(id).then((user) => done(null, user || false), done);
});

// 로그인 처리 — 성공하면 req.login으로 세션을 만들고 다음 핸들러로 넘긴다.
// 실패 응답(401)을 직접 만들기 위해 passport.authenticate에 콜백을 쓴다.
function authenticateLocal(req, res, next) {
	passport.authenticate('local', (err, user) => {
		if (err) return next(err);
		if (!user) {
			return res
				.status(401)
				.json({ error: { message: '이메일 또는 비밀번호가 올바르지 않습니다' } });
		}
		req.login(user, (loginErr) => (loginErr ? next(loginErr) : next()));
	})(req, res, next);
}

// 로그아웃 처리 — 로그인 정보를 지우고, 세션 자체를 파기하고, 쿠키도 삭제한다.
function endSession(req, res, next) {
	req.logout((logoutErr) => {
		if (logoutErr) return next(logoutErr);
		req.session.destroy((destroyErr) => {
			if (destroyErr) return next(destroyErr);
			res.clearCookie('connect.sid');
			next();
		});
	});
}

// 로그인한 사용자만 통과 (React의 보호된 라우트 가드와 비슷)
function requireAuth(req, res, next) {
	if (!req.user) {
		return res.status(401).json({ error: { message: '로그인이 필요합니다' } });
	}
	next();
}

// 관리자만 통과. 단독으로 써도 비로그인은 401, 일반 사용자(role NULL 포함)는 403.
function requireAdmin(req, res, next) {
	if (!req.user) {
		return res.status(401).json({ error: { message: '로그인이 필요합니다' } });
	}
	if (req.user.role !== ADMIN_ROLE) {
		return res.status(403).json({ error: { message: '관리자 권한이 필요합니다' } });
	}
	next();
}

module.exports = { passport, authenticateLocal, endSession, requireAuth, requireAdmin };
