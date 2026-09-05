import type { Floor, Point, Wall } from '$lib/models/types';
import { createDefaultFloor } from '$lib/stores/project';
import { detectRooms } from '$lib/utils/roomDetection';

export type CadFormat = 'dxf' | 'dwg';
export type CadUnit = 'auto' | 'mm' | 'cm' | 'm' | 'in' | 'ft';

export interface CadLayerStat {
  name: string;
  segments: number;
  selectedByDefault: boolean;
}

export interface CadAnalysis {
  fileName: string;
  format: CadFormat;
  bytes: number;
  entityCount: number;
  segmentCount: number;
  sourceUnit: Exclude<CadUnit, 'auto'> | null;
  layers: CadLayerStat[];
  warnings: string[];
  _segments: RawCadSegment[];
}

export interface CadImportOptions {
  unit: CadUnit;
  layers: string[];
  wallThicknessCm: number;
  wallHeightCm: number;
  minSegmentLengthCm: number;
  collapseParallelWalls: boolean;
  centerDrawing: boolean;
}

export interface CadImportResult {
  floor: Floor;
  walls: number;
  rooms: number;
  effectiveUnit: Exclude<CadUnit, 'auto'>;
  warnings: string[];
}

interface CadPoint {
  x: number;
  y: number;
}

interface RawCadSegment {
  a: CadPoint;
  b: CadPoint;
  layer: string;
  sourceType: string;
  width?: number;
}

interface CadSource {
  format: CadFormat;
  entities: any[];
  blocks: Record<string, any>;
  header: any;
  entityCount: number;
  warnings: string[];
}

interface Transform2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

const IDENTITY: Transform2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const DXF_URL = 'https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/+esm';

// This exact LibreDWG layout was already proven in our earlier browser loader.
// It is intentionally loaded only when a user selects a DWG file so the normal
// OpenPlan3D bundle stays small. LibreDWG is GPL-3.0; see the import dialog note.
const LIBREDWG_PROVIDERS = [
  {
    name: 'jsDelivr',
    wrapperUrl: 'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.9/dist/libredwg-web.js',
    rawModuleUrl: 'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.9/wasm/libredwg-web.js',
    wasmUrl: 'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.9/wasm/libredwg-web.wasm'
  },
  {
    name: 'UNPKG',
    wrapperUrl: 'https://unpkg.com/@mlightcad/libredwg-web@0.7.9/dist/libredwg-web.js',
    rawModuleUrl: 'https://unpkg.com/@mlightcad/libredwg-web@0.7.9/wasm/libredwg-web.js',
    wasmUrl: 'https://unpkg.com/@mlightcad/libredwg-web@0.7.9/wasm/libredwg-web.wasm'
  }
] as const;

let libreDwgContextPromise: Promise<any> | null = null;

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function layerName(entity: any): string {
  const value = entity?.layer ?? entity?.layerName ?? entity?.layer_name ?? entity?.layerId;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const nested = value.name ?? value.layerName ?? value.value;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return '0';
}

function entityType(entity: any): string {
  return String(entity?.type ?? entity?.entityType ?? entity?.objectName ?? entity?.dxfType ?? entity?.name ?? '')
    .toUpperCase()
    .replace(/^ACDB/, '')
    .replace(/^DWG_TYPE_/, '');
}

function pointFrom(value: any): CadPoint | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  if (typeof value === 'object') {
    const x = Number(value.x ?? value.X ?? value[0]);
    const y = Number(value.y ?? value.Y ?? value[1]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  return null;
}

function entityVertices(entity: any): CadPoint[] {
  const raw = entity?.vertices ?? entity?.points ?? entity?.controlPoints ?? entity?.fitPoints ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map(pointFrom).filter((p): p is CadPoint => !!p);
}

function applyTransform(p: CadPoint, t: Transform2D): CadPoint {
  return {
    x: p.x * t.a + p.y * t.c + t.tx,
    y: p.x * t.b + p.y * t.d + t.ty
  };
}

function compose(parent: Transform2D, child: Transform2D): Transform2D {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty
  };
}

function rotationToRadians(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n) <= Math.PI * 2 + 0.001 ? n : n * Math.PI / 180;
}

