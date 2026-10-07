// BE-4 deliverables API HTTP 수준 테스트 (node:test + supertest)
//
// 왜 DB를 가짜로 바꾸는가?
// - auth.test.js, masterItems.test.js와 같은 이유다. require.cache에 가짜 connection(fakeDb)을 넣어 두면
//   repository가 받는 db는 진짜 PostgreSQL이 아니라 아래의 fakeDb다.
// - deliverables 분기는 "builder 패턴"이다. db('deliverables')를 부를 때마다 새 builder를 만들고,
//   leftJoin / select / whereILike / orderBy 같은 체인 메서드가 호출 기록(q)을 쌓다가
//   offset(목록), count().first(), where().first(), where().del(), insert().returning()에서 결과를 계산한다.
//   체인에 넘기는 인자는 assert로 고정하므로, repository의 Knex 호출 모양이 곧 이 테스트의 계약이다.
//
// 왜 임시 디렉토리를 만드는가?
// - 업로드 파일은 진짜 디스크(UPLOAD_DIR)에 저장된다. 개발용 server/uploads를 건드리지 않도록
//   OS 임시 폴더 아래에 테스트 전용 폴더를 만들고 app을 require하기 전에 UPLOAD_DIR로 지정한다.
// - beforeEach에서 deliverables 폴더를 비우고, after에서 임시 폴더 전체를 지운다.
//
// 왜 케이스마다 request.agent(app)인가?
// - 세션은 쿠키로 유지된다. agent는 브라우저처럼 쿠키를 저장해 다음 요청에 자동으로 실어 준다.
// - 케이스마다 새 agent를 만들어 서로의 로그인 상태가 섞이지 않게 한다.

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const bcrypt = require('bcryptjs');

// express-session은 secret이 없으면 모든 요청에서 500을 내므로, app을 require하기 전에 설정한다.
process.env.SESSION_SECRET = 'test-secret';

// upload.js는 호출 시점마다 UPLOAD_DIR를 읽는다. app을 require하기 전에 임시 폴더로 지정한다.
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-deliverables-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;
const DIR = path.join(UPLOAD_DIR, 'deliverables');

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
	name: '일반 사용자',
	email: 'user@test.local',
	role: null
};
const OTHER_ROW = {
	...ADMIN_ROW,
	id: '33333333-3333-3333-3333-333333333333',
	name: '다른 사용자',
	email: 'other@test.local',
	role: null
};

// deliverables fixture (DB 모양 = snake_case)
const deliverableRow = (
	n,
	registeredBy,
	createdAt,
	mpwRound,
	processName,
	ext,
	originalFileName
) => {
	const id = `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, '0')}`;
	return {
		id,
		mpw_round: mpwRound,
		process_name: processName,
		file_path: ext ? `deliverables/${id}.${ext}` : null,
		original_file_name: originalFileName,
		registered_by: registeredBy,
		created_at: createdAt,
		updated_at: null,
		version: 1
	};
};
const D1 = deliverableRow(
	1,
	USER_ROW.id,
	'2026-10-03T00:00:00.000Z',
	'MPW2026-Q3',
	'0.13um',
	'xlsx',
	'chip_design.xlsx'
);
const D2 = deliverableRow(
	2,
	OTHER_ROW.id,
	'2026-10-02T00:00:00.000Z',
	'MPW2026-Q2',
	'BCD 0.18um',
	'xls',
	'plan.xls'
);
const D3 = deliverableRow(
	3,
	null,
	'2026-10-01T00:00:00.000Z',
	'MPW2025-Q4',
	'0.13um',
	'xlsx',
	null
);
const D4 = deliverableRow(
	4,
	ADMIN_ROW.id,
	'2026-10-03T00:00:00.000Z',
	'MPW2026-Q3',
	'65nm',
	'xlsx',
	'한글산출물.xlsx'
);
const D5 = deliverableRow(
	5,
	ADMIN_ROW.id,
	'2026-09-30T00:00:00.000Z',
	'MPW 50%',
	'0.35um',
	null,
	null
);
const DELIVERABLE_ROWS = [D1, D2, D3, D4, D5];
const NONEXISTENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const state = { users: [], deliverables: [], error: null, lastPattern: null };

