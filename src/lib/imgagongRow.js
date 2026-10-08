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

/** 화면 행이 조회 기간(YYYY-MM, 빈 값이면 그쪽 경계 없음) 안에 있는지. 서버처럼 생성 월로 판단한다. */
export function isInPeriod(row, { startMonth, endMonth }) {
	const month = row.date.slice(0, 7);
	return (!startMonth || month >= startMonth) && (!endMonth || month <= endMonth);
}

/**
 * 서버에서 온 행 하나(SSE 이벤트 또는 내 요청의 응답)를 화면 목록 rows에 반영한다. rows를 직접 바꾼다.
 * - 이미 있는 행: version이 더 높을 때만 덮어쓴다. 내 PATCH 결과가 SSE로 다시 와도(같은 version)
 *   두 번 반영되지 않고, 늦게 도착한 옛 이벤트로 값이 되돌아가지도 않는다. 체크박스 상태는 유지한다.
 * - 없는 행: 조회 기간 안이면 최신순(createdAt 내림차순) 자리에 끼워 넣고, 밖이면 무시한다.
 * 반영했으면 rows 안의 그 행을, 무시했으면 null을 돌려준다.
 */
export function mergeRow(rows, plan, period) {
	const index = rows.findIndex((r) => r.id === plan.id);
	if (index !== -1) {
		const current = rows[index];
		if (plan.version <= current.version) return null;
		Object.assign(current, toViewRow(plan), { _selected: current._selected });
		return current;
	}
	const view = toViewRow(plan);
	if (!isInPeriod(view, period)) return null;
	const at = rows.findIndex((r) => r.createdAt < plan.createdAt);
	const insertAt = at === -1 ? rows.length : at;
	rows.splice(insertAt, 0, view);
	return rows[insertAt];
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
