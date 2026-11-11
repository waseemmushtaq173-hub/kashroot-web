import { z } from 'zod';
import { Object3D, Group, Material, Mesh } from 'three';

/**
 * Design Registry — Single source of truth for all 3D design types.
 * 
 * Adding a new design type = adding one entry to this registry.
 * Each entry contains:
 *   - zod schema for validation
 *   - default values
 *   - generate() → three.js Group (pure geometry, no side effects)
 *   - summary() → human-readable string with units
 *   - voiceText() → spoken description for accessibility
 */

export type DesignType = 'carton' | 'crate' | 'coldStore' | 'truckLoad' | 'orchardLayout';

export interface DesignRegistryEntry<TParams extends Record<string, unknown>> {
  type: DesignType;
  label: { en: string; hi: string; ur: string; ks: string };
  schema: z.ZodObject<z.ZodRawShape>;
  defaults: TParams;
  /** Generate three.js Group from validated params. Pure function. */
  generate: (params: TParams) => Group;
  /** Human-readable summary with units. */
  summary: (params: TParams) => { en: string; hi: string; ur: string; ks: string };
  /** Spoken description for voice assistant. */
  voiceText: (params: TParams, locale: 'en' | 'hi' | 'ur' | 'ks') => string;
  /** Estimated bounds for camera framing: { width, height, depth } in meters. */
  estimateBounds: (params: TParams) => { width: number; height: number; depth: number };
}

export interface DesignRegistry {
  carton: DesignRegistryEntry<CartonParams>;
  crate: DesignRegistryEntry<CrateParams>;
  coldStore: DesignRegistryEntry<ColdStoreParams>;
  truckLoad: DesignRegistryEntry<TruckLoadParams>;
  orchardLayout: DesignRegistryEntry<OrchardLayoutParams>;
}

/** ============================================================================
 *  PARAMETER SCHEMAS (zod)
 * ============================================================================*/

export const CartonSchema = z.object({
  // Dimensions in mm
  length: z.number().min(100).max(2000).default(400),
  width: z.number().min(50).max(1000).default(300),
  height: z.number().min(50).max(1000).default(200),
  // Flap style
  flapStyle: z.enum(['tuck', 'lock', 'glued', 'stapled']).default('tuck'),
  // Material
  material: z.enum(['corrugated', 'solid', 'kraft']).default('corrugated'),
  ply: z.enum(['3', '5', '7']).default('5'),
  // QR label position
  qrPosition: z.enum(['top', 'side', 'front', 'back']).default('side'),
  // Optional: internal dividers
  dividers: z.number().min(0).max(10).default(0),
});

export type CartonParams = z.infer<typeof CartonSchema>;

export const CrateSchema = z.object({
  // Dimensions in mm
  length: z.number().min(200).max(2000).default(600),
  width: z.number().min(150).max(1500).default(400),
  height: z.number().min(100).max(1500).default(300),
  // Ventilation slots
  slotCount: z.number().min(0).max(50).default(8),
  slotWidth: z.number().min(2).max(20).default(5), // mm
  // Material
  material: z.enum(['plastic', 'wood', 'bamboo']).default('plastic'),
  // Handles
  handles: z.boolean().default(true),
  // Stackable
  stackable: z.boolean().default(true),
});

export type CrateParams = z.infer<typeof CrateSchema>;

export const ColdStoreSchema = z.object({
  // Building dimensions in meters
  buildingLength: z.number().min(5).max(200).default(30),
  buildingWidth: z.number().min(5).max(100).default(20),
  buildingHeight: z.number().min(3).max(20).default(6),
  // Wall insulation
  wallThickness: z.number().min(50).max(300).default(150), // mm
  wallMaterial: z.enum(['puff', 'eps', 'rockwool']).default('puff'),
  // Chambers
  chamberCount: z.number().min(1).max(20).default(4),
  chamberTemp: z.number().min(-30).max(15).default(2), // °C
  // Racks
  rackHeight: z.number().min(1).max(10).default(4), // m
  rackDepth: z.number().min(0.5).max(2).default(1), // m
  aisleWidth: z.number().min(0.8).max(3).default(1.5), // m
  bayWidth: z.number().min(0.8).max(3).default(1.2), // m
  // Door
  doorCount: z.number().min(1).max(10).default(2),
  doorType: z.enum(['hinged', 'sliding', 'rollup']).default('sliding'),
  // Refrigeration
  evaporatorType: z.enum(['ceiling', 'floor', 'wall']).default('ceiling'),
  compressorCount: z.number().min(1).max(10).default(2),
  // Booking data (from Supabase)
  bookedBays: z.array(z.object({
    bayIndex: z.number(),
    chamberIndex: z.number(),
    growerName: z.string(),
    crateCount: z.number(),
    variety: z.string(),
  })).default([]),
});

export type ColdStoreParams = z.infer<typeof ColdStoreSchema>;

