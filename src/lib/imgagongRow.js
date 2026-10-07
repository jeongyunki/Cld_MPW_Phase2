/**
 * ============================================================
 * imgagongRow.js
 * ============================================================
 * 임가공 Plan 행의 "서버 모양 <-> 화면 모양" 변환 함수 모음.
 * Svelte에 의존하지 않는 순수 함수라서 Vitest로 바로 테스트할 수 있다.
 * ============================================================
 */

// 빈 입력('' / null / undefined)은 서버가 받는 null로, 나머지는 그대로 둔다.
// 서버는 lotCount/pkgQty에 0 이상 정수 또는 null만 허용한다('' 는 400).
function toNullableInt(value) {
	return value === '' || value == null ? null : value;
}

const INT_FIELDS = ['lotCount', 'pkgQty'];

/**
 * 서버가 준 ISO 시각(UTC)을 'YYYY-MM-DD HH:MM'(브라우저 로컬 시각)으로 바꾼다.
 * toISOString().slice(0, 16)을 쓰면 UTC 기준이라 시간대가 어긋나므로,
 * 로컬 getter(getFullYear, getHours ...)로 직접 조립한다.
 */
export function formatDateTime(iso) {
	const d = new Date(iso);
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 서버 행 -> 화면 행. 원본은 건드리지 않고 date(표시용)와 _selected(체크박스용)를 덧붙인다. */
export function toViewRow(plan) {
	return { ...plan, date: formatDateTime(plan.createdAt), _selected: false };
}

/** Create 팝업 draft -> POST 본문. 숫자 칸의 빈 문자열만 null로 바꾼다. */
export function toCreateBody(draft) {
	return {
		...draft,
		lotCount: toNullableInt(draft.lotCount),
		pkgQty: toNullableInt(draft.pkgQty)
	};
}

/** 셀 하나가 바뀔 때 보낼 PATCH 본문. 바뀐 필드 하나와 낙관적 잠금용 version만 담는다. */
export function toPatchBody(row, field) {
	const value = INT_FIELDS.includes(field) ? toNullableInt(row[field]) : row[field];
	return { [field]: value, version: row.version };
}
