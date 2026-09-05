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
  code: string;        // "03"
  name: string;        // "Kunduzgi parvarish xizmati"
  color: string;       // hex
  pattern?: ZonePattern;
  /** Floor area per client in m², used for capacity and undersize checks */
  areaPerClient?: number;
}

export interface Room {
  id: string;
  name: string;
  walls: string[];
  floorTexture: string;
  /** Which service this room belongs to */
  zoneId?: string;
  /** Clear (net) floor area in m² — centerline polygon inset by half of each surrounding wall */
  area: number;
  /** Gross (axis-to-axis) area in m², measured on the wall centerlines */
  grossArea?: number;
  color?: string;
  roomType?: RoomCategory;
  /** Custom label position offset from centroid (in world units) */
  labelOffset?: Point;
}

export interface Door {
  id: string;
  wallId: string;
  position: number; // 0-1 along wall
  width: number;
  height: number;
  type: 'single' | 'double' | 'sliding' | 'french' | 'pocket' | 'bifold' | 'opening' | 'garage';
  swingDirection: 'left' | 'right';
  flipSide: boolean; // flip which side of wall the door opens to (vertical flip)
}

export interface Window {
  id: string;
  wallId: string;
  position: number; // 0-1 along wall
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
  // Per-item overrides (optional — falls back to catalog defaults)
  color?: string;
  width?: number;   // cm
  depth?: number;   // cm
  height?: number;  // cm
  material?: string; // material name/id
  locked?: boolean;
}

export interface ElementGroup {
  id: string;
  elementIds: string[];
}

export type StairType = 'straight' | 'l-shaped' | 'u-shaped' | 'spiral';

/**
 * Vertical circulation — stairs, lifts and ramps — connects floors, so each
 * element records the range of levels it passes through. A plan then knows on
 * its own whether to show "up", "down" or both, and the same shaft can't drift
 * out of alignment between storeys.
 */
export interface VerticalSpan {
  /** Lowest floor level the element reaches. Defaults to the floor it sits on. */
  fromLevel?: number;
  /** Highest floor level the element reaches. */
  toLevel?: number;
}

export interface Stair extends VerticalSpan {
  id: string;
  position: Point;
  rotation: number;
  width: number;   // default 100cm
  depth: number;   // default 300cm
  riserCount: number; // default 14
  direction: 'up' | 'down';
  stairType: StairType; // default 'straight'
  /** Floor-to-floor rise in cm; riser height = rise / riserCount */
  rise?: number;
  handrail?: 'none' | 'left' | 'right' | 'both';
}

export type LiftKind = 'passenger' | 'accessible' | 'service' | 'stretcher';

export interface Lift extends VerticalSpan {
  id: string;
  position: Point;      // centre of the shaft
  rotation: number;
  /** Shaft outer dimensions in cm */
  width: number;
  depth: number;
  /** Clear cabin dimensions in cm — what the norm is actually checked against */
  cabinWidth: number;
  cabinDepth: number;
  /** Which side of the shaft the doors open onto, in local coordinates */
  doorSide: 'front' | 'back' | 'left' | 'right';
  doorWidth: number;    // cm
  kind: LiftKind;
  label?: string;
}

export interface RampLanding {
  /** Distance along the ramp run where the landing sits, in cm */
  at: number;
  length: number;       // cm
}

export interface Ramp extends VerticalSpan {
  id: string;
  position: Point;      // centre of the run
  rotation: number;     // 0 = rises toward -y
  width: number;        // clear width in cm
  /** Horizontal length of the sloped run, excluding landings, in cm */
  runLength: number;
  /** Vertical rise in cm. Slope = rise / runLength */
  rise: number;
  handrail?: 'none' | 'left' | 'right' | 'both';
  /** Level platforms at the top and bottom, in cm (0 = none) */
  topLanding?: number;
  bottomLanding?: number;
  /** Intermediate landings breaking up a long run */
  landings?: RampLanding[];
  direction: 'up' | 'down';
}

export interface Column {
  id: string;
  position: Point;
  rotation: number;
  shape: 'round' | 'square';
  diameter: number;  // cm (for round) or side length (for square)
  height: number;    // cm
  color: string;
}

export interface Measurement {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Annotation {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  offset: number; // perpendicular offset for dimension line (default 40)
}

export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  rotation: number;
}

export interface GuideLine {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number; // world coordinate (x for vertical, y for horizontal)
}

export interface BackgroundImage {
  dataUrl: string;
  position: Point;
  scale: number;
  opacity: number;
  rotation: number;
  locked: boolean;
}

/** A placed 2D entourage symbol (person, car, tree, …) for presentation plans */
export interface EntourageItem {
  id: string;
  defId: string; // id of a built-in EntourageDef or a project CustomEntourageDef
  position: Point; // center, world cm
  width: number; // real-world width in cm
  rotation: number; // degrees
  opacity?: number; // 0–1, default 1
  locked?: boolean;
}

/** User-uploaded PNG entourage symbol, stored on the project */
export interface CustomEntourageDef {
  id: string;
  name: string;
  dataUrl: string; // PNG as data URL
  aspect: number; // height / width
}

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
  /** Services delivered in this building */
  zones?: Zone[];
  /** Accessibility limits this project is checked against. Editable, because
   *  building codes change and shouldn't require a new app release. */
  norms?: AccessibilityNorms;
}

/**
 * Accessibility limits, kept as project data rather than constants.
 * Defaults follow widely used international practice; check them against the
 * building code that applies to your project before relying on them.
 */
export interface AccessibilityNorms {
  /** Clear door opening width, cm */
  minDoorClearWidth: number;
  /** Clear corridor width, cm */
  minCorridorWidth: number;
  /** Wheelchair turning circle diameter, cm */
  minTurningDiameter: number;
  /** Maximum ramp slope as a percentage */
  maxRampSlopePercent: number;
  /** Longest ramp run allowed before an intermediate landing, cm */
  maxRampRunWithoutLanding: number;
  /** Minimum landing length, cm */
  minRampLanding: number;
  /** Clear lift cabin dimensions, cm */
  minLiftCabinWidth: number;
  minLiftCabinDepth: number;
  /** Stair geometry, cm */
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
