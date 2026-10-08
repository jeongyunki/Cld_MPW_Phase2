<script>
  import { masterData, MASTER_FIELDS, addMasterItem, removeMasterItem } from '$lib/masterStore.svelte.js';
  import { isAdmin } from '$lib/authStore.svelte.js';

  // 필드별로 "지금 입력창에 뭘 쓰고 있는지"를 따로 기억해야 하므로,
  // { status: '', category: '', ... } 형태의 객체 하나로 관리한다.
  let newItemText = $state(Object.fromEntries(MASTER_FIELDS.map((f) => [f.key, ''])));

  // 추가/삭제 결과나 실패 이유를 보여주는 안내 문구 (빈 문자열이면 표시 안 함)
  let message = $state('');

  async function handleAdd(key) {
    try {
      await addMasterItem(key, newItemText[key]);
      newItemText[key] = '';
      message = '';
    } catch (err) {
      // 중복(409), 권한 없음(403) 등은 서버 메시지를 그대로 보여준다
      message = err.message;
    }
  }

  async function handleRemove(key, index) {
    const item = masterData[key][index];
    try {
      const count = await removeMasterItem(key, index);
      // 서버는 사용 중인 항목도 삭제를 막지 않고, 영향받은 행 수만 알려준다
      message = count > 0
        ? `'${item}' 항목을 삭제했습니다. 이 항목을 사용 중인 임가공 Plan 행이 ${count}개 있습니다.`
        : `'${item}' 항목을 삭제했습니다.`;
    } catch (err) {
      message = err.message;
    }
  }

  function handleKeydown(event, key) {
    if (event.key === 'Enter') handleAdd(key);
  }
</script>

<div class="page">
  <header>
    <div class="eyebrow">MASTER PAGE</div>
    <h1>기준 정보 관리</h1>
    <p class="desc">임가공 Plan의 dropdown 항목들을 여기서 추가하거나 삭제할 수 있습니다. 변경 즉시 임가공 Plan에 반영됩니다.</p>
    {#if !isAdmin()}
      <p class="notice">항목 추가/삭제는 MPW 관리자만 할 수 있습니다.</p>
    {/if}
    {#if message}
      <p class="notice">{message}</p>
    {/if}
  </header>

  <div class="field-grid">
    {#each MASTER_FIELDS as field}
      <section class="field-card">
        <div class="field-title">{field.label}</div>

        <div class="chip-list">
          {#each masterData[field.key] as item, i}
            <span class="chip">
              {item}
              <button type="button" class="chip-remove" onclick={() => handleRemove(field.key, i)} title="삭제" disabled={!isAdmin()}>×</button>
            </span>
          {:else}
            <span class="chip-empty">등록된 항목이 없습니다</span>
          {/each}
        </div>

        <div class="add-row">
          <input
            type="text"
            placeholder="새 항목 입력 후 Enter"
            bind:value={newItemText[field.key]}
            onkeydown={(e) => handleKeydown(e, field.key)}
            disabled={!isAdmin()}
          />
          <button type="button" class="add-btn" onclick={() => handleAdd(field.key)} disabled={!isAdmin()}>추가</button>
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .page {
    max-width: 980px;
    margin: 0 auto;
    padding: 40px 24px;
  }
  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 24px;
    margin-bottom: 28px;
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

  .field-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
  }

  .field-card {
    background: var(--bg-panel-soft);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px 20px;
  }
  .field-title {
    font-weight: 700;
    font-size: 15px;
    color: var(--accent-light);
    margin-bottom: 14px;
  }

  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 32px;
    margin-bottom: 14px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--accent-soft-12);
    border: 1px solid var(--accent-border-35);
    color: var(--text-primary);
    border-radius: 999px;
    padding: 5px 8px 5px 12px;
    font-size: 13px;
  }
  .chip-remove {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 15px;
    line-height: 1;
    padding: 0 2px;
  }
  .chip-remove:hover:not(:disabled) {
    color: var(--danger-light);
  }
  .chip-remove:disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }
  .chip-empty {
    color: var(--text-muted);
    font-size: 13px;
    font-style: italic;
  }

  .add-row {
    display: flex;
    gap: 8px;
  }
  .add-row input {
    flex: 1;
    background: var(--bg-page);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text-primary);
    padding: 7px 10px;
    font-size: 13px;
  }
  .add-row input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .add-btn {
    background: var(--accent-strong);
    color: var(--accent-contrast);
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }
  .add-btn:hover:not(:disabled) {
    background: var(--accent);
  }
  .add-btn:disabled,
  .add-row input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .notice {
    color: var(--accent-light);
    font-size: 13px;
    margin: 10px 0 0;
  }
</style>
