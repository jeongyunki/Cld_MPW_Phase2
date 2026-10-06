// BE-1 app.js HTTP 수준 테스트 (node:test + supertest)
//
// 왜 DB를 가짜로 바꾸는가?
// - 이 테스트는 "Express 골격(라우팅, 404, 에러 처리, CORS)"을 검증하는 것이 목적이다.
// - 실제 PostgreSQL이 떠 있어야만 통과하는 테스트는 느리고, DB 상태에 따라 깨진다.
// - 그래서 DB 연결 모듈(src/db/connection.js)을 가짜 객체(fakeDb)로 바꿔치기한다.
//
// require.cache 대체 원리
// - Node의 require는 한 번 읽은 모듈을 require.cache[절대경로]에 저장해 두고 재사용한다.
// - app을 require하기 "전에" 그 자리에 가짜 모듈을 미리 넣어 두면,
//   이후 어디서 require('../db/connection')을 해도 진짜 파일 대신 fakeDb를 받는다.
// - React 테스트의 jest.mock('./connection')과 같은 역할이다. (순서가 중요: 반드시 app require 전)

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const fakeDb = { raw: async () => [] };
const connectionPath = require.resolve('../src/db/connection');
require.cache[connectionPath] = {
	id: connectionPath,
	filename: connectionPath,
	loaded: true,
	exports: fakeDb
};
// express-session은 secret이 없으면 모든 요청에서 500을 내므로, app을 require하기 전에 설정한다.
process.env.SESSION_SECRET = 'test-secret';
const app = require('../src/app');

const NOT_FOUND_BODY = { error: { message: '요청한 경로를 찾을 수 없습니다' } };
const ORIGIN = 'http://localhost:5173';

test('A1: health 정상 — 200 {status:"ok"}, raw("select 1") 1회 호출', async (t) => {
	const raw = t.mock.method(fakeDb, 'raw');
	const res = await request(app).get('/api/health');
	assert.equal(res.status, 200);
	assert.match(res.headers['content-type'], /json/);
	assert.deepEqual(res.body, { status: 'ok' });
	assert.equal(raw.mock.callCount(), 1);
	assert.equal(raw.mock.calls[0].arguments[0], 'select 1');
});

test('A2: health DB 실패 — 500 {status:"error"}', async (t) => {
	t.mock.method(console, 'error', () => {});
	t.mock.method(fakeDb, 'raw', async () => {
		throw new Error('connect ECONNREFUSED');
	});
	const res = await request(app).get('/api/health');
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, { status: 'error' });
});

test('A3: 없는 /api 경로 — 404 공통 에러 형식', async () => {
	const res = await request(app).get('/api/does-not-exist');
	assert.equal(res.status, 404);
	assert.deepEqual(res.body, NOT_FOUND_BODY);
});

test('A4: /api 밖 경로 — 404 공통 에러 형식', async () => {
	const res = await request(app).get('/not-api');
	assert.equal(res.status, 404);
	assert.deepEqual(res.body, NOT_FOUND_BODY);
});

test('A5: 깨진 JSON 본문 — 400 및 에러 메시지', async (t) => {
	t.mock.method(console, 'error', () => {});
	const res = await request(app)
		.post('/api/health')
		.set('Content-Type', 'application/json')
		.send('{bad');
	assert.equal(res.status, 400);
	assert.equal(typeof res.body.error.message, 'string');
	assert.ok(res.body.error.message.length > 0);
});

test('A6: CORS — 허용 origin과 credentials 헤더', async () => {
	const res = await request(app).get('/api/health').set('Origin', ORIGIN);
	assert.equal(res.headers['access-control-allow-origin'], ORIGIN);
	assert.equal(res.headers['access-control-allow-credentials'], 'true');
});

test('A7: CORS 프리플라이트 OPTIONS — 204 및 허용 origin', async () => {
	const res = await request(app)
		.options('/api/health')
		.set('Origin', ORIGIN)
		.set('Access-Control-Request-Method', 'GET');
	assert.equal(res.status, 204);
	assert.equal(res.headers['access-control-allow-origin'], ORIGIN);
});
