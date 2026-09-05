/**
 * Accessibility checks.
 *
 * Every limit comes from `project.norms`, never from a constant in this file.
 * Building codes change and differ by jurisdiction; a centre should be able to
 * update a number without waiting for a new release of the app. The defaults in
 * `DEFAULT_NORMS` follow widely used international practice and are a starting
 * point, not an authority — verify them against the code that applies.
 */
import type {
  AccessibilityNorms, Door, Floor, Lift, Point, Ramp, Room, Stair, Wall,
} from '$lib/models/types';
import { DEFAULT_NORMS } from '$lib/models/types';
import { getRoomClearPolygon } from '$lib/utils/roomDetection';

export type IssueLevel = 'fail' | 'warn';

export interface Issue {
  level: IssueLevel;
  /** Element the issue belongs to, so the UI can select and zoom to it */
  elementId: string;
  elementKind: 'door' | 'room' | 'stair' | 'lift' | 'ramp';
  /** Short machine-readable reason, for grouping and translation */
  code: string;
  measured: number;
  required: number;
  unit: 'cm' | '%';
}

export function norms(n?: Partial<AccessibilityNorms>): AccessibilityNorms {
  return { ...DEFAULT_NORMS, ...(n ?? {}) };
}

/**
 * Clear opening of a door, which is narrower than its nominal width: the leaf
 * does not swing fully flat against the reveal, and the frame eats a little on
 * each side. A 90 cm door is not a 90 cm opening.
 */
export function doorClearWidth(door: Door): number {
  const LEAF_AND_FRAME_LOSS = 8; // cm, single leaf
  switch (door.type) {
    case 'double':
    case 'french':
      // Both leaves open, so only the frame is lost
      return Math.max(0, door.width - 6);
    case 'opening':
    case 'garage':
      return door.width;
    case 'sliding':
    case 'pocket':
      return Math.max(0, door.width - 5);
    case 'bifold':
      return Math.max(0, door.width - 12);
    default:
      return Math.max(0, door.width - LEAF_AND_FRAME_LOSS);
  }
}

/** Ramp slope as a percentage. Returns 0 for a zero-length run. */
export function rampSlopePercent(ramp: Ramp): number {
  if (ramp.runLength <= 0) return 0;
  return (ramp.rise / ramp.runLength) * 100;
}

/** Horizontal run needed to climb `rise` without exceeding the slope limit. */
export function requiredRampRun(rise: number, maxSlopePercent: number): number {
  if (maxSlopePercent <= 0) return Infinity;
  return (rise / maxSlopePercent) * 100;
}

/** Riser height implied by the rise and the number of risers. */
export function stairRiserHeight(stair: Stair): number | null {
  if (!stair.rise || stair.riserCount <= 0) return null;
  return stair.rise / stair.riserCount;
}

/** Going (tread depth) implied by the run length and the number of treads. */
export function stairTreadDepth(stair: Stair): number | null {
  const treads = stair.riserCount - 1;
  if (treads <= 0) return null;
  return stair.depth / treads;
}

/**
 * Diameter of the largest circle that fits inside a polygon.
 *
 * Used for the wheelchair turning check. Solved by sampling the polygon's
 * bounding box on a grid and refining around the best point — the exact
 * solution needs a medial axis, which is far more machinery than a turning
 * check warrants, and this is accurate to well under a centimetre.
 */
export function largestInscribedCircle(poly: Point[]): { centre: Point; radius: number } | null {
  if (poly.length < 3) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  let best = { centre: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, radius: -Infinity };
  let step = Math.max(4, Math.min(maxX - minX, maxY - minY) / 12);

  for (let pass = 0; pass < 6; pass++) {
    const x0 = Math.max(minX, best.radius > 0 ? best.centre.x - step * 2 : minX);
    const x1 = Math.min(maxX, best.radius > 0 ? best.centre.x + step * 2 : maxX);
    const y0 = Math.max(minY, best.radius > 0 ? best.centre.y - step * 2 : minY);
    const y1 = Math.min(maxY, best.radius > 0 ? best.centre.y + step * 2 : maxY);
    for (let x = x0; x <= x1; x += step) {
      for (let y = y0; y <= y1; y += step) {
        const p = { x, y };
        if (!pointInPolygon(p, poly)) continue;
        const d = distanceToBoundary(p, poly);
        if (d > best.radius) best = { centre: p, radius: d };
      }
    }
    step /= 2.5;
  }

  return best.radius > 0 ? { centre: best.centre, radius: best.radius } : null;
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToBoundary(p: Point, poly: Point[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < min) min = d;
  }
  return min;
}

/**
 * Run every check over one floor.
 *
 * Rooms are measured on their clear polygon, not the centreline one — a person
 * turns a wheelchair inside the walls, not through them.
 */