export const TruckLoadSchema = z.object({
  // Cargo internal dimensions in meters
  cargoLength: z.number().min(2).max(20).default(8),
  cargoWidth: z.number().min(1).max(3).default(2.4),
  cargoHeight: z.number().min(1).max(3).default(2.5),
  // Box dimensions in mm
  boxLength: z.number().min(100).max(2000).default(400),
  boxWidth: z.number().min(50).max(1000).default(300),
  boxHeight: z.number().min(50).max(1000).default(200),
  // Stacking
  maxStackHeight: z.number().min(1).max(10).default(6), // boxes
  stackPattern: z.enum(['column', 'interlock', 'brick']).default('interlock'),
  // Weight limits
  maxWeightPerBox: z.number().min(1).max(100).default(20), // kg
  truckMaxPayload: z.number().min(500).max(30000).default(9000), // kg
});

export type TruckLoadParams = z.infer<typeof TruckLoadSchema>;

export const OrchardLayoutSchema = z.object({
  // Plot dimensions in meters
  plotLength: z.number().min(10).max(1000).default(100),
  plotWidth: z.number().min(10).max(1000).default(100),
  // Tree spacing
  rowSpacing: z.number().min(1).max(10).default(4), // m
  treeSpacing: z.number().min(0.5).max(5).default(3), // m
  // System
  system: z.enum(['traditional', 'high-density', 'ultra-high-density', 'espalier']).default('high-density'),
  // Variety
  variety: z.string().default('Apple - Delicious'),
  // Irrigation
  irrigation: z.enum(['drip', 'flood', 'sprinkler', 'none']).default('drip'),
  // Boundary
  boundaryOffset: z.number().min(0).max(10).default(2), // m from edge
});

export type OrchardLayoutParams = z.infer<typeof OrchardLayoutSchema>;

/** ============================================================================
 *  HELPER: Material presets
 * ============================================================================*/

import { MeshStandardMaterial, Color, Texture } from 'three';

export const MATERIALS = {
  corrugated: (color = 0x8b7355) => new MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.0,
    side: 2,
  }),
  plastic: (color = 0x4a90d9) => new MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.1,
    side: 2,
  }),
  wood: (color = 0x8b5a2b) => new MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.0,
    side: 2,
  }),
  bamboo: (color = 0xc2b280) => new MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.0,
    side: 2,
  }),
  puff: (color = 0xf5f5f5) => new MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.0,
    side: 2,
  }),
  eps: (color = 0xffffff) => new MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.0,
    side: 2,
  }),
  rockwool: (color = 0xcccccc) => new MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.0,
    side: 2,
  }),
  metal: (color = 0x888888) => new MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.8,
    side: 2,
  }),
  concrete: (color = 0x999999) => new MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.0,
    side: 2,
  }),
  grass: (color = 0x2d5a2d) => new MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.0,
    side: 2,
  }),
  soil: (color = 0x5d4037) => new MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.0,
    side: 2,
  }),
  treeTrunk: (color = 0x4a3728) => new MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.0,
    side: 2,
  }),
  leaves: (color = 0x2d5a2d) => new MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.0,
    side: 2,
    transparent: true,
    opacity: 0.9,
  }),
  apple: (color = 0xc41e3a) => new MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.0,
    side: 2,
  }),
  solid: (color = 0x8b7355) => new MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.0,
    side: 2,
  }),
  kraft: (color = 0x8b7355) => new MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.0,
    side: 2,
  }),
  crate: (color = 0x4a90d9) => new MeshStandardMaterial({
    color,
    roughness: 0.3,
    metalness: 0.1,
    side: 2,
  }),
} as const;

export function getMaterial(key: keyof typeof MATERIALS, color?: number) {
  const materialFn = MATERIALS[key];
  if (!materialFn) {
    console.warn(`Material '${key}' not found, falling back to corrugated`);
    return MATERIALS.corrugated(color);
  }
  return materialFn(color);
}

/** ============================================================================
 *  HELPER: Geometry builders
 * ============================================================================*/

import { BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, BufferGeometry, ExtrudeGeometry, Shape, Vector2, InstancedMesh, Matrix4 } from 'three';

/** Create a box with optional chamfered edges (for crate handles, etc.) */
export function createBox(w: number, h: number, d: number, material: ReturnType<typeof getMaterial>): Mesh {
  const geo = new BoxGeometry(w, h, d);
  return new Mesh(geo, material);
}