const match = (cond) => (r) => Object.keys(cond).every((k) => r[k] === cond[k]);
// deliverables에서만 DB 에러를 흉내 낸다. (users는 로그인 때문에 제외)
const check = () => {
	if (state.error) throw state.error;
};

// repository의 toLikePattern이 만든 패턴을 흉내 낸다: 앞뒤 %를 확인하고,
// 안쪽의 \\ \% \_ 이스케이프를 풀어서 소문자 부분 문자열 비교를 한다.
const ilike = (value, pattern) => {
	assert.ok(pattern.startsWith('%') && pattern.endsWith('%'), `LIKE 패턴 모양: ${pattern}`);
	const inner = pattern
		.slice(1, -1)
		.replace(/\\([\\%_])/g, '$1')
		.toLowerCase();
	return (value ?? '').toLowerCase().includes(inner);
};

const deliverablesBuilder = () => {
	const q = { joined: false, selected: false, pattern: null, cond: null, limit: null };
	const builder = {
		leftJoin: (...args) => {
			assert.deepEqual(args, ['users', 'deliverables.registered_by', 'users.id']);
			q.joined = true;
			return builder;
		},
		select: (...args) => {
			assert.deepEqual(args, ['deliverables.*', 'users.name as registered_by_name']);
			q.selected = true;
			return builder;
		},
		whereILike: (col, pattern) => {
			assert.equal(col, 'deliverables.mpw_round');
			q.pattern = pattern;
			state.lastPattern = pattern;
			return builder;
		},
		orWhereILike: (col, pattern) => {
			assert.equal(col, 'deliverables.process_name');
			assert.equal(pattern, q.pattern, 'whereILike와 같은 패턴이어야 함');
			return builder;
		},
		orderBy: (cols) => {
			assert.deepEqual(cols, [
				{ column: 'deliverables.created_at', order: 'desc' },
				{ column: 'deliverables.id', order: 'desc' }
			]);
			return builder;
		},
		limit: (n) => {
			q.limit = n;
			return builder;
		},
		offset: async (n) => {
			check();
			assert.ok(q.joined && q.selected, '목록은 leftJoin + select가 필요함');
			const rows = state.deliverables
				.filter(
					(r) =>
						q.pattern === null || ilike(r.mpw_round, q.pattern) || ilike(r.process_name, q.pattern)
				)
				.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
			return rows.slice(n, n + q.limit).map((r) => ({
				...r,
				registered_by_name: state.users.find((u) => u.id === r.registered_by)?.name ?? null
			}));
		},
		count: (expr) => ({
			first: async () => {
				check();
				assert.equal(expr, '* as count');
				assert.ok(!q.joined, '개수 조회에는 join이 없어야 함');
				const n = state.deliverables.filter(
					(r) =>
						q.pattern === null || ilike(r.mpw_round, q.pattern) || ilike(r.process_name, q.pattern)
				).length;
				// pg의 count는 문자열로 돌아온다.
				return { count: String(n) };
			}
		}),
		where: (cond) => {
			q.cond = cond;
			return builder;
		},
		first: async () => {
			check();
			assert.ok(q.joined, '단건 조회는 leftJoin이 필요함');
			assert.deepEqual(Object.keys(q.cond), ['deliverables.id']);
			const row = state.deliverables.find((r) => r.id === q.cond['deliverables.id']);
			if (!row) return undefined;
			return {
				...row,
				registered_by_name: state.users.find((u) => u.id === row.registered_by)?.name ?? null
			};
		},
		del: async () => {
			check();
			assert.ok(!q.joined);
			assert.deepEqual(Object.keys(q.cond), ['id']);
			const before = state.deliverables.length;
			state.deliverables = state.deliverables.filter((r) => !match(q.cond)(r));
			return before - state.deliverables.length;
		},
		insert: (row) => ({
			returning: async (cols = '*') => {
				check();
				assert.equal(cols, '*');
				assert.deepEqual(Object.keys(row).sort(), [
					'file_path',
					'id',
					'mpw_round',
					'original_file_name',
					'process_name',
					'registered_by'
				]);
				const newRow = {
					...row,
					created_at: new Date().toISOString(),
					updated_at: null,
					version: 1
				};
				state.deliverables.push(newRow);
				return [newRow];
			}
		})
	};
	return builder;
};

