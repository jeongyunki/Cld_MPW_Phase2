// Vitest 테스트 — xlsx 바이너리를 붙여넣기 텍스트로 바꾸고, 기존 파싱 로직까지 이어지는지 확인한다.
// 테스트용 엑셀 파일은 같은 SheetJS로 메모리에서 만든다 (실제 파일 없이).
import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { xlsxToText } from './xlsxToText.js';
import { parsePastedModuleData } from './parseModuleData.js';

// 2차원 배열 → xlsx 바이너리(ArrayBuffer). sheets로 뒤쪽 시트를 더 붙일 수 있다.
function makeXlsx(rows, { sheets = [] } = {}) {
	const workbook = utils.book_new();
	const sheet = utils.aoa_to_sheet(rows);
	utils.book_append_sheet(workbook, sheet, 'Sheet1');
	for (const [name, other] of sheets)
		utils.book_append_sheet(workbook, utils.aoa_to_sheet(other), name);
	return write(workbook, { type: 'array', bookType: 'xlsx' });
}

// MapGen이 기대하는 열 배치: A=이름, D/E=width/height, H/I=x/y, chip 정보는 A 라벨 + B/C
const SAMPLE = [
	['Module', '', '', 'width', 'height', '', '', 'x', 'y'],
	['M1', '', '', 100, 200, '', '', 10, 20],
	['M2', '', '', 1500, 50.5, '', '', 0, 30],
	['One Shot Size', 26000, 33000],
	['MostOuter ScribeLine Size', 80, 80],
	['Step pitch', 2000, 3000]
];

describe('xlsxToText', () => {
	it('X1 첫 시트를 탭/줄바꿈 텍스트로 바꾸고, 빈 셀도 자리를 유지한다', () => {
		const text = xlsxToText(makeXlsx(SAMPLE));
		const lines = text.split('\n');
		expect(lines[1]).toBe('M1\t\t\t100\t200\t\t\t10\t20');
		expect(lines[3]).toBe('One Shot Size\t26000\t33000\t\t\t\t\t\t');
	});

	it('X2 변환 결과가 기존 파싱 로직에서 module/chip으로 인식된다', () => {
		const result = parsePastedModuleData(xlsxToText(makeXlsx(SAMPLE)));
		expect(result.modules).toStrictEqual([
			{ name: 'M1', width: 100, height: 200, x: 10, y: 20 },
			{ name: 'M2', width: 1500, height: 50.5, x: 0, y: 30 }
		]);
		expect(result.chip).toStrictEqual({
			oneShotSize: { width: 26000, height: 33000 },
			outerScribeSize: { width: 80, height: 80 },
			stepPitch: { width: 2000, height: 3000 }
		});
		expect(result.warnings).toStrictEqual([]);
	});

	it('X3 천 단위 쉼표 서식이 있어도 원래 숫자 값으로 읽는다', () => {
		const workbook = utils.book_new();
		const sheet = utils.aoa_to_sheet([['M1', '', '', 1500, 2, '', '', 3, 4]]);
		sheet.D1.z = '#,##0';
		utils.book_append_sheet(workbook, sheet, 'S');
		const text = xlsxToText(write(workbook, { type: 'array', bookType: 'xlsx' }));
		expect(text).toBe('M1\t\t\t1500\t2\t\t\t3\t4');
	});

	it('X4 시트 내용이 B열부터 시작해도 A열 기준 위치를 유지한다', () => {
		// 엑셀이 저장한 사용 범위(!ref)가 C2:D2인 시트 — 행은 범위 첫 행부터, 열은 A열부터 읽는다
		const workbook = utils.book_new();
		const sheet = utils.aoa_to_sheet([['x', 'y']], { origin: 'C2' });
		sheet['!ref'] = 'C2:D2';
		utils.book_append_sheet(workbook, sheet, 'S');
		const text = xlsxToText(write(workbook, { type: 'array', bookType: 'xlsx' }));
		expect(text).toBe('\t\tx\ty');
	});

	it('X5 두 번째 시트는 읽지 않는다', () => {
		const text = xlsxToText(makeXlsx([['first']], { sheets: [['Sheet2', [['second']]]] }));
		expect(text).toBe('first');
	});

	it('X6 빈 시트면 빈 문자열', () => {
		expect(xlsxToText(makeXlsx([]))).toBe('');
	});

	it('X7 같은 파일을 두 번 읽으면 같은 텍스트 (파싱 일관성)', () => {
		const data = makeXlsx(SAMPLE);
		expect(xlsxToText(data)).toBe(xlsxToText(data));
	});
});
