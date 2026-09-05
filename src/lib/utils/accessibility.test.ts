import { describe, it, expect } from 'vitest';
import {
  doorClearWidth, rampSlopePercent, requiredRampRun, longestUnbrokenRun,
  stairRiserHeight, stairTreadDepth, largestInscribedCircle, checkFloor, norms,
} from './accessibility';
import { buildLegend, defaultZoneStyle, ZONE_PALETTE, PATTERN_CYCLE } from './zones';
import { DEFAULT_NORMS } from '$lib/models/types';
import type { Door, Floor, Lift, Point, Project, Ramp, Room, Stair, Wall } from '$lib/models/types';

const door = (o: Partial<Door> = {}): Door => ({
  id: 'd1', wallId: 'w1', position: 0.5, width: 90, height: 210,
  type: 'single', swingDirection: 'left', flipSide: false, ...o,
});

const ramp = (o: Partial<Ramp> = {}): Ramp => ({
  id: 'r1', position: { x: 0, y: 0 }, rotation: 0,
  width: 150, runLength: 200, rise: 15, direction: 'up', ...o,
});

const stair = (o: Partial<Stair> = {}): Stair => ({
  id: 's1', position: { x: 0, y: 0 }, rotation: 0,
  width: 120, depth: 300, riserCount: 15, direction: 'up', stairType: 'straight', ...o,
});

const lift = (o: Partial<Lift> = {}): Lift => ({
  id: 'l1', position: { x: 0, y: 0 }, rotation: 0,
  width: 160, depth: 180, cabinWidth: 110, cabinDepth: 140,
  doorSide: 'front', doorWidth: 90, kind: 'accessible', ...o,
});

function emptyFloor(o: Partial<Floor> = {}): Floor {
  return {
    id: 'f1', name: 'Ground', level: 0,
    walls: [], rooms: [], doors: [], windows: [], furniture: [],
    stairs: [], columns: [], guides: [], measurements: [],
    annotations: [], textAnnotations: [], groups: [], ...o,
  };
}

describe('doorClearWidth', () => {
  it('subtracts the leaf and frame from a single door', () => {
    expect(doorClearWidth(door({ width: 90 }))).toBe(82);
  });

  it('loses only the frame on a double door, where both leaves open', () => {
    expect(doorClearWidth(door({ width: 140, type: 'double' }))).toBe(134);
  });

  it('treats a plain opening as fully clear', () => {
    expect(doorClearWidth(door({ width: 100, type: 'opening' }))).toBe(100);
  });

  it('penalises a bi-fold most, since the folded leaves sit in the reveal', () => {
    expect(doorClearWidth(door({ width: 90, type: 'bifold' })))
      .toBeLessThan(doorClearWidth(door({ width: 90, type: 'single' })));
  });

  it('never returns a negative width', () => {
    expect(doorClearWidth(door({ width: 4, type: 'bifold' }))).toBe(0);
  });
});

describe('ramp geometry', () => {
  it('computes slope as rise over run', () => {
    expect(rampSlopePercent(ramp({ rise: 15, runLength: 200 }))).toBeCloseTo(7.5, 6);
  });

  it('returns zero slope for a zero-length run rather than dividing by zero', () => {
    expect(rampSlopePercent(ramp({ runLength: 0 }))).toBe(0);
  });

  it('inverts to the run needed for a given rise', () => {
    expect(requiredRampRun(15, 8)).toBeCloseTo(187.5, 6);
    expect(rampSlopePercent(ramp({ rise: 15, runLength: requiredRampRun(15, 8) })))
      .toBeCloseTo(8, 6);
  });

  it('measures the longest stretch with no landing to rest on', () => {
    expect(longestUnbrokenRun(ramp({ runLength: 1000 }))).toBe(1000);
    expect(longestUnbrokenRun(ramp({
      runLength: 1000, landings: [{ at: 400, length: 150 }],
    }))).toBe(450);
  });

  it('handles several landings, taking the widest gap', () => {
    expect(longestUnbrokenRun(ramp({
      runLength: 1200,
      landings: [{ at: 300, length: 150 }, { at: 800, length: 150 }],
    }))).toBe(350);
  });
});

