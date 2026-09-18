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
 * 주의: 지금은 브라우저 메모리에만 있어서 새로고침하면 데이터가 사라진다.
 * 나중에 사내 서버와 연동할 때는 createRow/deleteSelectedRows 안에서
 * fetch로 서버에 저장하도록 바꾸면 되고, 임가공 Plan 페이지 쪽 코드는
 * 거의 그대로 두어도 된다.
 * ============================================================
 */

let nextId = 1;

export const imgagongRows = $state([]);

/**
 * 팝업에서 입력받은 값(fields)으로 새 행을 만들어 목록 맨 위에 추가한다.
 * Date는 항상 "지금 이 순간"으로 자동 기록되고, Status는 항상 "new"로 시작한다 —
 * 둘 다 사용자가 팝업에서 직접 입력하지 않는 항목이라 여기서 고정해서 채운다.
 */
export function addRow(fields) {
  const now = new Date();
  // "YYYY-MM-DD HH:MM" 형태로 생성 시각을 기록 (필요하면 형식만 바꾸면 됨)
  const pad = (n) => String(n).padStart(2, '0');
  const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  imgagongRows.unshift({
    id: nextId++,
    date: createdAt,
    status: 'new',
    category: fields.category ?? '',
    assembler: fields.assembler ?? '',
    chipSize: fields.chipSize ?? '',
    module: fields.module ?? '',
    projectName: fields.projectName ?? '',
    gcmCode: fields.gcmCode ?? '',
    pkgType: fields.pkgType ?? '',
    customer: fields.customer ?? '',
    lotCount: fields.lotCount ?? '',
    pkgQty: fields.pkgQty ?? '',
    owner: fields.owner ?? '',
    _selected: false, // Delete 버튼으로 지울 행을 고르기 위한 체크박스 상태 (실제 데이터 컬럼 아님)
  });
}

/** 체크박스로 선택된(_selected === true) 행들을 모두 삭제한다. */
export function deleteSelectedRows() {
  for (let i = imgagongRows.length - 1; i >= 0; i--) {
    if (imgagongRows[i]._selected) {
      imgagongRows.splice(i, 1);
    }
  }
}
