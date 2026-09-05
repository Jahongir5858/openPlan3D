<script lang="ts">
  import { onMount } from 'svelte';
  import { importFloorIntoCurrentProject } from '$lib/stores/project';
  import { analyzeCadFile, buildFloorFromCad, type CadAnalysis, type CadUnit } from '$lib/utils/cadImport';

  let analysis = $state<CadAnalysis | null>(null);
  let busy = $state(false);
  let error = $state('');
  let success = $state('');
  let selectedLayers = $state<string[]>([]);
  let unit = $state<CadUnit>('auto');
  let wallThicknessCm = $state(15);
  let wallHeightCm = $state(280);
  let minSegmentLengthCm = $state(30);
  let collapseParallelWalls = $state(true);
  let centerDrawing = $state(true);

  function isEditorPage() {
    return typeof window !== 'undefined' && /\/editor(?:\/|$|\?)/.test(window.location.pathname + window.location.search);
  }

  function buttonAlreadyExists() {
    return !!document.querySelector('[data-op3d-cad-import]');
  }

  function findImportJsonButton(): HTMLButtonElement | null {
    const buttons = [...document.querySelectorAll('button')];
    return (buttons.find((button) => {
      const text = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return text.includes('json') && text.includes('import');
    }) as HTMLButtonElement | undefined) ?? null;
  }

  function installMenuButton() {
    if (!isEditorPage() || buttonAlreadyExists()) return;
    const anchor = findImportJsonButton();
    if (!anchor || !anchor.parentElement) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.op3dCadImport = 'true';
    button.className = anchor.className;
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6"/><path d="M8 15h8"/><path d="M8 18h5"/>
      </svg>
      AutoCAD import (.DWG/.DXF)`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      chooseCadFile();
    });
    anchor.insertAdjacentElement('afterend', button);
  }

  function chooseCadFile() {
    error = '';
    success = '';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dwg,.dxf,application/dxf,application/x-dxf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await loadFile(file);
    };
    input.click();
  }

  async function loadFile(file: File) {
    busy = true;
    error = '';
    success = '';
    analysis = null;
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
  }

  function toggleLayer(name: string, checked: boolean) {
    selectedLayers = checked
      ? [...new Set([...selectedLayers, name])]
      : selectedLayers.filter((layer) => layer !== name);
  }

  function selectAllLayers() {
    if (!analysis) return;
    selectedLayers = analysis.layers.map((layer) => layer.name);
  }

  function selectSuggestedLayers() {
    if (!analysis) return;
    selectedLayers = analysis.layers.filter((layer) => layer.selectedByDefault).map((layer) => layer.name);
    if (!selectedLayers.length) selectedLayers = analysis.layers.map((layer) => layer.name);
  }

  async function doImport() {
    if (!analysis) return;
    if (!selectedLayers.length) {
      error = 'Kamida bitta CAD qatlamini tanlang.';
      return;
    }

    busy = true;
    error = '';
    success = '';
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
      success = `${result.walls.toLocaleString('uz-UZ')} ta devor va ${result.rooms.toLocaleString('uz-UZ')} ta xona import qilindi. Birlik: ${result.effectiveUnit}.`;
      if (result.warnings.length) success += ` ${result.warnings.length} ta ogohlantirish bor.`;
      setTimeout(() => {
        analysis = null;
        success = '';
      }, 2200);
    } catch (e: any) {
      error = e?.message || 'CAD chizmani import qilib bo‘lmadi.';
    } finally {
      busy = false;
    }
  }

  function closeDialog() {
    if (busy) return;
    analysis = null;
    error = '';
    success = '';
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  onMount(() => {
    installMenuButton();
    const observer = new MutationObserver(() => installMenuButton());
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(installMenuButton, 1200);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      document.querySelector('[data-op3d-cad-import]')?.remove();
    };
  });
</script>

{#if busy && !analysis}
  <div class="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
    <div class="w-full max-w-sm rounded-2xl bg-white p-7 shadow-2xl text-center">
      <div class="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin"></div>
      <h2 class="font-bold text-slate-900">CAD fayl o‘qilmoqda</h2>
      <p class="mt-2 text-sm text-slate-500">DWG bo‘lsa, birinchi marta WebAssembly dekoderi yuklanishi mumkin.</p>
    </div>
  </div>
{/if}

{#if error && !analysis && !busy}
  <div class="fixed bottom-5 left-1/2 z-[10060] -translate-x-1/2 max-w-xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-xl flex items-start gap-3">
    <span class="flex-1">{error}</span>
    <button type="button" class="font-bold" onclick={() => error = ''} aria-label="Yopish">×</button>
  </div>
{/if}

{#if analysis}
  <div class="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4" role="presentation" onclick={(e) => { if (e.currentTarget === e.target) closeDialog(); }}>
    <div class="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200">
      <div class="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-5 flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="inline-flex rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 uppercase">{analysis.format}</span>
            <h2 class="text-xl font-bold text-slate-900">AutoCAD faylni import qilish</h2>
          </div>
          <p class="mt-1 text-sm text-slate-500 break-all">{analysis.fileName} · {formatBytes(analysis.bytes)}</p>
        </div>
        <button type="button" class="h-9 w-9 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 text-xl" onclick={closeDialog} aria-label="Yopish">×</button>
      </div>

      <div class="p-6 space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div class="text-xs text-slate-500">CAD obyektlari</div>
            <div class="mt-1 text-lg font-bold text-slate-900">{analysis.entityCount.toLocaleString('uz-UZ')}</div>
          </div>
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div class="text-xs text-slate-500">Chiziq segmentlari</div>
            <div class="mt-1 text-lg font-bold text-slate-900">{analysis.segmentCount.toLocaleString('uz-UZ')}</div>
          </div>
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div class="text-xs text-slate-500">Qatlamlar</div>
            <div class="mt-1 text-lg font-bold text-slate-900">{analysis.layers.length}</div>
          </div>
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div class="text-xs text-slate-500">CAD birligi</div>
            <div class="mt-1 text-lg font-bold text-slate-900">{analysis.sourceUnit ?? 'aniqlanmadi'}</div>
          </div>
        </div>

        {#if analysis.warnings.length}
          <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div class="font-semibold mb-1">Import ogohlantirishlari</div>
            {#each analysis.warnings as warning}
              <div>• {warning}</div>
            {/each}
          </div>
        {/if}

        <section>
          <div class="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 class="font-bold text-slate-900">1. Import qilinadigan qatlamlar</h3>
              <p class="text-xs text-slate-500 mt-0.5">Devor qatlamlari avtomatik tavsiya qilinadi. Keraksiz qatlamlarni o‘chiring.</p>
            </div>
            <div class="flex gap-2 shrink-0">
              <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" onclick={selectSuggestedLayers}>Tavsiya</button>
              <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" onclick={selectAllLayers}>Barchasi</button>
            </div>
          </div>
          <div class="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
            {#each analysis.layers as layer}
              <label class="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedLayers.includes(layer.name)}
                  onchange={(e) => toggleLayer(layer.name, e.currentTarget.checked)}
                  class="h-4 w-4 rounded accent-blue-600"
                />
                <span class="flex-1 min-w-0 text-sm font-medium text-slate-700 truncate" title={layer.name}>{layer.name}</span>
                <span class="text-xs text-slate-400">{layer.segments.toLocaleString('uz-UZ')} segment</span>
              </label>
            {/each}
          </div>
        </section>

        <section>
          <h3 class="font-bold text-slate-900 mb-3">2. Masshtab va devor parametrlari</h3>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label class="block">
              <span class="text-xs font-semibold text-slate-600">CAD o‘lchov birligi</span>
              <select bind:value={unit} class="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="auto">Auto {analysis.sourceUnit ? `(${analysis.sourceUnit})` : '(mm)'}</option>
                <option value="mm">Millimetr (mm)</option>
                <option value="cm">Santimetr (cm)</option>
                <option value="m">Metr (m)</option>
                <option value="in">Dyuym (inch)</option>
                <option value="ft">Fut (ft)</option>
              </select>
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-slate-600">Standart devor qalinligi, cm</span>
              <input type="number" min="5" max="100" step="1" bind:value={wallThicknessCm} class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-slate-600">Devor balandligi, cm</span>
              <input type="number" min="100" max="1000" step="10" bind:value={wallHeightCm} class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label class="block">
              <span class="text-xs font-semibold text-slate-600">Minimal segment, cm</span>
              <input type="number" min="0" max="500" step="5" bind:value={minSegmentLengthCm} class="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>
        </section>

        <section class="space-y-3">
          <h3 class="font-bold text-slate-900">3. Chizmani tozalash</h3>
          <label class="flex items-start gap-3 rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50">
            <input type="checkbox" bind:checked={collapseParallelWalls} class="mt-0.5 h-4 w-4 accent-blue-600" />
            <span>
              <span class="block text-sm font-semibold text-slate-800">Parallel chiziqlarni bitta devorga birlashtirish</span>
              <span class="block mt-0.5 text-xs text-slate-500">AutoCAD’da devor ikki parallel chiziq bilan chizilgan bo‘lsa, ularni markaziy devorga aylantirib, qalinligini hisoblaydi.</span>
            </span>
          </label>
          <label class="flex items-start gap-3 rounded-xl border border-slate-200 p-4 cursor-pointer hover:bg-slate-50">
            <input type="checkbox" bind:checked={centerDrawing} class="mt-0.5 h-4 w-4 accent-blue-600" />
            <span>
              <span class="block text-sm font-semibold text-slate-800">Chizmani ish maydoniga joylashtirish</span>
              <span class="block mt-0.5 text-xs text-slate-500">CAD koordinatalari juda katta yoki manfiy bo‘lsa, reja avtomatik ko‘rinadigan joyga ko‘chiriladi.</span>
            </span>
          </label>
        </section>

        {#if analysis.format === 'dwg'}
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs leading-relaxed text-slate-500">
            DWG fayl brauzerning o‘zida LibreDWG WebAssembly yordamida ochiladi; chizmaning o‘zi tashqi serverga yuklanmaydi. Birinchi DWG importida taxminan 9.5 MB dekoder yuklanadi. LibreDWG komponenti GPL-3.0 litsenziyasiga ega.
          </div>
        {:else}
          <div class="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs leading-relaxed text-slate-500">
            DXF fayl brauzerning o‘zida dxf-parser yordamida o‘qiladi. Import chizmadagi LINE, LWPOLYLINE/POLYLINE, ARC va SPLINE geometriyasini devorlarga aylantiradi.
          </div>
        {/if}

        {#if error}
          <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        {/if}
        {#if success}
          <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{success}</div>
        {/if}
      </div>

      <div class="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
        <div class="text-xs text-slate-400">Import joriy qavatdagi geometriyani almashtiradi. Undo orqali qaytarish mumkin.</div>
        <div class="flex gap-2 shrink-0">
          <button type="button" class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" onclick={closeDialog} disabled={busy}>Bekor qilish</button>
          <button type="button" class="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50" onclick={doImport} disabled={busy || !selectedLayers.length}>
            {busy ? 'Import qilinmoqda…' : 'Import qilish'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
