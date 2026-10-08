<script>
	import { onMount } from 'svelte';
	import {
		deliverables,
		deliverablesPaging,
		PAGE_LIMIT,
		loadDeliverables,
		addDeliverable,
		fetchDeliverableFile,
		deleteSelectedDeliverables
	} from '$lib/deliverablesStore.svelte.js';
	import { isFileTooLarge, validateDraft, FILE_TOO_LARGE_MESSAGE } from '$lib/deliverableRow.js';

	// ------------------------------------------------------------------
	// 목록 조회: 검색어 + 페이지 번호로 서버에서 다시 불러온다.
	// 스토어가 마지막 페이지/검색어를 기억하므로, 다른 메뉴에 다녀와도 보던 화면이 그대로 나온다.
	// ------------------------------------------------------------------
	let searchInput = $state(deliverablesPaging.search);

	// $derived: 의존하는 state가 바뀌면 자동으로 다시 계산되는 값 (≈ React의 useMemo)
	const totalPages = $derived(Math.max(1, Math.ceil(deliverablesPaging.total / PAGE_LIMIT)));
	const pageNumbers = $derived(Array.from({ length: totalPages }, (_, i) => i + 1));

	function goToPage(page, search = deliverablesPaging.search) {
		return loadDeliverables({ page, search }).catch((err) => alert(err.message));
	}

	// onMount: 페이지가 화면에 처음 붙을 때 1회 실행 (≈ React의 useEffect(fn, []))
	// $effect를 쓰지 않는 이유: 안에서 읽는 deliverablesPaging이 의존성이 되어, 조회가 끝나
	// 값이 바뀔 때마다 다시 조회하는 루프가 생기기 때문이다.
	onMount(() => {
		goToPage(deliverablesPaging.page);
	});

	// 검색은 항상 1페이지부터 (Enter 또는 "검색" 버튼)
	function handleSearch(e) {
		e.preventDefault();
		goToPage(1, searchInput.trim());
	}

	// ------------------------------------------------------------------
	// 다운로드: 스토어가 받아 온 Blob을 임시 URL로 만들어 <a download>로 저장시킨다.
	// (/uploads 경로를 노출하지 않고, 세션 쿠키가 필요한 API로만 받는다)
	// ------------------------------------------------------------------
	async function handleDownload(row) {
		try {
			const blob = await fetchDeliverableFile(row);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = row.originalFileName ?? `${row.id}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			alert(err.message);
		}
	}

	// ------------------------------------------------------------------
	// 삭제: 확인 팝업 → 선택 행마다 삭제 → 현재 페이지 재조회 (빈 페이지가 되면 앞 페이지로)
	// ------------------------------------------------------------------
	async function handleDelete() {
		const count = deliverables.filter((r) => r._selected).length;
		if (count === 0) {
			alert('삭제할 항목을 먼저 선택해주세요.');
			return;
		}
		if (!confirm(`선택된 ${count}개 항목을 삭제하시겠습니까?`)) return;
		try {
			const errors = await deleteSelectedDeliverables();
			if (errors.length > 0) {
				alert(`${count}개 중 ${errors.length}개를 삭제하지 못했습니다: ${errors[0].message}`);
			}
		} catch (err) {
			alert(err.message);
			return;
		}
		const page = deliverablesPaging.page;
		await goToPage(deliverables.length === 0 && page > 1 ? page - 1 : page);
	}

	// ------------------------------------------------------------------
	// "Create" 팝업(모달) — 차수/공정명/엑셀 파일을 입력받는다.
	// 입력값에 문제가 있거나 서버가 거절하면 팝업을 열어 둔 채 메시지를 보여준다 (예외 1-1, 1-2).
	// 성공하면 팝업을 닫고 검색 없이 1페이지를 다시 불러온다 → 최신순이라 새 행이 맨 위에 온다.
	// ------------------------------------------------------------------
	const emptyDraft = () => ({ mpwRound: '', processName: '', file: null });

	let showCreateModal = $state(false);
	let draft = $state(emptyDraft());
	let createError = $state('');
	let saving = $state(false);

	function openCreateModal() {
		draft = emptyDraft();
		createError = '';
		showCreateModal = true;
	}
	function closeCreateModal() {
		showCreateModal = false;
	}

	// 파일을 고르는 즉시 크기를 검사해 경고한다 (등록 버튼을 눌러도 다시 검사한다)
	function handleFileChange(e) {
		draft.file = e.currentTarget.files[0] ?? null;
		createError = isFileTooLarge(draft.file) ? FILE_TOO_LARGE_MESSAGE : '';
	}

	async function saveCreateModal() {
		createError = validateDraft(draft);
		if (createError) return;
		saving = true;
		try {
			await addDeliverable(draft);
			showCreateModal = false;
			searchInput = '';
			goToPage(1, '');
		} catch (err) {
			createError = err.message;
		} finally {
			saving = false;
		}
	}
</script>

<div class="page">
	<header>
		<div class="eyebrow">DELIVERABLES</div>
		<h1>Deliverables 관리</h1>
		<p class="desc">MPW 차수별 공정 산출물(엑셀 파일)을 등록하고 내려받습니다.</p>
	</header>

	<div class="toolbar">
		<form class="toolbar-field" onsubmit={handleSearch}>
			검색
			<input type="text" placeholder="차수/공정명" bind:value={searchInput} />
			<button type="submit" class="ghost-btn2">검색</button>
		</form>

		<span class="toolbar-spacer"></span>

		<button type="button" class="primary-btn" onclick={openCreateModal}>+ Create</button>
		<button type="button" class="danger-btn" onclick={handleDelete}>Delete</button>
	</div>

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th class="checkbox-col"></th>
					<th>차수</th>
					<th>공정명</th>
					<th>파일명</th>
					<th>등록일시</th>
					<th>등록자</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each deliverables as row (row.id)}
					<tr>
						<td class="checkbox-col"><input type="checkbox" bind:checked={row._selected} /></td>
						<td>{row.mpwRound}</td>
						<td>{row.processName}</td>
						<td>{row.originalFileName ?? '-'}</td>
						<td class="readonly-cell">{row.date}</td>
						<td>{row.registeredByName ?? '-'}</td>
						<td>
							<button type="button" class="ghost-btn2" onclick={() => handleDownload(row)}>
								다운로드
							</button>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="7" class="empty-row">
							등록된 Deliverables가 없습니다. "Create" 버튼으로 새로 등록해보세요.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if totalPages > 1}
		<nav class="pagination">
			<button
				type="button"
				class="page-btn"
				disabled={deliverablesPaging.page <= 1}
				onclick={() => goToPage(deliverablesPaging.page - 1)}>&lt;</button
			>
			{#each pageNumbers as n (n)}
				<button
					type="button"
					class="page-btn"
					class:active={n === deliverablesPaging.page}
					onclick={() => goToPage(n)}>{n}</button
				>
			{/each}
			<button
				type="button"
				class="page-btn"
				disabled={deliverablesPaging.page >= totalPages}
				onclick={() => goToPage(deliverablesPaging.page + 1)}>&gt;</button
			>
		</nav>
	{/if}
</div>

<!-- Create 팝업(모달). 등록일시/등록자는 서버가 채운다. -->
{#if showCreateModal}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={closeCreateModal}>
		<!-- stopPropagation: 모달 내부 클릭이 backdrop의 닫기 동작으로 이어지지 않도록 막음 -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Deliverables 등록</h2>
				<p class="modal-sub">
					새로운 Deliverables를 등록하려면 차수와 공정명을 입력한 뒤 엑셀 파일을 선택하세요.
				</p>
			</div>

			<div class="modal-grid">
				<label class="modal-field">
					차수*
					<input type="text" bind:value={draft.mpwRound} />
				</label>
				<label class="modal-field">
					공정명*
					<input type="text" bind:value={draft.processName} />
				</label>
				<label class="modal-field">
					엑셀 파일
					<input type="file" accept=".xlsx,.xls" onchange={handleFileChange} />
				</label>
			</div>

			{#if createError}<p class="modal-error" role="alert">⚠ {createError}</p>{/if}

			<div class="modal-actions">
				<button type="button" class="ghost-btn2" onclick={closeCreateModal}>취소</button>
				<button type="button" class="primary-btn" disabled={saving} onclick={saveCreateModal}>
					등록
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* 레이아웃·표·팝업 스타일은 임가공 Plan 페이지와 같다. 색은 테마 변수만 쓴다. */
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
	.toolbar-field input {
		background: var(--bg-page);
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		color: var(--text-primary);
		padding: 6px 10px;
		font-size: 13px;
		width: 240px;
	}
	.toolbar-spacer {
		flex: 1;
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
	.primary-btn:disabled {
		opacity: 0.6;
		cursor: wait;
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
	.ghost-btn2 {
		background: transparent;
		border: 1px solid var(--border-strong);
		color: var(--text-secondary);
		border-radius: 6px;
		padding: 6px 14px;
		font-size: 13px;
		cursor: pointer;
	}
	.ghost-btn2:hover {
		background: var(--bg-panel-soft-2);
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
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
	.empty-row {
		text-align: center;
		color: var(--text-muted);
		padding: 28px 0;
		white-space: normal;
	}

	.pagination {
		display: flex;
		justify-content: center;
		gap: 6px;
		margin-top: 16px;
	}
	.page-btn {
		min-width: 32px;
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-secondary);
		border-radius: 6px;
		padding: 5px 8px;
		font-size: 13px;
		cursor: pointer;
	}
	.page-btn.active {
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 600;
	}
	.page-btn:disabled {
		color: var(--text-muted);
		cursor: not-allowed;
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
		max-width: 480px;
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
	.modal-field input {
		background: var(--bg-page);
		border: 1px solid var(--border-strong);
		border-radius: 6px;
		color: var(--text-primary);
		padding: 7px 10px;
		font-size: 13px;
	}
	.modal-field input:focus {
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
</style>
