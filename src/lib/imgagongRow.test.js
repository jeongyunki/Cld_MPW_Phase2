// Vitest 테스트 — 임가공 Plan의 서버 행 <-> 화면 행 변환 순수 함수를 확인한다.
// Svelte·fetch에 의존하지 않으므로 가짜(mock) 없이 입력과 출력만 비교한다.
// 날짜는 TZ를 바꾸지 않고, 로컬 기준 Date를 ISO로 만들어 넣어 어떤 시간대에서도 같은 기대값이 나오게 한다.
import { describe, expect, it } from 'vitest';
import {
	formatDateTime,
	isInPeriod,
	mergeRow,
	toCreateBody,
	toPatchBody,
	toViewRow
} from './imgagongRow.js';

const ISO_R1 = new Date(2026, 0, 5, 9, 7).toISOString();

const serverPlan = () => ({
	id: 'u1',
	category: 'A',
	assembler: 'X사',
	chipSize: '5x5',
	module: null,
	lotCount: null,
	pkgQty: 10,
	pkgType: 'BGA',
	owner: 'lee',
	status: 'new',
	version: 1,
	createdAt: ISO_R1
});

describe('formatDateTime', () => {
	it('R1 ISO를 로컬 기준 YYYY-MM-DD HH:MM 으로 바꾼다 (한 자리 월/일/시/분은 0 채움)', () => {
		expect(formatDateTime(ISO_R1)).toBe('2026-01-05 09:07');
	});

	it('R2 초와 밀리초는 버린다', () => {
		const iso = new Date(2026, 11, 31, 23, 59, 59, 999).toISOString();
		expect(formatDateTime(iso)).toBe('2026-12-31 23:59');
	});
});

describe('toViewRow', () => {
	it('R3 원본 필드를 유지하고 date와 _selected:false 를 붙인다 (null은 그대로)', () => {
		const plan = serverPlan();
		expect(toViewRow(plan)).toStrictEqual({
			...serverPlan(),
			date: '2026-01-05 09:07',
			_selected: false
		});
	});

	it('R4 원본 객체는 바꾸지 않는다', () => {
		const plan = serverPlan();
		const view = toViewRow(plan);
		expect(view).not.toBe(plan);
		expect(plan).toStrictEqual(serverPlan());
		expect('date' in plan).toBe(false);
		expect('_selected' in plan).toBe(false);
	});
});

describe('toCreateBody', () => {
	const draft = () => ({
		category: 'A',
		assembler: 'X사',
		chipSize: '5x5',
		pkgType: 'BGA',
		owner: 'lee',
		module: '',
		lotCount: '',
		pkgQty: ''
	});

	it('R5 빈 문자열 lotCount/pkgQty 는 null 로, 나머지는 그대로 두며 status 키는 없다', () => {
		const body = toCreateBody(draft());
		expect(body).toStrictEqual({ ...draft(), lotCount: null, pkgQty: null });
		expect('status' in body).toBe(false);
	});

	it('R6 숫자 0 과 12 는 그대로 둔다', () => {
		const body = toCreateBody({ ...draft(), lotCount: 0, pkgQty: 12 });
		expect(body.lotCount).toBe(0);
		expect(body.pkgQty).toBe(12);
	});

	it('R7 null 과 undefined 는 둘 다 null 이 된다', () => {
		const body = toCreateBody({ ...draft(), lotCount: null, pkgQty: undefined });
		expect(body.lotCount).toBeNull();
		expect(body.pkgQty).toBeNull();
	});

	it('R8 draft 원본은 바꾸지 않는다', () => {
		const original = draft();
		const body = toCreateBody(original);
		expect(body).not.toBe(original);
		expect(original).toStrictEqual(draft());
	});

	it("R14 숫자 문자열 '5' 는 그대로 둔다", () => {
		const body = toCreateBody({ ...draft(), lotCount: '5' });
		expect(body.lotCount).toBe('5');
	});
});

