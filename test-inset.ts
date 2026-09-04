import { insetPolygonByWalls, detectRooms, getRoomClearPolygon } from './src/lib/utils/roomDetection.ts';
import type { Point, Wall } from './src/lib/models/types.ts';

let pass = 0, fail = 0;
function check(name: string, got: number, want: number, tol = 0.02) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} got ${got.toFixed(3)}  want ${want.toFixed(3)}`);
  ok ? pass++ : fail++;
}
const shoe = (p: Point[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const j = (i+1)%p.length; s += p[i].x*p[j].y - p[j].x*p[i].y; } return Math.abs(s/2); };
const m2 = (p: Point[]) => shoe(p) / 10000;

// helper: build closed wall loop from polygon vertices
function loop(pts: Point[], t = 15): Wall[] {
  return pts.map((p, i) => ({
    id: 'w' + i, start: p, end: pts[(i + 1) % pts.length],
    thickness: t, height: 280, color: '#444',
  }));
}
const R = (w: number, h: number): Point[] => [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];

// 1 — plain rectangle, uniform 15 cm walls
{
  const poly = R(400, 350);
  check('400x350 gross', m2(poly), 14.00);
  check('400x350 clear (385x335)', m2(insetPolygonByWalls(poly, loop(poly, 15))), 12.90);
}

// 2 — the small room from the user's plan (worst relative error)
{
  const poly = R(200, 250);
  check('200x250 clear (185x235)', m2(insetPolygonByWalls(poly, loop(poly, 15))), 4.3475);
}

// 3 — thicker walls
{
  const poly = R(400, 350);
  check('400x350 clear @ t=20 (380x330)', m2(insetPolygonByWalls(poly, loop(poly, 20))), 12.54);
}

// 4 — MIXED thicknesses: only the left wall is 40 cm thick
{
  const poly = R(400, 350);
  const walls = loop(poly, 15);
  walls[3].thickness = 40;                       // the x=0 edge
  // width 400 - 7.5 - 20 = 372.5 ; height 350 - 15 = 335
  check('mixed thickness (372.5x335)', m2(insetPolygonByWalls(poly, walls)), 372.5 * 335 / 10000);
}

// 5 — L-shaped room: reflex corner must miter outward, not collapse
{
  const poly: Point[] = [{x:0,y:0},{x:600,y:0},{x:600,y:300},{x:300,y:300},{x:300,y:600},{x:0,y:600}];
  check('L-shape gross', m2(poly), 27.00);
  const d = 7.5;
  check('L-shape clear (reflex corner)', m2(insetPolygonByWalls(poly, loop(poly, 15))), ((600-2*d)**2 - 300*300) / 10000);
}

// 6 — reversed winding must give the same answer
{
  const poly = R(400, 350);
  check('reversed winding', m2(insetPolygonByWalls([...poly].reverse(), loop(poly, 15))), 12.90);
}

// 7 — degenerate: room narrower than its own walls -> [] so caller falls back
{
  const poly = R(20, 400);
  const got = insetPolygonByWalls(poly, loop(poly, 30));
  console.log(`${got.length === 0 ? 'PASS' : 'FAIL'}  ${'degenerate room returns []'.padEnd(46)} got length ${got.length}`);
  got.length === 0 ? pass++ : fail++;
}

// 8 — end-to-end through detectRooms on a real 2x2 wall grid
{
  const S = 400, t = 15;
  const walls: Wall[] = [];
  let n = 0;
  for (let r = 0; r <= 2; r++) for (let c = 0; c < 2; c++)
    walls.push({ id:'w'+n++, start:{x:c*S,y:r*S}, end:{x:(c+1)*S,y:r*S}, thickness:t, height:280, color:'#444' });
  for (let c = 0; c <= 2; c++) for (let r = 0; r < 2; r++)
    walls.push({ id:'w'+n++, start:{x:c*S,y:r*S}, end:{x:c*S,y:(r+1)*S}, thickness:t, height:280, color:'#444' });
  const rooms = detectRooms(walls);
  check('detectRooms: 4 rooms found', rooms.length, 4, 0);
  check('detectRooms grossArea', rooms[0].grossArea!, 16.00);
  check('detectRooms area is clear (385x385)', rooms[0].area, 385 * 385 / 10000);
  check('getRoomClearPolygon matches', m2(getRoomClearPolygon(rooms[0], walls)), 385 * 385 / 10000);
}

console.log(`\n${pass} passed, ${fail} failed`);