const fakeDb = (table) => {
	if (table === 'users') {
		return { where: (cond) => ({ first: async () => state.users.find(match(cond)) }) };
	}
	if (table === 'deliverables') return deliverablesBuilder();
	throw new Error(`예상하지 못한 테이블: ${table}`);
};
fakeDb.raw = async () => [];

const connectionPath = require.resolve('../src/db/connection');
require.cache[connectionPath] = {
	id: connectionPath,
	filename: connectionPath,
	loaded: true,
	exports: fakeDb
};
const app = require('../src/app');
// 서비스가 쓰는 것과 같은 인스턴스. t.mock.method로 saveFile / fileExists를 바꿔 끼울 때 쓴다.
const upload = require('../src/lib/upload');

beforeEach(() => {
	state.users = [ADMIN_ROW, USER_ROW, OTHER_ROW];
	state.deliverables = DELIVERABLE_ROWS.map((r) => ({ ...r }));
	state.error = null;
	state.lastPattern = null;
	fs.rmSync(DIR, { recursive: true, force: true });
});

after(() => {
	fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

const NEED_LOGIN_BODY = { error: { message: '로그인이 필요합니다' } };
const SERVER_ERROR_BODY = { error: { message: '서버 내부 오류가 발생했습니다' } };
const ROUND_BODY = { error: { message: '차수를 입력해 주세요' } };
const PROCESS_BODY = { error: { message: '공정명을 입력해 주세요' } };
const NO_FILE_BODY = { error: { message: '엑셀 파일을 첨부해 주세요' } };
const EXTENSION_BODY = { error: { message: '엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다' } };
const TOO_LARGE_BODY = { error: { message: '파일 크기가 10MB를 초과합니다' } };
const INVALID_UPLOAD_BODY = { error: { message: '업로드 요청 형식이 올바르지 않습니다' } };
const PAGING_BODY = { error: { message: 'page와 limit은 1 이상의 정수여야 합니다' } };
const FORBIDDEN_BODY = { error: { message: '등록자 본인 또는 관리자만 삭제할 수 있습니다' } };
const NOT_FOUND_BODY = { error: { message: 'Deliverables 항목을 찾을 수 없습니다' } };
const FILE_NOT_FOUND_BODY = { error: { message: '파일을 찾을 수 없습니다' } };

const MAX_SIZE = 10 * 1024 * 1024;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const login = (agent, email = ADMIN_ROW.email) =>
	agent.post('/api/auth/login').send({ email, password: PASSWORD });

const loggedIn = async (email) => {
	const agent = request.agent(app);
	await login(agent, email);
	return agent;
};

// 디스크에 저장된 파일 이름 목록 (폴더가 아직 없으면 빈 배열)
const storedFiles = () => (fs.existsSync(DIR) ? fs.readdirSync(DIR) : []);

const writeFixtureFile = (id, ext, buffer) => {
	fs.mkdirSync(DIR, { recursive: true });
	fs.writeFileSync(path.join(DIR, `${id}.${ext}`), buffer);
};

// multipart 업로드. 값이 undefined인 필드와 file이 없으면 그 부분은 보내지 않는다.
const postDeliverable = (agent, { mpwRound, processName, file }) => {
	let req = agent.post('/api/deliverables');
	if (mpwRound !== undefined) req = req.field('mpwRound', mpwRound);
	if (processName !== undefined) req = req.field('processName', processName);
	if (file) req = req.attach('file', file[0], file[1]);
	return req;
};

// ---------- 등록 (POST) ----------

test('C1: USER가 한글 파일명 xlsx 등록 — 201, 10키, trim, 디스크·DB 저장', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const bytes = Buffer.from('xlsx-bytes-1');
	const before = state.deliverables.length;
	const res = await postDeliverable(agent, {
		mpwRound: '  MPW2026-Q4 ',
		processName: ' 0.18um ',
		file: [bytes, '한글산출물.xlsx']
	});
	assert.equal(res.status, 201);
	assert.deepEqual(Object.keys(res.body).sort(), [
		'createdAt',
		'filePath',
		'id',
		'mpwRound',
		'originalFileName',
		'processName',
		'registeredBy',
		'registeredByName',
		'updatedAt',
		'version'
	]);
	assert.match(res.body.id, UUID_V4);
	assert.equal(res.body.mpwRound, 'MPW2026-Q4');
	assert.equal(res.body.processName, '0.18um');
	assert.equal(res.body.originalFileName, '한글산출물.xlsx');
	assert.equal(res.body.filePath, `deliverables/${res.body.id}.xlsx`);
	assert.equal(res.body.registeredBy, USER_ROW.id);
	assert.equal(res.body.registeredByName, USER_ROW.name);
	assert.equal(res.body.version, 1);

	// 디스크: <UPLOAD_DIR>/deliverables/{id}.xlsx 에 업로드한 바이트 그대로
	assert.deepEqual(storedFiles(), [`${res.body.id}.xlsx`]);
	assert.deepEqual(fs.readFileSync(path.join(DIR, `${res.body.id}.xlsx`)), bytes);

	// DB 행은 snake_case
	assert.equal(state.deliverables.length, before + 1);
	const row = state.deliverables.find((r) => r.id === res.body.id);
	assert.equal(row.mpw_round, 'MPW2026-Q4');
	assert.equal(row.process_name, '0.18um');
	assert.equal(row.original_file_name, '한글산출물.xlsx');
	assert.equal(row.file_path, `deliverables/${res.body.id}.xlsx`);
	assert.equal(row.registered_by, USER_ROW.id);

	const text = JSON.stringify(res.body);
	for (const key of [
		'mpw_round',
		'process_name',
		'original_file_name',
		'file_path',
		'registered_by',
		'created_at',
		'updated_at'
	]) {
		assert.ok(!text.includes(key), `snake_case 키가 응답에 있음: ${key}`);
	}
});

test('C2: 대문자 확장자 PLAN.XLS — 201, 저장 확장자는 소문자 .xls, 원본 이름은 유지', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await postDeliverable(agent, {
		mpwRound: 'MPW2026-Q4',
		processName: '0.18um',
		file: [Buffer.from('xls-bytes'), 'PLAN.XLS']
	});
	assert.equal(res.status, 201);
	assert.equal(res.body.filePath, `deliverables/${res.body.id}.xls`);
	assert.equal(res.body.originalFileName, 'PLAN.XLS');
	assert.deepEqual(storedFiles(), [`${res.body.id}.xls`]);
});

