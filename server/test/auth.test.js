// BE-2 인증 API HTTP 수준 테스트 (node:test + supertest)
//
// 왜 DB를 가짜로 바꾸는가?
// - app.test.js와 같은 이유다. require.cache에 가짜 connection(fakeDb)을 미리 넣어 두면
//   auth.repository가 받는 db는 진짜 PostgreSQL이 아니라 아래의 fakeDb다.
// - fakeDb는 Knex 체인 db('users').where({...}).first() 모양만 흉내 낸다.
//   (repository의 Knex 호출 모양이 곧 이 테스트의 계약이다.)
//
// 왜 케이스마다 request.agent(app)인가?
// - 세션은 쿠키로 유지된다. agent는 브라우저처럼 쿠키를 저장해 다음 요청에 자동으로 실어 준다.
// - 케이스마다 새 agent를 만들어 서로의 로그인 상태가 섞이지 않게 한다.
// - beforeEach는 케이스마다 fakeDb 상태(rows, error)를 초기화한다. (React 테스트의 beforeEach와 같다)

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

// express-session은 secret이 없으면 모든 요청에서 500을 내므로, app을 require하기 전에 설정한다.
process.env.SESSION_SECRET = 'test-secret';

const PASSWORD = 'correct-password';
const HASH = bcrypt.hashSync(PASSWORD, 4); // 테스트라서 cost 4 (빠르게)
const ADMIN_ROW = {
	id: '11111111-1111-1111-1111-111111111111',
	name: '관리자',
	email: 'admin@test.local',
	password_hash: HASH,
	role: 'admin',
	created_at: '2026-10-06T00:00:00.000Z',
	updated_at: null,
	version: 1
};
const USER_ROW = {
	...ADMIN_ROW,
	id: '22222222-2222-2222-2222-222222222222',
	email: 'user@test.local',
	role: null
};
const NOHASH_ROW = {
	...ADMIN_ROW,
	id: '33333333-3333-3333-3333-333333333333',
	email: 'nohash@test.local',
	password_hash: null
};
const ADMIN_USER = {
	id: ADMIN_ROW.id,
	name: '관리자',
	email: 'admin@test.local',
	role: 'admin',
	createdAt: '2026-10-06T00:00:00.000Z',
	updatedAt: null,
	version: 1
};

const state = { rows: [], error: null };
const fakeDb = (table) => ({
	where: (cond) => ({
		first: async () => {
			if (state.error) throw state.error;
			assert.equal(table, 'users');
			return state.rows.find((r) => Object.keys(cond).every((k) => r[k] === cond[k]));
		}
	})
});
fakeDb.raw = async () => [];

const connectionPath = require.resolve('../src/db/connection');
require.cache[connectionPath] = {
	id: connectionPath,
	filename: connectionPath,
	loaded: true,
	exports: fakeDb
};
const app = require('../src/app');

beforeEach(() => {
	state.rows = [ADMIN_ROW, USER_ROW, NOHASH_ROW];
	state.error = null;
});

const BAD_REQUEST_BODY = { error: { message: '이메일과 비밀번호를 입력해 주세요' } };
const LOGIN_FAILED_BODY = { error: { message: '이메일 또는 비밀번호가 올바르지 않습니다' } };
const NEED_LOGIN_BODY = { error: { message: '로그인이 필요합니다' } };
const SERVER_ERROR_BODY = { error: { message: '서버 내부 오류가 발생했습니다' } };

const login = (agent, email = ADMIN_ROW.email, password = PASSWORD) =>
	agent.post('/api/auth/login').send({ email, password });

// ---------- 로그인 ----------

test('L1: 올바른 자격증명 로그인 — 200, 사용자 7개 키, 세션 쿠키(HttpOnly, Lax, 30분)', async () => {
	const res = await login(request.agent(app));
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, ADMIN_USER);
	assert.ok(!('passwordHash' in res.body));
	assert.ok(!('password_hash' in res.body));

	const cookie = res.headers['set-cookie'][0];
	assert.match(cookie, /^connect\.sid=/);
	assert.match(cookie, /HttpOnly/);
	assert.match(cookie, /SameSite=Lax/i);
	const expires = new Date(/Expires=([^;]+)/.exec(cookie)[1]).getTime();
	const diff = expires - Date.now();
	assert.ok(Math.abs(diff - 30 * 60 * 1000) < 60 * 1000, `Expires가 30분 후가 아님: ${diff}ms`);
});

