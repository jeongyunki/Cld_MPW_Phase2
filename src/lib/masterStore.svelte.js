/**
 * ============================================================
 * masterStore.svelte.js
 * ============================================================
 * 임가공 Plan에서 쓰는 dropdown(선택) 항목들을 여기 한 곳에 모아둔다.
 * "임가공 Plan" 페이지는 이 데이터를 "읽기"만 하고,
 * "Master Page"는 이 데이터를 "추가/삭제"한다.
 *
 * 파일 이름이 .svelte.js로 끝나는 것이 중요하다 — 이렇게 하면
 * .svelte 컴포넌트 파일이 아니어도 $state를 쓸 수 있고, 이렇게 만든
 * 반응형 값은 여러 페이지에서 import해서 함께 읽고 쓸 수 있다.
 * (Svelte 5의 "공유 상태" 패턴 - React로 치면 전역 Context나
 *  Zustand 스토어 하나를 여러 컴포넌트가 같이 쓰는 것과 비슷하다.)
 *
 * 서버 연동: 데이터의 원본은 서버(/master-items)다. 앱 시작(로그인) 시 레이아웃이
 * loadMasterItems()를 한 번 불러 masterData를 채운다. masterData의 모양(문자열 배열 5개)은
 * 그대로 두었기 때문에 Master Page/임가공 Plan 코드는 거의 바꾸지 않아도 된다.
 * 에러는 alert 등으로 표시하지 않고 던져서(throw) 호출한 쪽이 처리하게 한다.
 * ============================================================
 */

import { listMasterItems, createMasterItem, deleteMasterItem } from './api/masterItems.js';
import { clearUser } from './authStore.svelte.js';
import { splitGrouped } from './masterItem.js';

// 화면이 읽는 항목 이름 목록. 서버에서 불러오기 전에는 비어 있다.
// export한 $state는 재할당할 수 없어서, 내용을 바꿀 때는 splice/push로 한다.
export const masterData = $state({
  status: [],
  category: [],
  assembler: [],
  chipSize: [],
  pkgType: [],
});

// Master Page에서 각 목록을 사람이 읽기 좋은 이름과 함께 반복해서 그릴 때 쓰는 메타데이터.
// key는 서버의 fieldName과 같다 (변환 불필요).
export const MASTER_FIELDS = [
  { key: 'status', label: 'Status' },
  { key: 'category', label: '구분' },
  { key: 'assembler', label: '조립처' },
  { key: 'chipSize', label: 'Chip size' },
  { key: 'pkgType', label: 'PKG Type' },
];

// 삭제(DELETE /master-items/{id})에 필요한 항목 id. masterData[key]와 같은 순서로 둔다.
// 화면에 그리지 않는 값이라 $state로 만들 필요가 없다 (React의 useRef처럼 "그냥 들고 있는 값").
const itemIds = { status: [], category: [], assembler: [], chipSize: [], pkgType: [] };

// 세션이 만료(401)되면 로그인 상태를 비운다 → 레이아웃이 /login으로 보낸다.
function handleAuthError(err) {
  if (err.status === 401) clearUser();
}

/** 서버에서 전체 Master 항목을 불러와 masterData를 통째로 교체한다. */
export async function loadMasterItems() {
  try {
    const { names, ids } = splitGrouped(
      await listMasterItems(),
      MASTER_FIELDS.map((f) => f.key)
    );
    for (const { key } of MASTER_FIELDS) {
      masterData[key].splice(0, masterData[key].length, ...names[key]);
      itemIds[key] = ids[key];
    }
  } catch (err) {
    handleAuthError(err);
    throw err;
  }
}

/**
 * 목록(key)에 새 항목(value)을 서버에 추가하고, 성공하면 목록 끝에 붙인다. 빈 값은 무시한다.
 * 중복(409)·권한 없음(403) 등은 서버 메시지를 담은 에러로 던진다.
 */
export async function addMasterItem(key, value) {
  const v = String(value ?? '').trim();
  if (!v) return;
  try {
    const item = await createMasterItem(key, v);
    masterData[key].push(item.itemName);
    itemIds[key].push(item.id);
  } catch (err) {
    handleAuthError(err);
    throw err;
  }
}

/**
 * 목록(key)의 index번째 항목을 서버에서 삭제하고, 성공하면 목록에서 뺀다.
 * 그 항목을 쓰고 있던 임가공 Plan 행 수(affectedImgagongPlanCount)를 돌려준다.
 */
export async function removeMasterItem(key, index) {
  try {
    const { affectedImgagongPlanCount } = await deleteMasterItem(itemIds[key][index]);
    masterData[key].splice(index, 1);
    itemIds[key].splice(index, 1);
    return affectedImgagongPlanCount;
  } catch (err) {
    handleAuthError(err);
    throw err;
  }
}