test('C3: 엑셀이 아닌 확장자(a.txt, noext, a.xlsx.txt, .xlsx) — 400, 행·파일 변화 없음', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn(USER_ROW.email);
	const before = state.deliverables.length;
	for (const name of ['a.txt', 'noext', 'a.xlsx.txt', '.xlsx']) {
		const res = await postDeliverable(agent, {
			mpwRound: 'MPW2026-Q4',
			processName: '0.18um',
			file: [Buffer.from('x'), name]
		});
		assert.equal(res.status, 400, name);
		assert.deepEqual(res.body, EXTENSION_BODY, name);
	}
	assert.equal(state.deliverables.length, before);
	assert.deepEqual(storedFiles(), []);
});

test('C4: 10MB + 1바이트 — 400 크기 초과 메시지, 행·파일 변화 없음', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn(USER_ROW.email);
	const before = state.deliverables.length;
	const res = await postDeliverable(agent, {
		mpwRound: 'MPW2026-Q4',
		processName: '0.18um',
		file: [Buffer.alloc(MAX_SIZE + 1), 'big.xlsx']
	});
	assert.equal(res.status, 400);
	assert.deepEqual(res.body, TOO_LARGE_BODY);
	assert.equal(state.deliverables.length, before);
	assert.deepEqual(storedFiles(), []);
});

test('C4b: 정확히 10MB — 201 (경계값은 허용)', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await postDeliverable(agent, {
		mpwRound: 'MPW2026-Q4',
		processName: '0.18um',
		file: [Buffer.alloc(MAX_SIZE), 'exact.xlsx']
	});
	assert.equal(res.status, 201);
	assert.equal(fs.statSync(path.join(DIR, `${res.body.id}.xlsx`)).size, MAX_SIZE);
});

