// BE-5 imgagong-plans API HTTP 수준 테스트 (node:test + supertest)
//
// 왜 DB를 가짜로 바꾸는가?
// - deliverables.test.js와 같은 이유다. require.cache에 가짜 connection(fakeDb)을 넣어 두면
//   repository가 받는 db는 진짜 PostgreSQL이 아니라 아래의 fakeDb다.
// - imgagong_plans도 builder 패턴이다. 체인 메서드(where / orderBy / limit / offset / count / insert / update ...)가
//   호출 기록(q)을 쌓다가 offset, count().first(), where().first(), where().del(),
//   insert().returning(), update().returning()에서 결과를 계산한다.
//   체인에 넘기는 인자는 assert로 고정하므로, repository의 Knex 호출 모양이 곧 이 테스트의 계약이다.
//
// 낙관적 잠금이란?
// - 은행 통장의 "버전 번호"를 떠올리면 쉽다. 내가 통장을 볼 때 버전이 1이었다면,
//   "버전 1인 통장을 이렇게 고쳐 주세요"라고 요청한다. 그 사이 다른 사람이 먼저 고쳐서 버전이 2가 되었다면
//   내 요청은 거절(409)된다. 잠금을 걸고 기다리는 대신 "저장하는 순간에 버전을 비교"하는 방식이다.
// - 그래서 U2는 같은 version 1로 두 번 수정해서 첫 번째만 성공하는지(200 후 409) 확인한다.
//
// 왜 케이스마다 request.agent(app)인가?
// - 세션은 쿠키로 유지된다. agent는 브라우저처럼 쿠키를 저장해 다음 요청에 자동으로 실어 준다.
// - 케이스마다 새 agent를 만들어 서로의 로그인 상태가 섞이지 않게 한다.

const { test, beforeEach } = require('node:test');
const http = require('node:http');
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
// 이름이 없는(null) 사용자와 공백뿐인 사용자 — 삭제 권한 판정의 경계값
const USER_NONAME = {
	...ADMIN_ROW,
	id: '44444444-4444-4444-4444-444444444444',
	name: null,
	email: 'noname@test.local',
	role: null
};
const USER_BLANK = {
	...ADMIN_ROW,
	id: '55555555-5555-5555-5555-555555555555',
	name: '   ',
	email: 'blank@test.local',
	role: null
};
const USER_ROWS = [ADMIN_ROW, USER_ROW, OTHER_ROW, USER_NONAME, USER_BLANK];

// imgagong_plans fixture (DB 모양 = snake_case)
const planRow = (n, owner, createdAt, version) => ({
	id: `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, '0')}`,
	created_at: createdAt,
	status: 'new',
	category: '산학',
	assembler: 'A사',
	chip_size: '8인치',
	module: null,
	project_name: null,
	gcm_code: null,
	pkg_type: 'QFN',
	customer: null,
	lot_count: null,
	pkg_qty: null,
	owner,
	updated_by: null,
	updated_at: null,
	version
});
const P1 = planRow(1, '일반 사용자', '2026-03-31T23:59:59.000Z', 1);
const P2 = planRow(2, '  일반 사용자 ', '2026-04-01T00:00:00.000Z', 3);
const P3 = planRow(3, '다른 사용자', '2026-12-31T23:59:59.000Z', 1);
const P4 = planRow(4, '관리자', '2027-01-01T00:00:00.000Z', 1);
const P5 = planRow(5, '', '2025-12-15T09:00:00.000Z', 1);
const P6 = planRow(6, '다른 사용자', '2026-04-01T00:00:00.000Z', 1);
const PLAN_ROWS = [P1, P2, P3, P4, P5, P6];
// 최신순(created_at desc, id desc) 전체 정렬
const ALL_ORDER = [P4, P3, P6, P2, P1, P5].map((p) => p.id);
const NONEXISTENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const state = {
	users: [],
	plans: [],
	error: null,
	wheres: [],
	lastUpdate: null,
	lastInsert: null,
	lastBulk: null,
	seq: 0
};

const RAW_VERSION = { raw: 'version + 1' };
const NOW = { fn: 'now' };
const PLAN_COLUMNS = [
	'status',
	'category',
	'assembler',
	'chip_size',
	'module',
	'project_name',
	'gcm_code',
	'pkg_type',
	'customer',
	'lot_count',
	'pkg_qty',
	'owner'
];

const match = (cond) => (r) => Object.keys(cond).every((k) => r[k] === cond[k]);
// imgagong_plans에서만 DB 에러를 흉내 낸다. (users는 로그인 때문에 제외)
const check = () => {
	if (state.error) throw state.error;
};

