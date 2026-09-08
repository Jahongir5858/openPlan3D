import * as THREE from 'three';

/**
 * ThreeViewer builds walls around door/window openings from several adjacent
 * BoxGeometry meshes. At those T-junctions two faces can end up exactly
 * coplanar. WebGL then alternates which face wins the depth test while the
 * camera moves, which appears as a shimmering / flickering strip (z-fighting).
 *
 * Two safeguards are applied here:
 * 1) neutralise positive polygon offsets used by wall interior materials;
 * 2) give the dark-brown door-frame material a tiny negative depth bias so its
 *    jamb/header faces win consistently where they touch the wall opening.
 *
 * Negative offsets used by the floor and offsets assigned after material
 * construction (for example the ground plane) are left untouched.
 */
const materialPrototype = THREE.Material.prototype as THREE.Material & {
  __openPlan3DSeamGuard?: boolean;
};

if (!materialPrototype.__openPlan3DSeamGuard) {
  const originalSetValues = THREE.Material.prototype.setValues;

  THREE.Material.prototype.setValues = function (
    values?: THREE.MaterialParameters
  ): void {
    let safeValues = values;

    if (
      values?.polygonOffset === true &&
      (values.polygonOffsetFactor ?? 0) > 0
    ) {
      safeValues = {
        ...values,
        polygonOffset: false,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: 0
      };
    }

    // Door jambs/header are intentionally placed flush against the opening.
    // Their side faces can be coplanar with the wall segment faces. Bias only
    // this exact material slightly toward the camera to eliminate z-fighting
    // without changing any wall/door dimensions or positions.
    const standardValues = values as THREE.MeshStandardMaterialParameters | undefined;
    const isDoorFrameMaterial =
      standardValues?.color === 0x6b4423 && standardValues?.roughness === 0.6;

    if (isDoorFrameMaterial) {
      safeValues = {
        ...safeValues,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      };
    }

    originalSetValues.call(this, safeValues);
  };

  Object.defineProperty(THREE.Material.prototype, '__openPlan3DSeamGuard', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

export interface FloorMaterial {
  id: string;
  name: string;
  color: string;
  pattern?: 'hardwood' | 'tile' | 'carpet' | 'concrete' | 'marble' | 'bamboo' | 'laminate' | 'slate' | 'vinyl';
  roughness?: number;
}

export interface WallColor {
  id: string;
  name: string;
  color: string;
  texture?: 'brick' | 'stone' | 'wood-panel' | 'concrete' | 'tile';
}

export const floorMaterials: FloorMaterial[] = [
  // 'none' = no texture; floor renders as a solid color (room.color when set)
  { id: 'none', name: 'Solid Color', color: '#e8e4dc', roughness: 0.9 },
  { id: 'light-oak', name: 'Light Oak', color: '#ddc9a8', pattern: 'hardwood', roughness: 0.8 },
  { id: 'walnut', name: 'Walnut', color: '#8b6f47', pattern: 'hardwood', roughness: 0.8 },
  { id: 'bamboo', name: 'Bamboo', color: '#e6d3a7', pattern: 'bamboo', roughness: 0.7 },
  { id: 'laminate', name: 'Laminate', color: '#b8a082', pattern: 'laminate', roughness: 0.6 },
  { id: 'ceramic-white', name: 'White Tile', color: '#f8f8f8', pattern: 'tile', roughness: 0.3 },
  { id: 'ceramic-gray', name: 'Gray Tile', color: '#d4cfc9', pattern: 'tile', roughness: 0.3 },
  { id: 'porcelain', name: 'Porcelain', color: '#f5f5f5', pattern: 'tile', roughness: 0.2 },
  { id: 'marble-white', name: 'White Marble', color: '#f8f6f0', pattern: 'marble', roughness: 0.1 },
  { id: 'marble-dark', name: 'Dark Marble', color: '#4a4a4a', pattern: 'marble', roughness: 0.1 },
  { id: 'carpet-beige', name: 'Beige Carpet', color: '#d2b48c', pattern: 'carpet', roughness: 1.0 },
  { id: 'carpet-gray', name: 'Gray Carpet', color: '#a8a29e', pattern: 'carpet', roughness: 1.0 },
  { id: 'concrete', name: 'Concrete', color: '#9ca3af', pattern: 'concrete', roughness: 0.9 },
  { id: 'slate', name: 'Slate', color: '#708090', pattern: 'slate', roughness: 0.8 },
  { id: 'vinyl', name: 'Vinyl', color: '#c4a882', pattern: 'vinyl', roughness: 0.5 },
];

export const wallColors: WallColor[] = [
  { id: 'white', name: 'White', color: '#ffffff' },
  { id: 'cream', name: 'Cream', color: '#fffdd0' },
  { id: 'warm-white', name: 'Warm White', color: '#faf7f2' },
  { id: 'light-gray', name: 'Light Gray', color: '#d1d5db' },
  { id: 'medium-gray', name: 'Medium Gray', color: '#9ca3af' },
  { id: 'charcoal', name: 'Charcoal', color: '#374151' },
  { id: 'navy-blue', name: 'Navy Blue', color: '#1e3a8a' },
  { id: 'light-blue', name: 'Light Blue', color: '#dbeafe' },
  { id: 'sage-green', name: 'Sage Green', color: '#d4e2d4' },
  { id: 'olive', name: 'Olive', color: '#a3a058' },
  { id: 'terracotta', name: 'Terracotta', color: '#d2691e' },
  { id: 'blush-pink', name: 'Blush Pink', color: '#f4c2c2' },
  { id: 'lavender', name: 'Lavender', color: '#e6e6fa' },
  { id: 'butter-yellow', name: 'Butter Yellow', color: '#fff8dc' },
  { id: 'taupe', name: 'Taupe', color: '#b8a082' },
  // Textured walls
  { id: 'red-brick', name: 'Red Brick', color: '#8B4513', texture: 'brick' },
  { id: 'exposed-brick', name: 'Exposed Brick', color: '#A0522D', texture: 'brick' },
  { id: 'stone', name: 'Stone', color: '#808080', texture: 'stone' },
  { id: 'wood-panel', name: 'Wood Panel', color: '#8B6914', texture: 'wood-panel' },
  { id: 'concrete-block', name: 'Concrete Block', color: '#999999', texture: 'concrete' },
  { id: 'subway-tile', name: 'Subway Tile', color: '#F0F0F0', texture: 'tile' },
];

export function getMaterial(id: string): FloorMaterial {
  // Handle legacy material IDs
  const legacyMap: Record<string, string> = {
    'hardwood': 'light-oak',
    'tile': 'ceramic-white', 
    'carpet': 'carpet-beige',
    'marble': 'marble-white',
    'light-wood': 'light-oak',
    'dark-wood': 'walnut',
  };
  
  const materialId = legacyMap[id] || id;
  return floorMaterials.find(m => m.id === materialId)
    ?? floorMaterials.find(m => m.id === 'light-oak')!;
}

export function getWallColor(id: string): WallColor {
  // Handle legacy color IDs
  const legacyMap: Record<string, string> = {
    'gray': 'light-gray',
    'beige': 'cream',
    'sage': 'sage-green',
  };
  
  const colorId = legacyMap[id] || id;
  return wallColors.find(c => c.id === colorId) ?? wallColors[0];
}
