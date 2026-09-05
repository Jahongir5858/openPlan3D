<script lang="ts">
  import {
    currentProject, activeFloor, detectedRoomsStore, selectedRoomId,
    addZone, updateZone, removeZone, assignRoomZone, highlightZoneId,
  } from '$lib/stores/project';
  import { buildLegend, ZONE_PALETTE } from '$lib/utils/zones';
  import { checkFloor, norms } from '$lib/utils/accessibility';
  import { projectSettings, formatArea } from '$lib/stores/settings';
  import type { Issue } from '$lib/utils/accessibility';
  import type { Floor, Project, Room, Zone } from '$lib/models/types';

  let project = $state<Project | null>(null);
  let floor = $state<Floor | null>(null);
  let rooms = $state<Room[]>([]);
  let highlight = $state<string | null>(null);
  let selRoom = $state<string | null>(null);
  let settings = $state($projectSettings);

  currentProject.subscribe((p) => { project = p; });
  activeFloor.subscribe((f) => { floor = f; });
  detectedRoomsStore.subscribe((r) => { rooms = r; });
  highlightZoneId.subscribe((v) => { highlight = v; });
  selectedRoomId.subscribe((v) => { selRoom = v; });
  projectSettings.subscribe((s) => { settings = s; });

  let zones = $derived(project?.zones ?? []);
  let legend = $derived(project ? buildLegend(project, rooms) : []);

  let issues = $derived.by<Issue[]>(() => {
    if (!floor || !project) return [];
    return checkFloor(floor, rooms, norms(project.norms));
  });

  let fails = $derived(issues.filter(i => i.level === 'fail'));
  let warns = $derived(issues.filter(i => i.level === 'warn'));

  let newName = $state('');

  function create() {
    const n = newName.trim();
    if (!n) return;
    addZone(n);
    newName = '';
  }

  function toggleHighlight(id: string) {
    highlightZoneId.set(highlight === id ? null : id);
  }

  const ISSUE_TEXT: Record<string, string> = {
    'door-clear-width': 'Eshikning toza kengligi yetarli emas',
    'ramp-slope': 'Pandus qiyaligi normadan oshgan',
    'ramp-landing-missing': 'Pandusda oraliq maydoncha yo\u2018q',
    'ramp-landing-short': 'Maydoncha uzunligi kam',
    'ramp-handrail': 'Pandusda panjara belgilanmagan',
    'lift-cabin-width': 'Lift kabinasi tor',
    'lift-cabin-depth': 'Lift kabinasi kalta',
    'lift-door-width': 'Lift eshigi tor',
    'stair-riser-height': 'Bosqich balandligi ortiqcha',
    'stair-tread-depth': 'Bosqich kengligi kam',
    'stair-width': 'Zinapoya marshi tor',
    'stair-handrail': 'Zinapoyada panjara belgilanmagan',
    'room-turning-circle': 'Aravacha burilish doirasi sig\u2018maydi',
  };
</script>

