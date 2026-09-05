import type { Wall, Point, Room } from '$lib/models/types';

const EPSILON = 5; // snap distance for matching endpoints

function ptEq(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

interface Edge {
  wallId: string;
  start: Point;
  end: Point;
}

/**
 * Find points where one wall's endpoint lands on another wall's interior (T-junctions).
 * Split such walls into sub-segments so the graph correctly represents all connections.
 */
function splitWallsAtTJunctions(walls: Wall[]): Edge[] {
  // Collect all endpoints
  const endpoints: Point[] = [];
  for (const w of walls) {
    endpoints.push(w.start, w.end);
  }

  // For each wall, find any endpoints (from other walls) that lie on its interior
  interface SplitWall {
    wallId: string;
    start: Point;
    end: Point;
    splitPoints: { point: Point; t: number }[];
  }

  const splitWalls: SplitWall[] = walls.map(w => ({
    wallId: w.id,
    start: w.start,
    end: w.end,
    splitPoints: [],
  }));

  for (let wi = 0; wi < walls.length; wi++) {
    const w = walls[wi];
    const dx = w.end.x - w.start.x;
    const dy = w.end.y - w.start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < EPSILON * EPSILON) continue;

    for (const ep of endpoints) {
      // Skip if this endpoint is one of the wall's own endpoints
      if (ptEq(ep, w.start) || ptEq(ep, w.end)) continue;

      // Project ep onto the wall segment
      const t = ((ep.x - w.start.x) * dx + (ep.y - w.start.y) * dy) / lenSq;
      if (t <= EPSILON / Math.sqrt(lenSq) || t >= 1 - EPSILON / Math.sqrt(lenSq)) continue;

      // Check distance from ep to the projected point
      const projX = w.start.x + t * dx;
      const projY = w.start.y + t * dy;
      const dist = Math.sqrt((ep.x - projX) ** 2 + (ep.y - projY) ** 2);
      if (dist < EPSILON) {
        // Check we haven't already added a point at this location
        const already = splitWalls[wi].splitPoints.some(sp => ptEq(sp.point, ep));
        if (!already) {
          splitWalls[wi].splitPoints.push({ point: { x: ep.x, y: ep.y }, t });
        }
      }
    }
  }

  // Build edges: for walls with split points, create sub-segments
  const edges: Edge[] = [];
  for (const sw of splitWalls) {
    if (sw.splitPoints.length === 0) {
      edges.push({ wallId: sw.wallId, start: sw.start, end: sw.end });
    } else {
      // Sort split points by t
      sw.splitPoints.sort((a, b) => a.t - b.t);
      let prev = sw.start;
      for (const sp of sw.splitPoints) {
        edges.push({ wallId: sw.wallId, start: prev, end: sp.point });
        prev = sp.point;
      }
      edges.push({ wallId: sw.wallId, start: prev, end: sw.end });
    }
  }

  return edges;
}

/**
 * Detect enclosed rooms from a set of walls using a simple graph-cycle approach.
 * Returns detected rooms with wall ids, centroid, and area.
 */
// ── Caching ──────────────────────────────────────────────────────────
//
// splitWallsAtTJunctions() is O(walls²) and getRoomPolygon()'s pruning pass is
// O(edges²) inside a loop. Both used to run afresh for every room on every
// animation frame, which put a hard ceiling on frame rate for larger plans
// (measured: ~60 ms per frame for a 100-room layout). The geometry only changes
// when a wall moves, so both are memoised against a key built from the wall
// endpoints; the cache is dropped wholesale as soon as that key changes.