function insertTransform(entity: any, block: any): Transform2D {
  const p = pointFrom(entity?.position ?? entity?.insertionPoint ?? entity?.insertPoint ?? entity?.basePoint) ?? { x: 0, y: 0 };
  const base = pointFrom(block?.basePoint ?? block?.position ?? block?.origin) ?? { x: 0, y: 0 };
  const sx = Number(entity?.xScale ?? entity?.scaleX ?? entity?.scale?.x ?? 1) || 1;
  const sy = Number(entity?.yScale ?? entity?.scaleY ?? entity?.scale?.y ?? sx) || sx;
  const r = rotationToRadians(entity?.rotation ?? entity?.angle ?? 0);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    a: cos * sx,
    b: sin * sx,
    c: -sin * sy,
    d: cos * sy,
    tx: p.x - (base.x * cos * sx - base.y * sin * sy),
    ty: p.y - (base.x * sin * sx + base.y * cos * sy)
  };
}

function blockMap(raw: any): Record<string, any> {
  const result: Record<string, any> = {};
  if (!raw) return result;
  if (Array.isArray(raw)) {
    for (const b of raw) {
      const name = String(b?.name ?? b?.blockName ?? '').trim();
      if (name) result[name] = b;
    }
    return result;
  }
  if (typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) result[key] = value;
  }
  return result;
}

function isClosedPolyline(entity: any): boolean {
  if (entity?.isClosed === true || entity?.closed === true || entity?.shape === true) return true;
  const flag = Number(entity?.flag ?? entity?.flags ?? 0);
  return (flag & 1) === 1 || (flag & 0x200) === 0x200;
}

function widthOf(entity: any): number | undefined {
  const value = Number(
    entity?.constantWidth ?? entity?.constWidth ?? entity?.const_width ??
    entity?.width ?? entity?.startWidth ?? entity?.vertices?.[0]?.startWidth
  );
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function addPolylineSegments(
  out: RawCadSegment[],
  points: CadPoint[],
  layer: string,
  sourceType: string,
  transform: Transform2D,
  closed: boolean,
  width?: number
) {
  if (points.length < 2) return;
  const transformed = points.map(p => applyTransform(p, transform));
  for (let i = 0; i < transformed.length - 1; i++) {
    out.push({ a: transformed[i], b: transformed[i + 1], layer, sourceType, width });
  }
  if (closed && transformed.length > 2) {
    out.push({ a: transformed[transformed.length - 1], b: transformed[0], layer, sourceType, width });
  }
}

function arcPoints(entity: any): CadPoint[] {
  const center = pointFrom(entity?.center ?? entity?.centerPoint);
  const radius = Number(entity?.radius);
  if (!center || !Number.isFinite(radius) || radius <= 0) return [];

  let start = Number(entity?.startAngle ?? entity?.start_angle ?? 0);
  let end = Number(entity?.endAngle ?? entity?.end_angle ?? 0);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  if (Math.abs(start) > Math.PI * 2 + 0.001 || Math.abs(end) > Math.PI * 2 + 0.001) {
    start *= Math.PI / 180;
    end *= Math.PI / 180;
  }
  while (end <= start) end += Math.PI * 2;
  const sweep = Math.min(Math.PI * 2, end - start);
  const steps = Math.max(4, Math.min(48, Math.ceil(sweep / (Math.PI / 18))));
  const points: CadPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + sweep * (i / steps);
    points.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
  }
  return points;
}