/** Create a crate with ventilation slots */
export function createCrate(params: CrateParams): Group {
  const group = new Group();
  const { length, width, height, slotCount, slotWidth, material } = params;
  
  // Convert mm to meters
  const l = length / 1000;
  const w = width / 1000;
  const h = height / 1000;
  const sw = slotWidth / 1000;
  
  const mat = getMaterial(material);
  const wallThickness = 0.02; // 2cm walls
  
  // Bottom
  const bottom = createBox(l, wallThickness, w, mat);
  bottom.position.y = wallThickness / 2;
  group.add(bottom);
  
  // Four walls with slots
  const slotHeight = h - wallThickness;
  const slotSpacing = l / (slotCount + 1);
  
  // Front wall (with slots)
  for (let i = 0; i < slotCount; i++) {
    const slot = createBox(sw, slotHeight, wallThickness, mat);
    slot.position.set(
      -l / 2 + (i + 1) * slotSpacing,
      wallThickness + slotHeight / 2,
      w / 2 - wallThickness / 2
    );
    group.add(slot);
  }
  
  // Back wall (with slots)
  for (let i = 0; i < slotCount; i++) {
    const slot = createBox(sw, slotHeight, wallThickness, mat);
    slot.position.set(
      -l / 2 + (i + 1) * slotSpacing,
      wallThickness + slotHeight / 2,
      -w / 2 + wallThickness / 2
    );
    group.add(slot);
  }
  
  // Side walls (solid)
  const leftWall = createBox(wallThickness, slotHeight, w - 2 * wallThickness, mat);
  leftWall.position.set(-l / 2 + wallThickness / 2, wallThickness + slotHeight / 2, 0);
  group.add(leftWall);
  
  const rightWall = createBox(wallThickness, slotHeight, w - 2 * wallThickness, mat);
  rightWall.position.set(l / 2 - wallThickness / 2, wallThickness + slotHeight / 2, 0);
  group.add(rightWall);
  
  // Top frame (if crate has lid)
  const topFrame = createBox(l, wallThickness, w, mat);
  topFrame.position.y = h - wallThickness / 2;
  group.add(topFrame);
  
  // Handles
  if (params.handles) {
    const handleGeo = new CylinderGeometry(0.015, 0.015, 0.1, 8);
    const handleMat = getMaterial('metal');
    const handlePositions = [
      { x: -l / 2, y: h / 2, z: 0 },
      { x: l / 2, y: h / 2, z: 0 },
    ];
    handlePositions.forEach(pos => {
      const handle = new Mesh(handleGeo, handleMat);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(pos.x, pos.y, pos.z);
      group.add(handle);
    });
  }
  
  return group;
}

/** Create a carton with flaps */
export function createCarton(params: CartonParams): Group {
  const group = new Group();
  const { length, width, height, flapStyle, material, ply } = params;
  
  // Convert mm to meters
  const l = length / 1000;
  const w = width / 1000;
  const h = height / 1000;
  const wallThickness = ply === '7' ? 0.007 : ply === '5' ? 0.005 : 0.003;
  
  const mat = getMaterial(material);
  
  // Main box (bottom + 4 walls)
  const boxGeo = new BoxGeometry(l, h, w);
  const box = new Mesh(boxGeo, mat);
  box.position.y = h / 2;
  group.add(box);
  
  // Flaps based on style
  const flapHeight = h * 0.15;
  const flapMat = getMaterial(material);
  
  if (flapStyle === 'tuck' || flapStyle === 'lock') {
    // Top flaps (4)
    const flapGeo = new BoxGeometry(l, flapHeight, wallThickness);
    const positions = [
      { y: h + flapHeight / 2, z: w / 2, rot: 0 },
      { y: h + flapHeight / 2, z: -w / 2, rot: Math.PI },
      { y: h + flapHeight / 2, x: l / 2, z: 0, rot: Math.PI / 2 },
      { y: h + flapHeight / 2, x: -l / 2, z: 0, rot: -Math.PI / 2 },
    ];
    positions.forEach(p => {
      const flap = new Mesh(flapGeo, flapMat);
      flap.position.set(p.x ?? 0, p.y, p.z ?? 0);
      if (p.rot) flap.rotation.y = p.rot;
      group.add(flap);
    });
  }
  
  // QR code placeholder
  const qrGeo = new BoxGeometry(0.05, 0.001, 0.05);
  const qrMat = new (require('three')).MeshBasicMaterial({ color: 0x000000 });
  const qr = new Mesh(qrGeo, qrMat);
  qr.position.set(0, h / 2, w / 2 + 0.001);
  group.add(qr);
  
  return group;
}

