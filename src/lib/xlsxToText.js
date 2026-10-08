/**
 * ============================================================
 * xlsxToText.js
 * ============================================================
 * 엑셀 파일(.xlsx/.xls 바이너리)의 첫 번째 시트를 "엑셀에서 복사해 붙여넣은 텍스트"와
 * 같은 모양(셀은 탭, 행은 줄바꿈)으로 바꾼다. 이렇게 하면 parseModuleData.js의
 * 기존 파싱 로직을 고치지 않고 그대로 재사용할 수 있다.
 * Svelte에 의존하지 않는 순수 함수라서 Vitest로 바로 테스트할 수 있다.
 * ============================================================
 */

import { read, utils } from 'xlsx';

/**
 * @param {ArrayBuffer} data - 서버에서 내려받은 파일 내용 (Blob.arrayBuffer() 결과)
 * @returns {string} 탭/줄바꿈으로 구분된 텍스트 (빈 시트면 '')
 */
export function xlsxToText(data) {
	const workbook = read(data, { type: 'array' });
	const sheet = workbook.Sheets[workbook.SheetNames[0]];
	if (!sheet?.['!ref']) return '';

	// 파싱이 열 위치(A=0, D=3 ...)에 의존하므로, 시트의 사용 범위가 B열 이후에서 시작해도
	// 항상 A열부터 읽어 열이 밀리지 않게 한다.
	const range = utils.decode_range(sheet['!ref']);
	range.s.c = 0;

	// header: 1 → 행마다 셀 값 배열, raw: true → 서식 문자열('1,234')이 아닌 원래 값(1234),
	// defval: '' → 빈 셀도 자리를 유지해 뒤 열이 앞으로 당겨지지 않게 한다.
	const rows = utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', range });
	return rows.map((cells) => cells.join('\t')).join('\n');
}