function extractSegments(
  entities: any[],
  blocks: Record<string, any>,
  transform: Transform2D = IDENTITY,
  inheritedLayer?: string,
  depth = 0,
  out: RawCadSegment[] = []
): RawCadSegment[] {
  if (!Array.isArray(entities) || depth > 6) return out;

  for (const entity of entities) {
    if (!entity || typeof entity !== 'object') continue;
    const type = entityType(entity);
    const layer = layerName(entity) === '0' && inheritedLayer ? inheritedLayer : layerName(entity);

    if (type.includes('INSERT') && !type.includes('ATTRIBUTE')) {
      const name = String(entity?.blockName ?? entity?.name ?? entity?.effectiveBlockName ?? '').trim();
      const block = blocks[name];
      if (block?.entities) {
        extractSegments(block.entities, blocks, compose(transform, insertTransform(entity, block)), layer, depth + 1, out);
      }
      continue;
    }

    if (type.includes('LWPOLYLINE') || type === 'POLYLINE' || type.includes('POLYLINE_2D') || type.includes('POLYLINE2D') || type.includes('POLYLINE_3D')) {
      addPolylineSegments(out, entityVertices(entity), layer, type, transform, isClosedPolyline(entity), widthOf(entity));
      continue;
    }

    if (type === 'LINE' || type.endsWith('_LINE')) {
      const vertices = entityVertices(entity);
      const start = pointFrom(entity?.startPoint ?? entity?.start ?? entity?.p0 ?? entity?.from) ?? vertices[0] ?? null;
      const end = pointFrom(entity?.endPoint ?? entity?.end ?? entity?.p1 ?? entity?.to) ?? vertices[1] ?? null;
      if (start && end) {
        out.push({ a: applyTransform(start, transform), b: applyTransform(end, transform), layer, sourceType: type, width: widthOf(entity) });
      }
      continue;
    }

    if (type === 'ARC' || type.endsWith('_ARC')) {
      addPolylineSegments(out, arcPoints(entity), layer, type, transform, false, widthOf(entity));
      continue;
    }

    if (type.includes('SPLINE')) {
      const points = entityVertices(entity);
      addPolylineSegments(out, points, layer, type, transform, false, widthOf(entity));
    }
  }
  return out;
}

function getHeaderUnit(header: any): Exclude<CadUnit, 'auto'> | null {
  if (!header || typeof header !== 'object') return null;
  const raw = header.$INSUNITS ?? header.INSUNITS ?? header.insunits ?? header.units ?? header.insertionUnits;
  if (typeof raw === 'string') {
    const value = raw.toLowerCase();
    if (value.includes('millimeter') || value === 'mm') return 'mm';
    if (value.includes('centimeter') || value === 'cm') return 'cm';
    if (value === 'm' || value.includes('meter')) return 'm';
    if (value.includes('inch')) return 'in';
    if (value.includes('foot') || value.includes('feet')) return 'ft';
  }
  const code = Number(raw);
  if (!Number.isFinite(code)) return null;
  if (code === 4) return 'mm';
  if (code === 5) return 'cm';
  if (code === 6) return 'm';
  if (code === 1 || code === 22) return 'in';
  if (code === 2 || code === 21) return 'ft';
  return null;
}

export function unitScaleToCm(unit: Exclude<CadUnit, 'auto'>): number {
  switch (unit) {
    case 'mm': return 0.1;
    case 'cm': return 1;
    case 'm': return 100;
    case 'in': return 2.54;
    case 'ft': return 30.48;
  }
}

function defaultLayerSelection(name: string): boolean {
  return !/(^|[-_ ])(dim|dims|dimension|text|anno|annot|hatch|grid|axis|center|centre|door|window|furn|furniture|mebel|room|area|elect|plumb|san|ceiling|roof|landscape)([-_ ]|$)/i.test(name);
}

function isWallLayer(name: string): boolean {
  return /(wall|a[-_]?wall|walls|devor|стен|перегород|partition|muro|arch[-_]?wall)/i.test(name);
}

function layerStats(segments: RawCadSegment[]): CadLayerStat[] {
  const counts = new Map<string, number>();
  for (const segment of segments) counts.set(segment.layer, (counts.get(segment.layer) ?? 0) + 1);
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  const wallLayers = names.filter(isWallLayer);
  return names.map(name => ({
    name,
    segments: counts.get(name) ?? 0,
    selectedByDefault: wallLayers.length > 0 ? wallLayers.includes(name) : defaultLayerSelection(name)
  }));
}

async function dynamicImport(url: string): Promise<any> {
  return import(/* @vite-ignore */ url);
}

