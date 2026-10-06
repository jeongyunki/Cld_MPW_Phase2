// errorHandler 단위 테스트 (node:test)
//
// Express 없이 함수만 직접 호출한다. res는 status()/json()만 흉내 내는 가짜 객체이고,
// console.error는 테스트 로그가 지저분해지지 않도록 mock으로 막는다.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const errorHandler = require('../src/middleware/errorHandler');

const FIXED_MESSAGE = '서버 내부 오류가 발생했습니다';

function makeRes() {
	return {
		status(c) {
			this.statusCode = c;
			return this;
		},
		json(b) {
			this.body = b;
			return this;
		}
	};
}

function run(t, err) {
	const consoleError = t.mock.method(console, 'error', () => {});
	const res = makeRes();
	errorHandler(err, {}, res, () => {});
	return { res, consoleError };
}

test('E1: status 400 에러 — 400과 원래 메시지', (t) => {
	const { res } = run(t, Object.assign(new Error('잘못된 요청'), { status: 400 }));
	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.body, { error: { message: '잘못된 요청' } });
});

test('E2: status 404 에러 — 404와 원래 메시지', (t) => {
	const { res } = run(t, Object.assign(new Error('없음'), { status: 404 }));
	assert.equal(res.statusCode, 404);
	assert.deepEqual(res.body, { error: { message: '없음' } });
});

test('E3: status 없는 에러 — 500과 고정 메시지(내부 정보 숨김)', (t) => {
	const { res } = run(t, new Error('password=secret DB 에러'));
	assert.equal(res.statusCode, 500);
	assert.deepEqual(res.body, { error: { message: FIXED_MESSAGE } });
});

test('E4: 500 에러 — console.error 1회 호출, 응답 키는 error 하나', (t) => {
	const err = new Error('password=secret DB 에러');
	const { res, consoleError } = run(t, err);
	assert.equal(consoleError.mock.callCount(), 1);
	assert.equal(consoleError.mock.calls[0].arguments[0], err);
	assert.deepEqual(Object.keys(res.body), ['error']);
});

test('E5: status 503 에러 — 503과 고정 메시지', (t) => {
	const { res } = run(t, Object.assign(new Error('DB 점검 중'), { status: 503 }));
	assert.equal(res.statusCode, 503);
	assert.deepEqual(res.body, { error: { message: FIXED_MESSAGE } });
});