<div class="p-3 space-y-4 text-sm">
  <section>
    <div class="flex items-center justify-between mb-2">
      <h3 class="font-semibold text-gray-700">Xizmatlar</h3>
      {#if highlight}
        <button class="text-xs text-blue-600 hover:underline" onclick={() => highlightZoneId.set(null)}>
          Ajratishni bekor qilish
        </button>
      {/if}
    </div>

    {#if zones.length === 0}
      <p class="text-xs text-gray-500 mb-2">
        Hali xizmat qo&#8216;shilmagan. Xizmat qo&#8216;shsangiz, xonalarni unga biriktirib,
        rejani xizmatlar bo&#8216;yicha ranglaysiz.
      </p>
    {/if}

    <ul class="space-y-1">
      {#each zones as z, i (z.id)}
        {@const entry = legend.find(e => e.zone.id === z.id)}
        <li class="rounded-lg border px-2 py-1.5 {highlight === z.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}">
          <div class="flex items-center gap-2">
            <input
              type="color"
              value={z.color}
              aria-label="{z.name} rangi"
              oninput={(e) => updateZone(z.id, { color: (e.currentTarget as HTMLInputElement).value })}
              class="w-7 h-7 rounded cursor-pointer border border-gray-200 bg-transparent p-0.5"
            />
            <input
              type="text"
              value={z.code}
              aria-label="{z.name} kodi"
              oninput={(e) => updateZone(z.id, { code: (e.currentTarget as HTMLInputElement).value })}
              class="w-10 px-1 py-0.5 text-xs font-semibold border border-gray-200 rounded text-center"
            />
            <input
              type="text"
              value={z.name}
              aria-label="Xizmat nomi"
              oninput={(e) => updateZone(z.id, { name: (e.currentTarget as HTMLInputElement).value })}
              class="flex-1 min-w-0 px-1.5 py-0.5 text-xs border border-gray-200 rounded"
            />
            <button
              class="text-gray-400 hover:text-red-500 px-1"
              aria-label="{z.name} xizmatini o&#8216;chirish"
              onclick={() => removeZone(z.id)}
            >&#10005;</button>
          </div>
          <div class="flex items-center justify-between mt-1 pl-9 text-xs text-gray-500">
            <span>
              {#if entry}
                {entry.roomCount} xona &middot; {formatArea(entry.area, settings.units)}
                {#if entry.capacity !== undefined}&middot; {entry.capacity} o&#8216;rin{/if}
              {:else}
                bu qavatda yo&#8216;q
              {/if}
            </span>
            <button class="text-blue-600 hover:underline" onclick={() => toggleHighlight(z.id)}>
              {highlight === z.id ? 'ajratilgan' : 'ajratish'}
            </button>
          </div>
          {#if i >= ZONE_PALETTE.length}
            <p class="pl-9 mt-1 text-xs text-amber-600">
              Rang takrorlandi &mdash; shtrix bilan ajratiladi. Kodga tayaning.
            </p>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="flex gap-2 mt-2">
      <input
        type="text"
        bind:value={newName}
        placeholder="Yangi xizmat nomi"
        aria-label="Yangi xizmat nomi"
        onkeydown={(e) => { if (e.key === 'Enter') create(); }}
        class="flex-1 min-w-0 px-2 py-1 text-xs border border-gray-200 rounded"
      />
      <button
        class="px-2.5 py-1 text-xs rounded bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50"
        disabled={!newName.trim()}
        onclick={create}
      >Qo&#8216;shish</button>
    </div>
  </section>

  {#if selRoom && zones.length > 0}
    <section>
      <h3 class="font-semibold text-gray-700 mb-1.5">Tanlangan xona</h3>
      <select
        class="w-full px-2 py-1 text-xs border border-gray-200 rounded"
        aria-label="Xonaning xizmati"
        value={rooms.find(r => r.id === selRoom)?.zoneId ?? ''}
        onchange={(e) => assignRoomZone(selRoom!, (e.currentTarget as HTMLSelectElement).value || undefined)}
      >
        <option value="">Xizmatga biriktirilmagan</option>
        {#each zones as z (z.id)}
          <option value={z.id}>{z.code} &middot; {z.name}</option>
        {/each}
      </select>
    </section>
  {/if}

  <section>
    <h3 class="font-semibold text-gray-700 mb-1.5">
      Imkoniyat cheklanganlik tekshiruvi
    </h3>
    {#if issues.length === 0}
      <p class="text-xs text-green-700">Bu qavatda muammo topilmadi.</p>
    {:else}
      <p class="text-xs text-gray-500 mb-1.5">
        {fails.length} xato, {warns.length} ogohlantirish
      </p>
      <ul class="space-y-1">
        {#each [...fails, ...warns] as issue (issue.elementId + issue.code)}
          <li class="flex items-start gap-2 text-xs">
            <span class="mt-1 w-1.5 h-1.5 rounded-full shrink-0 {issue.level === 'fail' ? 'bg-red-500' : 'bg-amber-500'}"></span>
            <span class="flex-1">
              {ISSUE_TEXT[issue.code] ?? issue.code}
              {#if issue.measured > 0}
                <span class="text-gray-500">
                  &mdash; {issue.measured}{issue.unit}, kerak {issue.required}{issue.unit}
                </span>
              {/if}
            </span>
          </li>
        {/each}
      </ul>
      <p class="mt-2 text-xs text-gray-400 leading-relaxed">
        Qiymatlar loyiha sozlamalaridan olinadi. Ular xalqaro amaliyotga asoslangan
        boshlang&#8216;ich qiymatlar &mdash; loyihangizga tegishli qurilish normasi bilan
        solishtirib tekshiring.
      </p>
    {/if}
  </section>
</div>
