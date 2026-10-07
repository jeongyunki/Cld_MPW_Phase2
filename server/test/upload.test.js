// BE-4 lib/upload 단위 테스트 (node:test, app·DB 없음)
//
// 왜 app 없이 테스트하는가?
// - getUploadRoot / getDeliverablesDir / MAX_FILE_SIZE는 환경변수와 path만 다루는 순수 함수다.
// - getUploadRoot는 호출 시점마다 process.env.UPLOAD_DIR를 읽으므로, 케이스마다 env를 바꿔 가며 검증한다.
// - 환경변수는 프로세스 전역 상태라서 케이스가 끝나면 반드시 원래 값으로 되돌린다.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const upload = require('../src/lib/upload');

const SERVER_DIR = path.resolve(__dirname, '..');

// env를 value로 바꿔 fn을 실행하고, 끝나면(예외여도) 원래 값으로 복원한다. undefined면 키를 지운다.
const withUploadDir = (value, fn) => {
	const original = process.env.UPLOAD_DIR;
	try {
		if (value === undefined) delete process.env.UPLOAD_DIR;
		else process.env.UPLOAD_DIR = value;
		return fn();
	} finally {
		if (original === undefined) delete process.env.UPLOAD_DIR;
		else process.env.UPLOAD_DIR = original;
	}
};

test('U1: UPLOAD_DIR 미설정·빈 문자열·공백만 — server/uploads', () => {
	for (const value of [undefined, '', '   ']) {
		const root = withUploadDir(value, () => upload.getUploadRoot());
		assert.equal(root, path.resolve(SERVER_DIR, 'uploads'), JSON.stringify(value));
	}
});

test('U2: 상대경로 UPLOAD_DIR은 server/ 기준으로 해석', () => {
	const root = withUploadDir('data/files', () => upload.getUploadRoot());
	assert.equal(root, path.resolve(SERVER_DIR, 'data', 'files'));
});

test('U3: 절대경로 UPLOAD_DIR은 그대로 사용', () => {
	const absolute = path.resolve(SERVER_DIR, '..', 'somewhere-absolute');
	const root = withUploadDir(absolute, () => upload.getUploadRoot());
	assert.equal(root, absolute);
});

test('U4: getDeliverablesDir는 업로드 루트 아래 deliverables', () => {
	const dir = withUploadDir('data/files', () => upload.getDeliverablesDir());
	assert.equal(dir, path.join(SERVER_DIR, 'data', 'files', 'deliverables'));
	const defaultDir = withUploadDir(undefined, () => upload.getDeliverablesDir());
	assert.equal(defaultDir, path.join(SERVER_DIR, 'uploads', 'deliverables'));
});

test('U5: MAX_FILE_SIZE는 10MB(10485760)', () => {
	assert.equal(upload.MAX_FILE_SIZE, 10485760);
});
