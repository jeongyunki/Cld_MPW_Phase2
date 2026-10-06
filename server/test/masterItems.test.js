// BE-3 master-items API HTTP 수준 테스트 (node:test + supertest)
//
// 왜 DB를 가짜로 바꾸는가?
// - auth.test.js와 같은 이유다. require.cache에 가짜 connection(fakeDb)을 미리 넣어 두면
//   repository가 받는 db는 진짜 PostgreSQL이 아니라 아래의 fakeDb다.
// - fakeDb는 테이블별로 Knex 체인 모양(orderBy, where().first(), where().max().first(),
//   insert().returning(), where().del(), where().count().first())만 흉내 낸다.
//   체인에 넘기는 인자는 assert로 검증하므로, repository의 Knex 호출 모양이 곧 이 테스트의 계약이다.
//
// 왜 케이스마다 request.agent(app)인가?
// - 세션은 쿠키로 유지된다. agent는 브라우저처럼 쿠키를 저장해 다음 요청에 자동으로 실어 준다.
// - 케이스마다 새 agent를 만들어 서로의 로그인 상태가 섞이지 않게 한다.
// - beforeEach는 케이스마다 fakeDb 상태(users, items, plans, error)를 초기화한다.

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

// master_items fixture (DB 모양 = snake_case). 일부러 섞인 순서로 둔다.
const itemRow = (n, fieldName, itemName, sortOrder, createdAt) => ({
	id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`,
	field_name: fieldName,
	item_name: itemName,
	sort_order: sortOrder,
	created_at: createdAt,
	updated_at: null,
	version: 1
});
const ITEM_ROWS = [
	itemRow(1, 'status', 'checked', 1, '2026-10-01T00:00:00.000Z'),
	itemRow(2, 'status', 'new', 0, '2026-10-01T00:00:00.000Z'),
	itemRow(3, 'chip_size', 'ETC', 1, '2026-10-02T00:00:00.000Z'),
	itemRow(4, 'chip_size', '8인치', 0, '2026-10-01T00:00:00.000Z'),
	itemRow(5, 'chip_size', '12인치', 1, '2026-10-01T00:00:00.000Z'),
	itemRow(6, 'category', '산학', 0, '2026-10-01T00:00:00.000Z')
];
const ID_8 = ITEM_ROWS[3].id;
const ID_ETC = ITEM_ROWS[2].id;
const PLAN_ROWS = [
	{ chip_size: '8인치', category: '산학' },
	{ chip_size: '8인치', category: '산학' },
	{ chip_size: '12인치', category: '8인치' }
];

const state = { users: [], items: [], plans: [], error: null, seq: 0 };

const match = (cond) => (r) => Object.keys(cond).every((k) => r[k] === cond[k]);
// master_items / imgagong_plans에서만 DB 에러를 흉내 낸다. (users는 로그인 때문에 제외)
const check = () => {
	if (state.error) throw state.error;
};

const fakeDb = (table) => {
	if (table === 'users') {
		return { where: (cond) => ({ first: async () => state.users.find(match(cond)) }) };
	}
	if (table === 'master_items') {
		return {
			orderBy: async (cols) => {
				check();
				assert.deepEqual(cols, ['sort_order', 'created_at']);
				return [...state.items].sort(
					(a, b) =>
						(a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) ||
						a.created_at.localeCompare(b.created_at)
				);
			},
			where: (cond) => ({
				first: async () => {
					check();
					return state.items.find(match(cond));
				},
				max: (expr) => ({
					first: async () => {
						check();
						assert.equal(expr, 'sort_order as max');
						const vals = state.items
							.filter(match(cond))
							.map((r) => r.sort_order)
							.filter((v) => v !== null);
						return { max: vals.length ? Math.max(...vals) : null };
					}
				}),
				del: async () => {
					check();
					const before = state.items.length;
					state.items = state.items.filter((r) => !match(cond)(r));
					return before - state.items.length;
				}
			}),
			insert: (row) => ({
				returning: async (cols) => {
					check();
					assert.equal(cols, '*');
					const newRow = {
						id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(++state.seq).padStart(12, '0')}`,
						...row,
						created_at: new Date().toISOString(),
						updated_at: null,
						version: 1
					};
					state.items.push(newRow);
					return [newRow];
				}
			})
		};
	}
	if (table === 'imgagong_plans') {
		return {
			where: (cond) => ({
				count: (expr) => ({
					first: async () => {
						check();
						assert.equal(expr, '* as count');
						// pg의 count는 문자열로 돌아온다.
						return { count: String(state.plans.filter(match(cond)).length) };
					}
				})
			})
		};
	}
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

