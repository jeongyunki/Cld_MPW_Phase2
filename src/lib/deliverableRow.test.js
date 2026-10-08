// Vitest 테스트 — Deliverables 행 변환과 Create 팝업 입력 검사(순수 함수)를 확인한다.
import { describe, expect, it } from 'vitest';
import {
	FILE_TOO_LARGE_MESSAGE,
	MAX_FILE_SIZE,
	isFileTooLarge,
	toViewRow,
	validateDraft
} from './deliverableRow.js';
import { formatDateTime } from './imgagongRow.js';

// size만 쓰므로 실제 10MB를 만들지 않고 size를 가진 객체로 대신한다
const fakeFile = (size) => ({ name: 'a.xlsx', size });
const draft = (overrides = {}) => ({
	mpwRound: 'MPW2026-Q3',
	processName: '0.13um',
	file: fakeFile(100),
	...overrides
});

describe('toViewRow', () => {
	it('서버 필드는 그대로 두고 date와 _selected를 덧붙인다', () => {
		const item = {
			id: 'id-1',
			mpwRound: 'R1',
			originalFileName: 'a.xlsx',
			createdAt: '2026-09-28T05:30:00.000Z'
		};
		const row = toViewRow(item);
		expect(row).toStrictEqual({
			...item,
			date: formatDateTime(item.createdAt),
			_selected: false
		});
		expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
		expect(item).not.toHaveProperty('_selected');
	});
});

describe('isFileTooLarge', () => {
	it('10MB까지는 허용하고 1바이트라도 넘으면 true', () => {
		expect(isFileTooLarge(fakeFile(MAX_FILE_SIZE))).toBe(false);
		expect(isFileTooLarge(fakeFile(MAX_FILE_SIZE + 1))).toBe(true);
	});

	it('파일이 없으면 false', () => {
		expect(isFileTooLarge(null)).toBe(false);
		expect(isFileTooLarge(undefined)).toBe(false);
	});
});

describe('validateDraft', () => {
	it('모두 정상이면 빈 문자열', () => {
		expect(validateDraft(draft())).toBe('');
	});

	it('차수가 비었거나 공백뿐이면 필수 입력값 에러', () => {
		expect(validateDraft(draft({ mpwRound: '' }))).toBe('차수는 필수 입력값입니다');
		expect(validateDraft(draft({ mpwRound: '   ' }))).toBe('차수는 필수 입력값입니다');
	});

	it('공정명이 비었으면 필수 입력값 에러', () => {
		expect(validateDraft(draft({ processName: ' ' }))).toBe('공정명은 필수 입력값입니다');
	});

	it('파일을 고르지 않으면 에러', () => {
		expect(validateDraft(draft({ file: null }))).toBe('엑셀 파일을 선택해 주세요');
	});

	it('10MB를 넘는 파일이면 크기 경고', () => {
		expect(validateDraft(draft({ file: fakeFile(MAX_FILE_SIZE + 1) }))).toBe(
			FILE_TOO_LARGE_MESSAGE
		);
	});
});