describe('toPatchBody', () => {
	it('R9 바뀐 필드와 version 만 담는다 (id/_selected/date 등은 제외)', () => {
		const row = { id: 'u1', version: 3, owner: 'lee', _selected: true, date: '2026-01-05 09:07' };
		expect(toPatchBody(row, 'owner')).toStrictEqual({ owner: 'lee', version: 3 });
	});

	it('R10 lotCount null 은 null 로 보낸다', () => {
		expect(toPatchBody({ version: 2, lotCount: null }, 'lotCount')).toStrictEqual({
			lotCount: null,
			version: 2
		});
	});

	it('R11 pkgQty 빈 문자열은 null 로 바꾼다', () => {
		expect(toPatchBody({ version: 2, pkgQty: '' }, 'pkgQty')).toStrictEqual({
			pkgQty: null,
			version: 2
		});
	});

	it('R12 pkgQty 0 은 0 그대로 둔다', () => {
		expect(toPatchBody({ version: 2, pkgQty: 0 }, 'pkgQty')).toStrictEqual({
			pkgQty: 0,
			version: 2
		});
	});

	it('R13 숫자 필드가 아닌 module 의 빈 문자열은 그대로 둔다', () => {
		expect(toPatchBody({ version: 5, module: '' }, 'module')).toStrictEqual({
			module: '',
			version: 5
		});
	});
});

describe('isInPeriod', () => {
	const row = { date: '2026-03-15 10:00' };

	it('R15 시작~종료 월 안이면 true (경계 월 포함)', () => {
		expect(isInPeriod(row, { startMonth: '2026-03', endMonth: '2026-03' })).toBe(true);
		expect(isInPeriod(row, { startMonth: '2026-01', endMonth: '2026-12' })).toBe(true);
	});

	it('R16 시작 월 전이거나 종료 월 뒤면 false', () => {
		expect(isInPeriod(row, { startMonth: '2026-04', endMonth: '2026-12' })).toBe(false);
		expect(isInPeriod(row, { startMonth: '2026-01', endMonth: '2026-02' })).toBe(false);
	});

	it('R17 빈 값인 쪽은 경계가 없다', () => {
		expect(isInPeriod(row, { startMonth: '', endMonth: '' })).toBe(true);
		expect(isInPeriod(row, { startMonth: '', endMonth: '2026-02' })).toBe(false);
		expect(isInPeriod(row, { startMonth: undefined, endMonth: '2026-03' })).toBe(true);
	});
});

describe('mergeRow', () => {
	const ALL = { startMonth: '', endMonth: '' };
	const iso = (day) => new Date(2026, 0, day, 9, 0).toISOString();
	const plan = (id, day, version = 1, extra = {}) => ({
		...serverPlan(),
		id,
		createdAt: iso(day),
		version,
		...extra
	});
	// 서버처럼 최신순(createdAt 내림차순) 목록
	const rowsOf = (...plans) => plans.map(toViewRow);

	it('R18 version이 더 높으면 덮어쓰고 체크 상태는 유지한 채 그 행을 돌려준다', () => {
		const rows = rowsOf(plan('a', 5));
		rows[0]._selected = true;
		const before = rows[0];
		const result = mergeRow(rows, plan('a', 5, 2, { owner: 'kim' }), ALL);
		expect(result).toBe(before); // 같은 객체를 고친다 (each 키 유지)
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ owner: 'kim', version: 2, _selected: true });
	});

	it('R19 같거나 낮은 version(내 요청의 에코, 늦게 온 옛 이벤트)은 무시하고 null', () => {
		const rows = rowsOf(plan('a', 5, 3));
		expect(mergeRow(rows, plan('a', 5, 3, { owner: 'kim' }), ALL)).toBeNull();
		expect(mergeRow(rows, plan('a', 5, 2, { owner: 'kim' }), ALL)).toBeNull();
		expect(rows[0].owner).toBe('lee');
		expect(rows[0].version).toBe(3);
	});

	it('R20 없는 행은 최신순 자리에 끼워 넣는다 (맨 앞 / 중간 / 맨 뒤)', () => {
		const rows = rowsOf(plan('d8', 8), plan('d4', 4));
		mergeRow(rows, plan('d9', 9), ALL);
		mergeRow(rows, plan('d6', 6), ALL);
		const last = mergeRow(rows, plan('d1', 1), ALL);
		expect(rows.map((r) => r.id)).toStrictEqual(['d9', 'd8', 'd6', 'd4', 'd1']);
		expect(last).toBe(rows[4]);
		expect(last).toMatchObject({ date: formatDateTime(iso(1)), _selected: false });
	});

	it('R21 빈 목록에도 넣을 수 있다', () => {
		const rows = [];
		mergeRow(rows, plan('a', 5), ALL);
		expect(rows.map((r) => r.id)).toStrictEqual(['a']);
	});

	it('R22 조회 기간 밖의 새 행은 추가하지 않고 null', () => {
		const rows = [];
		const result = mergeRow(rows, plan('a', 5), { startMonth: '2026-02', endMonth: '2026-12' });
		expect(result).toBeNull();
		expect(rows).toHaveLength(0);
	});
});