/** Identity of a wall set for cache purposes — ids plus endpoint coordinates. */
function wallsKey(walls: Wall[]): string {
  let k = '';
  for (const w of walls) {
    k += `${w.id}:${w.start.x},${w.start.y},${w.end.x},${w.end.y}|`;
  }
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

  // Split walls at T-junctions so shared-wall rooms are properly separated
  const splitEdges = splitWallsCached(walls);

  // Build adjacency: collect unique vertices & edges
  const vertices: Point[] = [];
  const edges: Edge[] = [];

  function findOrAddVertex(p: Point): number {
    for (let i = 0; i < vertices.length; i++) {
      if (ptEq(vertices[i], p)) return i;
    }
    vertices.push({ x: p.x, y: p.y });
    return vertices.length - 1;
  }

  for (const e of splitEdges) {
    const si = findOrAddVertex(e.start);
    const ei = findOrAddVertex(e.end);
    if (si !== ei) {
      edges.push({ wallId: e.wallId, start: vertices[si], end: vertices[ei] });
    }
  }

  // Build adjacency list
  const adj = new Map<number, { to: number; wallId: string; angle: number }[]>();
  for (const e of edges) {
    const si = findOrAddVertex(e.start);
    const ei = findOrAddVertex(e.end);
    const angle1 = Math.atan2(e.end.y - e.start.y, e.end.x - e.start.x);
    const angle2 = Math.atan2(e.start.y - e.end.y, e.start.x - e.end.x);
    if (!adj.has(si)) adj.set(si, []);
    if (!adj.has(ei)) adj.set(ei, []);
    adj.get(si)!.push({ to: ei, wallId: e.wallId, angle: angle1 });
    adj.get(ei)!.push({ to: si, wallId: e.wallId, angle: angle2 });
  }

  // Sort adjacency by angle for each vertex
  for (const [, neighbors] of adj) {
    neighbors.sort((a, b) => a.angle - b.angle);
  }

  // Find minimal cycles using "next edge" (leftmost turn) traversal
  const usedDirected = new Set<string>();
  const rooms: Room[] = [];
  let roomCount = 0;

  // A cycle cannot visit more edges than exist in the graph.
  const maxCycleSteps = edges.length + 1;

  for (const e of edges) {
    const si = findOrAddVertex(e.start);
    const ei = findOrAddVertex(e.end);
    for (const [from, to] of [[si, ei], [ei, si]]) {
      const key = `${from}-${to}`;
      if (usedDirected.has(key)) continue;

      // Trace cycle
      const cycle: number[] = [from];
      const wallIds: string[] = [];
      let cur = from;
      let next = to;
      let valid = true;

      for (let step = 0; step < maxCycleSteps; step++) {
        const dk = `${cur}-${next}`;
        if (usedDirected.has(dk)) { valid = false; break; }
        usedDirected.add(dk);
        cycle.push(next);

        // Find the wall for this edge
        const neighbors = adj.get(cur);
        const edgeInfo = neighbors?.find(n => n.to === next);
        if (edgeInfo) wallIds.push(edgeInfo.wallId);

        if (next === from && cycle.length > 3) break; // closed

        // Pick the next edge clockwise from the back direction at `next`.
        // This is the standard planar face-finding step and traces minimal
        // interior faces CCW (positive signed area) in math coordinates.
        const inAngle = Math.atan2(vertices[cur].y - vertices[next].y, vertices[cur].x - vertices[next].x);
        const neighbors2 = adj.get(next);
        if (!neighbors2 || neighbors2.length === 0) { valid = false; break; }

        let bestIdx = -1;
        let bestDelta = Infinity;
        for (let i = 0; i < neighbors2.length; i++) {
          const n = neighbors2[i];
          // Skip going back along the same edge only if other options exist
          if (n.to === cur && neighbors2.length > 1) continue;
          // CW delta from back direction; smallest wins.
          let delta = inAngle - n.angle;
          if (delta <= 1e-9) delta += Math.PI * 2;
          if (delta < bestDelta) {
            bestDelta = delta;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) { valid = false; break; }

        cur = next;
        next = neighbors2[bestIdx].to;
      }

      if (!valid || cycle[cycle.length - 1] !== from || cycle.length < 4) continue;

      // Compute signed area using shoelace.
      // With this traversal (smallest CCW turn from the reverse-direction) in
      // screen coordinates, interior faces have positive signed area and the
      // outer (unbounded) face is negative — skip it so it isn't counted as a room.
      const poly = cycle.slice(0, -1).map(i => vertices[i]);
      const signedArea = shoelace(poly);
      if (signedArea <= 0) continue;
      const area = signedArea;

      // Skip very large or tiny areas
      if (area < 1000 || area > 10000000) continue;

      // Compute centroid
      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
      const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;

      // Check if this room overlaps with existing (same walls)
      const uniqueWalls = [...new Set(wallIds)];
      const dup = rooms.some(r => {
        const rw = new Set(r.walls);
        return uniqueWalls.length === rw.size && uniqueWalls.every(w => rw.has(w));
      });
      if (dup) continue;

      roomCount++;
      // `area` is the clear (net) floor area — what the room actually offers.
      // The centerline figure is kept alongside it as `grossArea` for anyone
      // who needs axis-to-axis numbers (structural take-offs, gross floor area).
      const roomWalls = walls.filter(w => uniqueWalls.includes(w.id));
      const clearPoly = insetPolygonByWalls(poly, roomWalls);
      const clearArea = clearPoly.length >= 3 ? Math.abs(shoelace(clearPoly)) : area;

      rooms.push({
        id: `room-${roomCount}-${Date.now()}`,
        name: `Room ${roomCount}`,
        walls: uniqueWalls,
        floorTexture: 'hardwood',
        area: Math.round(clearArea / 10000 * 100) / 100,   // cm² to m²
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

// ── Clear (net) room geometry ────────────────────────────────────────
//
// detectRooms() traces the wall CENTERLINES, so the polygon it produces runs
// through the middle of every surrounding wall. Its area is therefore a gross
// (axis-to-axis) figure that includes half of each wall's footprint — typically
// 7–13% more than the floor a person can actually stand on, and the error grows
// as rooms get smaller relative to wall thickness.
//
// The helpers below offset that centerline polygon inward by each bordering
// wall's half-thickness to produce the clear (net) room outline.

/** Perpendicular distance from p to segment ab. */
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * How far a polygon edge should move inward: half the thickness of whichever
 * candidate wall the edge actually lies on. Matching is done on the edge
 * midpoint, so it works regardless of how the polygon was chained together and
 * regardless of whether the edge covers the whole wall or a T-junction
 * sub-segment. Returns 0 when no wall matches, which leaves that edge in place.
 */
function insetForEdge(a: Point, b: Point, candidates: Wall[]): number {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let bestDist = Infinity;
  let bestThickness = 0;
  for (const w of candidates) {
    if (w.curvePoint) continue; // curved walls aren't straight segments
    const d = distToSegment(mid, w.start, w.end);
    if (d < bestDist) {
      bestDist = d;
      bestThickness = w.thickness;
    }
  }
  if (bestDist > EPSILON || bestThickness <= 0) return 0;
  return bestThickness / 2;
}

/** Miter joints longer than this multiple of the inset are clipped back. */
const MITER_LIMIT = 4;

/**
 * Offset a closed polygon inward, edge by edge, by a per-edge distance taken
 * from the wall that edge sits on. Each edge is slid along its inward normal
 * and consecutive offset lines are intersected, so corners stay sharp (a proper
 * miter) instead of being rounded or clipped.
 *
 * Returns [] when the inset collapses the polygon — a "room" narrower than the
 * walls around it has no clear area to report, and callers fall back to the
 * centerline figure rather than showing a negative or inside-out result.
 */
export function insetPolygonByWalls(poly: Point[], candidates: Wall[]): Point[] {
  const n = poly.length;
  if (n < 3) return [];

  // Normalise winding so that the left-hand normal (-uy, ux) points inward.
  const area0 = shoelace(poly);
  if (Math.abs(area0) < 1e-6) return [];
  const pts = area0 < 0 ? [...poly].reverse() : poly.slice();

  // Build the inward-offset support line for every edge.
  interface OffsetLine { px: number; py: number; ux: number; uy: number; d: number }
  const lines: (OffsetLine | null)[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) { lines.push(null); continue; }
    const ux = dx / len;
    const uy = dy / len;
    const d = insetForEdge(a, b, candidates);
    lines.push({ px: a.x - uy * d, py: a.y + ux * d, ux, uy, d });
  }

  // Each output vertex is where the previous edge's offset line meets this one's.
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
    if (Math.abs(cross) < 1e-9) {
      // Collinear or anti-parallel edges never intersect — keep the offset point.
      out.push({ x: cur.px, y: cur.py });
      continue;
    }
    const s = ((cur.px - prev.px) * cur.uy - (cur.py - prev.py) * cur.ux) / cross;
    const vx = prev.px + prev.ux * s;
    const vy = prev.py + prev.uy * s;

    // Clip runaway miters at very shallow corners.
    const maxOffset = Math.max(prev.d, cur.d) * MITER_LIMIT;
    if (maxOffset > 0 && Math.hypot(vx - pts[i].x, vy - pts[i].y) > maxOffset) {
      out.push({ x: (prev.px + cur.px) / 2, y: (prev.py + cur.py) / 2 });
    } else {
      out.push({ x: vx, y: vy });
    }
  }

  if (out.length < 3) return [];
  // The inset must shrink the polygon, not flip or grow it.
  const area1 = shoelace(out);
  if (area1 <= 0 || area1 > Math.abs(area0)) return [];
  return out;
}

/**
 * The room outline a person could actually walk on: the centerline polygon
 * pulled in by half the thickness of every wall around it. Falls back to the
 * centerline polygon when the inset is degenerate.
 */
export function getRoomClearPolygon(room: Room, walls: Wall[]): Point[] {
  const poly = getRoomPolygon(room, walls);
  if (poly.length < 3) return poly;
  const ids = new Set(room.walls);
  const candidates = walls.filter(w => ids.has(w.id));
  const inset = insetPolygonByWalls(poly, candidates.length ? candidates : walls);
  return inset.length >= 3 ? inset : poly;
}

/** Clear (net) floor area of a room in m². */
export function roomClearArea(room: Room, walls: Wall[]): number {
  const poly = getRoomClearPolygon(room, walls);
  if (poly.length < 3) return room.area;
  return Math.round(Math.abs(shoelace(poly)) / 10000 * 100) / 100;
}

/**
 * Get polygon vertices for a room from its walls.
 *
 * detectRooms() traces cycles over walls split at T-junctions, so a room may
 * border only a sub-segment of a wall. Chaining full wall segments here would
 * overshoot the room at such walls and break the loop (partial polygons with a
 * spurious diagonal closing edge), so we chain the same split edges instead.
 */
export function getRoomPolygon(room: Room, walls: Wall[]): Point[] {
  // Cached per (wall geometry, room wall set). The returned array is shared
  // between callers, so treat it as read-only — copy before mutating.
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

  // Iteratively prune dangling sub-segments (parts of split walls that extend
  // past the room and connect to nothing else on this room's boundary).
  let pruned = true;
  while (pruned && edges.length >= 3) {
    pruned = false;
    edges = edges.filter(e => {
      const degStart = edges.filter(o => ptEq(o.start, e.start) || ptEq(o.end, e.start)).length;
      const degEnd = edges.filter(o => ptEq(o.start, e.end) || ptEq(o.end, e.end)).length;
      // Each count includes the edge itself; < 2 means the endpoint dangles
      if (degStart < 2 || degEnd < 2) { pruned = true; return false; }
      return true;
    });
  }
  if (edges.length < 3) return [];

  // Chain edges into ordered loops; return the largest closed one,
  // falling back to the longest open chain if no loop closes.
  const used = new Set<Edge>();
  let best: Point[] = [];
  let bestArea = 0;
  let longestOpen: Point[] = [];

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
    } else if (verts.length > longestOpen.length) {
      longestOpen = verts;
    }
  }

  return best.length >= 3 ? best : longestOpen;
}

export function roomCentroid(polygon: Point[]): Point {
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
  return { x: cx, y: cy };
}