const plansBuilder = () => {
	const q = { cond: null, inIds: null, range: [], limit: null };
	const inRange = (r) =>
		q.range.every(([op, value]) => (op === '>=' ? r.created_at >= value : r.created_at < value));
	const builder = {
		where: (...args) => {
			if (args.length === 1) {
				q.cond = args[0];
				return builder;
			}
			// 기간 필터: where('created_at', '>=' 또는 '<', 값) — 인자 3개로 고정
			assert.equal(args.length, 3, 'where 범위 조건은 인자 3개여야 함');
			const [col, op, value] = args;
			assert.equal(col, 'created_at');
			assert.ok(op === '>=' || op === '<', `예상하지 못한 연산자: ${op}`);
			q.range.push([op, value]);
			state.wheres.push([col, op, value]);
			return builder;
		},
		// 일괄 의뢰확정: whereIn('id', ids) — 첫 인자는 'id', 두 번째는 배열로 고정
		whereIn: (col, values) => {
			assert.equal(col, 'id');
			assert.ok(Array.isArray(values));
			q.inIds = values;
			return builder;
		},
		orderBy: (cols) => {
			assert.deepEqual(cols, [
				{ column: 'created_at', order: 'desc' },
				{ column: 'id', order: 'desc' }
			]);
			return builder;
		},
		limit: (n) => {
			q.limit = n;
			return builder;
		},
		offset: async (n) => {
			check();
			const rows = state.plans
				.filter(inRange)
				.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
			return rows.slice(n, n + q.limit).map((r) => ({ ...r }));
		},
		count: (expr) => ({
			first: async () => {
				check();
				assert.equal(expr, '* as count');
				// pg의 count는 문자열로 돌아온다.
				return { count: String(state.plans.filter(inRange).length) };
			}
		}),
		first: async () => {
			check();
			assert.deepEqual(Object.keys(q.cond), ['id']);
			const row = state.plans.find(match(q.cond));
			return row ? { ...row } : undefined;
		},
		del: async () => {
			check();
			assert.deepEqual(Object.keys(q.cond), ['id']);
			const before = state.plans.length;
			state.plans = state.plans.filter((r) => !match(q.cond)(r));
			return before - state.plans.length;
		},
		insert: (row) => ({
			returning: async (cols = '*') => {
				check();
				assert.equal(cols, '*');
				assert.deepEqual(Object.keys(row).sort(), [...PLAN_COLUMNS].sort());
				state.lastInsert = row;
				state.seq += 1;
				const newRow = {
					id: `ffffffff-ffff-4fff-8fff-${String(state.seq).padStart(12, '0')}`,
					created_at: new Date().toISOString(),
					...row,
					updated_by: null,
					updated_at: null,
					version: 1
				};
				state.plans.push(newRow);
				return [{ ...newRow }];
			}
		}),
		update: (data) => ({
			returning: async (cols = '*') => {
				check();
				assert.equal(cols, '*');
				if (q.inIds) {
					// bulk update: whereIn('id', ids).where({ status }).update(4개 키).returning('*')
					assert.deepEqual(Object.keys(q.cond), ['status']);
					assert.deepEqual(Object.keys(data).sort(), [
						'status',
						'updated_at',
						'updated_by',
						'version'
					]);
					assert.deepEqual(data.version, RAW_VERSION);
					assert.deepEqual(data.updated_at, NOW);
					state.lastBulk = { ids: q.inIds, cond: q.cond, data };
					const rows = state.plans.filter((r) => q.inIds.includes(r.id) && match(q.cond)(r));
					for (const row of rows) {
						row.status = data.status;
						row.version += 1;
						row.updated_at = new Date().toISOString();
						row.updated_by = data.updated_by;
					}
					return rows.map((r) => ({ ...r }));
				}
				assert.deepEqual(Object.keys(q.cond).sort(), ['id', 'version']);
				assert.deepEqual(data.version, RAW_VERSION);
				assert.deepEqual(data.updated_at, NOW);
				for (const key of Object.keys(data)) {
					if (['version', 'updated_at', 'updated_by'].includes(key)) continue;
					assert.ok(PLAN_COLUMNS.includes(key), `허용되지 않은 컬럼: ${key}`);
				}
				state.lastUpdate = data;
				const row = state.plans.find(match(q.cond));
				if (!row) return [];
				for (const key of Object.keys(data)) {
					if (['version', 'updated_at', 'updated_by'].includes(key)) continue;
					row[key] = data[key];
				}
				row.version += 1;
				row.updated_at = new Date().toISOString();
				row.updated_by = data.updated_by;
				return [{ ...row }];
			}
		})
	};
	return builder;
};

const fakeDb = (table) => {
	if (table === 'users') {
		return { where: (cond) => ({ first: async () => state.users.find(match(cond)) }) };
	}
	if (table === 'imgagong_plans') return plansBuilder();
	throw new Error(`예상하지 못한 테이블: ${table}`);
};
// Knex의 db.raw / db.fn.now()도 동기 함수라서, 구분할 수 있는 마커 객체를 돌려준다.
fakeDb.raw = (sql) => ({ raw: sql });
fakeDb.fn = { now: () => NOW };

const connectionPath = require.resolve('../src/db/connection');
require.cache[connectionPath] = {
	id: connectionPath,
	filename: connectionPath,
	loaded: true,
	exports: fakeDb
};
const app = require('../src/app');
// 서비스·repository가 쓰는 것과 같은 인스턴스. 순수 함수 테스트와 t.mock.method에 쓴다.
const sse = require('../src/lib/sse');
const imgagongPlansService = require('../src/imgagong-plans/imgagong-plans.service');
const imgagongPlansRepository = require('../src/imgagong-plans/imgagong-plans.repository');

beforeEach(() => {
	state.users = USER_ROWS.map((r) => ({ ...r }));
	state.plans = PLAN_ROWS.map((r) => ({ ...r }));
	state.error = null;
	state.wheres = [];
	state.lastUpdate = null;
	state.lastInsert = null;
	state.lastBulk = null;
	state.seq = 0;
});

const NEED_LOGIN_BODY = { error: { message: '로그인이 필요합니다' } };
const SERVER_ERROR_BODY = { error: { message: '서버 내부 오류가 발생했습니다' } };
const PAGING_BODY = { error: { message: 'page와 limit은 1 이상의 정수여야 합니다' } };
const PERIOD_BODY = {
	error: { message: '조회 기간(startMonth, endMonth)은 YYYY-MM 형식이어야 합니다' }
};
const VERSION_BODY = { error: { message: 'version은 1 이상의 정수여야 합니다' } };
const EMPTY_PATCH_BODY = { error: { message: '수정할 항목이 없습니다' } };
const NOT_FOUND_BODY = { error: { message: '임가공 Plan 행을 찾을 수 없습니다' } };
const CONFLICT_BODY = {
	error: {
		message: '다른 사용자가 먼저 이 행을 수정했습니다. 페이지를 새로고침한 후 다시 시도하세요'
	}
};
const STATUS_FORBIDDEN_BODY = { error: { message: '상태(status)는 관리자만 변경할 수 있습니다' } };
const DELETE_FORBIDDEN_BODY = { error: { message: '이 행을 삭제할 권한이 없습니다' } };
const bodyOf = (message) => ({ error: { message } });
const REQUIRED_MESSAGES = {
	category: '구분을 입력해 주세요',
	assembler: '조립처를 입력해 주세요',
	chipSize: 'Chip size를 입력해 주세요',
	pkgType: 'PKG Type을 입력해 주세요',
	owner: '과제 담당자를 입력해 주세요'
};
const INT_MESSAGE = (key) =>
	bodyOf(`${key} 값은 0 이상 2147483647 이하의 정수 또는 null이어야 합니다`);
