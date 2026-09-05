# Changes

Fixes applied on top of v0.9.0. Every change is covered by `npm run check`,
`npm test` and `npm run build`.

| | Before | After |
|---|---|---|
| `svelte-check` errors | 6 | **0** |
| Unit tests | none | **28 passing** |
| Editor route initial JS | 393 KB gzip | **114 KB gzip** |
| Room polygons, 100-room plan | 60 ms/frame | **3.8 ms/frame** |

---

## 1. Room areas were gross, not net

`detectRooms()` traces wall **centrelines**, so its polygon runs through the
middle of every surrounding wall. The area it produced included half of each
wall's footprint. For a plan with 15 cm walls this overstated usable floor area
by 7–13%, and the error grows as rooms get smaller — a 2.5 × 2.0 m room was
reported as 5.00 m² when the real clear floor is 4.35 m².

`wallMeasureMode: 'centerline' | 'edge'` already existed in settings, but it was
read in exactly one place in the whole codebase (the wall dimension label). Room
areas, the room W × D label, the properties panel, the 3D labels and every
export ignored it entirely.

**Fix.** `roomDetection.ts` gained a variable-offset polygon inset:

- `insetPolygonByWalls(poly, walls)` — slides every edge inward along its own
  normal by half of *that edge's* wall thickness, then intersects consecutive
  offset lines so corners stay sharp (proper miter, correct at reflex corners
  and at non-90° angles). Winding is normalised first, runaway miters at shallow
  corners are clipped, and a degenerate result returns `[]` so callers can fall
  back rather than display a negative or inside-out area.
- `getRoomClearPolygon(room, walls)` and `roomClearArea(room, walls)` expose it.

`detectRooms()` now writes the clear figure to `room.area` and keeps the
centreline figure in a new optional `room.grossArea`. Because every consumer
reads `room.area`, this corrects the 2D labels, 3D labels, status bar,
properties panel and all four export formats at once.

Also fixed: the room "W × D" label under the room name is labelled *Internal
Dimensions* in settings but measured the centreline bounding box. It now
measures the clear polygon.

The properties panel shows both — clear area as the headline figure, with the
axis-to-axis value beneath it in grey.

`grossArea` is optional, so old saved projects load unchanged; `detectRooms()`
repopulates it on load.

## 2. Notched wall corners in 3D

Each wall was built as `BoxGeometry(len, h, t)` running exactly between its
centreline endpoints. Where two walls met, neither box covered the outside
`t/2 × t/2` square of the corner, leaving a visible notch. The 2D renderer
handles this with `wallEdgeInsets()` + `drawWallJoints()`; `ThreeViewer` used
neither.

**Fix.** New `wallJoinExtensions(wall, allWalls)` in `canvasRenderer.ts` returns
how far a wall must overrun each endpoint:

```
extension = (neighbourThickness / 2) / sin(θ)
```

At 90° that is exactly half the neighbour's thickness; it grows correctly at
oblique angles and is clamped by a miter limit at very shallow ones. Collinear
continuations are skipped. `buildWallSegments()` now accepts `extStart`/`extEnd`
and grows only the boundary segments, so door and window openings stay put.
Applied to both wall builders and to baseboards.

## 3. PNG export looked nothing like the editor

`exportAsPNG()` was a second, independent renderer — flat pastel room fills
instead of type colours and floor textures, furniture as plain labelled
rectangles instead of architectural icons, `${len} cm` hardcoded so unit
settings were ignored, round-capped line walls instead of filled joins, and
stairs, columns, annotations and measurements missing entirely. Bounds were
computed from walls plus a fixed ±50 cm around furniture, so large items could
be cropped.

**Fix.** ~180 lines of duplicate drawing code deleted. Export now builds a
`CanvasState` over an offscreen canvas and calls the *same* `canvasRenderer`
functions the editor uses (`drawRooms`, `drawWall`, `drawWallJoints`,
`drawDoorOnWall`, `drawWindowOnWall`, `drawStair`, `drawColumn`,
`drawFurnitureItem`, `drawEntourageItems`, `drawAnnotations`,
`drawPersistedMeasurements`, `drawTextAnnotations`). Editor-only chrome (grid,
rulers, selection handles, minimap) is simply not called.

