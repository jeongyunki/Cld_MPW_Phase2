// Master 항목 응답 변환 순수 함수 (Svelte 비의존 — Vitest 대상, masterStore가 사용)

/**
 * GET /master-items 응답({ status: [MasterItem], ... })을 화면용 이름 배열과 삭제용 id 배열로 나눈다.
 * keys에 있는데 응답에 없는 필드는 빈 배열로 채운다.
 * 예: { chipSize: [{ id: 'a', itemName: '8인치' }] } → { names: { chipSize: ['8인치'] }, ids: { chipSize: ['a'] } }
 */
export function splitGrouped(grouped, keys) {
	const names = {};
	const ids = {};
	for (const key of keys) {
		const items = grouped[key] ?? [];
		names[key] = items.map((item) => item.itemName);
		ids[key] = items.map((item) => item.id);
	}
	return { names, ids };
}