const STRING_MESSAGE = (key) => bodyOf(`${key} 값은 문자열 또는 null이어야 합니다`);

const VALID_BODY = {
	category: '산학',
	assembler: 'A사',
	chipSize: '8인치',
	pkgType: 'QFN',
	owner: '일반 사용자'
};
const PLAN_KEYS = [
	'assembler',
	'category',
	'chipSize',
	'createdAt',
	'customer',
	'gcmCode',
	'id',
	'lotCount',
	'module',
	'owner',
	'pkgQty',
	'pkgType',
	'projectName',
	'status',
	'updatedAt',
	'updatedBy',
	'version'
];
const SNAKE_KEYS = [
	'chip_size',
	'project_name',
	'gcm_code',
	'pkg_type',
	'lot_count',
	'pkg_qty',
	'created_at',
	'updated_at',
	'updated_by'
];
const MAX_INT = 2147483647;

const login = (agent, email = ADMIN_ROW.email) =>
	agent.post('/api/auth/login').send({ email, password: PASSWORD });

const loggedIn = async (email) => {
	const agent = request.agent(app);
	await login(agent, email);
	return agent;
};

const idsOf = (res) => res.body.data.map((d) => d.id);
const dbRow = (id) => state.plans.find((r) => r.id === id);
const url = (id) => `/api/imgagong-plans/${id}`;

// ---------- 등록 (POST) ----------

test('C1: USER 등록 (body의 status는 무시) — 201, 17키, status new, version 1, insert 키 12개', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.post('/api/imgagong-plans').send({ ...VALID_BODY, status: 'approved' });
	assert.equal(res.status, 201);
	assert.deepEqual(Object.keys(res.body).sort(), PLAN_KEYS);
	assert.equal(res.body.status, 'new');
	assert.equal(res.body.version, 1);
	assert.equal(res.body.updatedBy, null);
	assert.equal(res.body.updatedAt, null);
	assert.equal(res.body.chipSize, '8인치');
	assert.equal(state.lastInsert.status, 'new');
	assert.deepEqual(Object.keys(state.lastInsert).sort(), [...PLAN_COLUMNS].sort());
	assert.ok(!('id' in state.lastInsert) && !('created_at' in state.lastInsert));
	const text = JSON.stringify(res.body);
	for (const key of SNAKE_KEYS) {
		assert.ok(!text.includes(key), `snake_case 키가 응답에 있음: ${key}`);
	}
});

test('C2: 문자열 trim, 빈 문자열·null·생략은 null, 숫자 0 허용 — 201, DB 행은 snake_case', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.post('/api/imgagong-plans').send({
		...VALID_BODY,
		category: '  산학 ',
		module: '   ',
		projectName: ' P1 ',
		gcmCode: null,
		lotCount: null,
		pkgQty: 0
	});
	assert.equal(res.status, 201);
	assert.equal(res.body.category, '산학');
	assert.equal(res.body.module, null);
	assert.equal(res.body.projectName, 'P1');
	assert.equal(res.body.gcmCode, null);
	assert.equal(res.body.customer, null);
	assert.equal(res.body.lotCount, null);
	assert.equal(res.body.pkgQty, 0);
	const row = dbRow(res.body.id);
	assert.equal(row.category, '산학');
	assert.equal(row.chip_size, '8인치');
	assert.equal(row.pkg_type, 'QFN');
	assert.equal(row.project_name, 'P1');
	assert.equal(row.gcm_code, null);
	assert.equal(row.lot_count, null);
	assert.equal(row.pkg_qty, 0);
});

test('C3: 필수 5개 필드 각각 생략·공백·null·숫자 — 400 해당 메시지, 행 수 불변', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const before = state.plans.length;
	for (const [key, message] of Object.entries(REQUIRED_MESSAGES)) {
		const variants = { 생략: undefined, 공백: '   ', null: null, 숫자: 5 };
		for (const [label, value] of Object.entries(variants)) {
			const body = { ...VALID_BODY, [key]: value };
			const res = await agent.post('/api/imgagong-plans').send(body);
			assert.equal(res.status, 400, `${key} ${label}`);
			assert.deepEqual(res.body, bodyOf(message), `${key} ${label}`);
		}
	}
	assert.equal(state.plans.length, before);
});

test('C4: 선택 문자열 필드의 타입 오류(module 123, customer {}) — 400', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const cases = [
		['module', 123],
		['customer', {}]
	];
	for (const [key, value] of cases) {
		const res = await agent.post('/api/imgagong-plans').send({ ...VALID_BODY, [key]: value });
		assert.equal(res.status, 400, key);
		assert.deepEqual(res.body, STRING_MESSAGE(key), key);
	}
	assert.equal(state.plans.length, PLAN_ROWS.length);
});

test('C5: lotCount/pkgQty 범위·타입 오류 — 400', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const cases = [
		['lotCount', -1],
		['lotCount', 1.5],
		['lotCount', '3'],
		['lotCount', MAX_INT + 1],
		['pkgQty', -1]
	];
	for (const [key, value] of cases) {
		const res = await agent.post('/api/imgagong-plans').send({ ...VALID_BODY, [key]: value });
		assert.equal(res.status, 400, `${key}=${JSON.stringify(value)}`);
		assert.deepEqual(res.body, INT_MESSAGE(key), `${key}=${JSON.stringify(value)}`);
	}
	assert.equal(state.plans.length, PLAN_ROWS.length);
});

test('C6: lotCount 2147483647 (경계값) — 201', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.post('/api/imgagong-plans').send({ ...VALID_BODY, lotCount: MAX_INT });
	assert.equal(res.status, 201);
	assert.equal(res.body.lotCount, MAX_INT);
});

test('C7: 비로그인 POST — 401, 행 수 불변', async () => {
	const res = await request.agent(app).post('/api/imgagong-plans').send(VALID_BODY);
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
	assert.equal(state.plans.length, PLAN_ROWS.length);
});

test('C8: 로그인 후 DB 에러가 나면 유효 POST — 500 고정 메시지', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn(USER_ROW.email);
	state.error = new Error('db down');
	const res = await agent.post('/api/imgagong-plans').send(VALID_BODY);
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});