New `floorBounds()` covers walls with their thickness, furniture at its real
footprint including the rotation diagonal, stairs, columns, entourage,
annotations and measurements.

SVG export still has its own vector implementation — it has to, since it emits
markup rather than canvas calls — but the PNG and PDF paths no longer diverge.

## 4. Three.js loaded on the 2D editor

`editor/+page.svelte` lazy-loads `ThreeViewer`, but `BuildPanel` →
`furnitureThumbnails.ts` → `import * as THREE from 'three'` pulled the whole
library into the editor route's initial chunk anyway.

**Fix.** `furnitureThumbnails.ts` now imports Three.js and `GLTFLoader`
dynamically on first thumbnail render (types stay as `import type`, which
erases). `jsPDF` is likewise loaded only inside `exportPDF()`, which became
`async`.

Editor route initial JS: **393 KB → 114 KB gzip.**

## 5. Room polygons recomputed every frame

`getRoomPolygon()` re-ran `splitWallsAtTJunctions()` over every wall on each
call, and its dangling-edge pruning is `O(edges²)` inside a loop. It is called
per room inside the draw loop, so cost scaled roughly cubically.

**Fix.** Both are memoised against a key built from wall ids and endpoints; the
cache is dropped wholesale when that key changes.

| Plan | Before | After |
|---|---|---|
| 40 walls / 16 rooms | 1.0 ms | 0.13 ms |
| 144 walls / 64 rooms | 18 ms | 1.6 ms |
| 220 walls / 100 rooms | 60 ms | 3.8 ms |

Returned polygon arrays are now shared between callers — treat them as
read-only and copy before mutating.

## 6. Walls could not be dragged

Clicking a wall only selected it. `draggingWallParallel` — the parallel-move
drag — was armed exclusively by a hit inside `15 / zoom` of the wall's exact
midpoint, i.e. a single 10 px handle. On a 4.5 m wall that is roughly 3% of its
length, and the floating context toolbar (duplicate / split / delete) renders
right on top of it, so in practice the handle was unreachable.

**Fix.** A press anywhere on a wall now starts the drag, matching how furniture,
stairs, columns and entourage already behave. Connected walls still stretch to
follow, as before.

Two supporting changes:

- A 4 px movement threshold arms the drag, so merely clicking a wall to select
  it can no longer nudge it by a whole grid step.
- The undo snapshot moved from mouse-down to the moment the drag arms, so a
  plain click no longer pushes an empty undo entry. The duplicate snapshot taken
  on mouse-up (which recorded the *post*-drag state and added a second, empty
  step) was removed for both wall drags.

The pointer now shows a move cursor over walls so the behaviour is discoverable.
The midpoint handle still works, and Alt+drag on it still bends the wall.

## 7. Type errors

`Tool` was declared as six values but the UI dispatched `'annotate'` and
`'measure'`, producing 6 `svelte-check` errors. Both added to the union.

## 8. Tests and CI

- `npm test` (`vitest run`), `npm run test:watch`.
- `src/lib/utils/roomDetection.test.ts` — 16 tests: inset on rectangles, small
  rooms, mixed wall thicknesses, L-shaped rooms with a reflex corner, winding
  independence, degenerate input, `detectRooms` clear/gross split, invariants,
  and cache invalidation.
- `src/lib/utils/wallJoins.test.ts` — 12 tests: right angles, oblique miters,
  collinear continuations, T-junctions, miter clamping, multi-wall joints, and
  `wallEdgeInsets` clear-span behaviour.
- `.github/workflows/ci.yml` runs check → test → build on push and PR.

---

# Services, vertical circulation and accessibility

A second pass, adding what a social-care centre needs that a residential floor
plan editor doesn't have.

## 9. Service zones

`RoomCategory` was hardcoded to `'indoor' | 'outdoor' | 'garage' | 'utility'` —
a residential model that fits an institutional building badly.

Zones are now project data: define the services once, every storey draws from
the same list, and a service can't end up a different colour on the ground floor
than on the first.

```ts
export interface Zone {
  id: string;
  code: string;        // "03"
  name: string;        // "Kunduzgi parvarish xizmati"
  color: string;
  pattern?: ZonePattern;
  areaPerClient?: number;
}
```