/** Create cold store chamber with racks */
export function createColdStore(params: ColdStoreParams): Group {
  const group = new Group();
  // Implementation would be extensive - using the existing buildStore.ts logic
  // This is a simplified version for the registry
  const { buildingLength, buildingWidth, buildingHeight, chamberCount, rackHeight, aisleWidth, bayWidth, bookedBays } = params;
  
  // Building shell
  const shellGeo = new BoxGeometry(buildingLength, buildingHeight, buildingWidth);
  const shellMat = getMaterial('puff');
  const shell = new Mesh(shellGeo, shellMat);
  shell.position.y = buildingHeight / 2;
  group.add(shell);
  
  // Chambers
  const chamberWidth = buildingWidth / chamberCount;
  for (let ci = 0; ci < chamberCount; ci++) {
    const chamberX = (ci - (chamberCount - 1) / 2) * chamberWidth;
    
    // Racks in chamber
    const bayCount = Math.floor((buildingLength - 2 * params.aisleWidth) / bayWidth);
    for (let bi = 0; bi < bayCount; bi++) {
      const bayX = -buildingLength / 2 + params.aisleWidth + bi * bayWidth + bayWidth / 2;
      
      // Rack
      const rackGeo = new BoxGeometry(bayWidth * 0.9, rackHeight, chamberWidth * 0.8);
      const rackMat = getMaterial('metal');
      const rack = new Mesh(rackGeo, rackMat);
      rack.position.set(bayX, rackHeight / 2, chamberX);
      group.add(rack);
      
      // Highlight booked bays
      const booked = bookedBays.find(b => b.bayIndex === bi && b.chamberIndex === ci);
      if (booked) {
        const highlightGeo = new BoxGeometry(bayWidth * 0.95, rackHeight + 0.1, chamberWidth * 0.85);
        const highlightMat = getMaterial('metal', 0xff6b00);
        highlightMat.transparent = true;
        highlightMat.opacity = 0.3;
        const highlight = new Mesh(highlightGeo, highlightMat);
        highlight.position.set(bayX, rackHeight / 2 + 0.05, chamberX);
        group.add(highlight);
      }
    }
  }
  
  return group;
}

/** Simple grid packing algorithm for truck load */
export function packBoxes(params: TruckLoadParams): { count: number; fillPercent: number; positions: { x: number; y: number; z: number }[] } {
  const { cargoLength, cargoWidth, cargoHeight, boxLength, boxWidth, boxHeight, maxStackHeight, stackPattern } = params;
  
  // Convert mm to meters
  const bl = boxLength / 1000;
  const bw = boxWidth / 1000;
  const bh = boxHeight / 1000;
  
  // Calculate how many boxes fit in each dimension
  const boxesLength = Math.floor(cargoLength / bl);
  const boxesWidth = Math.floor(cargoWidth / bw);
  const boxesHeight = Math.min(maxStackHeight, Math.floor(cargoHeight / bh));
  
  const totalBoxes = boxesLength * boxesWidth * boxesHeight;
  const boxVolume = bl * bw * bh;
  const cargoVolume = cargoLength * cargoWidth * cargoHeight;
  const fillPercent = (totalBoxes * boxVolume) / cargoVolume * 100;
  
  // Generate positions
  const positions: { x: number; y: number; z: number }[] = [];
  for (let l = 0; l < boxesLength; l++) {
    for (let w = 0; w < boxesWidth; w++) {
      for (let h = 0; h < boxesHeight; h++) {
        let x = -cargoLength / 2 + (l + 0.5) * bl;
        let z = -cargoWidth / 2 + (w + 0.5) * bw;
        let y = (h + 0.5) * bh;
        
        // Apply interlock pattern offset
        if (stackPattern === 'interlock' && h % 2 === 1) {
          x += bl * 0.25;
        } else if (stackPattern === 'brick' && h % 2 === 1) {
          x += bl * 0.5;
        }
        
        positions.push({ x, y, z });
      }
    }
  }
  
  return { count: totalBoxes, fillPercent, positions };
}

/** Create truck load visualization */
export function createTruckLoad(params: TruckLoadParams): Group {
  const group = new Group();
  const { cargoLength, cargoWidth, cargoHeight, boxLength, boxWidth, boxHeight } = params;
  
  // Cargo space wireframe
  const cargoGeo = new (require('three')).BoxGeometry(cargoLength, cargoHeight, cargoWidth);
  const cargoMat = new (require('three')).MeshBasicMaterial({ 
    color: 0x888888, 
    wireframe: true, 
    transparent: true, 
    opacity: 0.3 
  });
  const cargo = new Mesh(cargoGeo, cargoMat);
  cargo.position.y = cargoHeight / 2;
  group.add(cargo);
  
  // Pack boxes
  const { positions } = packBoxes(params);
  const bl = boxLength / 1000;
  const bw = boxWidth / 1000;
  const bh = boxHeight / 1000;
  const boxMat = getMaterial('corrugated');
  
  positions.forEach((pos, i) => {
    const boxGeo = new BoxGeometry(bl, bh, bw);
    const box = new Mesh(boxGeo, boxMat);
    box.position.set(pos.x, pos.y, pos.z);
    group.add(box);
  });
  
  return group;
}