// ---------- 목록 조회 (GET) ----------

const FROM_APRIL = ['created_at', '>=', '2026-04-01'];
const BEFORE_MAY = ['created_at', '<', '2026-05-01'];
// findPage와 count가 Promise.all로 동시에 호출되므로, 호출 순서에 기대지 않도록 정렬해서 비교한다.
const sortedWheres = () => state.wheres.map((w) => JSON.stringify(w)).sort();
const expectWheres = (list) =>
	assert.deepEqual(sortedWheres(), list.map((w) => JSON.stringify(w)).sort());

test('G1: 필터 없음 — 최신순 P4 P3 P6 P2 P1 P5, total 6, page 1, limit 20, where 없음, 17키', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/imgagong-plans');
	assert.equal(res.status, 200);
	assert.deepEqual(Object.keys(res.body).sort(), ['data', 'limit', 'page', 'total']);
	assert.deepEqual(idsOf(res), ALL_ORDER);
	assert.equal(res.body.total, 6);
	assert.equal(typeof res.body.total, 'number');
	assert.equal(res.body.page, 1);
	assert.equal(res.body.limit, 20);
	assert.deepEqual(state.wheres, []);
	for (const plan of res.body.data) {
		assert.deepEqual(Object.keys(plan).sort(), PLAN_KEYS, plan.id);
	}
	assert.equal(res.body.data[0].createdAt, '2027-01-01T00:00:00.000Z');
});

test('G2: 2026-04 ~ 2026-04 — [P6, P2], total 2, 목록·count 모두 >= 04-01, < 05-01', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/imgagong-plans?startMonth=2026-04&endMonth=2026-04');
	assert.equal(res.status, 200);
	assert.deepEqual(idsOf(res), [P6.id, P2.id]);
	assert.equal(res.body.total, 2);
	assert.equal(state.wheres.length, 4);
	expectWheres([FROM_APRIL, BEFORE_MAY, FROM_APRIL, BEFORE_MAY]);
});

test('G3: 2026-12 ~ 2026-12 — [P3], 종료 경계는 다음 해 2027-01-01', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/imgagong-plans?startMonth=2026-12&endMonth=2026-12');
	assert.equal(res.status, 200);
	assert.deepEqual(idsOf(res), [P3.id]);
	assert.ok(state.wheres.some((w) => w[1] === '<' && w[2] === '2027-01-01'));
	assert.ok(state.wheres.every((w) => w[1] !== '<' || w[2] === '2027-01-01'));
});

test('G4: startMonth=2026-03만 — P5 제외 5건, < 조건 없음', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/imgagong-plans?startMonth=2026-03');
	assert.equal(res.status, 200);
	assert.deepEqual(idsOf(res), [P4.id, P3.id, P6.id, P2.id, P1.id]);
	assert.equal(res.body.total, 5);
	assert.ok(state.wheres.length > 0);
	assert.ok(state.wheres.every((w) => w[1] === '>=' && w[2] === '2026-03-01'));
});

test('G5: endMonth=2026-03만 — [P1, P5], >= 조건 없음', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/imgagong-plans?endMonth=2026-03');
	assert.equal(res.status, 200);
	assert.deepEqual(idsOf(res), [P1.id, P5.id]);
	assert.equal(res.body.total, 2);
	assert.ok(state.wheres.length > 0);
	assert.ok(state.wheres.every((w) => w[1] === '<' && w[2] === '2026-04-01'));
});

test('G6: 시작 > 종료(2026-05 ~ 2026-04) — 200, 빈 결과, total 0', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/imgagong-plans?startMonth=2026-05&endMonth=2026-04');
	assert.equal(res.status, 200);
	assert.deepEqual(res.body.data, []);
	assert.equal(res.body.total, 0);
});

test('G7: 잘못된 기간 형식 — 400 기간 메시지', async () => {
	const agent = await loggedIn();
	const queries = [
		'startMonth=2026-13',
		'startMonth=2026-00',
		'startMonth=2026-1',
		'startMonth=202604',
		'startMonth=abc',
		'startMonth=',
		'endMonth=2026-13',
		'endMonth=2026-04&endMonth=2026-05'
	];
	for (const query of queries) {
		const res = await agent.get(`/api/imgagong-plans?${query}`);
		assert.equal(res.status, 400, query);
		assert.deepEqual(res.body, PERIOD_BODY, query);
	}
});

test('G8: ?page=2&limit=2 — [P6, P2], total은 전체 6', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/imgagong-plans?page=2&limit=2');
	assert.equal(res.status, 200);
	assert.deepEqual(idsOf(res), [P6.id, P2.id]);
	assert.equal(res.body.total, 6);
	assert.equal(res.body.page, 2);
	assert.equal(res.body.limit, 2);
});

test('G9: 잘못된 page/limit — 400 페이지 메시지', async () => {
	const agent = await loggedIn();
	for (const query of ['page=0', 'page=1.5', 'page=abc', 'limit=-1']) {
		const res = await agent.get(`/api/imgagong-plans?${query}`);
		assert.equal(res.status, 400, query);
		assert.deepEqual(res.body, PAGING_BODY, query);
	}
});

test('G10: 비로그인 GET은 401, 로그인 후 DB 에러는 500', async (t) => {
	t.mock.method(console, 'error', () => {});
	const anonymous = await request.agent(app).get('/api/imgagong-plans');
	assert.equal(anonymous.status, 401);
	assert.deepEqual(anonymous.body, NEED_LOGIN_BODY);

	const agent = await loggedIn();
	state.error = new Error('db down');
	const res = await agent.get('/api/imgagong-plans');
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});

// ---------- 수정 (PATCH, 낙관적 잠금) ----------

test('U1: USER가 P1 수정 — 200, trim, version 2, updatedBy/updatedAt 채움, update 키 확인', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.patch(url(P1.id)).send({ version: 1, module: ' M1 ', lotCount: 5 });
	assert.equal(res.status, 200);
	assert.deepEqual(Object.keys(res.body).sort(), PLAN_KEYS);
	assert.equal(res.body.module, 'M1');
	assert.equal(res.body.lotCount, 5);
	assert.equal(res.body.version, 2);
	assert.equal(res.body.updatedBy, USER_ROW.id);
	assert.equal(typeof res.body.updatedAt, 'string');
	assert.deepEqual(Object.keys(state.lastUpdate).sort(), [
		'lot_count',
		'module',
		'updated_at',
		'updated_by',
		'version'
	]);
	assert.deepEqual(state.lastUpdate.version, RAW_VERSION);
	assert.deepEqual(state.lastUpdate.updated_at, NOW);
	assert.equal(state.lastUpdate.updated_by, USER_ROW.id);
});

