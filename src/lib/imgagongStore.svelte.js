/**
 * ============================================================
 * imgagongStore.svelte.js
 * ============================================================
 * "임가공 Plan" 페이지의 표(table) 데이터를 담아두는 공유 저장소.
 *
 * 왜 페이지 파일(+page.svelte) 안에 $state로 두지 않았는가?
 * SvelteKit은 사이드바에서 다른 메뉴로 이동했다가 돌아오면 그 페이지
 * 컴포넌트를 다시 새로 만든다. 컴포넌트 "안"의 $state는 그때 초기화되어
 * 버린다. 이 파일처럼 컴포넌트 "밖"에 있는 $state는 페이지를 오가도
 * 그대로 유지된다.
 *
 * 서버 연동: 이제 데이터의 원본은 서버(/imgagong-plans)다. 이 파일이 api 계층을
 * 호출하고, 임가공 Plan 페이지 쪽 코드는 거의 그대로 두었다.
 * 에러는 alert 등으로 표시하지 않고 던져서(throw) 페이지가 처리하게 한다.
 * ============================================================
 */

import {
  listImgagongPlans,
  createImgagongPlan,
  updateImgagongPlan,
  deleteImgagongPlan,
} from './api/imgagongPlans.js';
import { clearUser } from './authStore.svelte.js';
import { toViewRow, toCreateBody, toPatchBody } from './imgagongRow.js';

// 페이지 번호 UI 없이 조회 기간 안의 행을 한 번에 가져온다 (이슈 #14 결정 1).
const LIST_LIMIT = 1000;

// 가장 최근에 보낸 조회 요청의 번호. 응답이 늦게 도착한 "옛 요청"을 버리는 데 쓴다.
// 일부러 $state로 만들지 않았다: 반응형이면 $effect 안에서 읽는 순간 의존성이 되어
// loadRows가 값을 바꿀 때마다 $effect가 다시 실행되는 무한 루프 위험이 있다.
let latestRequest = 0;

// export한 $state는 재할당할 수 없어서, 내용을 바꿀 때는 splice로 한다.
export const imgagongRows = $state([]);

// 세션이 만료(401)되면 로그인 상태를 비운다 → 레이아웃이 /login으로 보낸다.
function handleAuthError(err) {
  if (err.status === 401) clearUser();
}

/**
 * 조회 기간(YYYY-MM)으로 서버에서 목록을 불러와 imgagongRows를 통째로 교체한다.
 * 기간을 빠르게 바꿔 요청이 겹치면 "마지막 요청"의 응답만 반영한다.
 *
 * 주의: 페이지의 $effect가 이 함수를 호출한다. $effect는 "실행되는 동안 읽은 $state"를
 * 의존성으로 삼으므로, await 이전의 동기 구간에서는 $state(imgagongRows, auth 등)를
 * 읽지 않는다. (latestRequest와 인자만 쓴다.)
 */
export async function loadRows({ startMonth, endMonth }) {
  const requestNo = ++latestRequest;
  try {
    const { data } = await listImgagongPlans({
      limit: LIST_LIMIT,
      startMonth: startMonth || undefined,
      endMonth: endMonth || undefined,
    });
    if (requestNo !== latestRequest) return;
    imgagongRows.splice(0, imgagongRows.length, ...data.map(toViewRow));
  } catch (err) {
    handleAuthError(err);
    if (requestNo !== latestRequest) return;
    throw err;
  }
}

/** 팝업에서 입력받은 값(draft)으로 서버에 새 행을 만든다. 목록 갱신은 페이지가 loadRows로 한다. */
export async function addRow(draft) {
  try {
    await createImgagongPlan(toCreateBody(draft));
  } catch (err) {
    handleAuthError(err);
    throw err;
  }
}

/**
 * 셀 하나(field)의 값을 서버에 저장하고, 응답(새 version 등)을 그 행에 반영한다.
 * 실패하면 던진다. 화면 값 되돌리기는 페이지가 loadRows로 한다.
 */
export async function updateRow(row, field) {
  try {
    const updated = await updateImgagongPlan(row.id, toPatchBody(row, field));
    Object.assign(row, toViewRow(updated), { _selected: row._selected });
  } catch (err) {
    handleAuthError(err);
    throw err;
  }
}

/**
 * 체크박스로 선택된(_selected === true) 행들을 하나씩 서버에서 삭제한다.
 * 성공한 행만 목록에서 지우고, 실패한 행은 남긴 채 에러 배열로 돌려준다 (전부 성공이면 []).
 * 401이면 이후 요청도 모두 실패하므로 바로 던진다.
 */
export async function deleteSelectedRows() {
  const selected = imgagongRows.filter((r) => r._selected);
  const errors = [];
  for (const row of selected) {
    try {
      await deleteImgagongPlan(row.id);
      const index = imgagongRows.findIndex((r) => r.id === row.id);
      if (index !== -1) imgagongRows.splice(index, 1);
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