test('C5: mpwRound/processName 누락·공백 — 400 차수/공정명 메시지 (순서: 차수 먼저), 파일 없음', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn(USER_ROW.email);
	const before = state.deliverables.length;
	const cases = [
		[{ processName: 'x' }, ROUND_BODY],
		[{ mpwRound: '   ', processName: 'x' }, ROUND_BODY],
		[{ mpwRound: 'x' }, PROCESS_BODY],
		[{}, ROUND_BODY]
	];
	for (const [fields, expected] of cases) {
		const res = await postDeliverable(agent, fields);
		assert.equal(res.status, 400, JSON.stringify(fields));
		assert.deepEqual(res.body, expected, JSON.stringify(fields));
	}
	assert.equal(state.deliverables.length, before);
	assert.deepEqual(storedFiles(), []);
});

test('C6: 파일 없이 필드만 multipart, 또는 JSON 본문 — 400 파일 첨부 메시지', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn(USER_ROW.email);
	const before = state.deliverables.length;

	const multipart = await postDeliverable(agent, { mpwRound: 'MPW2026-Q4', processName: 'x' });
	assert.equal(multipart.status, 400);
	assert.deepEqual(multipart.body, NO_FILE_BODY);

	const json = await agent
		.post('/api/deliverables')
		.send({ mpwRound: 'MPW2026-Q4', processName: 'x' });
	assert.equal(json.status, 400);
	assert.deepEqual(json.body, NO_FILE_BODY);

	assert.equal(state.deliverables.length, before);
});

test('C7: 다른 필드명 파일, file 2개 — 400 업로드 형식 메시지', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn(USER_ROW.email);
	const before = state.deliverables.length;

	const wrongName = await agent
		.post('/api/deliverables')
		.field('mpwRound', 'MPW2026-Q4')
		.field('processName', 'x')
		.attach('attachment', Buffer.from('x'), 'a.xlsx');
	assert.equal(wrongName.status, 400);
	assert.deepEqual(wrongName.body, INVALID_UPLOAD_BODY);

	const two = await agent
		.post('/api/deliverables')
		.field('mpwRound', 'MPW2026-Q4')
		.field('processName', 'x')
		.attach('file', Buffer.from('x'), 'a.xlsx')
		.attach('file', Buffer.from('y'), 'b.xlsx');
	assert.equal(two.status, 400);
	assert.deepEqual(two.body, INVALID_UPLOAD_BODY);

	assert.equal(state.deliverables.length, before);
	assert.deepEqual(storedFiles(), []);
});

test('C8: 비로그인 POST — 401, 파일 저장 없음', async () => {
	const res = await postDeliverable(request.agent(app), {
		mpwRound: 'MPW2026-Q4',
		processName: 'x',
		file: [Buffer.from('x'), 'a.xlsx']
	});
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
	assert.deepEqual(storedFiles(), []);
});

test('C9: DB 에러 상태에서 유효 POST — 500 고정 메시지, 저장했던 파일은 정리됨', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn(USER_ROW.email);
	state.error = new Error('db down');
	const res = await postDeliverable(agent, {
		mpwRound: 'MPW2026-Q4',
		processName: '0.18um',
		file: [Buffer.from('x'), 'a.xlsx']
	});
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
	assert.deepEqual(storedFiles(), []);
});

test('C10: 파일 저장(saveFile)이 실패하면 — 500, DB 행 없음', async (t) => {
	t.mock.method(console, 'error', () => {});
	t.mock.method(upload, 'saveFile', async () => {
		throw new Error('disk full');
	});
	const agent = await loggedIn(USER_ROW.email);
	const before = state.deliverables.length;
	const res = await postDeliverable(agent, {
		mpwRound: 'MPW2026-Q4',
		processName: '0.18um',
		file: [Buffer.from('x'), 'a.xlsx']
	});
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
	assert.equal(state.deliverables.length, before);
});