test('U2: 같은 version 1로 두 번 수정 — 200 후 409, DB는 첫 번째 값(module A, version 2)', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const first = await agent.patch(url(P1.id)).send({ version: 1, module: 'A' });
	assert.equal(first.status, 200);
	const second = await agent.patch(url(P1.id)).send({ version: 1, module: 'B' });
	assert.equal(second.status, 409);
	assert.deepEqual(second.body, CONFLICT_BODY);
	assert.equal(dbRow(P1.id).module, 'A');
	assert.equal(dbRow(P1.id).version, 2);
});

test('U3: 현재 version 3인 P2에 version 1로 수정 — 409, 행 불변', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.patch(url(P2.id)).send({ version: 1, module: 'X' });
	assert.equal(res.status, 409);
	assert.deepEqual(res.body, CONFLICT_BODY);
	assert.equal(dbRow(P2.id).module, null);
	assert.equal(dbRow(P2.id).version, 3);
});

test('U4: 없는 uuid — 404', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.patch(url(NONEXISTENT_ID)).send({ version: 1, module: 'X' });
	assert.equal(res.status, 404);
	assert.deepEqual(res.body, NOT_FOUND_BODY);
});

test('U5: uuid 형식이 아닌 id + 정상 body — 404, DB 호출 없음', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.patch(url('not-a-uuid')).send({ version: 1, module: 'X' });
	assert.equal(res.status, 404);
	assert.deepEqual(res.body, NOT_FOUND_BODY);
	assert.deepEqual(state.wheres, []);
	assert.equal(state.lastUpdate, null);
});

test('U6: version 없음/문자열/0/1.5/2147483648 — 400 version 메시지', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const versions = [undefined, '1', 0, 1.5, MAX_INT + 1];
	for (const version of versions) {
		const res = await agent.patch(url(P1.id)).send({ version, module: 'X' });
		assert.equal(res.status, 400, `version=${JSON.stringify(version)}`);
		assert.deepEqual(res.body, VERSION_BODY, `version=${JSON.stringify(version)}`);
	}
	assert.equal(dbRow(P1.id).version, 1);
});

test('U7: 수정할 필드가 없거나 목록 밖 키뿐 — 400 수정할 항목 없음', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const bodies = [{ version: 1 }, { version: 1, foo: 'x', createdAt: '2000-01-01T00:00:00.000Z' }];
	for (const body of bodies) {
		const res = await agent.patch(url(P1.id)).send(body);
		assert.equal(res.status, 400, JSON.stringify(body));
		assert.deepEqual(res.body, EMPTY_PATCH_BODY, JSON.stringify(body));
	}
});

test('U8: 필수 필드를 공백·null로 수정 — 400 필수 메시지', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const cases = [
		[{ version: 1, category: '  ' }, REQUIRED_MESSAGES.category],
		[{ version: 1, owner: null }, REQUIRED_MESSAGES.owner]
	];
	for (const [body, message] of cases) {
		const res = await agent.patch(url(P1.id)).send(body);
		assert.equal(res.status, 400, JSON.stringify(body));
		assert.deepEqual(res.body, bodyOf(message), JSON.stringify(body));
	}
	assert.equal(dbRow(P1.id).category, '산학');
});

test('U9: 일반 사용자가 status 키 포함(값 무관) — 403, 행 불변', async () => {
	const agent = await loggedIn(USER_ROW.email);
	for (const status of ['checked', null]) {
		const res = await agent.patch(url(P1.id)).send({ version: 1, status });
		assert.equal(res.status, 403, `status=${status}`);
		assert.deepEqual(res.body, STATUS_FORBIDDEN_BODY, `status=${status}`);
	}
	assert.equal(dbRow(P1.id).status, 'new');
	assert.equal(dbRow(P1.id).version, 1);
	assert.equal(state.lastUpdate, null);
});

test('U10: 관리자는 status 변경 가능 — checked는 200, 공백은 null', async () => {
	const agent = await loggedIn();
	const checked = await agent.patch(url(P1.id)).send({ version: 1, status: 'checked' });
	assert.equal(checked.status, 200);
	assert.equal(checked.body.status, 'checked');
	assert.equal(checked.body.updatedBy, ADMIN_ROW.id);

	const blank = await agent.patch(url(P3.id)).send({ version: 1, status: '  ' });
	assert.equal(blank.status, 200);
	assert.equal(blank.body.status, null);
});

test('U11: 목록 밖 키(id, createdAt, updatedBy, foo)는 무시 — 200, id·createdAt 불변, 허용 컬럼만 update', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.patch(url(P1.id)).send({
		version: 1,
		module: 'M',
		id: '99999999-9999-4999-8999-999999999999',
		createdAt: '2000-01-01',
		updatedBy: 'x',
		foo: 1
	});
	assert.equal(res.status, 200);
	assert.equal(res.body.id, P1.id);
	assert.equal(res.body.createdAt, P1.created_at);
	assert.equal(res.body.updatedBy, USER_ROW.id);
	assert.equal(dbRow(P1.id).id, P1.id);
	assert.deepEqual(Object.keys(state.lastUpdate).sort(), [
		'module',
		'updated_at',
		'updated_by',
		'version'
	]);
});

test('U12: 일반 사용자의 status 타입 오류(5) — 403보다 먼저 400 문자열 메시지', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.patch(url(P1.id)).send({ version: 1, status: 5 });
	assert.equal(res.status, 400);
	assert.deepEqual(res.body, STRING_MESSAGE('status'));
});

test('U13: 버전은 같은데 UPDATE가 0행(경합)이면 — 409', async (t) => {
	t.mock.method(imgagongPlansRepository, 'updateIfVersion', async () => null);
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.patch(url(P1.id)).send({ version: 1, module: 'X' });
	assert.equal(res.status, 409);
	assert.deepEqual(res.body, CONFLICT_BODY);
});

