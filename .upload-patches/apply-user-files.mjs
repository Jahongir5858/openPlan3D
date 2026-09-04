import fs from 'node:fs';

function edit(path, edits) {
  let text = fs.readFileSync(path, 'utf8');
  for (const [from, to, label] of edits) {
    if (!text.includes(from)) {
      throw new Error(`Patch context not found in ${path}: ${label}`);
    }
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, text);
}

edit('src/lib/utils/canvasRenderer.ts', [
  [
    "import { getRoomPolygon, roomCentroid } from '$lib/utils/roomDetection';",
    "import { getRoomPolygon, insetPolygonByWalls, roomCentroid } from '$lib/utils/roomDetection';",
    'roomDetection import',
  ],
  [
`  return { start: insetAt(w.start), end: insetAt(w.end) };
}

// ── Coordinate conversion (local helpers using CanvasState) ─────────`,
`  return { start: insetAt(w.start), end: insetAt(w.end) };
}

/**
 * How far a wall must run PAST each of its endpoints so that its solid volume
 * fills the corner where another wall meets it.
 *
 * A wall is a slab of half-width t/2 around its centerline. Two walls whose
 * centerlines meet at a shared endpoint therefore leave an unfilled wedge at
 * the outside of the corner — in 3D this shows up as a square notch bitten out
 * of the corner. For this wall to reach the far face of the other wall it must
 * overrun the joint by (otherThickness / 2) / sin(theta), where theta is the
 * angle between the two walls. At a right angle that is exactly
 * otherThickness / 2; at shallower angles it grows, so it is clamped by a
 * miter limit to avoid long spikes.
 *
 * Collinear continuations are skipped: they have nothing to fill, and sin(theta)
 * would be ~0.
 */
export function wallJoinExtensions(w: Wall, allWalls: Wall[]): { start: number; end: number } {
  const EP = 5;
  const MITER_LIMIT = 4; // multiples of the other wall's thickness
  const wdx = w.end.x - w.start.x;
  const wdy = w.end.y - w.start.y;
  const wl = Math.hypot(wdx, wdy) || 1;
  const fwd = { x: wdx / wl, y: wdy / wl };

  /** \`away\` = unit direction of THIS wall pointing away from the joint at \`pt\`. */
  const extAt = (pt: Point, away: Point): number => {
    let ext = 0;
    for (const other of allWalls) {
      if (other.id === w.id || other.curvePoint) continue;
      const atStart = Math.abs(other.start.x - pt.x) < EP && Math.abs(other.start.y - pt.y) < EP;
      const atEnd = Math.abs(other.end.x - pt.x) < EP && Math.abs(other.end.y - pt.y) < EP;
      if (!atStart && !atEnd) continue;
      // Direction of the other wall pointing away from the same joint
      const far = atStart ? other.end : other.start;
      const ox = far.x - pt.x;
      const oy = far.y - pt.y;
      const ol = Math.hypot(ox, oy) || 1;
      const sin = Math.abs(away.x * (oy / ol) - away.y * (ox / ol));
      if (sin < 0.1) continue; // collinear continuation — no corner to fill
      const t = Math.max(other.thickness, 1);
      ext = Math.max(ext, Math.min(t / 2 / sin, t * MITER_LIMIT));
    }
    return ext;
  };

  return {
    start: extAt(w.start, fwd),
    end: extAt(w.end, { x: -fwd.x, y: -fwd.y }),
  };
}

// ── Coordinate conversion (local helpers using CanvasState) ─────────`,
    'wallJoinExtensions helper',
  ],
  [
`    if (showDimensions && dimSettings.showInternalDimensions && poly.length >= 3) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const pt of poly) { if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x; if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y; }
      const roomW = (maxX - minX) / 100;
      const roomD = (maxY - minY) / 100;
      if (roomW > 0.1 && roomD > 0.1) {
        const dimFontSize = Math.max(9, 10 * zoom);
        ctx.fillStyle = '#b0b8c4'; ctx.font = \`\${dimFontSize}px sans-serif\`;
        ctx.fillText(\`\${formatLength(roomW * 100, dimSettings.units)} × \${formatLength(roomD * 100, dimSettings.units)}\`, sc.x, sc.y + fontSize + 2);
      }
    }`,
`    if (showDimensions && dimSettings.showInternalDimensions && poly.length >= 3) {
      // "Internal" means inside the walls, so measure the clear polygon rather
      // than the centerline one — otherwise this label reports half a wall's
      // thickness of space that isn't there on each side. \`poly\` is already in
      // hand, so inset it directly instead of paying for getRoomPolygon twice.
      const ids = new Set(room.walls);
      const clear = insetPolygonByWalls(poly, floor.walls.filter(w => ids.has(w.id)));
      const src = clear.length >= 3 ? clear : poly;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const pt of src) { if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x; if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y; }
      const roomW = maxX - minX;
      const roomD = maxY - minY;
      if (roomW > 10 && roomD > 10) {
        const dimFontSize = Math.max(9, 10 * zoom);
        ctx.fillStyle = '#b0b8c4'; ctx.font = \`\${dimFontSize}px sans-serif\`;
        ctx.fillText(\`\${formatLength(roomW, dimSettings.units)} × \${formatLength(roomD, dimSettings.units)}\`, sc.x, sc.y + fontSize + 2);
      }
    }`,
    'clear room dimensions',
  ],
]);