async function parseDxf(file: File): Promise<CadSource> {
  const mod = await dynamicImport(DXF_URL);
  const Parser = mod.DxfParser ?? mod.default?.DxfParser ?? mod.default;
  const text = await file.text();
  let data: any;
  if (typeof Parser === 'function') {
    const parser = new Parser();
    data = typeof parser.parseSync === 'function' ? parser.parseSync(text) : parser.parse(text);
  } else if (typeof mod.default === 'function') {
    data = mod.default(text);
  }
  if (!data) throw new Error('DXF parser faylni o‘qiy olmadi. ASCII DXF faylini tekshiring.');
  const entities = Array.isArray(data.entities) ? data.entities : [];
  return {
    format: 'dxf',
    entities,
    blocks: blockMap(data.blocks),
    header: data.header ?? {},
    entityCount: entities.length,
    warnings: []
  };
}

function promiseTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]);
}

async function loadLibreDwgProvider(provider: typeof LIBREDWG_PROVIDERS[number]) {
  const [wrapperModule, rawModule] = await Promise.all([
    promiseTimeout(dynamicImport(provider.wrapperUrl), 60_000, `${provider.name}: LibreDWG wrapper yuklanmadi`),
    promiseTimeout(dynamicImport(provider.rawModuleUrl), 60_000, `${provider.name}: LibreDWG WASM moduli yuklanmadi`)
  ]);
  const LibreDwg = wrapperModule.LibreDwg ?? wrapperModule.default?.LibreDwg;
  const createModule = rawModule.createModule ?? rawModule.default;
  if (!LibreDwg || typeof createModule !== 'function') throw new Error(`${provider.name}: LibreDWG API topilmadi`);

  const wasmInstance = await promiseTimeout(
    createModule({
      locateFile(path: string) {
        if (String(path).toLowerCase().endsWith('.wasm')) return provider.wasmUrl;
        return new URL(path, provider.rawModuleUrl).href;
      },
      mainScriptUrlOrBlob: provider.rawModuleUrl,
      print() {},
      printErr() {}
    }),
    150_000,
    `${provider.name}: LibreDWG WebAssembly yuklanish vaqti tugadi`
  );

  let engine: any;
  if (typeof LibreDwg.createByWasmInstance === 'function') engine = LibreDwg.createByWasmInstance(wasmInstance);
  else if (typeof LibreDwg.create === 'function') {
    const base = provider.wasmUrl.slice(0, provider.wasmUrl.lastIndexOf('/') + 1);
    engine = await promiseTimeout(LibreDwg.create(base), 150_000, `${provider.name}: LibreDWG engine yaratilmadi`);
  }
  if (!engine || typeof engine.dwg_read_data !== 'function') throw new Error(`${provider.name}: LibreDWG engine yaroqsiz`);
  return { module: wrapperModule, engine };
}

async function getLibreDwgContext() {
  if (libreDwgContextPromise) return libreDwgContextPromise;
  libreDwgContextPromise = (async () => {
    const errors: string[] = [];
    for (const provider of LIBREDWG_PROVIDERS) {
      try {
        return await loadLibreDwgProvider(provider);
      } catch (error: any) {
        errors.push(`${provider.name}: ${String(error?.message ?? error)}`);
      }
    }
    libreDwgContextPromise = null;
    throw new Error(`DWG dekoderi yuklanmadi. ${errors.join(' | ')}`);
  })();
  return libreDwgContextPromise;
}

async function parseDwg(file: File): Promise<CadSource> {
  const head = new TextDecoder('ascii').decode(new Uint8Array(await file.slice(0, 6).arrayBuffer()));
  if (!/^AC10\d{2}$/.test(head)) throw new Error('Fayl DWG imzosiga ega emas yoki DWG versiyasi aniqlanmadi.');
  const { module, engine } = await getLibreDwgContext();
  const type = module.Dwg_File_Type?.DWG ?? module.DwgFileType?.DWG ?? module.default?.Dwg_File_Type?.DWG ?? 0;
  const buffer = await file.arrayBuffer();
  let pointer: any = null;
  try {
    pointer = engine.dwg_read_data(buffer, type);
    if (!pointer) throw new Error('LibreDWG ushbu DWG faylini o‘qiy olmadi.');
    const converted = typeof engine.convertEx === 'function' ? engine.convertEx(pointer) : engine.convert(pointer);
    const database = converted?.database ?? converted;
    if (!database) throw new Error('DWG ma’lumotlar bazasiga aylantirilmadi.');
    const entities = Array.isArray(database.entities)
      ? database.entities
      : Array.isArray(database.modelSpace?.entities)
        ? database.modelSpace.entities
        : [];
    return {
      format: 'dwg',
      entities,
      blocks: blockMap(database.blocks ?? database.blockTable ?? database.block_table),
      header: database.header ?? {},
      entityCount: entities.length,
      warnings: entities.length ? [] : ['DWG ochildi, lekin model-space geometriyasi topilmadi. Paper Space yoki proxy obyektlar bo‘lishi mumkin.']
    };
  } finally {
    if (pointer && typeof engine.dwg_free === 'function') {
      try { engine.dwg_free(pointer); } catch {}
    }
  }
}

