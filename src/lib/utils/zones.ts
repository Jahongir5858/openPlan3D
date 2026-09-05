/**
 * Service zones — colour, hatch and legend.
 *
 * Zones are a flat list. Ten independent services do not form a hierarchy, so
 * nothing here groups them; the only structure is the palette order.
 */
import type { Floor, Project, Room, Zone, ZonePattern } from '$lib/models/types';

export const ZONE_PALETTE: string[] = [
  '#332288', '#88CCEE', '#44AA99', '#117733', '#999933',
  '#DDCC77', '#CC6677', '#882255', '#AA4499', '#EE8866',
];

export const NEUTRAL_FILL = '#98A2AD';
export const PATTERN_CYCLE: ZonePattern[] = ['none', 'diag-l', 'diag-r', 'dots', 'grid', 'cross'];

export function defaultZoneStyle(index: number): { color: string; pattern: ZonePattern } {
  return {
    color: ZONE_PALETTE[index % ZONE_PALETTE.length],
    pattern: PATTERN_CYCLE[Math.floor(index / ZONE_PALETTE.length) % PATTERN_CYCLE.length],
  };
}

export function findZone(project: Project | null, zoneId: string | undefined): Zone | null {
  if (!project?.zones || !zoneId) return null;
  return project.zones.find(z => z.id === zoneId) ?? null;
}

export function roomsByZone(floor: Floor, rooms: Room[]): Map<string, Room[]> {
  const out = new Map<string, Room[]>();
  for (const r of rooms) {
    if (!r.zoneId) continue;
    const list = out.get(r.zoneId);
    if (list) list.push(r); else out.set(r.zoneId, [r]);
  }
  return out;
}

export interface LegendEntry {
  zone: Zone;
  roomCount: number;
  area: number;
  capacity?: number;
}

export function buildLegend(project: Project, rooms: Room[]): LegendEntry[] {
  if (!project.zones?.length) return [];
  const byZone = new Map<string, Room[]>();
  for (const r of rooms) {
    if (!r.zoneId) continue;
    const list = byZone.get(r.zoneId);
    if (list) list.push(r); else byZone.set(r.zoneId, [r]);
  }
  const out: LegendEntry[] = [];
  for (const zone of project.zones) {
    const zoneRooms = byZone.get(zone.id);
    if (!zoneRooms?.length) continue;
    const area = zoneRooms.reduce((s, r) => s + r.area, 0);
    out.push({
      zone,
      roomCount: zoneRooms.length,
      area: Math.round(area * 100) / 100,
      capacity: zone.areaPerClient && zone.areaPerClient > 0
        ? Math.floor(area / zone.areaPerClient)
        : undefined,
    });
  }
  return out;
}

export function projectZoneTotals(project: Project, roomsByFloor: Map<string, Room[]>): LegendEntry[] {
  const all: Room[] = [];
  for (const floor of project.floors) all.push(...(roomsByFloor.get(floor.id) ?? []));
  return buildLegend(project, all);
}

const patternCache = new Map<string, CanvasPattern | null>();

export function zoneHatch(
  ctx: CanvasRenderingContext2D,
  color: string,
  pattern: ZonePattern | undefined,
  zoom: number,
): CanvasPattern | null {
  if (!pattern || pattern === 'none') return null;
  const step = Math.max(6, Math.min(22, Math.round(9 * zoom)));
  const key = `${color}|${pattern}|${step}`;
  const hit = patternCache.get(key);
  if (hit !== undefined) return hit;

  const c = document.createElement('canvas');
  c.width = step;
  c.height = step;
  const p = c.getContext('2d');
  if (!p) { patternCache.set(key, null); return null; }
  p.strokeStyle = color;
  p.fillStyle = color;
  p.globalAlpha = 0.5;
  p.lineWidth = 1;

  switch (pattern) {
    case 'diag-l': p.beginPath(); p.moveTo(0, step); p.lineTo(step, 0); p.stroke(); break;
    case 'diag-r': p.beginPath(); p.moveTo(0, 0); p.lineTo(step, step); p.stroke(); break;
    case 'dots': p.beginPath(); p.arc(step / 2, step / 2, 1.2, 0, Math.PI * 2); p.fill(); break;
    case 'grid': p.beginPath(); p.moveTo(0, 0); p.lineTo(0, step); p.moveTo(0, 0); p.lineTo(step, 0); p.stroke(); break;
    case 'cross': p.beginPath(); p.moveTo(0, step); p.lineTo(step, 0); p.moveTo(0, 0); p.lineTo(step, step); p.stroke(); break;
  }

  const made = ctx.createPattern(c, 'repeat');
  patternCache.set(key, made);
  return made;
}
