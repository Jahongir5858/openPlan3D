import { describe, it, expect } from 'vitest';
import { insetPolygonByWalls, detectRooms, getRoomClearPolygon, getRoomPolygon } from './roomDetection';
import type { Point, Wall } from '$lib/models/types';

/** Absolute polygon area in m². */
function areaM2(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(s / 2) / 10000;
}

/** Closed wall loop around a polygon. */
function loop(pts: Point[], thickness = 15): Wall[] {
  return pts.map((p, i) => ({
    id: `w${i}`,
    start: p,
    end: pts[(i + 1) % pts.length],
    thickness,
    height: 280,
    color: '#444444',
  }));
}

const rect = (w: number, h: number): Point[] => [
  { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
];

/** cols x rows grid of square rooms, sharing walls. */
function grid(cols: number, rows: number, size = 400, thickness = 15): Wall[] {
  const walls: Wall[] = [];
  let n = 0;
  const push = (x1: number, y1: number, x2: number, y2: number) =>
    walls.push({ id: `w${n++}`, start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, height: 280, color: '#444444' });
  for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) push(c * size, r * size, (c + 1) * size, r * size);
  for (let c = 0; c <= cols; c++) for (let r = 0; r < rows; r++) push(c * size, r * size, c * size, (r + 1) * size);
  return walls;
}

describe('insetPolygonByWalls', () => {
  it('insets a rectangle by half the wall thickness on every side', () => {
    const poly = rect(400, 350);
    expect(areaM2(poly)).toBeCloseTo(14.0, 3);
    // 385 x 335
    expect(areaM2(insetPolygonByWalls(poly, loop(poly, 15)))).toBeCloseTo(12.8975, 3);
  });

  it('produces the largest relative correction on small rooms', () => {
    const poly = rect(200, 250);
    // 185 x 235 — 13% smaller than the 5.0 m² centreline figure
    expect(areaM2(insetPolygonByWalls(poly, loop(poly, 15)))).toBeCloseTo(4.3475, 3);
  });

  it('scales with wall thickness', () => {
    const poly = rect(400, 350);
    // 380 x 330
    expect(areaM2(insetPolygonByWalls(poly, loop(poly, 20)))).toBeCloseTo(12.54, 3);
  });

  it('uses each wall’s own thickness, not a single global value', () => {
    const poly = rect(400, 350);
    const walls = loop(poly, 15);
    walls[3].thickness = 40; // the x = 0 edge only
    // 372.5 x 335
    expect(areaM2(insetPolygonByWalls(poly, walls))).toBeCloseTo(372.5 * 335 / 10000, 3);
  });

  it('miters reflex corners correctly on an L-shaped room', () => {
    const poly: Point[] = [
      { x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 300 },
      { x: 300, y: 300 }, { x: 300, y: 600 }, { x: 0, y: 600 },
    ];
    expect(areaM2(poly)).toBeCloseTo(27.0, 3);
    const d = 7.5;
    expect(areaM2(insetPolygonByWalls(poly, loop(poly, 15))))
      .toBeCloseTo(((600 - 2 * d) ** 2 - 300 * 300) / 10000, 3);
  });

  it('gives the same result regardless of winding direction', () => {
    const poly = rect(400, 350);
    const cw = areaM2(insetPolygonByWalls([...poly].reverse(), loop(poly, 15)));
    const ccw = areaM2(insetPolygonByWalls(poly, loop(poly, 15)));
    expect(cw).toBeCloseTo(ccw, 6);
  });

  it('returns [] when the room is narrower than its own walls', () => {
    const poly = rect(20, 400);
    expect(insetPolygonByWalls(poly, loop(poly, 30))).toEqual([]);
  });

  it('returns [] for degenerate input', () => {
    expect(insetPolygonByWalls([], [])).toEqual([]);
    expect(insetPolygonByWalls([{ x: 0, y: 0 }, { x: 1, y: 1 }], [])).toEqual([]);
  });
});

describe('detectRooms', () => {
  it('finds every cell of a wall grid', () => {
    expect(detectRooms(grid(2, 2)).length).toBe(4);
    expect(detectRooms(grid(3, 3)).length).toBe(9);
  });

  it('reports clear area as `area` and centreline area as `grossArea`', () => {
    const walls = grid(2, 2, 400, 15);
    const room = detectRooms(walls)[0];
    expect(room.grossArea).toBeCloseTo(16.0, 2);        // 400 x 400
    expect(room.area).toBeCloseTo(385 * 385 / 10000, 2); // 385 x 385
    expect(room.area).toBeLessThan(room.grossArea!);
  });

  it('never reports a negative or inside-out area', () => {
    for (const walls of [grid(1, 1), grid(2, 3), grid(4, 4)]) {
      for (const room of detectRooms(walls)) {
        expect(room.area).toBeGreaterThan(0);
        expect(room.area).toBeLessThanOrEqual(room.grossArea!);
      }
    }
  });

  it('returns nothing for fewer than three walls', () => {
    expect(detectRooms([])).toEqual([]);
    expect(detectRooms(grid(1, 1).slice(0, 2))).toEqual([]);
  });
});

describe('getRoomClearPolygon', () => {
  it('agrees with the area reported by detectRooms', () => {
    const walls = grid(2, 2, 400, 15);
    for (const room of detectRooms(walls)) {
      expect(areaM2(getRoomClearPolygon(room, walls))).toBeCloseTo(room.area, 2);
    }
  });

  it('is strictly inside the centreline polygon', () => {
    const walls = grid(2, 2, 400, 15);
    const room = detectRooms(walls)[0];
    expect(areaM2(getRoomClearPolygon(room, walls)))
      .toBeLessThan(areaM2(getRoomPolygon(room, walls)));
  });
});

describe('getRoomPolygon caching', () => {
  it('returns equal geometry on repeat calls', () => {
    const walls = grid(2, 2);
    const room = detectRooms(walls)[0];
    expect(getRoomPolygon(room, walls)).toEqual(getRoomPolygon(room, walls));
  });

  it('recomputes after the walls move', () => {
    const walls = grid(1, 1, 400, 15);
    const before = areaM2(getRoomPolygon(detectRooms(walls)[0], walls));
    // Stretch the room to 400 x 800
    const moved = walls.map(w => ({
      ...w,
      start: { x: w.start.x, y: w.start.y === 400 ? 800 : w.start.y },
      end: { x: w.end.x, y: w.end.y === 400 ? 800 : w.end.y },
    }));
    const after = areaM2(getRoomPolygon(detectRooms(moved)[0], moved));
    expect(after).toBeGreaterThan(before * 1.5);
  });
});