export async function analyzeCadFile(file: File): Promise<CadAnalysis> {
  if (!file) throw new Error('Fayl tanlanmagan.');
  if (file.size > 60 * 1024 * 1024) throw new Error('CAD fayl 60 MB dan katta. Avval chizmani yengillashtiring.');
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'dxf' && ext !== 'dwg') throw new Error('Faqat .DXF va .DWG fayllari qo‘llab-quvvatlanadi.');

  const source = ext === 'dxf' ? await parseDxf(file) : await parseDwg(file);
  const segments = extractSegments(source.entities, source.blocks);
  const sourceUnit = getHeaderUnit(source.header);
  const warnings = [...source.warnings];
  if (!sourceUnit) warnings.push('CAD faylda o‘lchov birligi aniq ko‘rsatilmagan. Auto rejim millimetr deb qabul qiladi; kerak bo‘lsa import oynasida birlikni o‘zgartiring.');
  if (!segments.length) warnings.push('LINE/LWPOLYLINE/POLYLINE/ARC geometriyasi topilmadi.');

  return {
    fileName: file.name,
    format: source.format,
    bytes: file.size,
    entityCount: source.entityCount,
    segmentCount: segments.length,
    sourceUnit,
    layers: layerStats(segments),
    warnings,
    _segments: segments
  };
}

function segmentLength(s: RawCadSegment): number {
  return Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
}

function scaleSegments(analysis: CadAnalysis, unit: Exclude<CadUnit, 'auto'>): RawCadSegment[] {
  const scale = unitScaleToCm(unit);
  return analysis._segments.map(s => ({
    ...s,
    a: { x: s.a.x * scale, y: -s.a.y * scale },
    b: { x: s.b.x * scale, y: -s.b.y * scale },
    width: s.width ? Math.abs(s.width * scale) : undefined
  }));
}

function centerSegments(segments: RawCadSegment[]): RawCadSegment[] {
  if (!segments.length) return segments;
  let minX = Infinity, minY = Infinity;
  for (const s of segments) {
    minX = Math.min(minX, s.a.x, s.b.x);
    minY = Math.min(minY, s.a.y, s.b.y);
  }
  const dx = 100 - minX;
  const dy = 100 - minY;
  return segments.map(s => ({
    ...s,
    a: { x: s.a.x + dx, y: s.a.y + dy },
    b: { x: s.b.x + dx, y: s.b.y + dy }
  }));
}

function parallelMetrics(a: RawCadSegment, b: RawCadSegment) {
  const adx = a.b.x - a.a.x, ady = a.b.y - a.a.y;
  let bdx = b.b.x - b.a.x, bdy = b.b.y - b.a.y;
  const alen = Math.hypot(adx, ady), blen = Math.hypot(bdx, bdy);
  if (alen < 1 || blen < 1) return null;
  const au = { x: adx / alen, y: ady / alen };
  let bu = { x: bdx / blen, y: bdy / blen };
  let dot = au.x * bu.x + au.y * bu.y;
  let bStart = b.a, bEnd = b.b;
  if (dot < 0) {
    dot = -dot;
    bu = { x: -bu.x, y: -bu.y };
    bStart = b.b; bEnd = b.a;
    bdx = -bdx; bdy = -bdy;
  }
  if (dot < Math.cos(2 * Math.PI / 180)) return null;

  const nx = -au.y, ny = au.x;
  const distance = Math.abs((bStart.x - a.a.x) * nx + (bStart.y - a.a.y) * ny);
  const project = (p: CadPoint) => (p.x - a.a.x) * au.x + (p.y - a.a.y) * au.y;
  const b0 = project(bStart), b1 = project(bEnd);
  const overlap = Math.max(0, Math.min(alen, Math.max(b0, b1)) - Math.max(0, Math.min(b0, b1)));
  const overlapRatio = overlap / Math.min(alen, blen);
  return { distance, overlapRatio, alen, blen, bStart, bEnd };
}

