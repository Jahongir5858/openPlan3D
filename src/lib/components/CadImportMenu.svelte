<script lang="ts">
  import { onMount } from 'svelte';
  import { importFloorIntoCurrentProject } from '$lib/stores/project';
  import { analyzeCadFile, buildFloorFromCad, type CadAnalysis, type CadUnit } from '$lib/utils/cadImport';

  let analysis = $state<CadAnalysis | null>(null);
  let busy = $state(false);
  let error = $state('');
  let selectedLayers = $state<string[]>([]);
  let unit = $state<CadUnit>('auto');
  let wallThicknessCm = $state(15);
  let wallHeightCm = $state(280);
  let minSegmentLengthCm = $state(30);
  let collapseParallelWalls = $state(true);
  let centerDrawing = $state(true);

  function isVisible(el: HTMLElement) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function findVisibleJsonImportButton(): HTMLButtonElement | null {
    const buttons = [...document.querySelectorAll('button')] as HTMLButtonElement[];
    return buttons.find((button) => {
      if (!isVisible(button)) return false;
      const text = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return text.includes('json') && text.includes('import');
    }) ?? null;
  }

  function injectMenuItem() {
    if (document.querySelector('[data-op3d-cad-import-menu]')) return;
    const anchor = findVisibleJsonImportButton();
    if (!anchor || !anchor.parentElement) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.op3dCadImportMenu = 'true';
    button.dataset.op3dCadImport = 'true';
    button.className = anchor.className;
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6"/>
        <path d="M8 15h8"/>
        <path d="M8 18h5"/>
      </svg>
      <span>AutoCAD import (.DWG/.DXF)</span>`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      chooseCadFile();
    });
    anchor.insertAdjacentElement('afterend', button);
  }

  function chooseCadFile() {
    error = '';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dwg,.dxf,application/dxf,application/x-dxf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      busy = true;
      analysis = null;
      error = '';
      try {
        const next = await analyzeCadFile(file);
        analysis = next;
        selectedLayers = next.layers.filter((layer) => layer.selectedByDefault).map((layer) => layer.name);
        if (!selectedLayers.length) selectedLayers = next.layers.map((layer) => layer.name);
        unit = 'auto';
      } catch (e: any) {
        error = e?.message || 'CAD faylni o‘qib bo‘lmadi.';
      } finally {
        busy = false;
      }
    };
    input.click();
  }

  function toggleLayer(name: string, checked: boolean) {
    selectedLayers = checked
      ? [...new Set([...selectedLayers, name])]
      : selectedLayers.filter((layer) => layer !== name);
  }

  function selectSuggested() {
    if (!analysis) return;
    selectedLayers = analysis.layers.filter((layer) => layer.selectedByDefault).map((layer) => layer.name);
    if (!selectedLayers.length) selectedLayers = analysis.layers.map((layer) => layer.name);
  }

  function selectAll() {
    if (!analysis) return;
    selectedLayers = analysis.layers.map((layer) => layer.name);
  }

  function closeDialog() {
    if (busy) return;
    analysis = null;
    error = '';
  }

  async function doImport() {
    if (!analysis) return;
    if (!selectedLayers.length) {
      error = 'Kamida bitta CAD qatlamini tanlang.';
      return;
    }
    busy = true;
    error = '';
    try {
      const result = buildFloorFromCad(analysis, {
        unit,
        layers: selectedLayers,
        wallThicknessCm: Number(wallThicknessCm) || 15,
        wallHeightCm: Number(wallHeightCm) || 280,
        minSegmentLengthCm: Number(minSegmentLengthCm) || 0,
        collapseParallelWalls,
        centerDrawing
      });
      importFloorIntoCurrentProject(result.floor);
      window.alert(`${result.walls.toLocaleString('uz-UZ')} ta devor va ${result.rooms.toLocaleString('uz-UZ')} ta xona import qilindi.`);
      analysis = null;
    } catch (e: any) {
      error = e?.message || 'CAD chizmani import qilib bo‘lmadi.';
    } finally {
      busy = false;
    }
  }

  function formatBytes(bytes: number) {
    return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`;
  }

  onMount(() => {
    injectMenuItem();
    const observer = new MutationObserver(injectMenuItem);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(injectMenuItem, 150);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      document.querySelector('[data-op3d-cad-import-menu]')?.remove();
    };
  });
</script>

