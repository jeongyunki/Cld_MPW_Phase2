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
 * 주의: 지금은 브라우저 메모리에만 저장되어 새로고침하면 초기값으로
 * 돌아간다. 나중에 사내 서버와 연동할 때는 이 파일 안의 초기값 대신
 * 서버에서 목록을 불러오도록 바꾸면 된다 (Master Page/임가공 Plan
 * 코드는 그대로 두고, 이 파일만 손보면 되도록 설계했다).
 * ============================================================
 */

export const masterData = $state({
  status: ['new', 'checked', 'approved'],
  category: ['조립비 (Package)', '개발비 (Design Charge)', '개발비 (PCB Tooling)', '산학', 'Sawing'],
  assembler: ['Amkor (광주)', 'chippac(영종도)', '조립처3', '조립처4', '조립처5'],
  chipSize: ['8인치', '12인치', 'ETC'],
  pkgType: ['p-type1', 'p-type2', 'p-type3'],
});

// Master Page에서 각 목록을 사람이 읽기 좋은 이름과 함께 반복해서 그릴 때 쓰는 메타데이터.
export const MASTER_FIELDS = [
  { key: 'status', label: 'Status' },
  { key: 'category', label: '구분' },
  { key: 'assembler', label: '조립처' },
  { key: 'chipSize', label: 'Chip size' },
  { key: 'pkgType', label: 'PKG Type' },
];

/** 목록(key)에 새 항목(value)을 추가한다. 중복/빈 값은 무시한다. */
export function addMasterItem(key, value) {
  const v = String(value ?? '').trim();
  if (!v) return;
  if (masterData[key].includes(v)) return;
  masterData[key].push(v);
}

/** 목록(key)의 index번째 항목을 삭제한다. */
export function removeMasterItem(key, index) {
  masterData[key].splice(index, 1);
}