edit('src/lib/components/viewer3d/ThreeViewer.svelte', [
  [
    "  import { getWallTextureCanvas, getFloorTextureCanvas, setTextureLoadCallback } from '$lib/utils/textureGenerator';",
    "  import { getWallTextureCanvas, getFloorTextureCanvas, setTextureLoadCallback } from '$lib/utils/textureGenerator';\n  import { wallJoinExtensions } from '$lib/utils/canvasRenderer';",
    'wallJoinExtensions import',
  ],
  [
`      const doorOpenings = floor.doors.filter((d) => d.wallId === wall.id);
      const winOpenings = floor.windows.filter((w) => w.wallId === wall.id);
      const segments = buildWallSegments(len, h, t, doorOpenings, winOpenings);`,
`      const doorOpenings = floor.doors.filter((d) => d.wallId === wall.id);
      const winOpenings = floor.windows.filter((w) => w.wallId === wall.id);
      // Overrun the ends so corners are solid instead of leaving a square notch
      const ext = wallJoinExtensions(wall, floor.walls);
      const segments = buildWallSegments(len, h, t, doorOpenings, winOpenings, ext.start, ext.end);`,
    'primary wall extensions',
  ],
  [
`      if (doorOpeningsForBB.length === 0) {
        const bbGeo = new THREE.BoxGeometry(len, BASEBOARD_HEIGHT, t + 2);
        const bbMesh = new THREE.Mesh(bbGeo, baseboardMat);
        bbMesh.position.set(cx, BASEBOARD_HEIGHT / 2, cy);
        bbMesh.rotation.y = -angle;
        bbMesh.castShadow = true;
        wallGroup.add(bbMesh);`,
`      if (doorOpeningsForBB.length === 0) {
        // Match the wall's corner overrun so the trim doesn't stop short
        const bbLen = len + ext.start + ext.end;
        const bbShift = (ext.end - ext.start) / 2;
        const bbGeo = new THREE.BoxGeometry(bbLen, BASEBOARD_HEIGHT, t + 2);
        const bbMesh = new THREE.Mesh(bbGeo, baseboardMat);
        bbMesh.position.set(
          cx + bbShift * Math.cos(angle),
          BASEBOARD_HEIGHT / 2,
          cy + bbShift * Math.sin(angle)
        );
        bbMesh.rotation.y = -angle;
        bbMesh.castShadow = true;
        wallGroup.add(bbMesh);`,
    'baseboard extensions',
  ],
  [
`      const doorOpenings = floor.doors.filter((d) => d.wallId === wall.id);
      const winOpenings = floor.windows.filter((w) => w.wallId === wall.id);
      const segments = buildWallSegments(len, h, t, doorOpenings, winOpenings);`,
`      const doorOpenings = floor.doors.filter((d) => d.wallId === wall.id);
      const winOpenings = floor.windows.filter((w) => w.wallId === wall.id);
      const ext = wallJoinExtensions(wall, floor.walls);
      const segments = buildWallSegments(len, h, t, doorOpenings, winOpenings, ext.start, ext.end);`,
    'stacked floor wall extensions',
  ],
  [
`  function buildWallSegments(
    wallLen: number, wallH: number, _t: number,
    doors: Door[], windows: Win[]
  ): WallSegment[] {
    type Opening = { pos: number; width: number; bottomY: number; topY: number };
    const openings: Opening[] = [];
    for (const d of doors) {
      openings.push({ pos: d.position * wallLen, width: d.width, bottomY: 0, topY: 210 });
    }
    for (const w of windows) {
      openings.push({ pos: w.position * wallLen, width: w.width, bottomY: w.sillHeight, topY: w.sillHeight + w.height });
    }

    if (openings.length === 0) {
      return [{ width: wallLen, height: wallH, offsetX: wallLen / 2, offsetY: 0 }];
    }

    openings.sort((a, b) => a.pos - b.pos);
    const segs: WallSegment[] = [];
    let cursor = 0;

    for (const op of openings) {
      const left = op.pos - op.width / 2;
      const right = op.pos + op.width / 2;
      if (left > cursor) {
        segs.push({ width: left - cursor, height: wallH, offsetX: cursor + (left - cursor) / 2, offsetY: 0 });
      }
      if (op.topY < wallH) {
        segs.push({ width: op.width, height: wallH - op.topY, offsetX: op.pos, offsetY: op.topY });
      }
      if (op.bottomY > 0) {
        segs.push({ width: op.width, height: op.bottomY, offsetX: op.pos, offsetY: 0 });
      }
      cursor = Math.max(cursor, right);
    }

    if (cursor < wallLen) {
      segs.push({ width: wallLen - cursor, height: wallH, offsetX: cursor + (wallLen - cursor) / 2, offsetY: 0 });
    }

    return segs;
  }`,
`  /**
   * Split a wall into solid box segments, skipping door/window openings.
   *
   * \`extStart\` / \`extEnd\` extend the wall past its endpoints so it fills the
   * corner where a neighbouring wall meets it (see \`wallJoinExtensions\`).
   * Openings are still positioned in the wall's own 0..wallLen space; only the
   * two boundary segments grow.
   */
  function buildWallSegments(
    wallLen: number, wallH: number, _t: number,
    doors: Door[], windows: Win[],
    extStart = 0, extEnd = 0
  ): WallSegment[] {
    type Opening = { pos: number; width: number; bottomY: number; topY: number };
    const openings: Opening[] = [];
    for (const d of doors) {
      openings.push({ pos: d.position * wallLen, width: d.width, bottomY: 0, topY: 210 });
    }
    for (const w of windows) {
      openings.push({ pos: w.position * wallLen, width: w.width, bottomY: w.sillHeight, topY: w.sillHeight + w.height });
    }

    // The solid run spans [lo, hi] — wider than the wall itself at joined ends.
    const lo = -extStart;
    const hi = wallLen + extEnd;

    if (openings.length === 0) {
      return [{ width: hi - lo, height: wallH, offsetX: (lo + hi) / 2, offsetY: 0 }];
    }

    openings.sort((a, b) => a.pos - b.pos);
    const segs: WallSegment[] = [];
    let cursor = lo;

    for (const op of openings) {
      const left = op.pos - op.width / 2;
      const right = op.pos + op.width / 2;
      if (left > cursor) {
        segs.push({ width: left - cursor, height: wallH, offsetX: (cursor + left) / 2, offsetY: 0 });
      }
      if (op.topY < wallH) {
        segs.push({ width: op.width, height: wallH - op.topY, offsetX: op.pos, offsetY: op.topY });
      }
      if (op.bottomY > 0) {
        segs.push({ width: op.width, height: op.bottomY, offsetX: op.pos, offsetY: 0 });
      }
      cursor = Math.max(cursor, right);
    }

    if (cursor < hi) {
      segs.push({ width: hi - cursor, height: wallH, offsetX: (cursor + hi) / 2, offsetY: 0 });
    }

    return segs;
  }`,
    'extended buildWallSegments',
  ],
]);

edit('src/lib/components/sidebar/PropertiesPanel.svelte', [
  [
`      <div>
        <span class="text-xs text-gray-500">Area</span>
        <p class="text-sm text-gray-700">{formatArea(selectedRoom.area, settings.units)}</p>
      </div>`,
`      <div>
        <span class="text-xs text-gray-500">Area (clear)</span>
        <p class="text-sm text-gray-700">{formatArea(selectedRoom.area, settings.units)}</p>
        {#if selectedRoom.grossArea && selectedRoom.grossArea > selectedRoom.area}
          <p class="text-xs text-gray-400">{formatArea(selectedRoom.grossArea, settings.units)} to wall centrelines</p>
        {/if}
      </div>`,
    'room clear/gross area display',
  ],
]);

console.log('Uploaded OpenPlan3D file changes applied successfully.');
