<script>
  import { masterData } from '$lib/masterStore.svelte.js';
  import { imgagongRows, loadRows, addRow, updateRow, deleteSelectedRows } from '$lib/imgagongStore.svelte.js';
  import { isAdmin } from '$lib/authStore.svelte.js';

  // ------------------------------------------------------------------
  // 상단 필터 컨트롤: 조회 기간 (시작 년월 ~ 종료 년월)
  // 예전엔 "년도"와 "표시할 월"이 따로 있어서 "25년 9월 ~ 26년 10월"처럼
  // 연도를 걸치는 조회가 불가능했다. <input type="month">은 브라우저가
  // 기본 제공하는 "년-월" 선택기로, 값이 "YYYY-MM" 문자열로 들어와서
  // 연도까지 함께 다루기에 가장 간단하다.
  // ------------------------------------------------------------------
  const thisYear = new Date().getFullYear();

  let startPeriod = $state(`${thisYear}-01`); // "YYYY-MM"
  let endPeriod = $state(`${thisYear}-12`);   // "YYYY-MM"

  // 현재 조회 기간으로 서버에서 다시 불러온다. 실패하면 서버 메시지를 alert로 보여준다.
  function reload() {
    loadRows({ startMonth: startPeriod, endMonth: endPeriod }).catch((err) => alert(err.message));
  }

  // $effect: 안에서 읽은 state(startPeriod/endPeriod)가 바뀔 때마다 다시 실행된다
  // (≈ React의 useEffect(fn, [startPeriod, endPeriod]) — 단, 의존성 배열 없이 자동 추적).
  // 페이지에 들어올 때도 1회 실행된다.
  $effect(() => {
    reload();
  });

  // 셀 하나가 바뀌면(change 이벤트 — 텍스트는 blur/Enter 때) 그 필드만 저장한다.
  // oninput(글자마다)이 아니라 onchange를 쓰는 이유: 타이핑할 때마다 서버 요청이 나가는 것을 막기 위해서다.
  // bind:value가 먼저 row 값을 바꾼 뒤 onchange가 실행되므로 이 시점의 row[field]는 새 값이다.
  // 실패하면 메시지를 보여주고 재조회로 서버 값을 복원한다.
  async function saveCell(row, field) {
    try {
      await updateRow(row, field);
    } catch (err) {
      alert(err.message);
      reload();
    }
  }

  async function handleDelete() {
    const count = imgagongRows.filter((r) => r._selected).length;
    if (count === 0) {
      alert('삭제할 행을 먼저 선택해주세요.');
      return;
    }
    if (confirm(`선택된 ${count}개 행을 삭제하시겠습니까?`)) {
      try {
        const errors = await deleteSelectedRows();
        if (errors.length > 0) {
          alert(`${count}개 중 ${errors.length}개를 삭제하지 못했습니다: ${errors[0].message}`);
        }
      } catch (err) {
        alert(err.message);
      }
    }
  }

  // ------------------------------------------------------------------
  // "Create" 팝업(모달) — Date/Status를 제외한 나머지 항목을 입력받는다.
  // 저장을 누르면 서버가 생성 시각과 status='new'를 채워서 행을 만들고,
  // 성공하면 팝업을 닫고 목록을 다시 불러온다. 실패하면 팝업을 열어 둔 채 메시지를 보여준다.
  // ------------------------------------------------------------------
  function emptyDraft() {
    return {
      category: '',
      assembler: '',
      chipSize: '',
      module: '',
      projectName: '',
      gcmCode: '',
      pkgType: '',
      customer: '',
      lotCount: '',
      pkgQty: '',
      owner: '',
    };
  }

  let showCreateModal = $state(false);
  let draft = $state(emptyDraft());
  let createError = $state('');

  function openCreateModal() {
    draft = emptyDraft();
    createError = '';
    showCreateModal = true;
  }
  function closeCreateModal() {
    showCreateModal = false;
  }
  async function saveCreateModal() {
    createError = '';
    try {
      await addRow(draft);
      showCreateModal = false;
      reload();
    } catch (err) {
      createError = err.message; // 팝업은 열어 둔다 (시나리오 예외 2-1)
    }
  }
</script>

