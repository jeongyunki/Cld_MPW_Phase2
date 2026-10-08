/**
 * ============================================================
 * deliverablesStore.svelte.js
 * ============================================================
 * "Deliverables" 페이지의 목록과 페이지네이션 상태를 담아두는 공유 저장소.
 * imgagongStore와 같은 이유로 컴포넌트 "밖"에 두어, 다른 메뉴에 다녀와도
 * 보고 있던 페이지/검색어가 유지된다.
 *
 * 데이터의 원본은 서버(/deliverables)다. 이 파일만 api 계층을 호출하고,
 * 에러는 alert 등으로 표시하지 않고 던져서(throw) 페이지가 처리하게 한다.
 * ============================================================
 */

import {
	listDeliverables,
	createDeliverable,
	downloadDeliverable,
	deleteDeliverable
} from './api/deliverables.js';
import { clearUser } from './authStore.svelte.js';
import { toViewRow } from './deliverableRow.js';

// 한 화면에 보여줄 건수 (와이어프레임 1.2절 "한 화면 10~20건", 서버 기본값과 같음)
export const PAGE_LIMIT = 20;

// export한 $state는 재할당할 수 없어서, 내용을 바꿀 때는 splice / Object.assign으로 한다.
export const deliverables = $state([]);
// 마지막으로 불러온 페이지 번호, 전체 건수, 그때 쓴 검색어
export const deliverablesPaging = $state({ page: 1, total: 0, search: '' });

// 세션이 만료(401)되면 로그인 상태를 비운다 → 레이아웃이 /login으로 보낸다.
function handleAuthError(err) {
	if (err.status === 401) clearUser();
}

/** 서버에서 한 페이지(최신순)를 불러와 목록과 페이지 정보를 통째로 교체한다. */
export async function loadDeliverables({ page = 1, search = '' } = {}) {
	try {
		const res = await listDeliverables({ page, limit: PAGE_LIMIT, search: search || undefined });
		deliverables.splice(0, deliverables.length, ...res.data.map(toViewRow));
		Object.assign(deliverablesPaging, { page: res.page, total: res.total, search });
	} catch (err) {
		handleAuthError(err);
		throw err;
	}
}

/** 팝업 입력값({ mpwRound, processName, file })으로 등록한다. 목록 갱신은 페이지가 loadDeliverables로 한다. */
export async function addDeliverable(draft) {
	try {
		await createDeliverable({
			mpwRound: draft.mpwRound.trim(),
			processName: draft.processName.trim(),
			file: draft.file
		});
	} catch (err) {
		handleAuthError(err);
		throw err;
	}
}

/** 행의 원본 파일을 Blob으로 받아 돌려준다. 파일로 저장하는 것은 화면(페이지)의 일이다. */
export async function fetchDeliverableFile(row) {
	try {
		return await downloadDeliverable(row.id);
	} catch (err) {
		handleAuthError(err);
		throw err;
	}
}

/**
 * 체크박스로 선택된(_selected === true) 행들을 하나씩 서버에서 삭제한다 (일괄 삭제 API가 없음).
 * 성공한 행만 목록에서 지우고, 실패한 행(403 등)은 남긴 채 에러 배열로 돌려준다 (전부 성공이면 []).
 * 401이면 이후 요청도 모두 실패하므로 바로 던진다.
 */
export async function deleteSelectedDeliverables() {
	const selected = deliverables.filter((r) => r._selected);
	const errors = [];
	for (const row of selected) {
		try {
			await deleteDeliverable(row.id);
			const index = deliverables.findIndex((r) => r.id === row.id);
			if (index !== -1) deliverables.splice(index, 1);
		} catch (err) {
			if (err.status === 401) {
				clearUser();
				throw err;
			}
			errors.push(err);
		}
	}
	return errors;
}
