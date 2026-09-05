import type { Wall, Point, Room } from '$lib/models/types';

const EPSILON = 5;

function ptEq(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

interface Edge { wallId: string; start: Point; end: Point; }

function splitWallsAtTJunctions(walls: Wall[]): Edge[] {
  const endpoints: Point[] = [];
  for (const w of walls) endpoints.push(w.start, w.end);

  interface SplitWall { wallId: string; start: Point; end: Point; splitPoints: { point: Point; t: number }[]; }
  const splitWalls: SplitWall[] = walls.map(w => ({ wallId: w.id, start: w.start, end: w.end, splitPoints: [] }));

  for (let wi = 0; wi < walls.length; wi++) {
    const w = walls[wi];
    const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < EPSILON * EPSILON) continue;
    for (const ep of endpoints) {
      if (ptEq(ep, w.start) || ptEq(ep, w.end)) continue;
      const t = ((ep.x - w.start.x) * dx + (ep.y - w.start.y) * dy) / lenSq;
      if (t <= EPSILON / Math.sqrt(lenSq) || t >= 1 - EPSILON / Math.sqrt(lenSq)) continue;
      const projX = w.start.x + t * dx, projY = w.start.y + t * dy;
      const dist = Math.sqrt((ep.x - projX) ** 2 + (ep.y - projY) ** 2);
      if (dist < EPSILON && !splitWalls[wi].splitPoints.some(sp => ptEq(sp.point, ep))) {
        splitWalls[wi].splitPoints.push({ point: { x: ep.x, y: ep.y }, t });
      }
    }
  }

  const edges: Edge[] = [];
  for (const sw of splitWalls) {
    if (sw.splitPoints.length === 0) edges.push({ wallId: sw.wallId, start: sw.start, end: sw.end });
    else {
      sw.splitPoints.sort((a, b) => a.t - b.t);
      let prev = sw.start;
      for (const sp of sw.splitPoints) { edges.push({ wallId: sw.wallId, start: prev, end: sp.point }); prev = sp.point; }
      edges.push({ wallId: sw.wallId, start: prev, end: sw.end });
    }
  }
  return edges;
}

function wallsKey(walls: Wall[]): string {
  let k = '';
  for (const w of walls) k += `${w.id}:${w.start.x},${w.start.y},${w.end.x},${w.end.y}|`;
  return k;
}

let splitCacheKey: string | null = null;
let splitCacheValue: Edge[] = [];
function splitWallsCached(walls: Wall[]): Edge[] {
  const key = wallsKey(walls);
  if (key === splitCacheKey) return splitCacheValue;
  splitCacheKey = key;
  splitCacheValue = splitWallsAtTJunctions(walls);
  return splitCacheValue;
}

const polyCache = new Map<string, Point[]>();
let polyCacheKey: string | null = null;

