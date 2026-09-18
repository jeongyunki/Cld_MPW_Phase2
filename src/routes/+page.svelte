<script>
  // 각 도구로 이동하는 카드에 쓸 데이터.
  // 새 메뉴가 생기면 여기에 한 줄만 추가하면 Welcome 화면에도 카드가 나타난다.
  const cards = [
    {
      title: 'MapGen Web',
      desc: 'Excel 데이터로 chip 위 module 위치와 sawing line을 계산하고 시각화합니다.',
      href: '/mapgen',
      tag: '완성',
      icon: '🗺️',
    },
    {
      title: '임가공 Plan',
      desc: '임가공 진행 현황을 등록하고, 년도/월별로 관리합니다.',
      href: '/imgagong',
      tag: '신규',
      icon: '📋',
    },
    {
      title: 'Master Page',
      desc: '임가공 Plan에서 사용하는 선택 항목(구분/조립처/PKG Type 등)을 관리합니다.',
      href: '/master',
      tag: '신규',
      icon: '⚙️',
    },
  ];
</script>

<div class="welcome">
  <section class="hero">
    <div class="hero-eyebrow">MPW CONSOLE</div>
    <h1>사내 업무 자동화 도구 모음</h1>
    <p>왼쪽 메뉴에서 원하는 기능을 선택하세요. 이 화면은 새로운 기능이 추가될 때마다 계속 늘어날 예정입니다.</p>
  </section>

  <section class="cards">
    {#each cards as c}
      <a class="tool-card" href={c.href}>
        <div class="tool-top">
          <span class="tool-icon">{c.icon}</span>
          <span class="tool-tag">{c.tag}</span>
        </div>
        <div class="tool-title">{c.title}</div>
        <div class="tool-desc">{c.desc}</div>
        <div class="tool-arrow">열기 →</div>
      </a>
    {/each}
  </section>
</div>

<style>
  .welcome {
    max-width: 980px;
    margin: 0 auto;
    padding: 64px 32px;
  }

  .hero {
    margin-bottom: 48px;
  }
  .hero-eyebrow {
    font-family: monospace;
    font-size: 12px;
    letter-spacing: 0.15em;
    color: var(--accent);
    margin-bottom: 14px;
  }
  .hero h1 {
    font-size: 34px;
    margin: 0 0 14px;
    background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hero p {
    color: var(--text-secondary);
    font-size: 15px;
    max-width: 560px;
    line-height: 1.6;
    margin: 0;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 18px;
  }

  .tool-card {
    display: block;
    background: linear-gradient(160deg, var(--bg-panel-soft), var(--bg-page-soft));
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 22px;
    text-decoration: none;
    color: inherit;
    transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .tool-card:hover {
    transform: translateY(-3px);
    border-color: var(--accent);
    box-shadow: 0 8px 24px var(--accent-soft-12);
  }

  .tool-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .tool-icon {
    font-size: 24px;
  }
  .tool-tag {
    font-size: 11px;
    font-family: monospace;
    color: var(--accent-light);
    background: var(--accent-soft-12);
    border: 1px solid var(--accent-border-35);
    border-radius: 999px;
    padding: 2px 10px;
  }
  .tool-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--text-strong);
    margin-bottom: 8px;
  }
  .tool-desc {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.55;
    margin-bottom: 18px;
    min-height: 40px;
  }
  .tool-arrow {
    font-size: 13px;
    color: var(--accent);
    font-weight: 600;
  }
</style>