export function collapseParallelSegments(segments: RawCadSegment[], minThickness = 5, maxThickness = 60): RawCadSegment[] {
  const used = new Set<number>();
  const result: RawCadSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    const a = segments[i];
    if (a.width && a.width >= minThickness && a.width <= maxThickness) {
      used.add(i);
      result.push(a);
      continue;
    }

    let best = -1;
    let bestDistance = Infinity;
    let bestMetrics: ReturnType<typeof parallelMetrics> = null;
    for (let j = i + 1; j < segments.length; j++) {
      if (used.has(j)) continue;
      const b = segments[j];
      if (a.layer !== b.layer) continue;
      const metrics = parallelMetrics(a, b);
      if (!metrics) continue;
      if (metrics.distance < minThickness || metrics.distance > maxThickness) continue;
      if (metrics.overlapRatio < 0.72) continue;
      if (metrics.alen / metrics.blen < 0.65 || metrics.alen / metrics.blen > 1.55) continue;
      if (metrics.distance < bestDistance) {
        best = j;
        bestDistance = metrics.distance;
        bestMetrics = metrics;
      }
    }

    if (best >= 0 && bestMetrics) {
      const b = segments[best];
      used.add(i); used.add(best);
      const start = { x: (a.a.x + bestMetrics.bStart.x) / 2, y: (a.a.y + bestMetrics.bStart.y) / 2 };
      const end = { x: (a.b.x + bestMetrics.bEnd.x) / 2, y: (a.b.y + bestMetrics.bEnd.y) / 2 };
      result.push({ ...a, a: start, b: end, width: bestDistance, sourceType: `${a.sourceType}+PARALLEL` });
    } else {
      used.add(i);
      result.push(a);
    }
  }
  return result;
}

export function buildFloorFromCad(analysis: CadAnalysis, options: CadImportOptions): CadImportResult {
  const effectiveUnit = options.unit === 'auto' ? (analysis.sourceUnit ?? 'mm') : options.unit;
  const selected = new Set(options.layers);
  let segments = scaleSegments(analysis, effectiveUnit).filter(s => selected.has(s.layer));
  if (options.centerDrawing) segments = centerSegments(segments);
  segments = segments.filter(s => segmentLength(s) >= Math.max(1, options.minSegmentLengthCm));
  if (options.collapseParallelWalls) segments = collapseParallelSegments(segments);

  const warnings = [...analysis.warnings];
  if (!segments.length) throw new Error('Tanlangan qatlamlarda import qilinadigan devor chiziqlari topilmadi.');
  if (segments.length > 10_000) warnings.push('10 000 dan ortiq segment import qilinmoqda; ishlash sekinlashishi mumkin. CAD qatlamlarini kamaytirish tavsiya etiladi.');

  const floor = createDefaultFloor(0);
  const defaultThickness = Math.max(5, Math.min(100, options.wallThicknessCm || 15));
  const height = Math.max(100, Math.min(1000, options.wallHeightCm || 280));
  const walls: Wall[] = segments.map((s, index) => ({
    id: uid(`cad-wall-${index}`),
    start: { x: Math.round(s.a.x * 100) / 100, y: Math.round(s.a.y * 100) / 100 } as Point,
    end: { x: Math.round(s.b.x * 100) / 100, y: Math.round(s.b.y * 100) / 100 } as Point,
    thickness: Math.max(5, Math.min(100, s.width ?? defaultThickness)),
    height,
    color: '#444444'
  }));

  floor.walls = walls;
  floor.rooms = detectRooms(walls);
  return {
    floor,
    walls: walls.length,
    rooms: floor.rooms.length,
    effectiveUnit,
    warnings
  };
}