export function detectRooms(walls: Wall[]): Room[] {
  if (walls.length < 3) return [];
  const splitEdges = splitWallsCached(walls);
  const vertices: Point[] = [];
  const edges: Edge[] = [];

  function findOrAddVertex(p: Point): number {
    for (let i = 0; i < vertices.length; i++) if (ptEq(vertices[i], p)) return i;
    vertices.push({ x: p.x, y: p.y });
    return vertices.length - 1;
  }

  for (const e of splitEdges) {
    const si = findOrAddVertex(e.start), ei = findOrAddVertex(e.end);
    if (si !== ei) edges.push({ wallId: e.wallId, start: vertices[si], end: vertices[ei] });
  }

  const adj = new Map<number, { to: number; wallId: string; angle: number }[]>();
  for (const e of edges) {
    const si = findOrAddVertex(e.start), ei = findOrAddVertex(e.end);
    const angle1 = Math.atan2(e.end.y - e.start.y, e.end.x - e.start.x);
    const angle2 = Math.atan2(e.start.y - e.end.y, e.start.x - e.end.x);
    if (!adj.has(si)) adj.set(si, []);
    if (!adj.has(ei)) adj.set(ei, []);
    adj.get(si)!.push({ to: ei, wallId: e.wallId, angle: angle1 });
    adj.get(ei)!.push({ to: si, wallId: e.wallId, angle: angle2 });
  }
  for (const [, neighbors] of adj) neighbors.sort((a, b) => a.angle - b.angle);

  const usedDirected = new Set<string>();
  const rooms: Room[] = [];
  let roomCount = 0;
  const maxCycleSteps = edges.length + 1;

  for (const e of edges) {
    const si = findOrAddVertex(e.start), ei = findOrAddVertex(e.end);
    for (const [from, to] of [[si, ei], [ei, si]]) {
      const key = `${from}-${to}`;
      if (usedDirected.has(key)) continue;
      const cycle: number[] = [from];
      const wallIds: string[] = [];
      let cur = from, next = to, valid = true;

      for (let step = 0; step < maxCycleSteps; step++) {
        const dk = `${cur}-${next}`;
        if (usedDirected.has(dk)) { valid = false; break; }
        usedDirected.add(dk);
        cycle.push(next);
        const edgeInfo = adj.get(cur)?.find(n => n.to === next);
        if (edgeInfo) wallIds.push(edgeInfo.wallId);
        if (next === from && cycle.length > 3) break;
        const inAngle = Math.atan2(vertices[cur].y - vertices[next].y, vertices[cur].x - vertices[next].x);
        const neighbors2 = adj.get(next);
        if (!neighbors2?.length) { valid = false; break; }
        let bestIdx = -1, bestDelta = Infinity;
        for (let i = 0; i < neighbors2.length; i++) {
          const n = neighbors2[i];
          if (n.to === cur && neighbors2.length > 1) continue;
          let delta = inAngle - n.angle;
          if (delta <= 1e-9) delta += Math.PI * 2;
          if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
        }
        if (bestIdx === -1) { valid = false; break; }
        cur = next; next = neighbors2[bestIdx].to;
      }

      if (!valid || cycle[cycle.length - 1] !== from || cycle.length < 4) continue;
      const poly = cycle.slice(0, -1).map(i => vertices[i]);
      const signedArea = shoelace(poly);
      if (signedArea <= 0) continue;
      const area = signedArea;
      if (area < 1000 || area > 10000000) continue;
      const uniqueWalls = [...new Set(wallIds)];
      const dup = rooms.some(r => {
        const rw = new Set(r.walls);
        return uniqueWalls.length === rw.size && uniqueWalls.every(w => rw.has(w));
      });
      if (dup) continue;

      roomCount++;
      const roomWalls = walls.filter(w => uniqueWalls.includes(w.id));
      const clearPoly = insetPolygonByWalls(poly, roomWalls);
      const clearArea = clearPoly.length >= 3 ? Math.abs(shoelace(clearPoly)) : area;
      rooms.push({
        id: `room-${roomCount}-${Date.now()}`,
        name: `Room ${roomCount}`,
        walls: uniqueWalls,
        floorTexture: 'hardwood',
        area: Math.round(clearArea / 10000 * 100) / 100,
        grossArea: Math.round(area / 10000 * 100) / 100,
      });
    }
  }
  return rooms;
}