beforeEach(() => {
	state.users = [ADMIN_ROW, USER_ROW];
	state.items = ITEM_ROWS.map((r) => ({ ...r }));
	state.plans = PLAN_ROWS.map((r) => ({ ...r }));
	state.error = null;
	state.seq = 0;
});

const FIELD_NAME_BODY = {
	error: {
		message: 'fieldName은 status, category, assembler, chipSize, pkgType 중 하나여야 합니다'
	}
};
const ITEM_NAME_BODY = { error: { message: '항목명을 입력해 주세요' } };
const DUPLICATE_BODY = { error: { message: '같은 필드에 이미 등록된 항목입니다' } };
const NOT_FOUND_BODY = { error: { message: 'Master 항목을 찾을 수 없습니다' } };
const NEED_LOGIN_BODY = { error: { message: '로그인이 필요합니다' } };
const NEED_ADMIN_BODY = { error: { message: '관리자 권한이 필요합니다' } };
const SERVER_ERROR_BODY = { error: { message: '서버 내부 오류가 발생했습니다' } };

const login = (agent, email = ADMIN_ROW.email) =>
	agent.post('/api/auth/login').send({ email, password: PASSWORD });

const loggedIn = async (email) => {
	const agent = request.agent(app);
	await login(agent, email);
	return agent;
};

// ---------- 목록 조회 (GET) ----------

test('G1: 관리자 GET — 200, 키 정확히 5개, MasterItem 7키(camelCase), snake_case 키 없음', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/master-items');
	assert.equal(res.status, 200);
	assert.deepEqual(Object.keys(res.body), [
		'status',
		'category',
		'assembler',
		'chipSize',
		'pkgType'
	]);
	assert.deepEqual(res.body.chipSize[0], {
		id: ID_8,
		fieldName: 'chipSize',
		itemName: '8인치',
		sortOrder: 0,
		createdAt: '2026-10-01T00:00:00.000Z',
		updatedAt: null,
		version: 1
	});
	const text = JSON.stringify(res.body);
	for (const key of ['field_name', 'item_name', 'sort_order', 'created_at', 'updated_at']) {
		assert.ok(!text.includes(key), `snake_case 키가 응답에 있음: ${key}`);
	}
});

test('G2: 행이 없는 필드는 빈 배열 — assembler, pkgType', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/master-items');
	assert.deepEqual(res.body.assembler, []);
	assert.deepEqual(res.body.pkgType, []);
});

test('G3: sortOrder, createdAt 순으로 정렬되어 필드별로 묶임', async () => {
	const agent = await loggedIn();
	const res = await agent.get('/api/master-items');
	assert.deepEqual(
		res.body.chipSize.map((i) => i.itemName),
		['8인치', '12인치', 'ETC']
	);
	assert.deepEqual(
		res.body.status.map((i) => i.itemName),
		['new', 'checked']
	);
});

test('G4: 일반 사용자 GET — 200', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.get('/api/master-items');
	assert.equal(res.status, 200);
});

test('G5: 비로그인 GET — 401', async () => {
	const res = await request.agent(app).get('/api/master-items');
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
});

test('G6: 로그인 후 DB 에러가 나면 GET — 500 고정 메시지', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	state.error = new Error('db down');
	const res = await agent.get('/api/master-items');
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});

// ---------- 추가 (POST) ----------