test('C11: 같은 차수·공정명으로 2번 등록 — 둘 다 201 (중복 허용), id 서로 다름', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const send = () =>
		postDeliverable(agent, {
			mpwRound: 'MPW2026-Q4',
			processName: '0.18um',
			file: [Buffer.from('x'), 'a.xlsx']
		});
	const first = await send();
	const second = await send();
	assert.equal(first.status, 201);
	assert.equal(second.status, 201);
	assert.notEqual(first.body.id, second.body.id);
	assert.equal(storedFiles().length, 2);
});

// ---------- 목록 조회 (GET) ----------

const idsOf = (res) => res.body.data.map((d) => d.id);

test('L1: 기본 목록 — page 1, limit 20, total 5, 정렬 D4 D1 D2 D3 D5, registeredByName', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/deliverables');
	assert.equal(res.status, 200);
	assert.deepEqual(Object.keys(res.body).sort(), ['data', 'limit', 'page', 'total']);
	assert.equal(res.body.page, 1);
	assert.equal(res.body.limit, 20);
	assert.equal(res.body.total, 5);
	assert.equal(typeof res.body.total, 'number');
	assert.deepEqual(idsOf(res), [D4.id, D1.id, D2.id, D3.id, D5.id]);
	assert.deepEqual(
		res.body.data.map((d) => d.registeredByName),
		['관리자', '일반 사용자', '다른 사용자', null, '관리자']
	);
	assert.deepEqual(res.body.data[0], {
		id: D4.id,
		mpwRound: 'MPW2026-Q3',
		processName: '65nm',
		originalFileName: '한글산출물.xlsx',
		filePath: `deliverables/${D4.id}.xlsx`,
		registeredBy: ADMIN_ROW.id,
		registeredByName: '관리자',
		createdAt: '2026-10-03T00:00:00.000Z',
		updatedAt: null,
		version: 1
	});
});

test('L2: ?page=2&limit=2 — [D2, D3], total은 전체 5', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/deliverables?page=2&limit=2');
	assert.equal(res.status, 200);
	assert.deepEqual(idsOf(res), [D2.id, D3.id]);
	assert.equal(res.body.page, 2);
	assert.equal(res.body.limit, 2);
	assert.equal(res.body.total, 5);
});

test('L3: 검색은 앞뒤 공백 제거 + 대소문자 무시 (process_name) — [D1, D3]', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/deliverables?search=%200.13UM%20');
	assert.equal(res.status, 200);
	assert.deepEqual(idsOf(res), [D1.id, D3.id]);
	assert.equal(res.body.total, 2);
});

test('L3b: 검색은 차수(mpw_round)도 대상 — q3 -> [D4, D1]', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/deliverables?search=q3');
	assert.deepEqual(idsOf(res), [D4.id, D1.id]);
	assert.equal(res.body.total, 2);
});

test('L4: 공백만 있는 search — 필터 없음 (total 5)', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/deliverables?search=%20%20');
	assert.equal(res.status, 200);
	assert.equal(res.body.total, 5);
	assert.equal(state.lastPattern, null);
});

test('L5: 검색어의 % _ 는 이스케이프되어 글자 그대로 검색', async () => {
	const agent = await loggedIn();
	const percent = await agent.get('/api/deliverables?search=50%25');
	assert.equal(percent.status, 200);
	assert.deepEqual(idsOf(percent), [D5.id]);
	assert.equal(state.lastPattern, '%50\\%%');

	const underscore = await agent.get('/api/deliverables?search=_');
	assert.equal(underscore.status, 200);
	assert.equal(underscore.body.total, 0);
	assert.deepEqual(underscore.body.data, []);
	assert.equal(state.lastPattern, '%\\_%');
});

test('L6: 범위를 넘은 page — 200, 빈 data, total은 5', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/deliverables?page=99');
	assert.equal(res.status, 200);
	assert.deepEqual(res.body.data, []);
	assert.equal(res.body.total, 5);
	assert.equal(res.body.page, 99);
});

test('L7: 잘못된 page/limit — 400', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	const queries = [
		'page=0',
		'page=abc',
		'page=1.5',
		'page=',
		'page=-1',
		'page=99999999999999999999',
		'page=1&page=2',
		'limit=0'
	];
	for (const query of queries) {
		const res = await agent.get(`/api/deliverables?${query}`);
		assert.equal(res.status, 400, query);
		assert.deepEqual(res.body, PAGING_BODY, query);
	}
});