function shoelace(pts: Point[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return sum / 2;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function insetForEdge(a: Point, b: Point, candidates: Wall[]): number {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let bestDist = Infinity, bestThickness = 0;
  for (const w of candidates) {
    if (w.curvePoint) continue;
    const d = distToSegment(mid, w.start, w.end);
    if (d < bestDist) { bestDist = d; bestThickness = w.thickness; }
  }
  if (bestDist > EPSILON || bestThickness <= 0) return 0;
  return bestThickness / 2;
}

const MITER_LIMIT = 4;
export function insetPolygonByWalls(poly: Point[], candidates: Wall[]): Point[] {
  const n = poly.length;
  if (n < 3) return [];
  const area0 = shoelace(poly);
  if (Math.abs(area0) < 1e-6) return [];
  const pts = area0 < 0 ? [...poly].reverse() : poly.slice();
  interface OffsetLine { px: number; py: number; ux: number; uy: number; d: number }
  const lines: (OffsetLine | null)[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) { lines.push(null); continue; }
    const ux = dx / len, uy = dy / len, d = insetForEdge(a, b, candidates);
    lines.push({ px: a.x - uy * d, py: a.y + ux * d, ux, uy, d });
  }
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const cur = lines[i];
    if (!cur) continue;
    let prev: OffsetLine | null = null;
    for (let k = 1; k <= n; k++) {
      const cand = lines[(i - k + n * 2) % n];
      if (cand) { prev = cand; break; }
    }
    if (!prev) return [];
    const cross = prev.ux * cur.uy - prev.uy * cur.ux;
    if (Math.abs(cross) < 1e-9) { out.push({ x: cur.px, y: cur.py }); continue; }
    const s = ((cur.px - prev.px) * cur.uy - (cur.py - prev.py) * cur.ux) / cross;
    const vx = prev.px + prev.ux * s, vy = prev.py + prev.uy * s;
    const maxOffset = Math.max(prev.d, cur.d) * MITER_LIMIT;
    if (maxOffset > 0 && Math.hypot(vx - pts[i].x, vy - pts[i].y) > maxOffset) out.push({ x: (prev.px + cur.px) / 2, y: (prev.py + cur.py) / 2 });
    else out.push({ x: vx, y: vy });
  }
  if (out.length < 3) return [];
  const area1 = shoelace(out);
  if (area1 <= 0 || area1 > Math.abs(area0)) return [];
  return out;
}

export function getRoomClearPolygon(room: Room, walls: Wall[]): Point[] {
  const poly = getRoomPolygon(room, walls);
  if (poly.length < 3) return poly;
  const ids = new Set(room.walls);
  const candidates = walls.filter(w => ids.has(w.id));
  const inset = insetPolygonByWalls(poly, candidates.length ? candidates : walls);
  return inset.length >= 3 ? inset : poly;
}

export function roomClearArea(room: Room, walls: Wall[]): number {
  const poly = getRoomClearPolygon(room, walls);
  if (poly.length < 3) return room.area;
  return Math.round(Math.abs(shoelace(poly)) / 10000 * 100) / 100;
}

export function getRoomPolygon(room: Room, walls: Wall[]): Point[] {
  const key = wallsKey(walls);
  if (key !== polyCacheKey) { polyCache.clear(); polyCacheKey = key; }
  const roomKey = room.walls.join(',');
  const cached = polyCache.get(roomKey);
  if (cached) return cached;
  const result = computeRoomPolygon(room, walls);
  polyCache.set(roomKey, result);
  return result;
}

function computeRoomPolygon(room: Room, walls: Wall[]): Point[] {
  const wallIds = new Set(room.walls);
  if (walls.filter(w => wallIds.has(w.id)).length < 3) return [];
  let edges = splitWallsCached(walls).filter(e => wallIds.has(e.wallId));
  let pruned = true;
  while (pruned && edges.length >= 3) {
    pruned = false;
    edges = edges.filter(e => {
      const degStart = edges.filter(o => ptEq(o.start, e.start) || ptEq(o.end, e.start)).length;
      const degEnd = edges.filter(o => ptEq(o.start, e.end) || ptEq(o.end, e.end)).length;
      if (degStart < 2 || degEnd < 2) { pruned = true; return false; }
      return true;
    });
  }
  if (edges.length < 3) return [];
  const used = new Set<Edge>();
  let best: Point[] = [], bestArea = 0, longestOpen: Point[] = [];
  for (const startEdge of edges) {
    if (used.has(startEdge)) continue;
    const verts: Point[] = [startEdge.start];
    used.add(startEdge);
    let tip = startEdge.end;
    while (!ptEq(tip, verts[0])) {
      verts.push(tip);
      const next = edges.find(e => !used.has(e) && (ptEq(e.start, tip) || ptEq(e.end, tip)));
      if (!next) break;
      used.add(next);
      tip = ptEq(next.start, tip) ? next.end : next.start;
    }
    if (ptEq(tip, verts[0])) {
      const area = Math.abs(shoelace(verts));
      if (area > bestArea) { bestArea = area; best = verts; }
    } else if (verts.length > longestOpen.length) longestOpen = verts;
  }
  return best.length >= 3 ? best : longestOpen;
}

export function roomCentroid(polygon: Point[]): Point {
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
  return { x: cx, y: cy };
}
