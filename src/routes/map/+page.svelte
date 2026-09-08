<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import AppNav from '$lib/components/AppNav.svelte';
  import CentersMap from '$lib/components/CentersMap.svelte';
  import { centers2026, centerProjectMatch, type Center2026 } from '$lib/data/centers2026';
  import { localStore } from '$lib/services/datastore';

  type ProjectMeta = { id: string; name: string; updatedAt: string };
  let projects = $state<ProjectMeta[]>([]);
  let query = $state('');
  let region = $state('');
  let selectedCenterId = $state<number | null>(null);

  onMount(async () => { projects = await localStore.list(); });

  const regions = Array.from(new Set(centers2026.map(c => c.region))).sort((a,b) => a.localeCompare(b,'uz'));
  let filtered = $derived(centers2026.filter(c => {
    const q = query.trim().toLocaleLowerCase('uz');
    const matchesText = !q || `${c.district} ${c.region} ${c.name} ${c.object}`.toLocaleLowerCase('uz').includes(q);
    return matchesText && (!region || c.region === region);
  }));

  function projectFor(center: Center2026) {
    return projects.find(p => centerProjectMatch(p.name, center.district));
  }
</script>

<svelte:head><title>Xarita · Hududiy markazlar</title></svelte:head>

<div class="page-shell">
  <AppNav active="map" />
  <main class="layout">
    <aside class="sidebar">
      <div class="side-head">
        <span class="eyebrow">2026 · 20 MARKAZ</span>
        <h1>Markazlar xaritasi</h1>
        <p>Hudud, tuman/shahar yoki obyekt nomi bo‘yicha qidiring.</p>
      </div>

      <div class="filters">
        <label><span>Qidiruv</span><input bind:value={query} placeholder="Masalan: Yunusobod" /></label>
        <label><span>Hudud</span><select bind:value={region}><option value="">Barcha hududlar</option>{#each regions as r}<option value={r}>{r}</option>{/each}</select></label>
      </div>

      <div class="summary"><b>{filtered.length}</b><span>ta markaz ko‘rsatilmoqda</span><button onclick={() => { query=''; region=''; selectedCenterId=null; }}>Tozalash</button></div>

      <div class="center-list">
        {#each filtered as center}
          {@const project = projectFor(center)}
          <button class:selected={selectedCenterId === center.id} onclick={() => selectedCenterId = center.id}>
            <span class="index">{String(center.id).padStart(2,'0')}</span>
            <span class="meta"><b>{center.district}</b><small>{center.region}</small><em>{center.object}</em></span>
            <span class:linked={!!project} class="status-dot" title={project ? '3D loyiha mavjud' : '3D loyiha bog‘lanmagan'}></span>
          </button>
        {/each}
      </div>
    </aside>

    <section class="map-area">
      <div class="map-toolbar">
        <div><span class="legend-item"><i class="green"></i>3D loyiha mavjud</span><span class="legend-item"><i></i>3D loyiha bog‘lanmagan</span></div>
        <a href={`${base}/`}>Bino rejalari →</a>
      </div>
      <CentersMap {projects} height="calc(100vh - 142px)" {selectedCenterId} onSelect={(c) => selectedCenterId = c.id} />
    </section>
  </main>
</div>

<style>
  :global(body){margin:0;background:#0b1423;color:#e5edf7;font-family:Manrope,system-ui,sans-serif;overflow-x:hidden}
  .page-shell{min-height:100vh;background:#0b1423}.layout{max-width:1480px;margin:0 auto;padding:16px 24px 24px;display:grid;grid-template-columns:350px minmax(0,1fr);gap:15px}.sidebar{height:calc(100vh - 102px);display:flex;flex-direction:column;min-height:520px;border:1px solid #223249;background:#101d2e;border-radius:18px;overflow:hidden}.side-head{padding:20px 20px 10px}.eyebrow{font-size:9px;letter-spacing:.13em;color:#60a5fa;font-weight:800}.side-head h1{font-size:21px;color:#fff;margin:6px 0}.side-head p{font-size:11px;line-height:1.5;color:#7e93ad;margin:0}.filters{display:grid;gap:8px;padding:10px 16px 12px}.filters label{display:grid;gap:5px}.filters label span{font-size:9px;color:#71869f;font-weight:800;text-transform:uppercase;letter-spacing:.07em}.filters input,.filters select{width:100%;box-sizing:border-box;border:1px solid #2b3d55;background:#0c1827;color:#dce7f5;border-radius:9px;padding:9px 10px;font:600 11px Manrope,system-ui;outline:none}.filters input:focus,.filters select:focus{border-color:#3b82f6}.summary{margin:0 16px 9px;padding:9px 10px;border:1px solid #20324a;background:#0d1929;border-radius:10px;display:flex;align-items:center;gap:6px;font-size:9px;color:#71869f}.summary b{font-size:14px;color:#fff}.summary button{margin-left:auto;border:0;background:none;color:#6fa9ff;font-size:9px;font-weight:800;cursor:pointer}.center-list{overflow:auto;padding:0 8px 10px}.center-list button{width:100%;display:grid;grid-template-columns:34px minmax(0,1fr) 12px;gap:8px;align-items:center;text-align:left;padding:10px 9px;border:1px solid transparent;border-bottom-color:#1d2b3e;background:transparent;color:inherit;cursor:pointer;border-radius:9px}.center-list button:hover,.center-list button.selected{background:#15263b;border-color:#29405d}.index{width:30px;height:30px;border-radius:8px;background:#172a42;display:grid;place-items:center;font-size:9px;font-weight:800;color:#77a8e8}.meta{min-width:0;display:flex;flex-direction:column}.meta b{font-size:10.5px;color:#e9f2ff}.meta small{font-size:8.5px;color:#6f849e;margin-top:2px}.meta em{font-size:8px;color:#536980;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px}.status-dot{width:8px;height:8px;border-radius:50%;background:#3b82f6}.status-dot.linked{background:#22c55e}.map-area{min-width:0}.map-toolbar{height:42px;display:flex;align-items:center;justify-content:space-between;padding:0 4px}.map-toolbar>div{display:flex;gap:16px}.legend-item{font-size:9px;color:#8295ad}.legend-item i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#3b82f6;margin-right:6px}.legend-item i.green{background:#22c55e}.map-toolbar a{color:#7fb4ff;text-decoration:none;font-size:10px;font-weight:800}
  @media(max-width:850px){.layout{grid-template-columns:1fr;padding:10px}.sidebar{height:auto;min-height:0;max-height:430px}.map-area :global(.map-shell){height:58vh!important}.map-toolbar{padding:0 4px}.center-list{max-height:220px}}
</style>