<div class="page">
  <header>
    <div class="eyebrow">임가공 PLAN</div>
    <h1>임가공 진행 현황</h1>
    <p class="desc">임가공 관련 진행 건을 등록하고 년도/월별로 확인합니다.</p>
  </header>

  <div class="toolbar">
    <label class="toolbar-field">
      조회 기간
      <input type="month" bind:value={startPeriod} />
      ~
      <input type="month" bind:value={endPeriod} />
    </label>

    <span class="toolbar-sep"></span>

    <button type="button" class="primary-btn" onclick={openCreateModal}>+ Create</button>
    <button type="button" class="danger-btn" onclick={handleDelete}>Delete</button>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="checkbox-col"></th>
          <th>Date</th>
          <th>Status</th>
          <th>구분</th>
          <th>조립처</th>
          <th>Chip size</th>
          <th>Module</th>
          <th>과제명</th>
          <th>GCM Code</th>
          <th>PKG Type</th>
          <th>고객</th>
          <th>LOT수</th>
          <th>PKG 수량</th>
          <th>과제 담당자</th>
        </tr>
      </thead>
      <tbody>
        {#each imgagongRows as row (row.id)}
          <tr>
            <td class="checkbox-col"><input type="checkbox" bind:checked={row._selected} /></td>

            <!-- Date는 생성 시각으로 고정, 수정 불가 (읽기 전용 텍스트로만 표시) -->
            <td class="readonly-cell">{row.date}</td>

            <!-- Status는 계속 진행되며 바뀌는 값이라 다른 항목처럼 편집 가능하게 둠 -->
            <td>
              <select bind:value={row.status} disabled={!isAdmin()} onchange={() => saveCell(row, 'status')}>
                <option value="">선택</option>
                {#each masterData.status as opt}<option value={opt}>{opt}</option>{/each}
              </select>
            </td>
            <td>
              <select bind:value={row.category} onchange={() => saveCell(row, 'category')}>
                <option value="">선택</option>
                {#each masterData.category as opt}<option value={opt}>{opt}</option>{/each}
              </select>
            </td>
            <td>
              <select bind:value={row.assembler} onchange={() => saveCell(row, 'assembler')}>
                <option value="">선택</option>
                {#each masterData.assembler as opt}<option value={opt}>{opt}</option>{/each}
              </select>
            </td>
            <td>
              <select bind:value={row.chipSize} onchange={() => saveCell(row, 'chipSize')}>
                <option value="">선택</option>
                {#each masterData.chipSize as opt}<option value={opt}>{opt}</option>{/each}
              </select>
            </td>

            <td><input type="text" bind:value={row.module} onchange={() => saveCell(row, 'module')} /></td>
            <td><input type="text" bind:value={row.projectName} onchange={() => saveCell(row, 'projectName')} /></td>
            <td><input type="text" bind:value={row.gcmCode} onchange={() => saveCell(row, 'gcmCode')} /></td>

            <td>
              <select bind:value={row.pkgType} onchange={() => saveCell(row, 'pkgType')}>
                <option value="">선택</option>
                {#each masterData.pkgType as opt}<option value={opt}>{opt}</option>{/each}
              </select>
            </td>

            <td><input type="text" bind:value={row.customer} onchange={() => saveCell(row, 'customer')} /></td>
            <td><input type="number" bind:value={row.lotCount} onchange={() => saveCell(row, 'lotCount')} /></td>
            <td><input type="number" bind:value={row.pkgQty} onchange={() => saveCell(row, 'pkgQty')} /></td>
            <td><input type="text" bind:value={row.owner} onchange={() => saveCell(row, 'owner')} /></td>
          </tr>
        {:else}
          <tr>
            <td colspan="14" class="empty-row">등록된 데이터가 없습니다. "Create" 버튼으로 새 행을 추가해보세요.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<!-- ------------------------------------------------------------------
     Create 팝업(모달). Date/Status는 서버가 채운다.
     ------------------------------------------------------------------ -->
{#if showCreateModal}
  <div class="modal-backdrop" onclick={closeCreateModal}>
    <!-- stopPropagation: 모달 내부 클릭이 backdrop의 닫기 동작으로 이어지지 않도록 막음 -->
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>새 임가공 항목 등록</h2>
        <p class="modal-sub">Date는 저장 시각으로 자동 기록되고, Status는 "new"로 시작합니다.</p>
      </div>

      <div class="modal-grid">
        <label class="modal-field">
          구분
          <select bind:value={draft.category}>
            <option value="">선택</option>
            {#each masterData.category as opt}<option value={opt}>{opt}</option>{/each}
          </select>
        </label>
        <label class="modal-field">
          조립처
          <select bind:value={draft.assembler}>
            <option value="">선택</option>
            {#each masterData.assembler as opt}<option value={opt}>{opt}</option>{/each}
          </select>
        </label>
        <label class="modal-field">
          Chip size
          <select bind:value={draft.chipSize}>
            <option value="">선택</option>
            {#each masterData.chipSize as opt}<option value={opt}>{opt}</option>{/each}
          </select>
        </label>
        <label class="modal-field">
          Module
          <input type="text" bind:value={draft.module} />
        </label>
        <label class="modal-field">
          과제명
          <input type="text" bind:value={draft.projectName} />
        </label>
        <label class="modal-field">
          GCM Code
          <input type="text" bind:value={draft.gcmCode} />
        </label>
        <label class="modal-field">
          PKG Type
          <select bind:value={draft.pkgType}>
            <option value="">선택</option>
            {#each masterData.pkgType as opt}<option value={opt}>{opt}</option>{/each}
          </select>
        </label>
        <label class="modal-field">
          고객
          <input type="text" bind:value={draft.customer} />
        </label>
        <label class="modal-field">
          LOT수
          <input type="number" bind:value={draft.lotCount} />
        </label>
        <label class="modal-field">
          PKG 수량
          <input type="number" bind:value={draft.pkgQty} />
        </label>
        <label class="modal-field">
          과제 담당자
          <input type="text" bind:value={draft.owner} />
        </label>
      </div>

      {#if createError}<p class="modal-error" role="alert">⚠ {createError}</p>{/if}

      <div class="modal-actions">
        <button type="button" class="ghost-btn2" onclick={closeCreateModal}>취소</button>
        <button type="button" class="primary-btn" onclick={saveCreateModal}>저장</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* 사이드바를 제외한 오른쪽 전체 폭을 그대로 사용 (가운데 정렬/최대폭 제한 없음) */
  .page {
    padding: 40px 32px;
  }
  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 24px;
    margin-bottom: 24px;
  }
  .eyebrow {
    font-family: monospace;
    font-size: 12px;
    letter-spacing: 0.1em;
    color: var(--accent);
    margin-bottom: 8px;
  }
  h1 {
    font-size: 24px;
    margin: 0 0 8px;
  }
  .desc {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    background: var(--bg-panel-soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 18px;
    margin-bottom: 20px;
  }
  .toolbar-field {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-secondary);
  }
  .toolbar-field select,
  .toolbar-field input[type='month'] {
    background: var(--bg-page);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text-primary);
    padding: 6px 10px;
    font-size: 13px;
  }
  .toolbar-sep {
    width: 1px;
    align-self: stretch;
    background: var(--border);
  }
  .primary-btn {
    background: var(--accent-strong);
    color: var(--accent-contrast);
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }
  .primary-btn:hover {
    background: var(--accent);
  }
  .danger-btn {
    background: transparent;
    border: 1px solid var(--danger);
    color: var(--danger-light);
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 13px;
    cursor: pointer;
  }
  .danger-btn:hover {
    background: var(--danger-soft-15);
  }

  /* 이 wrapper 자체는 폭 제한이 없어서 main-area(사이드바 제외 전체 폭)를 그대로 채우고,
     안의 table이 화면보다 넓어질 때만 이 요소에서 가로 스크롤이 생긴다. */
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    min-width: 1400px;
  }
  thead {
    background: var(--bg-panel);
    color: var(--text-secondary);
    font-size: 11px;
    text-transform: uppercase;
  }
  th,
  td {
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid var(--bg-panel);
    white-space: nowrap;
  }
  .checkbox-col {
    width: 34px;
    text-align: center;
  }
  .readonly-cell {
    color: var(--text-muted);
    font-family: monospace;
    font-size: 12px;
  }
  td input,
  td select {
    width: 100%;
    min-width: 100px;
    background: var(--bg-page);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-primary);
    padding: 5px 8px;
    font-size: 13px;
  }
  td input:focus,
  td select:focus {
    outline: none;
    border-color: var(--accent);
  }
  td select:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }
  .empty-row {
    text-align: center;
    color: var(--text-muted);
    padding: 28px 0;
    white-space: normal;
  }

  /* Create 팝업 */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 20px;
  }
  .modal {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 26px 28px;
    width: 100%;
    max-width: 640px;
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal-header h2 {
    margin: 0 0 6px;
    font-size: 18px;
    color: var(--text-strong);
  }
  .modal-sub {
    margin: 0 0 18px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .modal-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
    margin-bottom: 22px;
  }
  .modal-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .modal-field input,
  .modal-field select {
    background: var(--bg-page);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text-primary);
    padding: 7px 10px;
    font-size: 13px;
  }
  .modal-field input:focus,
  .modal-field select:focus {
    outline: none;
    border-color: var(--accent);
  }
  .modal-error {
    color: var(--danger-light);
    background: var(--danger-soft-15);
    border: 1px solid var(--danger);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    margin: 0 0 14px;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .ghost-btn2 {
    background: transparent;
    border: 1px solid var(--border-strong);
    color: var(--text-secondary);
    border-radius: 6px;
    padding: 7px 16px;
    font-size: 13px;
    cursor: pointer;
  }
  .ghost-btn2:hover {
    background: var(--bg-panel-soft-2);
  }
</style>