test('L2: password만 보내면 — 400', async () => {
	const res = await request.agent(app).post('/api/auth/login').send({ password: PASSWORD });
	assert.equal(res.status, 400);
	assert.deepEqual(res.body, BAD_REQUEST_BODY);
});

test('L3: email만 보내면 — 400', async () => {
	const res = await request.agent(app).post('/api/auth/login').send({ email: ADMIN_ROW.email });
	assert.equal(res.status, 400);
	assert.deepEqual(res.body, BAD_REQUEST_BODY);
});

test('L4: body 없이 POST — 400', async () => {
	const res = await request.agent(app).post('/api/auth/login');
	assert.equal(res.status, 400);
	assert.deepEqual(res.body, BAD_REQUEST_BODY);
});

test('L5: email이 문자열이 아니면 — 400', async () => {
	const res = await request.agent(app).post('/api/auth/login').send({ email: 123, password: 'x' });
	assert.equal(res.status, 400);
	assert.deepEqual(res.body, BAD_REQUEST_BODY);
});

test('L6: 틀린 비밀번호 — 401, 쿠키 발급 없음', async () => {
	const res = await login(request.agent(app), ADMIN_ROW.email, 'wrong-password');
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, LOGIN_FAILED_BODY);
	assert.equal(res.headers['set-cookie'], undefined);
});

test('L7: 없는 이메일 — 401 (비밀번호 틀림과 같은 메시지)', async () => {
	const res = await login(request.agent(app), 'nobody@test.local');
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, LOGIN_FAILED_BODY);
});

test('L8: password_hash가 NULL인 계정 — 401', async () => {
	const res = await login(request.agent(app), NOHASH_ROW.email);
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, LOGIN_FAILED_BODY);
});

test('L9: DB 에러 — 500 공통 에러 형식', async (t) => {
	t.mock.method(console, 'error', () => {});
	state.error = new Error('db down');
	const res = await login(request.agent(app));
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});

// ---------- 현재 사용자 (me) ----------

test('M1: 로그인 후 me — 200 사용자, 세션 쿠키 갱신(rolling)', async () => {
	const agent = request.agent(app);
	await login(agent);
	const res = await agent.get('/api/auth/me');
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, ADMIN_USER);
	assert.ok(res.headers['set-cookie']);
});

test('M2: 쿠키 없이 me — 401', async () => {
	const res = await request.agent(app).get('/api/auth/me');
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
});

test('M3: 로그인 후 사용자가 삭제되면 me — 401', async () => {
	const agent = request.agent(app);
	await login(agent);
	state.rows = [];
	const res = await agent.get('/api/auth/me');
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
});

test('M4: 로그인 후 DB 에러가 나면 me — 500', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = request.agent(app);
	await login(agent);
	state.error = new Error('db down');
	const res = await agent.get('/api/auth/me');
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});

test('M5: 일반 사용자 로그인 후 me — 200, role null', async () => {
	const agent = request.agent(app);
	await login(agent, USER_ROW.email);
	const res = await agent.get('/api/auth/me');
	assert.equal(res.status, 200);
	assert.equal(res.body.email, USER_ROW.email);
	assert.equal(res.body.role, null);
});

// ---------- 로그아웃 ----------

test('O1: 로그아웃 — 200 {success:true}, 세션 쿠키 삭제', async () => {
	const agent = request.agent(app);
	await login(agent);
	const res = await agent.post('/api/auth/logout');
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { success: true });

	const cleared = res.headers['set-cookie'].find((c) => c.startsWith('connect.sid=;'));
	assert.ok(cleared, 'connect.sid 삭제 Set-Cookie가 없음');
	const expires = new Date(/Expires=([^;]+)/.exec(cleared)[1]).getTime();
	assert.ok(expires < Date.now(), 'Expires가 과거가 아님');
});

test('O2: 로그아웃 후 같은 agent로 me — 401', async () => {
	const agent = request.agent(app);
	await login(agent);
	await agent.post('/api/auth/logout');
	const res = await agent.get('/api/auth/me');
	assert.equal(res.status, 401);
});

test('O3: 로그아웃 후 옛 쿠키를 직접 실어 me — 401 (서버 세션이 파기됨)', async () => {
	const agent = request.agent(app);
	const loginRes = await login(agent);
	const oldCookie = loginRes.headers['set-cookie'][0].split(';')[0];
	await agent.post('/api/auth/logout');
	const res = await request(app).get('/api/auth/me').set('Cookie', oldCookie);
	assert.equal(res.status, 401);
});

test('O4: 쿠키 없이 로그아웃 — 401', async () => {
	const res = await request.agent(app).post('/api/auth/logout');
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
});
