<script>
	// Deliverables 목록에서 파일 하나를 고르는 팝업 (MapGen "Excel 파일 선택"에서 사용).
	// 고른 행을 부모에게 onselect(row)로 알려줄 뿐, 다운로드·파싱은 부모(페이지)가 한다.
	// props는 React의 props와 같다 — Svelte 5에서는 $props()로 꺼낸다.
	import { onMount } from 'svelte';
	import { deliverables, loadDeliverables } from '$lib/deliverablesStore.svelte.js';

	let { onselect, oncancel } = $props();

	let loading = $state(true);
	let loadError = $state('');

	// 팝업이 열릴 때마다 서버에서 최신 목록(최신순 첫 페이지)을 가져온다
	onMount(async () => {
		try {
			await loadDeliverables({ page: 1 });
		} catch (err) {
			loadError = err.message;
		} finally {
			loading = false;
		}
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={oncancel}>
	<!-- stopPropagation: 팝업 내부 클릭이 backdrop의 닫기 동작으로 이어지지 않도록 막음 -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<h2>Excel 파일 선택 (Deliverables)</h2>
		<p class="modal-sub">아래 목록에서 불러올 파일을 선택하세요</p>

		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>차수</th>
						<th>공정명</th>
						<th>등록일시</th>
					</tr>
				</thead>
				<tbody>
					{#if loading}
						<tr><td colspan="3" class="empty-row">불러오는 중...</td></tr>
					{:else if loadError}
						<tr><td colspan="3" class="empty-row error">⚠ {loadError}</td></tr>
					{:else}
						{#each deliverables as row (row.id)}
							<tr class="pick-row" onclick={() => onselect(row)}>
								<td>{row.mpwRound}</td>
								<td>{row.processName}</td>
								<td class="date-cell">{row.date}</td>
							</tr>
						{:else}
							<tr><td colspan="3" class="empty-row">등록된 Deliverables가 없습니다.</td></tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<div class="modal-actions">
			<button type="button" class="ghost-btn" onclick={oncancel}>취소</button>
		</div>
	</div>
</div>

<style>
	/* 색은 테마 변수만 쓴다 (다크/라이트 전환) */
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
		max-width: 560px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}
	h2 {
		margin: 0 0 6px;
		font-size: 18px;
		color: var(--text-strong);
	}
	.modal-sub {
		margin: 0 0 16px;
		font-size: 12px;
		color: var(--text-muted);
	}
	.table-wrap {
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: 10px;
		margin-bottom: 18px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	thead {
		background: var(--bg-page);
		color: var(--text-secondary);
		font-size: 11px;
	}
	th,
	td {
		padding: 8px 12px;
		text-align: left;
		border-bottom: 1px solid var(--border);
		color: var(--text-primary);
	}
	.pick-row {
		cursor: pointer;
	}
	.pick-row:hover td {
		background: var(--bg-panel-soft);
	}
	.date-cell {
		color: var(--text-muted);
		font-family: monospace;
		font-size: 12px;
	}
	.empty-row {
		text-align: center;
		color: var(--text-muted);
		padding: 24px 0;
	}
	.empty-row.error {
		color: var(--danger-light);
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
	}
	.ghost-btn {
		background: transparent;
		border: 1px solid var(--border-strong);
		color: var(--text-secondary);
		border-radius: 6px;
		padding: 7px 16px;
		font-size: 13px;
		cursor: pointer;
	}
	.ghost-btn:hover {
		background: var(--bg-panel-soft-2);
	}
</style>
