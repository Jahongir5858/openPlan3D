<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import AppNav from '$lib/components/AppNav.svelte';
  import CentersMap from '$lib/components/CentersMap.svelte';
  import { centers2026, centerProjectMatch } from '$lib/data/centers2026';
  import { localStore } from '$lib/services/datastore';

  type ProjectMeta = { id: string; name: string; updatedAt: string };
  let projects = $state<ProjectMeta[]>([]);
  let loading = $state(true);
  let adminOverview = $state<{ users?: number; projects?: number } | null>(null);

  onMount(async () => {
    try {
      projects = await localStore.list();
      const me = await fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (me?.user?.role === 'admin' || Number(me?.user?.id) === 1) {
        adminOverview = await fetch('/api/admin/overview', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
      }
    } finally {
      loading = false;
    }
  });

  function findProject(district: string) {
    return projects.find(p => centerProjectMatch(p.name, district));
  }

  function formatDate(d: string) {
    const date = new Date(d);
    return new Intl.DateTimeFormat('uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
  }

  let linkedCount = $derived(centers2026.filter(c => !!findProject(c.district)).length);
  let regionsCount = $derived(new Set(centers2026.map(c => c.region)).size);
</script>

<svelte:head><title>Dashboard · Hududiy markazlar</title></svelte:head>

<div class="page-shell">
  <AppNav active="dashboard" />
  <main class="dashboard">
    <section class="hero">
      <div>
        <span class="eyebrow">MARKAZLASHTIRILGAN BOSHQARUV</span>
        <h1>Hududiy ijtimoiy xizmatlar markazlari</h1>
        <p>2026-yilgi 20 ta markazning joylashuvi, bino rejalari va 3D loyihalarini yagona oynadan boshqaring.</p>
      </div>
      <div class="hero-actions">
        <a class="btn secondary" href={`${base}/map`}>Xaritani ochish</a>
        <a class="btn primary" href={`${base}/`}>Bino rejalari</a>
      </div>
    </section>

    <section class="kpis" aria-label="Asosiy ko‘rsatkichlar">
      <div class="kpi"><span>2026 markazlari</span><b>20</b><small>{regionsCount} ta hudud</small></div>
      <div class="kpi"><span>3D loyiha bog‘langan</span><b>{linkedCount}</b><small>20 tadan</small></div>
      <div class="kpi"><span>Muharrirdagi loyihalar</span><b>{projects.length}</b><small>joriy foydalanuvchi</small></div>
      <div class="kpi"><span>Tizim foydalanuvchilari</span><b>{adminOverview?.users ?? '—'}</b><small>{adminOverview ? 'administrator ko‘rishi' : 'faqat admin uchun'}</small></div>
    </section>

    <section class="grid-main">
      <div class="panel map-panel">
        <div class="panel-head">
          <div><span class="label">XARITA</span><h2>20 ta markaz joylashuvi</h2></div>
          <a href={`${base}/map`}>To‘liq xarita →</a>
        </div>
        <CentersMap {projects} height="430px" compact={true} />
        <div class="legend"><span><i class="dot linked"></i>3D loyiha bog‘langan</span><span><i class="dot"></i>3D loyiha bog‘lanmagan</span></div>
      </div>

      <div class="panel recent-panel">
        <div class="panel-head"><div><span class="label">SO‘NGGI ISHLAR</span><h2>Bino rejalari</h2></div><a href={`${base}/`}>Barchasi →</a></div>
        {#if loading}
          <div class="empty">Yuklanmoqda…</div>
        {:else if projects.length === 0}
          <div class="empty">Hozircha loyiha yo‘q.</div>
        {:else}
          <div class="recent-list">
            {#each projects.slice(0, 7) as p}
              <a href={`${base}/editor?id=${p.id}`}>
                <span class="project-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></span>
                <span class="project-name"><b>{p.name || 'Nomsiz loyiha'}</b><small>{formatDate(p.updatedAt)}</small></span>
                <span class="arrow">›</span>
              </a>
            {/each}
          </div>
        {/if}
      </div>
    </section>

    <section class="panel centers-panel">
      <div class="panel-head"><div><span class="label">2026 DASTUR</span><h2>Markazlar holati</h2></div><span class="counter">{linkedCount}/20 loyiha bog‘langan</span></div>
      <div class="center-grid">
        {#each centers2026 as center}
          {@const project = findProject(center.district)}
          <article class:linked={!!project}>
            <div class="center-top"><span class="number">{String(center.id).padStart(2,'0')}</span><span class="status">{project ? '3D mavjud' : 'Kutilmoqda'}</span></div>
            <h3>{center.district}</h3>
            <p>{center.region}</p>
            <small>{center.object}</small>
            <div class="center-actions">
              <a href={center.mapsUrl} target="_blank" rel="noreferrer">Xaritada</a>
              {#if project}<a class="open" href={`${base}/editor?id=${project.id}`}>Loyihani ochish</a>{:else}<a class="open muted" href={`${base}/`}>Loyiha bog‘lash</a>{/if}
            </div>
          </article>
        {/each}
      </div>
    </section>
  </main>
</div>

<style>
  :global(body){margin:0;background:#0b1423;color:#e5edf7;font-family:Manrope,system-ui,sans-serif}
  .page-shell{min-height:100vh;background:radial-gradient(circle at 20% -10%,rgba(37,99,235,.13),transparent 30%),#0b1423}
  .dashboard{max-width:1480px;margin:0 auto;padding:28px 24px 52px}
  .hero{border:1px solid #24344a;background:linear-gradient(135deg,#14243a,#101c2d);border-radius:20px;padding:28px 30px;display:flex;justify-content:space-between;gap:28px;align-items:center;box-shadow:0 18px 50px rgba(0,0,0,.16)}
  .eyebrow,.label{font-size:10px;font-weight:800;letter-spacing:.14em;color:#60a5fa}
  .hero h1{font-size:28px;line-height:1.15;margin:7px 0 8px;color:#fff}
  .hero p{max-width:760px;color:#9fb0c6;margin:0;font-size:13px;line-height:1.6}
  .hero-actions{display:flex;gap:9px;flex-wrap:wrap}.btn{padding:11px 16px;border-radius:10px;text-decoration:none;font-weight:800;font-size:12px;border:1px solid #334a67;color:#dce9f8}.btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.btn.secondary{background:#16273d}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:16px 0}.kpi{border:1px solid #223249;background:#101d2e;border-radius:16px;padding:18px 20px;display:flex;flex-direction:column}.kpi span{font-size:11px;color:#8fa2ba;font-weight:700}.kpi b{font-size:29px;color:#fff;margin:6px 0 2px}.kpi small{font-size:10px;color:#64748b}
  .grid-main{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(320px,.65fr);gap:16px}.panel{border:1px solid #223249;background:#101d2e;border-radius:18px;padding:17px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}.panel-head h2{font-size:16px;color:#f8fafc;margin:4px 0 0}.panel-head a,.counter{font-size:11px;color:#7fb4ff;text-decoration:none;font-weight:800}.map-panel{min-width:0}.legend{display:flex;gap:18px;flex-wrap:wrap;padding:10px 3px 0;font-size:10px;color:#8092aa}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;margin-right:6px}.dot.linked{background:#22c55e}
  .recent-list{display:flex;flex-direction:column}.recent-list>a{display:flex;align-items:center;gap:11px;padding:11px 7px;border-bottom:1px solid #1d2b3d;text-decoration:none;color:inherit}.recent-list>a:hover{background:#14243a}.project-icon{width:34px;height:34px;border-radius:9px;background:#1a2b42;display:grid;place-items:center;color:#72a7ed}.project-icon svg{width:18px}.project-name{min-width:0;display:flex;flex:1;flex-direction:column}.project-name b{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.project-name small{font-size:9px;color:#6f8299;margin-top:4px}.arrow{color:#58708e;font-size:20px}.empty{padding:40px 10px;text-align:center;color:#64748b;font-size:12px}
  .centers-panel{margin-top:16px}.center-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.center-grid article{padding:14px;border:1px solid #24344a;background:#0d1929;border-radius:14px;min-width:0}.center-grid article.linked{border-color:#245b43;box-shadow:inset 0 0 0 1px rgba(34,197,94,.06)}.center-top{display:flex;justify-content:space-between;align-items:center}.number{font-size:10px;color:#5f7898;font-weight:800}.status{font-size:9px;padding:4px 7px;border-radius:999px;background:#172b45;color:#76aafa;font-weight:800}.linked .status{background:#123524;color:#6ee7a0}.center-grid h3{font-size:13px;margin:10px 0 3px;color:#eef5ff}.center-grid p{font-size:10px;color:#7890ad;margin:0}.center-grid small{display:block;font-size:9.5px;line-height:1.45;color:#60748d;margin:9px 0;height:28px;overflow:hidden}.center-actions{display:flex;gap:6px;margin-top:10px}.center-actions a{font-size:9px;padding:7px 8px;border-radius:8px;background:#16273d;color:#9eb6d3;text-decoration:none;font-weight:800}.center-actions a.open{background:#1d4ed8;color:#fff}.center-actions a.muted{background:#1d2d41;color:#8192a7}
  @media(max-width:1100px){.kpis{grid-template-columns:repeat(2,1fr)}.grid-main{grid-template-columns:1fr}.center-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:650px){.dashboard{padding:14px 12px 36px}.hero{padding:20px;align-items:flex-start;flex-direction:column}.hero h1{font-size:22px}.kpis{grid-template-columns:1fr 1fr;gap:9px}.kpi{padding:13px}.kpi b{font-size:24px}.center-grid{grid-template-columns:1fr}.panel{padding:12px}}
</style>