Deliberately flat — no groups. Ten services a centre runs are not a hierarchy,
and grouping them by colour family would imply a relationship that isn't there.

**Palette.** `defaultZoneStyle(n)` assigns from Paul Tol's *muted* qualitative
scheme, computed to stay separable under the common forms of colour-vision
deficiency and the largest such set available at nine entries. Past nine the
palette wraps and the hatch changes instead, because colour stops being reliable
— which is why `code` is the identifier and colour only an aid.

**Hatch** is a second channel: a plan that gets photocopied in mono loses its
colour but keeps its hatching.

**Fill strength** is 32%, not the 12% used for room types. At ten flat
categories a weaker fill lets neighbouring hues collapse into each other.

**Highlight mode** (`highlightZoneId`) colours one service and greys the rest —
the readable way to present ten services, one sheet each.

**Legend** is generated per floor and filters itself to the services actually
present, then drawn into the PNG export. An organisation may run ten services
while a storey holds three; printing all ten on every sheet helps nobody.

## 10. Lifts and ramps

Neither existed. Stairs did, so lifts and ramps follow the same shape — floor
array, store CRUD, placing store, renderer, hit test — rather than introducing a
parallel system.

Stairs were extended rather than migrated: `fromLevel`/`toLevel`, `rise` and
`handrail` were added in place. A full merge into one vertical-circulation type
would have touched roughly 190 call sites across the canvas, the 3D viewer and
the exports — too large to attempt without a browser to test in.

**Lift** draws as a shaft, the cabin inside it, the two diagonals that mark a
shaft on every architectural drawing, and a break in the shaft wall at the doors.
`cabinWidth`/`cabinDepth` are kept separate from the shaft dimensions because the
norm is checked against the clear cabin, not the structure around it.

**Ramp** draws the run with its landings, slope hatching, an arrow that always
points uphill, and the slope percentage computed from the geometry — so it can't
go stale the way a typed-in note does. A ramp over the project's slope limit
turns red on the plan, rather than only appearing in a report.

**Stair break line.** A floor plan is a cut roughly a metre above the floor, so a
stair is shown cut: lower flight in full, upper flight sliced by paired
diagonals. The app drew every tread of every flight, which reads as an
axonometric, not a plan. The `UP` / `DN` label is replaced by an arrow plus the
schedule note (`15 × 20 = 300`) derived from the geometry — the line an inspector
looks for.

## 11. Accessibility checks

`src/lib/utils/accessibility.ts`. Every limit comes from `project.norms`, never
from a constant, so a centre can update a figure without waiting for a release.
`DEFAULT_NORMS` follows widely used international practice and is a starting
point, not an authority.

Checked: door clear width (a 90 cm door is not a 90 cm opening — the leaf and
frame take 8 cm), ramp slope, ramp landings, lift cabin and door, stair riser
height, going and width, handrails, and the wheelchair turning circle in every
room.

The turning circle uses `largestInscribedCircle`, solved by grid sampling with
refinement — an exact answer needs a medial axis, which is far more machinery
than a turning check warrants. It measures the *clear* room polygon from fix 1,
because a wheelchair turns inside the walls, not through them.

## 12. Tests

33 more tests (61 total): door clear widths per type, ramp slope and its
inverse, landing gaps, stair geometry, inscribed circles in squares and
corridors, every check firing and not firing, norms being overridable without
mutating the defaults, palette assignment and wrap-around, and legend filtering
and capacity.

---

## Not addressed

Known issues from `BUG_REPORT.md` that remain open:

- The 3D scene is fully torn down and rebuilt on every store change
  (`activeFloor.subscribe` → `rebuildScene()`), with fresh materials per wall.
  Needs incremental updates before 3D editing feels good.
- Persistence is `localStorage` only, and on quota exhaustion `datastore.ts`
  deletes other projects to save the current one. Should move to IndexedDB.
- Room identity is derived from wall-id sets, so custom names and colours can be
  lost when a room's wall topology changes.
- `FloorPlanCanvas.svelte` is 4 000 lines with a ~640-line `draw()` and a
  ~450-line `onMouseDown()`.
- No i18n — all strings are hardcoded English.
- 25 accessibility warnings from `svelte-check`.