test('L8: 비로그인 GET — 401', async () => {
	const res = await request.agent(app).get('/api/deliverables');
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
});

test('L9: 로그인 후 DB 에러가 나면 GET — 500 고정 메시지', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	state.error = new Error('db down');
	const res = await agent.get('/api/deliverables');
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});

test('L10: 일반 사용자 GET — 200, 남이 등록한 행도 보임', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.get('/api/deliverables');
	assert.equal(res.status, 200);
	assert.equal(res.body.total, 5);
	assert.ok(idsOf(res).includes(D2.id));
});

// ---------- 다운로드 (GET /:id/download) ----------

test('W1: 다운로드 — 200, octet-stream, 바이트 일치, attachment 파일명', async () => {
	const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x10, 0x80]);
	writeFixtureFile(D1.id, 'xlsx', bytes);
	const agent = await loggedIn();
	const res = await agent.get(`/api/deliverables/${D1.id}/download`).buffer(true);
	assert.equal(res.status, 200);
	assert.match(res.headers['content-type'], /^application\/octet-stream/);
	assert.equal(res.headers['content-disposition'], 'attachment; filename="chip_design.xlsx"');
	assert.ok(Buffer.isBuffer(res.body));
	assert.deepEqual(res.body, bytes);
});

test('W2: 한글 원본 파일명 — filename*=UTF-8 인코딩 포함', async () => {
	writeFixtureFile(D4.id, 'xlsx', Buffer.from('hangul'));
	const agent = await loggedIn();
	const res = await agent.get(`/api/deliverables/${D4.id}/download`);
	assert.equal(res.status, 200);
	assert.ok(
		res.headers['content-disposition'].includes(
			`filename*=UTF-8''${encodeURIComponent('한글산출물.xlsx')}`
		),
		res.headers['content-disposition']
	);
});

test('W3: originalFileName이 null이면 {id}.{ext}로 다운로드', async () => {
	writeFixtureFile(D3.id, 'xlsx', Buffer.from('legacy'));
	const agent = await loggedIn();
	const res = await agent.get(`/api/deliverables/${D3.id}/download`);
	assert.equal(res.status, 200);
	assert.equal(res.headers['content-disposition'], `attachment; filename="${D3.id}.xlsx"`);
});

test('W4: 없는 uuid, uuid 형식이 아닌 id — 404 항목 메시지 (형식 오류는 DB 미호출)', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	const missing = await agent.get(`/api/deliverables/${NONEXISTENT_ID}/download`);
	assert.equal(missing.status, 404);
	assert.deepEqual(missing.body, NOT_FOUND_BODY);

	state.error = new Error('db down');
	const invalid = await agent.get('/api/deliverables/not-a-uuid/download');
	assert.equal(invalid.status, 404);
	assert.deepEqual(invalid.body, NOT_FOUND_BODY);
});

test('W5: 행은 있지만 디스크에 파일이 없으면 — 404 파일 메시지', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	const res = await agent.get(`/api/deliverables/${D1.id}/download`);
	assert.equal(res.status, 404);
	assert.deepEqual(res.body, FILE_NOT_FOUND_BODY);
});

test('W6: file_path가 null인 행(D5) — 404 파일 메시지', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	const res = await agent.get(`/api/deliverables/${D5.id}/download`);
	assert.equal(res.status, 404);
	assert.deepEqual(res.body, FILE_NOT_FOUND_BODY);
});

test('W7: 비로그인 다운로드 — 401', async () => {
	writeFixtureFile(D1.id, 'xlsx', Buffer.from('x'));
	const res = await request.agent(app).get(`/api/deliverables/${D1.id}/download`);
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
});

test('W8: 존재 확인은 통과했는데 전송이 실패하면 — 500 고정 메시지, 서버 경로 노출 없음', async (t) => {
	t.mock.method(console, 'error', () => {});
	t.mock.method(upload, 'fileExists', async () => true);
	const agent = await loggedIn();
	const res = await agent.get(`/api/deliverables/${D1.id}/download`);
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
	assert.ok(!JSON.stringify(res.body).includes(UPLOAD_DIR));
});

