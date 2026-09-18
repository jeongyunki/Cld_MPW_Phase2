<script>
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';

  // SvelteKit이 제공하는 "현재 URL 정보" 스토어.
  // 사이드바에서 "지금 어떤 메뉴가 선택되어 있는지" 표시하는 데 쓴다.
  import { page } from '$app/stores';
  import { theme, toggleTheme } from '$lib/theme.svelte.js';

  // Svelte 5 + SvelteKit의 최신 방식: 레이아웃 안에 끼워질 페이지 내용은
  // slot이 아니라 $props()로 받은 children을 {@render children()}으로 그린다.
  let { children } = $props();

  // theme.mode가 바뀔 때마다 <html> 태그에 "light" class를 붙였다 뗐다 한다.
  // 아래 style 블록에서 :global(:root)와 :global(:root.light)로 CSS 변수 값을
  // 다르게 정의해뒀기 때문에, 이 class 하나만으로 모든 페이지의 배경/글자색이
  // 한꺼번에 바뀐다 (각 페이지 CSS가 색을 직접 쓰지 않고 var(--xxx)를 쓰기 때문).
  $effect(() => {
    document.documentElement.classList.toggle('light', theme.mode === 'light');
  });

  // 사이드바 메뉴 목록. 여기에 새 항목을 추가하면 메뉴가 하나씩 늘어난다.
  // href는 routes 폴더 구조와 그대로 대응된다 (예: '/mapgen' -> src/routes/mapgen/+page.svelte)
  const menuItems = [
    { href: '/', label: 'Welcome', icon: '🏠' },
    { href: '/mapgen', label: 'MapGen Web', icon: '🗺️' },
    { href: '/imgagong', label: '임가공 Plan', icon: '📋' },
    { href: '/master', label: 'Master Page', icon: '⚙️' },
  ];
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">M</div>
      <div class="brand-text">
        <div class="brand-title">MPW Console</div>
        <div class="brand-sub">Internal Tools</div>
      </div>
    </div>

    <nav>
      {#each menuItems as item}
        <a href={item.href} class="nav-item" class:active={$page.url.pathname === item.href}>
          <span class="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </a>
      {/each}
    </nav>

    <div class="sidebar-footer">v0.1 · 학습용 프로토타입</div>
  </aside>

  <main class="main-area">
    <button
      type="button"
      class="theme-toggle"
      onclick={toggleTheme}
      title="다크/라이트 모드 전환"
      aria-label="다크/라이트 모드 전환"
    >
      <span class="toggle-track" class:is-light={theme.mode === 'light'}>
        <span class="toggle-thumb">{theme.mode === 'dark' ? '🌙' : '☀️'}</span>
      </span>
    </button>

    {@render children()}
  </main>
</div>

<style>
  /* ------------------------------------------------------------------
     [코드 위치 안내 5] 다크/라이트 테마 색상 정의.
     여기 두 블록의 값만 바꾸면 앱 전체(사이드바, 모든 페이지)의
     색상 톤을 조정할 수 있다. 각 페이지의 <style>은 이 변수(var(--xxx))를
     참조하도록 이미 바꿔뒀다.
     ------------------------------------------------------------------ */
  :global(:root) {
    --bg-page: #0f172a;
    --bg-page-soft: rgba(15, 23, 42, 0.7);
    --sidebar-bg: #0b1120;
    --bg-panel: #1e293b;
    --bg-panel-soft: rgba(30, 41, 59, 0.6);
    --bg-panel-soft-2: rgba(30, 41, 59, 0.4);
    --border: #334155;
    --border-strong: #475569;
    --text-primary: #e2e8f0;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;
    --text-strong: #f1f5f9;
    --accent: #2dd4bf;
    --accent-light: #5eead4;
    --accent-strong: #14b8a6;
    --accent-strong2: #0891b2;
    --accent-contrast: #052e2b;
    --accent-soft-12: rgba(20, 184, 166, 0.12);
    --accent-soft-15: rgba(20, 184, 166, 0.15);
    --accent-soft-25: rgba(20, 184, 166, 0.25);
    --accent-border-35: rgba(45, 212, 191, 0.35);
    --accent-border-60: rgba(45, 212, 191, 0.6);
    --danger: #dc2626;
    --danger-light: #f87171;
    --danger-soft-15: rgba(220, 38, 38, 0.15);
    --warning-bg: rgba(120, 53, 15, 0.3);
    --warning-border: #b45309;
    --warning-text: #fbbf24;
  }

  :global(:root.light) {
    --bg-page: #f8fafc;
    --bg-page-soft: rgba(255, 255, 255, 0.85);
    --sidebar-bg: #ffffff;
    --bg-panel: #ffffff;
    --bg-panel-soft: rgba(255, 255, 255, 0.9);
    --bg-panel-soft-2: rgba(241, 245, 249, 0.8);
    --border: #e2e8f0;
    --border-strong: #cbd5e1;
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-muted: #94a3b8;
    --text-strong: #0f172a;
    --accent: #0d9488;
    --accent-light: #0f766e;
    --accent-strong: #0d9488;
    --accent-strong2: #0e7490;
    --accent-contrast: #ffffff;
    --accent-soft-12: rgba(13, 148, 136, 0.1);
    --accent-soft-15: rgba(13, 148, 136, 0.12);
    --accent-soft-25: rgba(13, 148, 136, 0.18);
    --accent-border-35: rgba(13, 148, 136, 0.35);
    --accent-border-60: rgba(13, 148, 136, 0.55);
    --danger: #dc2626;
    --danger-light: #dc2626;
    --danger-soft-15: rgba(220, 38, 38, 0.08);
    --warning-bg: rgba(251, 191, 36, 0.15);
    --warning-border: #d97706;
    --warning-text: #92400e;
  }

  :global(html, body) {
    margin: 0;
    padding: 0;
    background: var(--bg-page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    transition: background 0.2s, color 0.2s;
  }
  :global(*) {
    box-sizing: border-box;
  }

  .app-shell {
    display: flex;
    min-height: 100vh;
  }

  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 20px 14px;
    position: sticky;
    top: 0;
    height: 100vh;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 28px;
    padding: 0 6px;
  }
  .brand-mark {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--accent-strong), var(--accent-strong2));
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: var(--accent-contrast);
    flex-shrink: 0;
  }
  .brand-title {
    font-weight: 700;
    font-size: 14px;
    line-height: 1.2;
    color: var(--text-primary);
  }
  .brand-sub {
    font-size: 11px;
    color: var(--text-muted);
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 14px;
    transition: background 0.15s, color 0.15s;
  }
  .nav-item:hover {
    background: var(--bg-panel);
    color: var(--text-primary);
  }
  .nav-item.active {
    background: var(--accent-soft-15);
    color: var(--accent-light);
    font-weight: 600;
  }
  .nav-icon {
    font-size: 16px;
    width: 20px;
    text-align: center;
  }

  .sidebar-footer {
    font-size: 11px;
    color: var(--border-strong);
    padding: 10px 6px 0;
  }

  .main-area {
    flex: 1;
    min-width: 0;
    position: relative;
  }

  /* [코드 위치 안내 5-계속] 다크/라이트 토글 스위치 */
  .theme-toggle {
    position: fixed;
    top: 16px;
    right: 20px;
    z-index: 50;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .toggle-track {
    display: flex;
    align-items: center;
    width: 52px;
    height: 28px;
    border-radius: 999px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    padding: 3px;
    transition: background 0.2s;
  }
  .toggle-thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--bg-page);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: transform 0.2s;
  }
  .toggle-track.is-light .toggle-thumb {
    transform: translateX(24px);
  }
</style>
