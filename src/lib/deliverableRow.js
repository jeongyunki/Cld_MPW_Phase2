/**
 * ============================================================
 * deliverableRow.js
 * ============================================================
 * Deliverables 행 변환과 Create 팝업 입력 검사 함수 모음.
 * Svelte에 의존하지 않는 순수 함수라서 Vitest로 바로 테스트할 수 있다.
 * ============================================================
 */

import { formatDateTime } from './imgagongRow.js';

// 서버(upload.js)와 같은 10MB 제한. 서버도 400으로 막지만, 업로드 전에 먼저 알려준다.
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const FILE_TOO_LARGE_MESSAGE =
	'파일 크기가 10MB를 초과합니다. 파일을 줄이거나 다른 방식으로 제공하세요';

/** 서버 행 -> 화면 행. 원본은 건드리지 않고 date(표시용)와 _selected(체크박스용)를 덧붙인다. */
export function toViewRow(item) {
	return { ...item, date: formatDateTime(item.createdAt), _selected: false };
}

export const isFileTooLarge = (file) => file != null && file.size > MAX_FILE_SIZE;

/** Create 팝업 입력값 검사. 문제가 있으면 화면에 보여줄 메시지, 없으면 ''. */
export function validateDraft({ mpwRound, processName, file }) {
	if (!mpwRound.trim()) return '차수는 필수 입력값입니다';
	if (!processName.trim()) return '공정명은 필수 입력값입니다';
	if (!file) return '엑셀 파일을 선택해 주세요';
	if (isFileTooLarge(file)) return FILE_TOO_LARGE_MESSAGE;
	return '';
}