test('U14: 비로그인 PATCH는 401, 로그인 후 DB 에러는 500', async (t) => {
	t.mock.method(console, 'error', () => {});
	const anonymous = await request.agent(app).patch(url(P1.id)).send({ version: 1, module: 'X' });
	assert.equal(anonymous.status, 401);
	assert.deepEqual(anonymous.body, NEED_LOGIN_BODY);

	const agent = await loggedIn(USER_ROW.email);
	state.error = new Error('db down');
	const res = await agent.patch(url(P1.id)).send({ version: 1, module: 'X' });
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});

// ---------- 삭제 (DELETE) ----------

test('D1: 관리자가 남의 P3 삭제 — 200 {id}, 행 제거', async () => {
	const agent = await loggedIn();
	const res = await agent.delete(url(P3.id));
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { id: P3.id });
	assert.equal(dbRow(P3.id), undefined);
});

test('D2: owner 이름이 같은 USER가 P1 삭제 — 200', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.delete(url(P1.id));
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { id: P1.id });
	assert.equal(dbRow(P1.id), undefined);
});

test('D3: owner 앞뒤 공백이 있어도 trim 일치(P2)면 USER 삭제 — 200', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.delete(url(P2.id));
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { id: P2.id });
});

test('D4: USER가 남의 P3 삭제 — 403, 행 유지', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.delete(url(P3.id));
	assert.equal(res.status, 403);
	assert.deepEqual(res.body, DELETE_FORBIDDEN_BODY);
	assert.ok(dbRow(P3.id));
});

test('D5: 이름이 null인 사용자는 일반 행(P1)도 삭제 불가 — 403', async () => {
	const agent = await loggedIn(USER_NONAME.email);
	const res = await agent.delete(url(P1.id));
	assert.equal(res.status, 403);
	assert.deepEqual(res.body, DELETE_FORBIDDEN_BODY);
	assert.ok(dbRow(P1.id));
});

test('D6: 이름이 공백뿐인 사용자는 owner가 빈 행(P5)도 삭제 불가 — 403', async () => {
	const agent = await loggedIn(USER_BLANK.email);
	const res = await agent.delete(url(P5.id));
	assert.equal(res.status, 403);
	assert.deepEqual(res.body, DELETE_FORBIDDEN_BODY);
	assert.ok(dbRow(P5.id));
});

test('D7: 없는 uuid, uuid 형식이 아닌 id — 404', async () => {
	const agent = await loggedIn();
	for (const id of [NONEXISTENT_ID, 'not-a-uuid']) {
		const res = await agent.delete(url(id));
		assert.equal(res.status, 404, id);
		assert.deepEqual(res.body, NOT_FOUND_BODY, id);
	}
});

test('D8: 비로그인 DELETE는 401(행 유지), 로그인 후 DB 에러는 500', async (t) => {
	t.mock.method(console, 'error', () => {});
	const anonymous = await request.agent(app).delete(url(P1.id));
	assert.equal(anonymous.status, 401);
	assert.deepEqual(anonymous.body, NEED_LOGIN_BODY);
	assert.ok(dbRow(P1.id));

	const agent = await loggedIn();
	state.error = new Error('db down');
	const res = await agent.delete(url(P1.id));
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});

// ---------- 순수 함수 ----------

test('V1: isVersionMatch — 같으면 true, 다르면 false', () => {
	assert.equal(imgagongPlansService.isVersionMatch(1, 1), true);
	assert.equal(imgagongPlansService.isVersionMatch(1, 2), false);
	assert.equal(imgagongPlansService.isVersionMatch(3, 1), false);
});

test('V2: nextMonthStart — 다음 달 1일, 12월은 다음 해 1월', () => {
	assert.equal(imgagongPlansService.nextMonthStart('2026-01'), '2026-02-01');
	assert.equal(imgagongPlansService.nextMonthStart('2026-09'), '2026-10-01');
	assert.equal(imgagongPlansService.nextMonthStart('2026-12'), '2027-01-01');
});

// ---------- SSE 이벤트 발행 (broadcast) ----------
// 업무 이벤트는 service가 "성공한 뒤에만" 발행한다. 실패(400/403/404/409/500)에는 한 번도 부르지 않는다.
// 여기서는 sse.broadcast를 빈 함수로 바꿔 끼우고, 호출 횟수와 인자만 확인한다.

const IDS_BODY = bodyOf('ids는 uuid 형식의 id를 1개 이상 담은 배열이어야 합니다');
const ADMIN_ONLY_BODY = bodyOf('관리자 권한이 필요합니다');
const BULK = '/api/imgagong-plans/bulk-confirm';
const setStatus = (plan, status) => {
	dbRow(plan.id).status = status;
};

test('E1: POST 성공은 created 발행(인자 = 응답 body), 400·500은 발행 없음', async (t) => {
	t.mock.method(console, 'error', () => {});
	const broadcast = t.mock.method(sse, 'broadcast', () => {});
	const agent = await loggedIn(USER_ROW.email);

	const res = await agent.post('/api/imgagong-plans').send(VALID_BODY);
	assert.equal(res.status, 201);
	assert.equal(broadcast.mock.callCount(), 1);
	assert.deepEqual(broadcast.mock.calls[0].arguments, ['created', res.body]);

	const bad = await agent.post('/api/imgagong-plans').send({ ...VALID_BODY, category: '  ' });
	assert.equal(bad.status, 400);
	state.error = new Error('db down');
	const fail = await agent.post('/api/imgagong-plans').send(VALID_BODY);
	assert.equal(fail.status, 500);
	assert.equal(broadcast.mock.callCount(), 1);
});

