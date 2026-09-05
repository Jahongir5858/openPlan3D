export interface Point { x: number; y: number; }

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  height: number;
  color: string;
  /** Optional quadratic bezier control point for curved walls */
  curvePoint?: Point;
  texture?: string;
  /** Interior-specific overrides (if different from exterior) */
  interiorColor?: string;
  interiorTexture?: string;
  /** Exterior-specific overrides */
  exteriorColor?: string;
  exteriorTexture?: string;
}

export type RoomCategory = 'indoor' | 'outdoor' | 'garage' | 'utility';

/** Hatch applied on top of a zone's colour so the plan survives a mono copy. */
export type ZonePattern = 'none' | 'diag-l' | 'diag-r' | 'dots' | 'grid' | 'cross';

/**
 * A service delivered in the building. Zones are flat and independent — there
 * is deliberately no grouping, because the services a social-care centre runs
 * are not a hierarchy. Colour is an aid; `code` is what actually identifies a
 * room on paper, in a mono photocopy, and over the phone.
 */
export interface Zone {
  id: string;
  code: string;
  name: string;
  color: string;
  pattern?: ZonePattern;
  areaPerClient?: number;
}

export interface Room {
  id: string;
  name: string;
  walls: string[];
  floorTexture: string;
  zoneId?: string;
  area: number;
  grossArea?: number;
  color?: string;
  roomType?: RoomCategory;
  labelOffset?: Point;
}

export interface Door {
  id: string;
  wallId: string;
  position: number;
  width: number;
  height: number;
  type: 'single' | 'double' | 'sliding' | 'french' | 'pocket' | 'bifold' | 'opening' | 'garage';
  swingDirection: 'left' | 'right';
  flipSide: boolean;
}

export interface Window {
  id: string;
  wallId: string;
  position: number;
  width: number;
  height: number;
  sillHeight: number;
  type: 'standard' | 'fixed' | 'casement' | 'sliding' | 'bay';
}

export interface FurnitureItem {
  id: string;
  catalogId: string;
  position: Point;
  rotation: number;
  scale: { x: number; y: number; z: number };
  color?: string;
  width?: number;
  depth?: number;
  height?: number;
  material?: string;
  locked?: boolean;
}

export interface ElementGroup { id: string; elementIds: string[]; }
export type StairType = 'straight' | 'l-shaped' | 'u-shaped' | 'spiral';

export interface VerticalSpan {
  fromLevel?: number;
  toLevel?: number;
}

export interface Stair extends VerticalSpan {
  id: string;
  position: Point;
  rotation: number;
  width: number;
  depth: number;
  riserCount: number;
  direction: 'up' | 'down';
  stairType: StairType;
  rise?: number;
  handrail?: 'none' | 'left' | 'right' | 'both';
}

export type LiftKind = 'passenger' | 'accessible' | 'service' | 'stretcher';
export interface Lift extends VerticalSpan {
  id: string;
  position: Point;
  rotation: number;
  width: number;
  depth: number;
  cabinWidth: number;
  cabinDepth: number;
  doorSide: 'front' | 'back' | 'left' | 'right';
  doorWidth: number;
  kind: LiftKind;
  label?: string;
}

export interface RampLanding { at: number; length: number; }
export interface Ramp extends VerticalSpan {
  id: string;
  position: Point;
  rotation: number;
  width: number;
  runLength: number;
  rise: number;
  handrail?: 'none' | 'left' | 'right' | 'both';
  topLanding?: number;
  bottomLanding?: number;
  landings?: RampLanding[];
  direction: 'up' | 'down';
}

export interface Column {
  id: string;
  position: Point;
  rotation: number;
  shape: 'round' | 'square';
  diameter: number;
  height: number;
  color: string;
}

export interface Measurement { id: string; x1: number; y1: number; x2: number; y2: number; }
export interface Annotation { id: string; x1: number; y1: number; x2: number; y2: number; label?: string; offset: number; }
export interface TextAnnotation { id: string; x: number; y: number; text: string; fontSize: number; color: string; rotation: number; }
export interface GuideLine { id: string; orientation: 'horizontal' | 'vertical'; position: number; }
export interface BackgroundImage { dataUrl: string; position: Point; scale: number; opacity: number; rotation: number; locked: boolean; }
export interface EntourageItem { id: string; defId: string; position: Point; width: number; rotation: number; opacity?: number; locked?: boolean; }
export interface CustomEntourageDef { id: string; name: string; dataUrl: string; aspect: number; }

export interface Floor {
  id: string;
  name: string;
  level: number;
  walls: Wall[];
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  furniture: FurnitureItem[];
  stairs: Stair[];
  lifts?: Lift[];
  ramps?: Ramp[];
  columns: Column[];
  backgroundImage?: BackgroundImage;
  guides: GuideLine[];
  measurements: Measurement[];
  annotations: Annotation[];
  textAnnotations: TextAnnotation[];
  groups: ElementGroup[];
  entourage?: EntourageItem[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  floors: Floor[];
  activeFloorId: string;
  createdAt: Date;
  updatedAt: Date;
  customEntourage?: CustomEntourageDef[];
  zones?: Zone[];
  norms?: AccessibilityNorms;
}

export interface AccessibilityNorms {
  minDoorClearWidth: number;
  minCorridorWidth: number;
  minTurningDiameter: number;
  maxRampSlopePercent: number;
  maxRampRunWithoutLanding: number;
  minRampLanding: number;
  minLiftCabinWidth: number;
  minLiftCabinDepth: number;
  maxRiserHeight: number;
  minTreadDepth: number;
  minStairWidth: number;
}

export const DEFAULT_NORMS: AccessibilityNorms = {
  minDoorClearWidth: 90,
  minCorridorWidth: 150,
  minTurningDiameter: 150,
  maxRampSlopePercent: 8,
  maxRampRunWithoutLanding: 900,
  minRampLanding: 150,
  minLiftCabinWidth: 110,
  minLiftCabinDepth: 140,
  maxRiserHeight: 17,
  minTreadDepth: 30,
  minStairWidth: 120,
};