test('P1: 관리자 POST chipSize — 201, 다음 sortOrder(2), DB 행은 snake_case', async () => {
	const agent = await loggedIn();
	const res = await agent
		.post('/api/master-items')
		.send({ fieldName: 'chipSize', itemName: '16인치' });
	assert.equal(res.status, 201);
	assert.deepEqual(Object.keys(res.body).sort(), [
		'createdAt',
		'fieldName',
		'id',
		'itemName',
		'sortOrder',
		'updatedAt',
		'version'
	]);
	assert.equal(res.body.fieldName, 'chipSize');
	assert.equal(res.body.itemName, '16인치');
	assert.equal(res.body.sortOrder, 2);
	assert.equal(res.body.version, 1);
	assert.equal(typeof res.body.id, 'string');
	assert.equal(typeof res.body.createdAt, 'string');

	const last = state.items[state.items.length - 1];
	assert.equal(last.field_name, 'chip_size');
	assert.equal(last.item_name, '16인치');
	assert.equal(last.sort_order, 2);
});

test('P2: 행이 없는 필드(pkgType)에 첫 항목 POST — 201, sortOrder 0', async () => {
	const agent = await loggedIn();
	const res = await agent
		.post('/api/master-items')
		.send({ fieldName: 'pkgType', itemName: 'p-type9' });
	assert.equal(res.status, 201);
	assert.equal(res.body.sortOrder, 0);
});

test('P3: itemName 앞뒤 공백은 제거되어 저장됨', async () => {
	const agent = await loggedIn();
	const res = await agent
		.post('/api/master-items')
		.send({ fieldName: 'chipSize', itemName: '  16인치  ' });
	assert.equal(res.status, 201);
	assert.equal(res.body.itemName, '16인치');
	assert.equal(state.items[state.items.length - 1].item_name, '16인치');
});

test('P4: 잘못된 fieldName(chip_size, foo, 누락) — 400, 행 개수 변화 없음', async () => {
	const agent = await loggedIn();
	const before = state.items.length;
	const bodies = [
		{ fieldName: 'chip_size', itemName: 'x' },
		{ fieldName: 'foo', itemName: 'x' },
		{ itemName: 'x' }
	];
	for (const body of bodies) {
		const res = await agent.post('/api/master-items').send(body);
		assert.equal(res.status, 400, JSON.stringify(body));
		assert.deepEqual(res.body, FIELD_NAME_BODY, JSON.stringify(body));
	}
	assert.equal(state.items.length, before);
});

test('P5: body 없이 POST — 400 fieldName 메시지', async () => {
	const agent = await loggedIn();
	const res = await agent.post('/api/master-items');
	assert.equal(res.status, 400);
	assert.deepEqual(res.body, FIELD_NAME_BODY);
});

test('P6: 잘못된 itemName(공백만, 숫자, 누락) — 400 항목명 메시지', async () => {
	const agent = await loggedIn();
	const before = state.items.length;
	const bodies = [
		{ fieldName: 'chipSize', itemName: '   ' },
		{ fieldName: 'chipSize', itemName: 123 },
		{ fieldName: 'chipSize' }
	];
	for (const body of bodies) {
		const res = await agent.post('/api/master-items').send(body);
		assert.equal(res.status, 400, JSON.stringify(body));
		assert.deepEqual(res.body, ITEM_NAME_BODY, JSON.stringify(body));
	}
	assert.equal(state.items.length, before);
});

test('P7: 같은 필드에 같은 이름(trim 후) POST — 409, 행 개수 변화 없음', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	const before = state.items.length;
	const res = await agent
		.post('/api/master-items')
		.send({ fieldName: 'chipSize', itemName: ' 8인치 ' });
	assert.equal(res.status, 409);
	assert.deepEqual(res.body, DUPLICATE_BODY);
	assert.equal(state.items.length, before);
});

test('P8: 다른 필드의 같은 이름, 대소문자만 다른 이름은 중복 아님 — 201', async () => {
	const agent = await loggedIn();
	const bodies = [
		{ fieldName: 'category', itemName: '8인치' },
		{ fieldName: 'chipSize', itemName: 'etc' }
	];
	for (const body of bodies) {
		const res = await agent.post('/api/master-items').send(body);
		assert.equal(res.status, 201, JSON.stringify(body));
	}
});

