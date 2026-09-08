<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { centers2026, centerProjectMatch, type Center2026 } from '$lib/data/centers2026';

  type ProjectMeta = { id: string; name: string; updatedAt: string };
  let {
    projects = [],
    height = '560px',
    compact = false,
    selectedCenterId = null,
    onSelect = undefined
  }: {
    projects?: ProjectMeta[];
    height?: string;
    compact?: boolean;
    selectedCenterId?: number | null;
    onSelect?: ((center: Center2026) => void) | undefined;
  } = $props();

  let host: HTMLDivElement;
  let map: any = null;
  let markers = new Map<number, any>();
  let resizeObserver: ResizeObserver | null = null;

  function esc(value: string) {
    return value.replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch] || ch);
  }

  function matchingProject(center: Center2026) {
    return projects.find(p => centerProjectMatch(p.name, center.district));
  }

  async function loadLeaflet() {
    const w = window as any;
    if (w.L) return w.L;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-openplan-leaflet]') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Leaflet yuklanmadi')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.dataset.openplanLeaflet = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Leaflet yuklanmadi'));
      document.head.appendChild(script);
    });
    return (window as any).L;
  }

  function renderMarkers(L: any) {
    markers.clear();
    const bounds: [number, number][] = [];
    for (const center of centers2026) {
      const project = matchingProject(center);
      const marker = L.circleMarker([center.lat, center.lng], {
        radius: project ? 9 : 7,
        weight: 2,
        color: project ? '#14532d' : '#1d4ed8',
        fillColor: project ? '#22c55e' : '#3b82f6',
        fillOpacity: .9
      }).addTo(map);
      const editor = project
        ? `<a class="op3d-map-btn primary" href="${base}/editor?id=${encodeURIComponent(project.id)}">3D loyihani ochish</a>`
        : `<span class="op3d-map-note">3D loyiha hali bog‘lanmagan</span>`;
      marker.bindPopup(`
        <div class="op3d-map-popup">
          <div class="op3d-map-kicker">2026 · #${center.id}</div>
          <strong>${esc(center.district)}</strong>
          <span>${esc(center.region)}</span>
          <p>${esc(center.object)}</p>
          <div class="op3d-map-actions">
            ${editor}
            <a class="op3d-map-btn" href="${center.mapsUrl}" target="_blank" rel="noreferrer">Google Maps</a>
          </div>
        </div>`);
      marker.on('click', () => onSelect?.(center));
      markers.set(center.id, marker);
      bounds.push([center.lat, center.lng]);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: compact ? [16, 16] : [30, 30], maxZoom: 7 });
  }

  onMount(async () => {
    try {
      const L = await loadLeaflet();
      if (!host || map) return;
      map = L.map(host, { zoomControl: true, scrollWheelZoom: !compact, minZoom: 5, maxZoom: 18 }).setView([41.0, 64.7], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      renderMarkers(L);
      resizeObserver = new ResizeObserver(() => map?.invalidateSize(false));
      resizeObserver.observe(host);
      setTimeout(() => map?.invalidateSize(false), 100);
    } catch (e) {
      console.error(e);
      if (host) host.innerHTML = '<div class="op3d-map-error">Xarita yuklanmadi. Internet aloqasini tekshiring.</div>';
    }
  });

  $effect(() => {
    const id = selectedCenterId;
    if (id && map) {
      const marker = markers.get(id);
      if (marker) {
        map.setView(marker.getLatLng(), 13, { animate: true });
        marker.openPopup();
      }
    }
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    map?.remove();
    map = null;
    markers.clear();
  });
</script>

<svelte:head>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div class="map-shell" class:compact style={`height:${height}`}>
  <div bind:this={host} class="map-host" aria-label="2026-yil hududiy ijtimoiy xizmatlar markazlari xaritasi"></div>
</div>

<style>
  .map-shell{width:100%;min-height:300px;border-radius:18px;overflow:hidden;background:#dce6ee;border:1px solid #cbd5e1;position:relative}
  .map-host{width:100%;height:100%;min-height:inherit}
  .map-shell :global(.leaflet-control-attribution){font-size:9px}
  .map-shell :global(.leaflet-popup-content-wrapper){border-radius:14px;box-shadow:0 18px 45px rgba(15,23,42,.2)}
  .map-shell :global(.leaflet-popup-content){margin:14px 16px;min-width:230px}
  .map-shell :global(.op3d-map-popup){display:flex;flex-direction:column;gap:5px;color:#0f172a;font-family:Manrope,system-ui,sans-serif}
  .map-shell :global(.op3d-map-popup strong){font-size:15px}
  .map-shell :global(.op3d-map-popup span){font-size:11px;color:#64748b;font-weight:700}
  .map-shell :global(.op3d-map-popup p){font-size:12px;line-height:1.45;margin:4px 0;color:#334155}
  .map-shell :global(.op3d-map-kicker){font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#2563eb;font-weight:800}
  .map-shell :global(.op3d-map-actions){display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}
  .map-shell :global(.op3d-map-btn){display:inline-flex;padding:7px 9px;border-radius:8px;background:#e2e8f0;color:#1e293b;text-decoration:none;font-size:10px;font-weight:800}
  .map-shell :global(.op3d-map-btn.primary){background:#2563eb;color:white}
  .map-shell :global(.op3d-map-note){font-size:10px;color:#94a3b8}
  .map-shell :global(.op3d-map-error){height:100%;display:grid;place-items:center;padding:24px;text-align:center;color:#475569;font-weight:700}
  .compact :global(.leaflet-control-attribution){display:none}
</style>