test('W9: 일반 사용자가 남이 등록한 파일(D2, .xls) 다운로드 — 200', async () => {
	const bytes = Buffer.from('xls-content');
	writeFixtureFile(D2.id, 'xls', bytes);
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.get(`/api/deliverables/${D2.id}/download`).buffer(true);
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, bytes);
	assert.equal(res.headers['content-disposition'], 'attachment; filename="plan.xls"');
});

// ---------- 삭제 (DELETE) ----------

test('X1: 등록자 본인(USER)이 D1 삭제 — 200 {id}, 행과 파일 제거', async () => {
	writeFixtureFile(D1.id, 'xlsx', Buffer.from('x'));
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.delete(`/api/deliverables/${D1.id}`);
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { id: D1.id });
	assert.ok(!state.deliverables.some((r) => r.id === D1.id));
	assert.deepEqual(storedFiles(), []);
});

test('X2: 관리자가 남의 D2(.xls) 삭제 — 200, .xls 파일 제거', async () => {
	writeFixtureFile(D2.id, 'xls', Buffer.from('x'));
	const agent = await loggedIn();
	const res = await agent.delete(`/api/deliverables/${D2.id}`);
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { id: D2.id });
	assert.ok(!state.deliverables.some((r) => r.id === D2.id));
	assert.deepEqual(storedFiles(), []);
});

test('X3: 일반 사용자가 남의 D2 삭제 — 403, 행·파일 유지', async (t) => {
	t.mock.method(console, 'error', () => {});
	writeFixtureFile(D2.id, 'xls', Buffer.from('x'));
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.delete(`/api/deliverables/${D2.id}`);
	assert.equal(res.status, 403);
	assert.deepEqual(res.body, FORBIDDEN_BODY);
	assert.ok(state.deliverables.some((r) => r.id === D2.id));
	assert.deepEqual(storedFiles(), [`${D2.id}.xls`]);
});

test('X4: 등록자가 없는(null) D3은 USER 403, ADMIN 200', async (t) => {
	t.mock.method(console, 'error', () => {});
	const user = await loggedIn(USER_ROW.email);
	const forbidden = await user.delete(`/api/deliverables/${D3.id}`);
	assert.equal(forbidden.status, 403);
	assert.deepEqual(forbidden.body, FORBIDDEN_BODY);
	assert.ok(state.deliverables.some((r) => r.id === D3.id));

	const admin = await loggedIn();
	const ok = await admin.delete(`/api/deliverables/${D3.id}`);
	assert.equal(ok.status, 200);
	assert.deepEqual(ok.body, { id: D3.id });
});

test('X5: 없는 uuid, uuid 형식이 아닌 id — 404 (형식 오류는 DB 에러 상태여도 404)', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	const missing = await agent.delete(`/api/deliverables/${NONEXISTENT_ID}`);
	assert.equal(missing.status, 404);
	assert.deepEqual(missing.body, NOT_FOUND_BODY);

	state.error = new Error('db down');
	const invalid = await agent.delete('/api/deliverables/not-a-uuid');
	assert.equal(invalid.status, 404);
	assert.deepEqual(invalid.body, NOT_FOUND_BODY);
});

test('X6: 비로그인 DELETE — 401, 행 유지', async () => {
	const res = await request.agent(app).delete(`/api/deliverables/${D1.id}`);
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
	assert.ok(state.deliverables.some((r) => r.id === D1.id));
});

test('X7: 디스크 파일이 이미 없어도 삭제는 성공 — 200', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.delete(`/api/deliverables/${D1.id}`);
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { id: D1.id });
	assert.ok(!state.deliverables.some((r) => r.id === D1.id));
});

test('X8: file_path가 null인 D5를 관리자가 삭제 — 200', async () => {
	const agent = await loggedIn();
	const res = await agent.delete(`/api/deliverables/${D5.id}`);
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { id: D5.id });
	assert.ok(!state.deliverables.some((r) => r.id === D5.id));
});

test('X9: 로그인 후 DB 에러가 나면 유효 id DELETE — 500', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	state.error = new Error('db down');
	const res = await agent.delete(`/api/deliverables/${D1.id}`);
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});