test('E2: PATCH 성공은 updated 발행(인자 = 응답 body), 409·404·403·400은 발행 없음', async (t) => {
	const broadcast = t.mock.method(sse, 'broadcast', () => {});
	const agent = await loggedIn(USER_ROW.email);

	const res = await agent.patch(url(P1.id)).send({ version: 1, module: 'M' });
	assert.equal(res.status, 200);
	assert.equal(broadcast.mock.callCount(), 1);
	assert.deepEqual(broadcast.mock.calls[0].arguments, ['updated', res.body]);

	const conflict = await agent.patch(url(P2.id)).send({ version: 1, module: 'X' });
	assert.equal(conflict.status, 409);
	const notFound = await agent.patch(url(NONEXISTENT_ID)).send({ version: 1, module: 'X' });
	assert.equal(notFound.status, 404);
	const forbidden = await agent.patch(url(P3.id)).send({ version: 1, status: 'checked' });
	assert.equal(forbidden.status, 403);
	const bad = await agent.patch(url(P3.id)).send({ module: 'X' });
	assert.equal(bad.status, 400);
	assert.equal(broadcast.mock.callCount(), 1);
});

test('E3: DELETE 성공은 deleted 발행({ id }), 403·404는 발행 없음', async (t) => {
	const broadcast = t.mock.method(sse, 'broadcast', () => {});
	const agent = await loggedIn(USER_ROW.email);

	const res = await agent.delete(url(P1.id));
	assert.equal(res.status, 200);
	assert.equal(broadcast.mock.callCount(), 1);
	assert.deepEqual(broadcast.mock.calls[0].arguments, ['deleted', { id: P1.id }]);

	const forbidden = await agent.delete(url(P3.id));
	assert.equal(forbidden.status, 403);
	const notFound = await agent.delete(url(NONEXISTENT_ID));
	assert.equal(notFound.status, 404);
	assert.equal(broadcast.mock.callCount(), 1);
});

// ---------- 일괄 의뢰확정 (PATCH /bulk-confirm) ----------
// 상태 흐름: new -> checked -> requested(의뢰 확정) -> approved(결재 완료)
// 'checked' 행만 'requested'로 바뀌고, 나머지(없는 id 포함)는 건너뛴다(부분 성공).

test('K1: 관리자 일괄 확정 — checked인 P1·P2만 requested, 나머지는 불변, broadcast 1회', async (t) => {
	const broadcast = t.mock.method(sse, 'broadcast', () => {});
	setStatus(P1, 'checked');
	setStatus(P2, 'checked');
	setStatus(P3, 'approved');
	setStatus(P4, 'requested');
	setStatus(P5, 'new');
	const [p3, p4, p5] = [P3, P4, P5].map((plan) => ({ ...dbRow(plan.id) }));
	const ids = [P1.id, P2.id, P3.id, P4.id, P5.id, NONEXISTENT_ID];

	const agent = await loggedIn();
	const res = await agent.patch(BULK).send({ ids });
	assert.equal(res.status, 200);
	assert.deepEqual(Object.keys(res.body), ['data']);
	assert.deepEqual(idsOf(res).sort(), [P1.id, P2.id].sort());
	for (const plan of res.body.data) {
		assert.deepEqual(Object.keys(plan).sort(), PLAN_KEYS, plan.id);
		assert.equal(plan.status, 'requested');
		assert.equal(plan.updatedBy, ADMIN_ROW.id);
		assert.equal(typeof plan.updatedAt, 'string');
	}
	const byId = Object.fromEntries(res.body.data.map((d) => [d.id, d]));
	assert.equal(byId[P1.id].version, 2);
	assert.equal(byId[P2.id].version, 4);

	assert.deepEqual(dbRow(P3.id), p3);
	assert.deepEqual(dbRow(P4.id), p4);
	assert.deepEqual(dbRow(P5.id), p5);

	assert.deepEqual(state.lastBulk.ids, ids);
	assert.deepEqual(state.lastBulk.cond, { status: 'checked' });
	assert.equal(state.lastBulk.data.status, 'requested');
	assert.equal(state.lastBulk.data.updated_by, ADMIN_ROW.id);

	assert.equal(broadcast.mock.callCount(), 1);
	assert.deepEqual(broadcast.mock.calls[0].arguments, ['bulk-confirmed', res.body.data]);

	const text = JSON.stringify(res.body);
	for (const key of SNAKE_KEYS) {
		assert.ok(!text.includes(key), `snake_case 키가 응답에 있음: ${key}`);
	}
});

test('K2: 모두 new(checked 없음) — 200 {data: []}, broadcast 없음, DB 불변', async (t) => {
	const broadcast = t.mock.method(sse, 'broadcast', () => {});
	const snapshot = JSON.stringify(state.plans);
	const agent = await loggedIn();
	const res = await agent.patch(BULK).send({ ids: [P1.id, P2.id, P3.id] });
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { data: [] });
	assert.equal(broadcast.mock.callCount(), 0);
	assert.equal(JSON.stringify(state.plans), snapshot);
});

test('K3: 없는 id만 — 200 {data: []}', async (t) => {
	const broadcast = t.mock.method(sse, 'broadcast', () => {});
	const agent = await loggedIn();
	const res = await agent.patch(BULK).send({ ids: [NONEXISTENT_ID] });
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { data: [] });
	assert.equal(broadcast.mock.callCount(), 0);
});

test('K4: 잘못된 ids(없음·null·문자열·객체·숫자·빈 배열·uuid 아님·섞임) — 400, DB·broadcast 호출 없음', async (t) => {
	const broadcast = t.mock.method(sse, 'broadcast', () => {});
	const agent = await loggedIn();
	const bodies = [
		undefined,
		{},
		{ ids: null },
		{ ids: 'x' },
		{ ids: {} },
		{ ids: 123 },
		{ ids: [] },
		{ ids: ['not-uuid'] },
		{ ids: [P1.id, 'abc'] },
		{ ids: [P1.id, 123] },
		{ ids: [null] }
	];
	for (const body of bodies) {
		const res = await (body === undefined ? agent.patch(BULK) : agent.patch(BULK).send(body));
		assert.equal(res.status, 400, JSON.stringify(body));
		assert.deepEqual(res.body, IDS_BODY, JSON.stringify(body));
		assert.equal(state.lastBulk, null, JSON.stringify(body));
	}
	assert.equal(broadcast.mock.callCount(), 0);
});