/** Create orchard layout with InstancedMesh for trees */
export function createOrchardLayout(params: OrchardLayoutParams): Group {
  const group = new Group();
  const { plotLength, plotWidth, rowSpacing, treeSpacing, system, irrigation } = params;
  
  // Ground
  const groundGeo = new BoxGeometry(plotLength, 0.05, plotWidth);
  const groundMat = getMaterial('soil');
  const ground = new Mesh(groundGeo, groundMat);
  ground.position.y = -0.025;
  group.add(ground);
  
  // Calculate tree positions
  const positions: { x: number; z: number }[] = [];
  const offset = params.boundaryOffset;
  
  const effectiveLength = plotLength - 2 * offset;
  const effectiveWidth = plotWidth - 2 * offset;
  
  const rows = Math.floor(effectiveLength / rowSpacing) + 1;
  const treesPerRow = Math.floor(effectiveWidth / treeSpacing) + 1;
  
  for (let r = 0; r < rows; r++) {
    for (let t = 0; t < treesPerRow; t++) {
      let x = -plotLength / 2 + offset + r * rowSpacing;
      let z = -plotWidth / 2 + offset + t * treeSpacing;
      
      // High-density: stagger rows
      if (system === 'high-density' && r % 2 === 1) {
        x += rowSpacing * 0.5;
      }
      // Ultra-high-density: closer spacing
      if (system === 'ultra-high-density') {
        z += treeSpacing * 0.1;
      }
      
      positions.push({ x, z });
    }
  }
  
  // InstancedMesh for trees
  const treeCount = positions.length;
  const trunkGeo = new CylinderGeometry(0.15, 0.25, 2.5, 8);
  const leavesGeo = new SphereGeometry(1.5, 8, 6);
  
  const trunkMat = getMaterial('treeTrunk');
  const leavesMat = getMaterial('leaves');
  
  const trunks = new InstancedMesh(trunkGeo, trunkMat, treeCount);
  const canopies = new InstancedMesh(leavesGeo, leavesMat, treeCount);
  
  const matrix = new Matrix4();
  const dummy = new (require('three')).Object3D();
  
  positions.forEach((pos, i) => {
    dummy.position.set(pos.x, 1.25, pos.z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    
    dummy.position.set(pos.x, 3.5, pos.z);
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
  });
  
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  
  group.add(trunks);
  group.add(canopies);
  
  // Irrigation lines (if drip)
  if (irrigation === 'drip') {
    const lineMat = new (require('three')).LineBasicMaterial({ color: 0x4a90d9, transparent: true, opacity: 0.5 });
    for (let r = 0; r < rows; r++) {
      const points = positions
        .filter((_, i) => Math.floor(i / treesPerRow) === r)
        .map(p => new (require('three')).Vector3(p.x, 0.05, p.z));
      if (points.length > 1) {
        const lineGeo = new (require('three')).BufferGeometry().setFromPoints(points);
        const line = new (require('three')).Line(lineGeo, lineMat);
        group.add(line);
      }
    }
  }
  
  return group;
}

/** ============================================================================
 *  BOUNDS ESTIMATION
 * ============================================================================*/

export function estimateCartonBounds(params: CartonParams) {
  return {
    width: params.length / 1000,
    height: params.height / 1000,
    depth: params.width / 1000,
  };
}

export function estimateCrateBounds(params: CrateParams) {
  return {
    width: params.length / 1000,
    height: params.height / 1000,
    depth: params.width / 1000,
  };
}

export function estimateColdStoreBounds(params: ColdStoreParams) {
  return {
    width: params.buildingLength,
    height: params.buildingHeight,
    depth: params.buildingWidth,
  };
}

export function estimateTruckLoadBounds(params: TruckLoadParams) {
  return {
    width: params.cargoLength,
    height: params.cargoHeight,
    depth: params.cargoWidth,
  };
}

export function estimateOrchardLayoutBounds(params: OrchardLayoutParams) {
  return {
    width: params.plotLength,
    height: 5, // tree height
    depth: params.plotWidth,
  };
}

/** ============================================================================
 *  SUMMARY & VOICE TEXT
 * ============================================================================*/

export function formatDim(value: number | undefined, unit: string, locale: 'en' | 'hi' | 'ur' | 'ks'): string {
  if (value === undefined || value === null) return `N/A ${unit}`;
  const fmt = locale === 'en' ? value.toLocaleString('en-IN') :
              locale === 'hi' ? value.toLocaleString('hi-IN') :
              locale === 'ur' ? value.toLocaleString('ur-IN') :
              value.toLocaleString('en-IN'); // KS uses Urdu numerals
  return `${fmt} ${unit}`;
}

export function cartonSummary(params: CartonParams) {
  const vol = (params.length * params.width * params.height / 1e9).toFixed(3); // m³
  return {
    en: `Carton ${formatDim(params.length, 'mm', 'en')} × ${formatDim(params.width, 'mm', 'en')} × ${formatDim(params.height, 'mm', 'en')} — Volume ${vol} m³, ${params.material} ${params.ply}-ply, ${params.flapStyle} flap`,
    hi: `कार्टन ${formatDim(params.length, 'मिमी', 'hi')} × ${formatDim(params.width, 'मिमी', 'hi')} × ${formatDim(params.height, 'मिमी', 'hi')} — आयतन ${vol} घन मी, ${params.material} ${params.ply}-प्लाई, ${params.flapStyle} फ्लैप`,
    ur: `کارٹن ${formatDim(params.length, 'ملم', 'ur')} × ${formatDim(params.width, 'ملم', 'ur')} × ${formatDim(params.height, 'ملم', 'ur')} — حجم ${vol} 큼 میٹر، ${params.material} ${params.ply}-پلی، ${params.flapStyle} فلیپ`,
    ks: `کارٹن ${formatDim(params.length, 'ملم', 'ur')} × ${formatDim(params.width, 'ملم', 'ur')} × ${formatDim(params.height, 'ملم', 'ur')} — حجم ${vol} 큼 میٹر، ${params.material} ${params.ply}-پلی، ${params.flapStyle} فلیپ`,
  };
}

export function crateSummary(params: CrateParams) {
  const vol = (params.length * params.width * params.height / 1e9).toFixed(3);
  return {
    en: `Crate ${formatDim(params.length, 'mm', 'en')} × ${formatDim(params.width, 'mm', 'en')} × ${formatDim(params.height, 'mm', 'en')} — Volume ${vol} m³, ${params.material}, ${params.slotCount} vents`,
    hi: `क्रेट ${formatDim(params.length, 'मिमी', 'hi')} × ${formatDim(params.width, 'मिमी', 'hi')} × ${formatDim(params.height, 'मिमी', 'hi')} — आयतन ${vol} घन मी, ${params.material}, ${params.slotCount} वेंट`,
    ur: `کریٹ ${formatDim(params.length, 'ملم', 'ur')} × ${formatDim(params.width, 'ملم', 'ur')} × ${formatDim(params.height, 'ملم', 'ur')} — حجم ${vol} 큼 میٹر، ${params.material}, ${params.slotCount} وینٹ`,
    ks: `کریٹ ${formatDim(params.length, 'ملم', 'ur')} × ${formatDim(params.width, 'ملم', 'ur')} × ${formatDim(params.height, 'ملم', 'ur')} — حجم ${vol} 큼 میٹر، ${params.material}, ${params.slotCount} وینٹ`,
  };
}

export function coldStoreSummary(params: ColdStoreParams) {
  const totalVol = params.buildingLength * params.buildingWidth * params.buildingHeight;
  const bayCount = Math.floor((params.buildingLength - 2 * params.aisleWidth) / params.bayWidth) * params.chamberCount;
  return {
    en: `Cold store ${params.buildingLength}m × ${params.buildingWidth}m × ${params.buildingHeight}m — ${totalVol.toFixed(0)} m³, ${params.chamberCount} chambers @ ${params.chamberTemp}°C, ${bayCount} bays`,
    hi: `कोल्ड स्टोर ${params.buildingLength}मी × ${params.buildingWidth}मी × ${params.buildingHeight}मी — ${totalVol.toFixed(0)} घन मी, ${params.chamberCount} चेंबर @ ${params.chamberTemp}°C, ${bayCount} बे`,
    ur: `کولڈ اسٹور ${params.buildingLength}م × ${params.buildingWidth}م × ${params.buildingHeight}م — ${totalVol.toFixed(0)} 큼 میٹر، ${params.chamberCount} چیمبر @ ${params.chamberTemp}°C، ${bayCount} بے`,
    ks: `کولڈ اسٹور ${params.buildingLength}م × ${params.buildingWidth}م × ${params.buildingHeight}م — ${totalVol.toFixed(0)} 큼 میٹر، ${params.chamberCount} چیمبر @ ${params.chamberTemp}°C، ${bayCount} بے`,
  };
}

export function truckLoadSummary(params: TruckLoadParams) {
  const { count, fillPercent } = packBoxes(params);
  return {
    en: `Truck load ${params.cargoLength}m × ${params.cargoWidth}m × ${params.cargoHeight}m — ${count} boxes (${fillPercent.toFixed(1)}% fill), ${params.stackPattern} stacking`,
    hi: `ट्रक लोड ${params.cargoLength}मी × ${params.cargoWidth}मी × ${params.cargoHeight}मी — ${count} बॉक्स (${fillPercent.toFixed(1)}% भराव), ${params.stackPattern} स्टैकिंग`,
    ur: `ٹرک لوڈ ${params.cargoLength}م × ${params.cargoWidth}م × ${params.cargoHeight}م — ${count} بکس (${fillPercent.toFixed(1)}% بھرائی)، ${params.stackPattern} اسٹیکنگ`,
    ks: `ٹرک لوڈ ${params.cargoLength}م × ${params.cargoWidth}م × ${params.cargoHeight}م — ${count} بکس (${fillPercent.toFixed(1)}% بھرائی)، ${params.stackPattern} اسٹیکنگ`,
  };
}

export function orchardLayoutSummary(params: OrchardLayoutParams) {
  const effectiveLength = params.plotLength - 2 * params.boundaryOffset;
  const effectiveWidth = params.plotWidth - 2 * params.boundaryOffset;
  const rows = Math.floor(effectiveLength / params.rowSpacing) + 1;
  const treesPerRow = Math.floor(effectiveWidth / params.treeSpacing) + 1;
  const totalTrees = rows * treesPerRow;
  const hectares = (params.plotLength * params.plotWidth) / 10000;
  const treesPerHa = Math.round(totalTrees / hectares);
  
  return {
    en: `Orchard ${params.plotLength}m × ${params.plotWidth}m (${hectares.toFixed(2)} ha) — ${rows} rows × ${treesPerRow} trees = ${totalTrees} trees (${treesPerHa}/ha), ${params.system}`,
    hi: `बाग ${params.plotLength}मी × ${params.plotWidth}मी (${hectares.toFixed(2)} हेक्टर) — ${rows} पंक्तियाँ × ${treesPerRow} पेड़ = ${totalTrees} पेड़ (${treesPerHa}/हेक्टेयर), ${params.system}`,
    ur: `باغ ${params.plotLength}م × ${params.plotWidth}م (${hectares.toFixed(2)} ہیکٹر) — ${rows} قطاریں × ${treesPerRow} درخت = ${totalTrees} درخت (${treesPerHa}/ہیکٹر)، ${params.system}`,
    ks: `باغ ${params.plotLength}م × ${params.plotWidth}م (${hectares.toFixed(2)} ہیکٹر) — ${rows} قطاریں × ${treesPerRow} درخت = ${totalTrees} درخت (${treesPerHa}/ہیکٹر)، ${params.system}`,
  };
}

export function cartonVoiceText(params: CartonParams, locale: 'en' | 'hi' | 'ur' | 'ks') {
  const texts = {
    en: `Carton ${params.length} by ${params.width} by ${params.height} millimeters. ${params.material} ${params.ply} ply. ${params.flapStyle} flap. QR code on ${params.qrPosition}.`,
    hi: `कार्टन ${params.length} गुणा ${params.width} गुणा ${params.height} मिलीमीटर। ${params.material} ${params.ply} प्लाई। ${params.flapStyle} फ्लैप। क्यूआर कोड ${params.qrPosition} पर।`,
    ur: `کارٹن ${params.length} ضرب ${params.width} ضرب ${params.height} ملے میٹر۔ ${params.material} ${params.ply} پلی۔ ${params.flapStyle} فلیپ۔ کью آر کوڈ ${params.qrPosition} پر۔`,
    ks: `کارٹن ${params.length} ضرب ${params.width} ضرب ${params.height} ملے میٹر۔ ${params.material} ${params.ply} پلی۔ ${params.flapStyle} فلیپ۔ کью آر کوڈ ${params.qrPosition} تی।`,
  };
  return texts[locale];
}

export function crateVoiceText(params: CrateParams, locale: 'en' | 'hi' | 'ur' | 'ks') {
  const texts = {
    en: `Crate ${params.length} by ${params.width} by ${params.height} millimeters. ${params.material} material. ${params.slotCount} ventilation slots. ${params.handles ? 'Has handles.' : 'No handles.'} ${params.stackable ? 'Stackable.' : 'Not stackable.'}`,
    hi: `क्रेट ${params.length} गुणा ${params.width} गुणा ${params.height} मिलीमीटर। ${params.material} सामग्री। ${params.slotCount} वेंटिलेशन स्लॉट। ${params.handles ? 'हैंडल हैं।' : 'हैंडल नहीं हैं।'} ${params.stackable ? 'स्टैकेबल।' : 'स्टैकेबल नहीं।'}`,
    ur: `کریٹ ${params.length} ضرب ${params.width} ضرب ${params.height} ملے میٹر۔ ${params.material} مواد۔ ${params.slotCount} وینٹلیشن سلوٹ۔ ${params.handles ? 'ہینڈل ہیں۔' : 'ہینڈل نہیں ہیں۔'} ${params.stackable ? 'اسٹیکبل۔' : 'اسٹیکبل نہیں۔'}`,
    ks: `کریٹ ${params.length} ضرب ${params.width} ضرب ${params.height} ملے میٹر۔ ${params.material} مواد۔ ${params.slotCount} وینٹلیشن سلوٹ۔ ${params.handles ? 'ہینڈل چھُس۔' : 'ہینڈل نہٕی چھُس۔'} ${params.stackable ? 'اسٹیکبل چھُس۔' : 'اسٹیکبل نہٕی چھُس۔'}`,
  };
  return texts[locale];
}

export function coldStoreVoiceText(params: ColdStoreParams, locale: 'en' | 'hi' | 'ur' | 'ks') {
  const texts = {
    en: `Cold store ${params.buildingLength} by ${params.buildingWidth} by ${params.buildingHeight} meters. ${params.chamberCount} chambers at ${params.chamberTemp} degrees Celsius. ${params.wallThickness} millimeter ${params.wallMaterial} insulation.`,
    hi: `कोल्ड स्टोर ${params.buildingLength} गुणा ${params.buildingWidth} गुणा ${params.buildingHeight} मीटर। ${params.chamberCount} चेंबर ${params.chamberTemp} डिग्री सेल्सियस पर। ${params.wallThickness} मिलीमीटर ${params.wallMaterial} इन्सुलेशन।`,
    ur: `کولڈ اسٹور ${params.buildingLength} ضرب ${params.buildingWidth} ضرب ${params.buildingHeight} میٹر۔ ${params.chamberCount} چیمبر ${params.chamberTemp} ڈگری سیلسیس پر۔ ${params.wallThickness} ملے میٹر ${params.wallMaterial} ان슐یشن۔`,
    ks: `کولڈ اسٹور ${params.buildingLength} ضرب ${params.buildingWidth} ضرب ${params.buildingHeight} میٹر۔ ${params.chamberCount} چیمبر ${params.chamberTemp} ڈگری سیلسیس تہٕ۔ ${params.wallThickness} ملے میٹر ${params.wallMaterial} ان슐یشن۔`,
  };
  return texts[locale];
}

export function truckLoadVoiceText(params: TruckLoadParams, locale: 'en' | 'hi' | 'ur' | 'ks') {
  const { count, fillPercent } = packBoxes(params);
  const texts = {
    en: `Truck cargo ${params.cargoLength} by ${params.cargoWidth} by ${params.cargoHeight} meters. Fits ${count} boxes at ${fillPercent.toFixed(1)} percent fill. ${params.stackPattern} stacking pattern.`,
    hi: `ट्रक कार्गो ${params.cargoLength} गुणा ${params.cargoWidth} गुणा ${params.cargoHeight} मीटर। ${count} बॉक्स ${fillPercent.toFixed(1)} प्रतिशत भराव पर। ${params.stackPattern} स्टैकिंग पैटर्न।`,
    ur: `ٹرک کارگو ${params.cargoLength} ضرب ${params.cargoWidth} ضرب ${params.cargoHeight} میٹر۔ ${count} بکس ${fillPercent.toFixed(1)} فیصد بھرائی پر۔ ${params.stackPattern} اسٹیکنگ پیٹرن۔`,
    ks: `ٹرک کارگو ${params.cargoLength} ضرب ${params.cargoWidth} ضرب ${params.cargoHeight} میٹر۔ ${count} بکس ${fillPercent.toFixed(1)} فیصد بھرائی تہٕ۔ ${params.stackPattern} اسٹیکنگ پیٹرن۔`,
  };
  return texts[locale];
}

export function orchardLayoutVoiceText(params: OrchardLayoutParams, locale: 'en' | 'hi' | 'ur' | 'ks') {
  const effectiveLength = params.plotLength - 2 * params.boundaryOffset;
  const effectiveWidth = params.plotWidth - 2 * params.boundaryOffset;
  const rows = Math.floor(effectiveLength / params.rowSpacing) + 1;
  const treesPerRow = Math.floor(effectiveWidth / params.treeSpacing) + 1;
  const totalTrees = rows * treesPerRow;
  
  const texts = {
    en: `Orchard ${params.plotLength} by ${params.plotWidth} meters. ${rows} rows spaced ${params.rowSpacing} meters. ${treesPerRow} trees per row at ${params.treeSpacing} meters. Total ${totalTrees} trees. ${params.system} system. ${params.irrigation} irrigation.`,
    hi: `बाग ${params.plotLength} गुणा ${params.plotWidth} मीटर। ${rows} पंक्तियाँ ${params.rowSpacing} मीटर पर। ${treesPerRow} पेड़ प्रति पंक्ति ${params.treeSpacing} मीटर पर। कुल ${totalTrees} पेड़। ${params.system} सिस्टम। ${params.irrigation} सिंचाई।`,
    ur: `باغ ${params.plotLength} ضرب ${params.plotWidth} میٹر۔ ${rows} قطاریں ${params.rowSpacing} میٹر پر۔ ${treesPerRow} درخت فی قطار ${params.treeSpacing} میٹر پر۔ کل ${totalTrees} درخت۔ ${params.system} سسٹم۔ ${params.irrigation} آبپاشی۔`,
    ks: `باغ ${params.plotLength} ضرب ${params.plotWidth} میٹر۔ ${rows} قطاریں ${params.rowSpacing} میٹر تہٕ۔ ${treesPerRow} درخت فی قطار ${params.treeSpacing} میٹر تہٕ۔ کل ${totalTrees} درخت۔ ${params.system} سسٹم۔ ${params.irrigation} آبپاشی۔`,
  };
  return texts[locale];
}