test('P9: 일반 사용자 POST — 403, 행 변화 없음', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const before = state.items.length;
	const res = await agent
		.post('/api/master-items')
		.send({ fieldName: 'chipSize', itemName: '16인치' });
	assert.equal(res.status, 403);
	assert.deepEqual(res.body, NEED_ADMIN_BODY);
	assert.equal(state.items.length, before);
});

test('P10: 비로그인 POST(잘못된 본문이어도) — 401', async () => {
	const res = await request.agent(app).post('/api/master-items').send({ fieldName: 'foo' });
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
});

test('P11: 로그인 후 DB 에러가 나면 유효한 POST — 500', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	state.error = new Error('db down');
	const res = await agent
		.post('/api/master-items')
		.send({ fieldName: 'chipSize', itemName: '16인치' });
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});

// ---------- 삭제 (DELETE) ----------

test('D1: 관리자 DELETE — 200 {id, affectedImgagongPlanCount:2}, 행 제거', async () => {
	const agent = await loggedIn();
	const res = await agent.delete(`/api/master-items/${ID_8}`);
	assert.equal(res.status, 200);
	assert.deepEqual(res.body, { id: ID_8, affectedImgagongPlanCount: 2 });
	assert.equal(typeof res.body.affectedImgagongPlanCount, 'number');
	assert.ok(!state.items.some((r) => r.id === ID_8));
});

test('D2: 사용 중인 계획이 없는 항목 DELETE — 200, count 0', async () => {
	const agent = await loggedIn();
	const res = await agent.delete(`/api/master-items/${ID_ETC}`);
	assert.equal(res.status, 200);
	assert.equal(res.body.affectedImgagongPlanCount, 0);
});

test('D3: uuid 형식이지만 없는 id DELETE — 404, 행 변화 없음', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	const before = state.items.length;
	const res = await agent.delete('/api/master-items/cccccccc-cccc-4ccc-8ccc-cccccccccccc');
	assert.equal(res.status, 404);
	assert.deepEqual(res.body, NOT_FOUND_BODY);
	assert.equal(state.items.length, before);
});

test('D4: uuid 형식이 아닌 id DELETE — 404 (DB 에러 상태여도 500이 아님 = DB 미호출)', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	state.error = new Error('db down');
	const res = await agent.delete('/api/master-items/not-a-uuid');
	assert.equal(res.status, 404);
	assert.deepEqual(res.body, NOT_FOUND_BODY);
});

test('D5: 일반 사용자 DELETE — 403, 행 유지', async () => {
	const agent = await loggedIn(USER_ROW.email);
	const res = await agent.delete(`/api/master-items/${ID_8}`);
	assert.equal(res.status, 403);
	assert.deepEqual(res.body, NEED_ADMIN_BODY);
	assert.ok(state.items.some((r) => r.id === ID_8));
});

test('D6: 비로그인 DELETE — 401', async () => {
	const res = await request.agent(app).delete(`/api/master-items/${ID_8}`);
	assert.equal(res.status, 401);
	assert.deepEqual(res.body, NEED_LOGIN_BODY);
});

test('D7: 로그인 후 DB 에러가 나면 유효 id DELETE — 500', async (t) => {
	t.mock.method(console, 'error', () => {});
	const agent = await loggedIn();
	state.error = new Error('db down');
	const res = await agent.delete(`/api/master-items/${ID_8}`);
	assert.equal(res.status, 500);
	assert.deepEqual(res.body, SERVER_ERROR_BODY);
});

test('D8: pkgType 항목 DELETE — field_name에 맞는 plans 컬럼(pkg_type)으로 count 1', async () => {
	const agent = await loggedIn();
	const row = itemRow(7, 'pkg_type', 'p-type1', 0, '2026-10-01T00:00:00.000Z');
	state.items.push(row);
	state.plans.push({ pkg_type: 'p-type1' });
	const res = await agent.delete(`/api/master-items/${row.id}`);
	assert.equal(res.status, 200);
	assert.equal(res.body.affectedImgagongPlanCount, 1);
});