test('K5: 비로그인 401, 일반 사용자는 정상·잘못된 body 모두 403 — DB 불변', async (t) => {
	const broadcast = t.mock.method(sse, 'broadcast', () => {});
	setStatus(P1, 'checked');
	const snapshot = JSON.stringify(state.plans);

	const anonymous = await request
		.agent(app)
		.patch(BULK)
		.send({ ids: [P1.id] });
	assert.equal(anonymous.status, 401);
	assert.deepEqual(anonymous.body, NEED_LOGIN_BODY);

	const agent = await loggedIn(USER_ROW.email);
	for (const body of [{ ids: [P1.id] }, { ids: 'x' }, {}]) {
		const res = await agent.patch(BULK).send(body);
		assert.equal(res.status, 403, JSON.stringify(body));
		assert.deepEqual(res.body, ADMIN_ONLY_BODY, JSON.stringify(body));
	}
	assert.equal(JSON.stringify(state.plans), snapshot);
	assert.equal(state.lastBulk, null);
	assert.equal(broadcast.mock.callCount(), 0);
});

test('K6: 라우트 순서 — /bulk-confirm이 /:id로 잡히지 않음 (USER 403, 관리자 400)', async () => {
	const body = { version: 1, module: 'x' };
	const user = await loggedIn(USER_ROW.email);
	const forbidden = await user.patch(BULK).send(body);
	assert.equal(forbidden.status, 403);
	assert.deepEqual(forbidden.body, ADMIN_ONLY_BODY);

	const admin = await loggedIn();
	const res = await admin.patch(BULK).send(body);
	assert.equal(res.status, 400);
	assert.deepEqual(res.body, IDS_BODY);
	assert.notDeepEqual(res.body, VERSION_BODY);
	assert.notDeepEqual(res.body, NOT_FOUND_BODY);
});

test('K7: 같은 id가 두 번 들어와도(중복) 한 번만 확정 — data 1개, version 2', async (t) => {
	t.mock.method(sse, 'broadcast', () => {});
	setStatus(P1, 'checked');
	const agent = await loggedIn();
	const res = await agent.patch(BULK).send({ ids: [P1.id, P1.id] });
	assert.equal(res.status, 200);
	assert.deepEqual(idsOf(res), [P1.id]);
	assert.equal(res.body.data[0].version, 2);
});

test('K8: 같은 요청을 두 번 — 두 번째는 이미 requested라 {data: []}, broadcast는 1회뿐', async (t) => {
	const broadcast = t.mock.method(sse, 'broadcast', () => {});
	setStatus(P1, 'checked');
	const agent = await loggedIn();
	const first = await agent.patch(BULK).send({ ids: [P1.id] });
	assert.equal(first.status, 200);
	assert.equal(first.body.data.length, 1);
	const second = await agent.patch(BULK).send({ ids: [P1.id] });
	assert.equal(second.status, 200);
	assert.deepEqual(second.body, { data: [] });
	assert.equal(broadcast.mock.callCount(), 1);
	assert.equal(dbRow(P1.id).version, 2);
});

test('K9: 로그인 후 DB 에러 — 500 고정 메시지, broadcast 없음', async (t) => {
	t.mock.method(console, 'error', () => {});
	const broadcast = t.mock.method(sse, 'broadcast', () => {});
	const agent = await loggedIn();
	state.error = new Error('db down');
	const res = await agent.patch(BULK).send({ ids: [P1.id] });
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
	assert.equal(broadcast.mock.callCount(), 0);
});

// ---------- 실시간 스트림 (GET /stream) ----------

test('ST1: 비로그인 GET /stream — 401 JSON', async () => {
	const res = await request.agent(app).get('/api/imgagong-plans/stream');
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
});

test('ST2: 로그인하면 /:id가 아니라 stream 핸들러(sse.addClient)로 req, res가 전달됨', async (t) => {
	const addClient = t.mock.method(sse, 'addClient', (req, res) => res.status(204).end());
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.get('/api/imgagong-plans/stream');
	assert.equal(res.status, 204);
	assert.equal(addClient.mock.callCount(), 1);
	assert.equal(addClient.mock.calls[0].arguments[0].user.id, USER_ROW.id);
});

// 조건이 참이 될 때까지 짧게 폴링하고, 시간이 지나면 실패시키는 대기 도우미
const waitFor = async (condition, what, timeoutMs = 3000) => {
	const startedAt = Date.now();
	while (!condition()) {
		if (Date.now() - startedAt > timeoutMs) throw new Error(`시간 초과: ${what}`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
};

test('ST3: 진짜 연결 — 헤더·": connected" 수신, POST 하면 created 이벤트 수신, 끊으면 등록 해제', async () => {
	const server = app.listen(0);
	let req;
	try {
		await new Promise((resolve) => server.once('listening', resolve));
		const { port } = server.address();

		const loginRes = await request(app)
			.post('/api/auth/login')
			.send({ email: USER_ROW.email, password: PASSWORD });
		const cookie = loginRes.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

		let buffer = '';
		const response = await new Promise((resolve, reject) => {
			req = http.get(
				{
					host: '127.0.0.1',
					port,
					path: '/api/imgagong-plans/stream',
					headers: { Cookie: cookie }
				},
				resolve
			);
			req.on('error', reject);
		});
		assert.equal(response.statusCode, 200);
		assert.match(response.headers['content-type'], /^text\/event-stream/);
		assert.equal(response.headers['cache-control'], 'no-cache');
		response.setEncoding('utf8');
		response.on('data', (chunk) => {
			buffer += chunk;
		});

		await waitFor(() => buffer.includes(': connected\n\n'), ': connected');
		assert.equal(sse.clientCount(), 1);

		const created = await request(app)
			.post('/api/imgagong-plans')
			.set('Cookie', cookie)
			.send(VALID_BODY);
		assert.equal(created.status, 201);

		const prefix = 'event: created\ndata: ';
		await waitFor(() => buffer.includes(prefix) && buffer.endsWith('\n\n'), 'created 이벤트');
		const dataLine = buffer.slice(buffer.indexOf(prefix) + prefix.length).split('\n')[0];
		assert.deepEqual(JSON.parse(dataLine), created.body);

		req.destroy();
		await waitFor(() => sse.clientCount() === 0, '연결 해제', 1000);
	} finally {
		if (req) req.destroy();
		server.close();
	}
});
