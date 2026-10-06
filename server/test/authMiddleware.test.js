// BE-2 middleware/auth.js 단위 테스트 (node:test)
//
// HTTP 서버 없이 미들웨어 함수를 직접 호출한다.
// - req, res는 필요한 부분만 흉내 낸 가짜 객체, next는 t.mock.fn()으로 호출 기록을 남긴다.
// - middleware/auth.js는 auth.service → auth.repository → db/connection을 import하므로,
//   connection만 빈 객체로 바꿔 진짜 DB 연결이 만들어지지 않게 한다. (app.test.js와 같은 방식)
// - authService는 모듈 객체째로 import되어 있어 t.mock.method로 함수를 바꿔치기할 수 있다.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const connectionPath = require.resolve('../src/db/connection');
require.cache[connectionPath] = {
	id: connectionPath,
	filename: connectionPath,
	loaded: true,
	exports: {}
};
const auth = require('../src/middleware/auth');
const authService = require('../src/auth/auth.service');

// status/json/clearCookie 호출을 기록하는 가짜 res
function makeRes() {
	const res = { statusCode: null, body: null, cleared: [] };
	res.status = (code) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body) => {
		res.body = body;
		return res;
	};
	res.clearCookie = (name) => {
		res.cleared.push(name);
		return res;
	};
	return res;
}

const NEED_LOGIN = { error: { message: '로그인이 필요합니다' } };
const NEED_ADMIN = { error: { message: '관리자 권한이 필요합니다' } };

test('U1: requireAuth, 비로그인 — 401, next 호출 없음', (t) => {
	const res = makeRes();
	const next = t.mock.fn();
	auth.requireAuth({}, res, next);
	assert.equal(res.statusCode, 401);
	assert.deepEqual(res.body, NEED_LOGIN);
	assert.equal(next.mock.callCount(), 0);
});

test('U2: requireAuth, 로그인 — next() 1회, 인자 없음', (t) => {
	const res = makeRes();
	const next = t.mock.fn();
	auth.requireAuth({ user: { role: 'admin' } }, res, next);
	assert.equal(next.mock.callCount(), 1);
	assert.equal(next.mock.calls[0].arguments.length, 0);
	assert.equal(res.statusCode, null);
});

test('U3: requireAdmin, 비로그인 — 401', (t) => {
	const res = makeRes();
	const next = t.mock.fn();
	auth.requireAdmin({}, res, next);
	assert.equal(res.statusCode, 401);
	assert.deepEqual(res.body, NEED_LOGIN);
	assert.equal(next.mock.callCount(), 0);
});

test('U4: requireAdmin, role이 null — 403', (t) => {
	const res = makeRes();
	const next = t.mock.fn();
	auth.requireAdmin({ user: { role: null } }, res, next);
	assert.equal(res.statusCode, 403);
	assert.deepEqual(res.body, NEED_ADMIN);
	assert.equal(next.mock.callCount(), 0);
});

test('U5: requireAdmin, role이 user — 403', (t) => {
	const res = makeRes();
	const next = t.mock.fn();
	auth.requireAdmin({ user: { role: 'user' } }, res, next);
	assert.equal(res.statusCode, 403);
	assert.deepEqual(res.body, NEED_ADMIN);
	assert.equal(next.mock.callCount(), 0);
});

test('U6: requireAdmin, role이 admin — next() 1회, 인자 없음', (t) => {
	const res = makeRes();
	const next = t.mock.fn();
	auth.requireAdmin({ user: { role: 'admin' } }, res, next);
	assert.equal(next.mock.callCount(), 1);
	assert.equal(next.mock.calls[0].arguments.length, 0);
});

test('U7: endSession, req.logout 에러 — next(err), clearCookie 미호출', (t) => {
	const err = new Error('logout failed');
	const res = makeRes();
	const next = t.mock.fn();
	const req = { logout: (cb) => cb(err), session: { destroy: (cb) => cb() } };
	auth.endSession(req, res, next);
	assert.equal(next.mock.callCount(), 1);
	assert.equal(next.mock.calls[0].arguments[0], err);
	assert.deepEqual(res.cleared, []);
});

test('U8: endSession, session.destroy 에러 — next(err), clearCookie 미호출', (t) => {
	const err = new Error('destroy failed');
	const res = makeRes();
	const next = t.mock.fn();
	const req = { logout: (cb) => cb(), session: { destroy: (cb) => cb(err) } };
	auth.endSession(req, res, next);
	assert.equal(next.mock.callCount(), 1);
	assert.equal(next.mock.calls[0].arguments[0], err);
	assert.deepEqual(res.cleared, []);
});

test('U9: endSession 성공 — clearCookie("connect.sid") 후 next() 인자 없음', (t) => {
	const res = makeRes();
	const next = t.mock.fn();
	const req = { logout: (cb) => cb(), session: { destroy: (cb) => cb() } };
	auth.endSession(req, res, next);
	assert.deepEqual(res.cleared, ['connect.sid']);
	assert.equal(next.mock.callCount(), 1);
	assert.equal(next.mock.calls[0].arguments.length, 0);
});

test('U10: authenticateLocal, req.logIn 에러 — next(err)', async (t) => {
	const err = new Error('login failed');
	const user = { id: 'u1', role: 'admin' };
	t.mock.method(authService, 'verifyCredentials', async () => user);
	// next가 비동기로 호출되므로 Promise로 감싸 호출될 때까지 기다린다.
	const nextArgs = await new Promise((resolve) => {
		const logIn = (u, cb) => cb(err);
		// 계획의 req.login과 passport의 logIn 별칭 어느 쪽이든 동작하도록 둘 다 둔다.
		const req = { body: { email: 'a@test.local', password: 'pw' }, logIn, login: logIn };
		auth.authenticateLocal(req, makeRes(), (...args) => resolve(args));
	});
	assert.equal(nextArgs[0], err);
});