export function checkFloor(
  floor: Floor,
  rooms: Room[],
  n: AccessibilityNorms,
): Issue[] {
  const issues: Issue[] = [];

  for (const d of floor.doors) {
    const clear = doorClearWidth(d);
    if (clear < n.minDoorClearWidth) {
      issues.push({
        level: 'fail', elementId: d.id, elementKind: 'door',
        code: 'door-clear-width',
        measured: Math.round(clear), required: n.minDoorClearWidth, unit: 'cm',
      });
    }
  }

  for (const r of floor.ramps ?? []) {
    const slope = rampSlopePercent(r);
    if (slope > n.maxRampSlopePercent) {
      issues.push({
        level: 'fail', elementId: r.id, elementKind: 'ramp',
        code: 'ramp-slope',
        measured: Math.round(slope * 10) / 10, required: n.maxRampSlopePercent, unit: '%',
      });
    }
    // A long run needs a level landing to rest on
    const longest = longestUnbrokenRun(r);
    if (longest > n.maxRampRunWithoutLanding) {
      issues.push({
        level: 'fail', elementId: r.id, elementKind: 'ramp',
        code: 'ramp-landing-missing',
        measured: Math.round(longest), required: n.maxRampRunWithoutLanding, unit: 'cm',
      });
    }
    for (const l of r.landings ?? []) {
      if (l.length < n.minRampLanding) {
        issues.push({
          level: 'fail', elementId: r.id, elementKind: 'ramp',
          code: 'ramp-landing-short',
          measured: Math.round(l.length), required: n.minRampLanding, unit: 'cm',
        });
      }
    }
    if (!r.handrail || r.handrail === 'none') {
      issues.push({
        level: 'warn', elementId: r.id, elementKind: 'ramp',
        code: 'ramp-handrail', measured: 0, required: 2, unit: 'cm',
      });
    }
  }

  for (const l of floor.lifts ?? []) {
    if (l.cabinWidth < n.minLiftCabinWidth) {
      issues.push({
        level: 'fail', elementId: l.id, elementKind: 'lift',
        code: 'lift-cabin-width',
        measured: Math.round(l.cabinWidth), required: n.minLiftCabinWidth, unit: 'cm',
      });
    }
    if (l.cabinDepth < n.minLiftCabinDepth) {
      issues.push({
        level: 'fail', elementId: l.id, elementKind: 'lift',
        code: 'lift-cabin-depth',
        measured: Math.round(l.cabinDepth), required: n.minLiftCabinDepth, unit: 'cm',
      });
    }
    if (l.doorWidth < n.minDoorClearWidth) {
      issues.push({
        level: 'fail', elementId: l.id, elementKind: 'lift',
        code: 'lift-door-width',
        measured: Math.round(l.doorWidth), required: n.minDoorClearWidth, unit: 'cm',
      });
    }
  }

  for (const s of floor.stairs ?? []) {
    const riser = stairRiserHeight(s);
    if (riser !== null && riser > n.maxRiserHeight) {
      issues.push({
        level: 'fail', elementId: s.id, elementKind: 'stair',
        code: 'stair-riser-height',
        measured: Math.round(riser * 10) / 10, required: n.maxRiserHeight, unit: 'cm',
      });
    }
    const tread = stairTreadDepth(s);
    if (tread !== null && tread < n.minTreadDepth) {
      issues.push({
        level: 'fail', elementId: s.id, elementKind: 'stair',
        code: 'stair-tread-depth',
        measured: Math.round(tread * 10) / 10, required: n.minTreadDepth, unit: 'cm',
      });
    }
    if (s.width < n.minStairWidth) {
      issues.push({
        level: 'fail', elementId: s.id, elementKind: 'stair',
        code: 'stair-width',
        measured: Math.round(s.width), required: n.minStairWidth, unit: 'cm',
      });
    }
    if (!s.handrail || s.handrail === 'none') {
      issues.push({
        level: 'warn', elementId: s.id, elementKind: 'stair',
        code: 'stair-handrail', measured: 0, required: 2, unit: 'cm',
      });
    }
  }

  for (const room of rooms) {
    const poly = getRoomClearPolygon(room, floor.walls);
    const circle = largestInscribedCircle(poly);
    if (!circle) continue;
    const diameter = circle.radius * 2;
    if (diameter < n.minTurningDiameter) {
      issues.push({
        level: 'warn', elementId: room.id, elementKind: 'room',
        code: 'room-turning-circle',
        measured: Math.round(diameter), required: n.minTurningDiameter, unit: 'cm',
      });
    }
  }

  return issues;
}

/** Longest stretch of a ramp with no landing to break it. */
export function longestUnbrokenRun(ramp: Ramp): number {
  const marks = (ramp.landings ?? [])
    .map(l => ({ start: l.at, end: l.at + l.length }))
    .sort((a, b) => a.start - b.start);
  let longest = 0;
  let cursor = 0;
  for (const m of marks) {
    longest = Math.max(longest, Math.max(0, m.start - cursor));
    cursor = Math.max(cursor, m.end);
  }
  return Math.max(longest, Math.max(0, ramp.runLength - cursor));
}