describe('stair geometry', () => {
  it('derives riser height from the floor-to-floor rise', () => {
    expect(stairRiserHeight(stair({ rise: 300, riserCount: 20 }))).toBe(15);
  });

  it('returns null when the rise was never entered', () => {
    expect(stairRiserHeight(stair({ rise: undefined }))).toBeNull();
  });

  it('derives going from the run, which has one fewer tread than risers', () => {
    expect(stairTreadDepth(stair({ depth: 300, riserCount: 11 }))).toBe(30);
  });
});

describe('largestInscribedCircle', () => {
  it('finds the inradius of a square', () => {
    const sq: Point[] = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }];
    const c = largestInscribedCircle(sq)!;
    expect(c.radius).toBeGreaterThan(96);
    expect(c.radius).toBeLessThanOrEqual(100);
  });

  it('is limited by the short side of a corridor, not its length', () => {
    const corridor: Point[] = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 120 }, { x: 0, y: 120 }];
    const c = largestInscribedCircle(corridor)!;
    expect(c.radius).toBeLessThanOrEqual(60);
    expect(c.radius).toBeGreaterThan(56);
  });

  it('returns null for a degenerate polygon', () => {
    expect(largestInscribedCircle([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });
});

describe('checkFloor', () => {
  const n = norms();

  it('flags a door whose clear opening falls short of the nominal width', () => {
    const f = emptyFloor({ doors: [door({ width: 90 })] });
    const issues = checkFloor(f, [], n);
    expect(issues.map(i => i.code)).toContain('door-clear-width');
    expect(issues[0].measured).toBe(82);
  });

  it('passes a door wide enough to stay clear after the leaf', () => {
    const f = emptyFloor({ doors: [door({ width: 100 })] });
    expect(checkFloor(f, [], n).filter(i => i.code === 'door-clear-width')).toHaveLength(0);
  });

  it('flags a ramp over the slope limit', () => {
    const f = emptyFloor({ ramps: [ramp({ rise: 30, runLength: 200, handrail: 'both' })] });
    const codes = checkFloor(f, [], n).map(i => i.code);
    expect(codes).toContain('ramp-slope');
  });

  it('flags a long ramp run with no intermediate landing', () => {
    const f = emptyFloor({ ramps: [ramp({ rise: 60, runLength: 1000, handrail: 'both' })] });
    expect(checkFloor(f, [], n).map(i => i.code)).toContain('ramp-landing-missing');
  });

  it('warns about a missing handrail rather than failing', () => {
    const f = emptyFloor({ ramps: [ramp({ rise: 10, runLength: 200, handrail: 'none' })] });
    const issue = checkFloor(f, [], n).find(i => i.code === 'ramp-handrail')!;
    expect(issue.level).toBe('warn');
  });

  it('flags an undersized lift cabin', () => {
    const f = emptyFloor({ lifts: [lift({ cabinWidth: 90, cabinDepth: 110 })] });
    const codes = checkFloor(f, [], n).map(i => i.code);
    expect(codes).toContain('lift-cabin-width');
    expect(codes).toContain('lift-cabin-depth');
  });

  it('passes a compliant accessible lift', () => {
    const f = emptyFloor({ lifts: [lift()] });
    expect(checkFloor(f, [], n).filter(i => i.level === 'fail')).toHaveLength(0);
  });

  it('flags steep risers and a narrow stair', () => {
    const f = emptyFloor({ stairs: [stair({ rise: 300, riserCount: 15, width: 90, handrail: 'both' })] });
    const codes = checkFloor(f, [], n).map(i => i.code);
    expect(codes).toContain('stair-riser-height');
    expect(codes).toContain('stair-width');
  });

  it('reads every limit from the passed norms, not from constants', () => {
    const f = emptyFloor({ ramps: [ramp({ rise: 20, runLength: 200, handrail: 'both' })] });
    expect(checkFloor(f, [], norms({ maxRampSlopePercent: 8 })).map(i => i.code))
      .toContain('ramp-slope');
    expect(checkFloor(f, [], norms({ maxRampSlopePercent: 12 })).map(i => i.code))
      .not.toContain('ramp-slope');
  });

  it('measures a room turning circle inside the walls, not to the centrelines', () => {
    const t = 15;
    const mk = (id: string, a: Point, b: Point): Wall =>
      ({ id, start: a, end: b, thickness: t, height: 280, color: '#444' });
    // 160 x 160 centreline -> 145 clear, under the 150 turning circle
    const walls = [
      mk('w0', { x: 0, y: 0 }, { x: 160, y: 0 }),
      mk('w1', { x: 160, y: 0 }, { x: 160, y: 160 }),
      mk('w2', { x: 160, y: 160 }, { x: 0, y: 160 }),
      mk('w3', { x: 0, y: 160 }, { x: 0, y: 0 }),
    ];
    const room: Room = {
      id: 'r1', name: 'Room 1', walls: walls.map(w => w.id),
      floorTexture: 'hardwood', area: 2.1,
    };
    const issues = checkFloor(emptyFloor({ walls }), [room], n);
    expect(issues.map(i => i.code)).toContain('room-turning-circle');
    const issue = issues.find(i => i.code === 'room-turning-circle')!;
    expect(issue.measured).toBeLessThan(150);
  });

  it('reports nothing on an empty floor', () => {
    expect(checkFloor(emptyFloor(), [], n)).toEqual([]);
  });
});

describe('zones', () => {
  it('assigns colours from the palette in order, without repeating early', () => {
    const seen = new Set<string>();
    for (let i = 0; i < ZONE_PALETTE.length; i++) seen.add(defaultZoneStyle(i).color);
    expect(seen.size).toBe(ZONE_PALETTE.length);
  });

  it('switches hatch once the palette wraps, so the 11th service is still distinct', () => {
    const a = defaultZoneStyle(0);
    const b = defaultZoneStyle(ZONE_PALETTE.length);
    expect(b.color).toBe(a.color);
    expect(b.pattern).not.toBe(a.pattern);
    expect(PATTERN_CYCLE).toContain(b.pattern);
  });

  it('lists only the services present on the floor', () => {
    const project = {
      id: 'p', name: 'P', floors: [], activeFloorId: 'f1',
      createdAt: new Date(), updatedAt: new Date(),
      zones: [
        { id: 'z1', code: '01', name: 'Reabilitatsiya', color: '#332288' },
        { id: 'z2', code: '02', name: 'Psixososial', color: '#88CCEE' },
        { id: 'z3', code: '03', name: 'Ishlatilmagan', color: '#44AA99' },
      ],
    } as unknown as Project;
    const rooms = [
      { id: 'a', name: 'A', walls: [], floorTexture: 'x', area: 20, zoneId: 'z1' },
      { id: 'b', name: 'B', walls: [], floorTexture: 'x', area: 15, zoneId: 'z1' },
      { id: 'c', name: 'C', walls: [], floorTexture: 'x', area: 28, zoneId: 'z2' },
      { id: 'd', name: 'D', walls: [], floorTexture: 'x', area: 12 },
    ] as Room[];

    const legend = buildLegend(project, rooms);
    expect(legend.map(e => e.zone.code)).toEqual(['01', '02']);
    expect(legend[0].area).toBe(35);
    expect(legend[0].roomCount).toBe(2);
  });

  it('derives capacity from area per client when it is set', () => {
    const project = {
      zones: [{ id: 'z1', code: '01', name: 'X', color: '#332288', areaPerClient: 6 }],
    } as unknown as Project;
    const rooms = [{ id: 'a', name: 'A', walls: [], floorTexture: 'x', area: 35, zoneId: 'z1' }] as Room[];
    expect(buildLegend(project, rooms)[0].capacity).toBe(5);
  });

  it('leaves capacity undefined when no norm is set', () => {
    const project = {
      zones: [{ id: 'z1', code: '01', name: 'X', color: '#332288' }],
    } as unknown as Project;
    const rooms = [{ id: 'a', name: 'A', walls: [], floorTexture: 'x', area: 35, zoneId: 'z1' }] as Room[];
    expect(buildLegend(project, rooms)[0].capacity).toBeUndefined();
  });
});

describe('DEFAULT_NORMS', () => {
  it('is overridable per project without mutating the defaults', () => {
    const custom = norms({ maxRampSlopePercent: 10 });
    expect(custom.maxRampSlopePercent).toBe(10);
    expect(custom.minDoorClearWidth).toBe(DEFAULT_NORMS.minDoorClearWidth);
    expect(DEFAULT_NORMS.maxRampSlopePercent).toBe(8);
  });
});