{#if busy && !analysis}
  <div class="fixed inset-0 z-[10060] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
    <div class="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl text-center">
      <div class="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin"></div>
      <div class="font-bold text-slate-900">CAD fayl o‘qilmoqda</div>
      <div class="mt-2 text-sm text-slate-500">DWG fayl bo‘lsa, LibreDWG WebAssembly dekoderi yuklanadi.</div>
    </div>
  </div>
{/if}

{#if error && !analysis && !busy}
  <div class="fixed bottom-5 left-1/2 z-[10070] -translate-x-1/2 max-w-xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-xl flex items-start gap-3">
    <span class="flex-1">{error}</span>
    <button type="button" class="font-bold" onclick={() => error = ''} aria-label="Yopish">×</button>
  </div>
{/if}

{#if analysis}
  <div class="fixed inset-0 z-[10060] flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4" role="presentation" onclick={(e) => { if (e.currentTarget === e.target) closeDialog(); }}>
    <div class="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200">
      <div class="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-5 flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 uppercase">{analysis.format}</span>
            <h2 class="text-xl font-bold text-slate-900">AutoCAD faylni import qilish</h2>
          </div>
          <p class="mt-1 text-sm text-slate-500 break-all">{analysis.fileName} · {formatBytes(analysis.bytes)}</p>
        </div>
        <button type="button" class="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 text-xl" onclick={closeDialog} aria-label="Yopish">×</button>
      </div>

      <div class="p-6 space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-3"><div class="text-xs text-slate-500">CAD obyektlari</div><div class="mt-1 text-lg font-bold">{analysis.entityCount.toLocaleString('uz-UZ')}</div></div>
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-3"><div class="text-xs text-slate-500">Segmentlar</div><div class="mt-1 text-lg font-bold">{analysis.segmentCount.toLocaleString('uz-UZ')}</div></div>
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-3"><div class="text-xs text-slate-500">Qatlamlar</div><div class="mt-1 text-lg font-bold">{analysis.layers.length}</div></div>
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-3"><div class="text-xs text-slate-500">CAD birligi</div><div class="mt-1 text-lg font-bold">{analysis.sourceUnit ?? 'aniqlanmadi'}</div></div>
        </div>

        {#if analysis.warnings.length}
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {#each analysis.warnings as warning}<div>• {warning}</div>{/each}
          </div>
        {/if}

        <section>
          <div class="flex items-center justify-between gap-3 mb-3">
            <div><h3 class="font-bold text-slate-900">1. Qatlamlarni tanlang</h3><p class="text-xs text-slate-500 mt-0.5">Devor qatlamlari avtomatik tavsiya qilinadi.</p></div>
            <div class="flex gap-2"><button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" onclick={selectSuggested}>Tavsiya</button><button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold" onclick={selectAll}>Barchasi</button></div>
          </div>
          <div class="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
            {#each analysis.layers as layer}
              <label class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selectedLayers.includes(layer.name)} onchange={(e) => toggleLayer(layer.name, e.currentTarget.checked)} class="h-4 w-4 accent-blue-600" />
                <span class="flex-1 min-w-0 text-sm font-medium text-slate-700 truncate" title={layer.name}>{layer.name}</span>
                <span class="text-xs text-slate-400">{layer.segments.toLocaleString('uz-UZ')} segment</span>
              </label>
            {/each}
          </div>
        </section>

        <section>
          <h3 class="font-bold text-slate-900 mb-3">2. Masshtab va devor parametrlari</h3>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label class="block"><span class="text-xs font-semibold text-slate-600">CAD birligi</span><select bind:value={unit} class="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="auto">Auto {analysis.sourceUnit ? `(${analysis.sourceUnit})` : '(mm)'}</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">inch</option><option value="ft">ft</option></select></label>
            <label class="block"><span class="text-xs font-semibold text-slate-600">Devor qalinligi, cm</span><input type="number" min="5" max="100" bind:value={wallThicknessCm} class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
            <label class="block"><span class="text-xs font-semibold text-slate-600">Devor balandligi, cm</span><input type="number" min="100" max="1000" bind:value={wallHeightCm} class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
            <label class="block"><span class="text-xs font-semibold text-slate-600">Minimal segment, cm</span><input type="number" min="0" max="500" bind:value={minSegmentLengthCm} class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
          </div>
        </section>

        <section class="space-y-3">
          <label class="flex items-start gap-3 rounded-xl border border-slate-200 p-4 cursor-pointer"><input type="checkbox" bind:checked={collapseParallelWalls} class="mt-0.5 h-4 w-4 accent-blue-600" /><span><span class="block text-sm font-semibold text-slate-800">Parallel devor chiziqlarini birlashtirish</span><span class="block mt-0.5 text-xs text-slate-500">Ikki parallel CAD chizig‘idan bitta markaziy devor hosil qiladi.</span></span></label>
          <label class="flex items-start gap-3 rounded-xl border border-slate-200 p-4 cursor-pointer"><input type="checkbox" bind:checked={centerDrawing} class="mt-0.5 h-4 w-4 accent-blue-600" /><span><span class="block text-sm font-semibold text-slate-800">Chizmani ish maydoniga joylashtirish</span><span class="block mt-0.5 text-xs text-slate-500">Katta yoki manfiy CAD koordinatalarini ko‘rinadigan joyga ko‘chiradi.</span></span></label>
        </section>

        {#if error}<div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>{/if}
      </div>

      <div class="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
        <div class="text-xs text-slate-400">Import joriy qavat geometriyasini almashtiradi.</div>
        <div class="flex gap-2"><button type="button" class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold" onclick={closeDialog} disabled={busy}>Bekor qilish</button><button type="button" class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50" onclick={doImport} disabled={busy || !selectedLayers.length}>{busy ? 'Import qilinmoqda…' : 'Import qilish'}</button></div>
      </div>
    </div>
  </div>
{/if}
