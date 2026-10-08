// Vitest 테스트 — 임가공 Plan의 서버 행 <-> 화면 행 변환 순수 함수를 확인한다.
// Svelte·fetch에 의존하지 않으므로 가짜(mock) 없이 입력과 출력만 비교한다.
// 날짜는 TZ를 바꾸지 않고, 로컬 기준 Date를 ISO로 만들어 넣어 어떤 시간대에서도 같은 기대값이 나오게 한다.
import { describe, expect, it } from 'vitest';
import { formatDateTime, toCreateBody, toPatchBody, toViewRow } from './imgagongRow.js';

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
