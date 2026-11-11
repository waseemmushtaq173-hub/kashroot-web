/**
 * The 3D store built from the scene (three/storeScene), in metres:
 *
 *   shell   the building with its roof off and its front wall see-through, the
 *           main door where the owner measured it, every chamber with its
 *           insulated walls and its own door, the floors inside a chamber as
 *           steel grating decks, walkways, row numbers;
 *   places  every place on every floor: a stack of wooden bins (slats and a
 *           pallet base), plastic crates or apple boxes, as many high as the
 *           store stacks them — booked stacks stand full, an empty place is a
 *           faint outline of the stack that fits there, a coloured mark on the
 *           floor says what each place is (components/rental/placeLook).
 *
 * Stacks are instanced (one draw for all stacks of the same height), so a
 * store with thousands of bins stays smooth. three.js is passed in — it is
 * loaded only when the 3D view opens.
 */
import { PLACE_LOOK, type Look } from '@/components/rental/placeLook';
import { binTexture, cartonTexture, concreteTexture, crateTexture, fanTexture, ghostTexture, gratingTexture, labelCanvas, panelTexture, plateTexture } from '@/components/rental/three/textures';
import type { Route } from '@/components/rental/walk/route';
import { buildFixtures } from '@/components/rental/three/fixtures';
import type { ColdKitGeos } from '@/components/rental/three/coldKit';
import { type Kind, midOf, type Rect, rowPlates, type SceneZone, type Seg, segLength, type StoreScene, ZONE_LOOK } from '@/components/rental/three/storeScene';
import { DOOR_KIND_TEXT, countText } from '@/lib/coldStore';
import { showLength } from '@/lib/coldLayout';

type Three = typeof import('three');
type Obj = InstanceType<Three['Object3D']>;
type Mesh = InstanceType<Three['Mesh']>;
type IMesh = InstanceType<Three['InstancedMesh']>;
type Geo = import('three').BufferGeometry;
type Mat = InstanceType<Three['Material']>;
type Tex = InstanceType<Three['Texture']>;

/** One place to draw, with what it is for the months looked at. */
export interface Cell {
  chamber: number;
  floor: number;
  place: number;
  row: number;
  col: number;
  slot: string;
  look: Look;
  /** Bins / crates / boxes that still fit on it, and how full it is (0–1). */
  free: number;
  full: number;
}

/** World position: x along the front, z towards the viewer (the front), y up; centred on the store. */
export interface Origin {
  ox: number;
  oy: number;
}
export const wx = (o: Origin, x: number) => x - o.ox;
export const wz = (o: Origin, y: number) => o.oy - y;

/** What a stack of places is drawn as: bins, crates, or paper cartons. */
export type StackKind = 'bin' | 'crate' | 'carton';

/** Materials, textures and shapes shared by everything drawn (made once per 3D view). */
export interface Kit {
  T: Three;
  unitBox: Geo;
  /** One level of the drawn look per unit of height (`kind`: which proto the Blender kit lends its slats). */
  stackGeo: (units: number, kind?: StackKind) => Geo;
  /** The Blender kit's squeezed protos (null when the kit GLB did not load this session). */
  protos: ColdKitGeos | null;
  /** `wall` / `chamberWall` solid, `wallNear` / `chamberNear` see-through (the walls between the camera and the inside). */
  mats: Record<
    | 'bin' | 'crate' | 'carton' | 'ghostOn' | 'tile' | 'hall' | 'yard' | 'apron' | 'walk' | 'passage' | 'stripe' | 'chamberFloor' | 'wall' | 'wallNear' | 'chamberWall' | 'chamberNear' | 'door' | 'leaf' | 'deck' | 'beam' | 'glass' | 'hit' | 'shutter'
    // The machines and fittings (three/fixtures).
    | 'ceiling' | 'roof' | 'lamp' | 'cooler' | 'fan' | 'guard' | 'pipe' | 'copper' | 'curtain' | 'condenser',
    Mat
  >;
  edge: InstanceType<Three['LineBasicMaterial']>;
  edgeOn: InstanceType<Three['LineBasicMaterial']>;
  textures: Tex[];
  dispose: () => void;
}

/** The drawn look: the side of every stack shows one bin per unit of height; the top shows the top (two halves of one picture). */
function drawnStackGeo(T: Three, units: number): Geo {
  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  const I: number[] = [];
  const face = (a: number[], b: number[], c: number[], d: number[], n: number[], uv: number[][]) => {
    const i = P.length / 3;
    for (const p of [a, b, c, d]) P.push(...p);
    for (let k = 0; k < 4; k++) N.push(...n);
    for (const t of uv) U.push(...t);
    I.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const s = [[0.01, 0], [0.49, 0], [0.49, units], [0.01, units]];
  const h = 0.5;
  face([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], [0, 0, 1], s);
  face([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], [0, 0, -1], s);
  face([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], [1, 0, 0], s);
  face([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], [-1, 0, 0], s);
  face([-h, 1, h], [h, 1, h], [h, 1, -h], [-h, 1, -h], [0, 1, 0], [[0.51, 0.01], [0.99, 0.01], [0.99, 0.99], [0.51, 0.99]]);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.userData.stack = true;
  return g;
}

/**
 * The Blender kit's real slatted shape, one proto per unit of height: the
 * proto (squeezed into the unit cube) copies into each level slab of
 * [0..1], stacked `units` high, with the drawn look's own UV rule so the
 * texture, the per-instance colours and all the level slicing stay true.
 * Sides sample u 0.01–0.49 with v = level + the proto height; the top strip
 * stays u 0.51–0.99.
 */
function slattedStackGeo(T: Three, units: number, proto: Geo): Geo {
  const pa = proto.getAttribute('position') as import('three').BufferAttribute;
  const na = proto.getAttribute('normal') as import('three').BufferAttribute | undefined;
  if (!pa) return drawnStackGeo(T, units);
  const idx = proto.getIndex();
  const faceIdx = idx ? Array.from(idx.array as ArrayLike<number>) : Array.from({ length: pa.count }, (_, i) => i);
  const P: number[] = [];
  const N: number[] = [];
  const U: number[] = [];
  const I: number[] = [];
  const topStrip = (px: number, pz: number) => U.push(0.51 + 0.48 * px, 0.01 + 0.98 * pz);
  for (let lv = 0; lv < units; lv++) {
    const base = P.length / 3;
    for (let i = 0; i < pa.count; i++) {
      const px = pa.getX(i);
      const py = pa.getY(i);
      const pz = pa.getZ(i);
      const nx = na ? na.getX(i) : 0;
      const ny = na ? na.getY(i) : 0;
      const nz = na ? na.getZ(i) : 0;
      P.push(px, (py + lv) / units, pz);
      N.push(nx, ny, nz);
      if (Math.abs(ny) > 0.55) topStrip(px, pz);
      else U.push(0.01 + 0.48 * (Math.abs(nx) > Math.abs(nz) ? pz : px), lv + py);
    }
    for (const j of faceIdx) I.push(j + base);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  if (!na) g.computeVertexNormals();
  g.userData.stack = true;
  return g;
}

export function makeKit(T: Three, phone: boolean, protos: ColdKitGeos | null = null): Kit {
  const tex = { bin: binTexture(T), crate: crateTexture(T), carton: cartonTexture(T), ghost: ghostTexture(T), concrete: concreteTexture(T), grating: gratingTexture(T), panel: panelTexture(T), fan: fanTexture(T) };
  if (phone) for (const t of Object.values(tex)) t.anisotropy = 1;
  const unitBox = new T.BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0);
  const geos = new Map<string, Geo>();
  const forKind = (kind?: StackKind): Geo | null => (!protos || !kind || kind === 'carton' ? null : kind === 'bin' ? protos.bin : protos.crate);
  const stackGeo = (units: number, kind?: StackKind) => {
    const proto = forKind(kind);
    const key = `${proto ? 'slat' : 'draw'}:${kind ?? ''}:${units}`;
    let g = geos.get(key);
    if (!g) {
      g = proto ? slattedStackGeo(T, units, proto) : drawnStackGeo(T, units);
      geos.set(key, g);
    }
    return g;
  };
  const see = { transparent: true, depthWrite: false, side: T.DoubleSide } as const;
  // Painted steel and galvanised racks read by their reflections. The
  // environment map is a desktop thing, so on a phone metals stay low —
  // without it they would sit dark under the two lights.
  const galv = phone ? 0.25 : 0.55;
  const paint = phone ? 0.06 : 0.14;
  const mats = {
    bin: new T.MeshStandardMaterial({ map: tex.bin, roughness: 0.82 }),
    crate: new T.MeshStandardMaterial({ map: tex.crate, roughness: 0.5, metalness: 0.04 }),
    carton: new T.MeshStandardMaterial({ map: tex.carton, roughness: 0.9 }),
    // A place being chosen or waiting for payment: the outline of the stack that fits there (front faces only).
    ghostOn: new T.MeshBasicMaterial({ map: tex.ghost, ...see, side: T.FrontSide, opacity: 0.88 }),
    tile: new T.MeshBasicMaterial({ color: '#ffffff' }),
    hall: new T.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95 }),
    yard: new T.MeshStandardMaterial({ color: '#d9e4d3', roughness: 1 }),
    apron: new T.MeshStandardMaterial({ color: '#b8c0c8', roughness: 1 }),
    walk: new T.MeshStandardMaterial({ color: '#fcd34d', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }),
    passage: new T.MeshStandardMaterial({ color: '#fde68a', roughness: 1, transparent: true, opacity: 0.45, depthWrite: false }),
    stripe: new T.MeshStandardMaterial({ color: '#eab308', roughness: 0.8 }),
    chamberFloor: new T.MeshStandardMaterial({ map: tex.concrete, color: '#eef3f8', roughness: 0.85 }),
    wall: new T.MeshStandardMaterial({ map: tex.panel, color: '#e2e8f0', roughness: 0.78, metalness: 0.05 }),
    wallNear: new T.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.78, metalness: 0.05, ...see, opacity: 0.12 }),
    chamberWall: new T.MeshStandardMaterial({ map: tex.panel, roughness: 0.52, metalness: 0.05 }),
    chamberNear: new T.MeshStandardMaterial({ map: tex.panel, roughness: 0.52, metalness: 0.05, ...see, opacity: 0.22 }),
    door: new T.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.45, metalness: paint }),
    leaf: new T.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.42, metalness: 0.04 }),
    deck: new T.MeshStandardMaterial({ map: tex.grating, roughness: 0.45, ...see, opacity: 1, metalness: phone ? 0.15 : 0.4 }),
    beam: new T.MeshStandardMaterial({ color: '#1e5a8c', roughness: 0.42, metalness: galv }),
    glass: new T.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0ea5e9', emissiveIntensity: 0.25, transparent: true, opacity: 0.7, roughness: 0.2 }),
    hit: new T.MeshBasicMaterial({ visible: false }),
    shutter: new T.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.35, metalness: phone ? 0.35 : 0.7 }),
    ceiling: new T.MeshStandardMaterial({ map: tex.panel, color: '#f8fafc', roughness: 0.7, side: T.DoubleSide }),
    roof: new T.MeshStandardMaterial({ color: '#c9d1da', roughness: 0.9, side: T.DoubleSide }),
    // LED lights glow: they are not lit by anything.
    lamp: new T.MeshBasicMaterial({ color: '#fbfdff' }),
    cooler: new T.MeshStandardMaterial({ color: '#e8edf2', roughness: 0.35, metalness: phone ? 0.15 : 0.4 }),
    fan: new T.MeshStandardMaterial({ map: tex.fan, roughness: 0.5 }),
    guard: new T.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.3, metalness: phone ? 0.4 : 0.75 }),
    pipe: new T.MeshStandardMaterial({ color: '#1f2937', roughness: 0.95 }),
    copper: new T.MeshStandardMaterial({ color: '#b87333', roughness: 0.28, metalness: phone ? 0.5 : 0.75 }),
    curtain: new T.MeshStandardMaterial({ color: '#cbe8f6', transparent: true, opacity: 0.3, roughness: 0.15, depthWrite: false, side: T.DoubleSide }),
    condenser: new T.MeshStandardMaterial({ color: '#d5dbe2', roughness: 0.38, metalness: phone ? 0.2 : 0.5 }),
  };
  const edge = new T.LineBasicMaterial({ color: '#334155', transparent: true, opacity: 0.55 });
  const edgeOn = new T.LineBasicMaterial({ color: '#0284c7' });
  const textures = Object.values(tex);
  return {
    T,
    unitBox,
    stackGeo,
    protos,
    mats,
    edge,
    edgeOn,
    textures,
    dispose: () => {
      unitBox.dispose();
      for (const g of geos.values()) g.dispose();
      if (protos) for (const g of Object.values(protos)) g.dispose();
      for (const m of Object.values(mats)) m.dispose();
      edge.dispose();
      edgeOn.dispose();
      for (const t of textures) t.dispose();
    },
  };
}

/**
 * Re-slice one instanced mesh in place: the kept instances are copied to the
 * front (three.js draws only the first `count` of them), their matrices and
 * colours put back from the ones it was built with — or tinted darker when
 * `tint` says so. Done per change of the floor filter or the grower
 * highlight, never per frame, and with no allocations.
 */
function sliceMesh<T>(o: {
  mesh: IMesh;
  /** One entry per instance, in instance order (carries its cell). */
  rows: T[];
  cellsOf: (r: T) => Cell | null;
  /** The stored floor number of a cell (-99 when a place has none). */
  label: (c: Cell | null) => number;
  floor: number | 'all';
  baseM: Float32Array;
  baseC: Float32Array | null;
  /** 0–1: how much darker this instance is drawn against its built colour (null: as was). */
  tint: (r: T) => number | null;
  col: import('three').Color;
}): void {
  const keep: number[] = [];
  for (let i = 0; i < o.rows.length; i++) {
    const c = o.cellsOf(o.rows[i]);
    if (o.floor === 'all' || o.label(c) === o.floor) keep.push(i);
  }
  const m = o.mesh.instanceMatrix.array as Float32Array;
  for (let k = 0; k < keep.length; k++) {
    const i = keep[k];
    m.set(o.baseM.subarray(i * 16, i * 16 + 16), k * 16);
  }
  o.mesh.count = keep.length;
  o.mesh.instanceMatrix.needsUpdate = true;
  if (o.baseC && o.mesh.instanceColor) {
    const cc = o.mesh.instanceColor.array as Float32Array;
    for (let k = 0; k < keep.length; k++) {
      const i = keep[k];
      cc.set(o.baseC.subarray(i * 3, i * 3 + 3), k * 3);
      const t = o.tint(o.rows[i]);
      if (t !== null) {
        o.col.setRGB(cc[k * 3], cc[k * 3 + 1], cc[k * 3 + 2]).multiplyScalar(t);
        cc[k * 3] = o.col.r;
        cc[k * 3 + 1] = o.col.g;
        cc[k * 3 + 2] = o.col.b;
      }
    }
    o.mesh.instanceColor.needsUpdate = true;
  }
  o.mesh.computeBoundingSphere();
}

/** Free everything a group made for itself (not the kit's shared parts). */
export function disposeGroup(T: Three, kit: Kit, g: Obj) {
  const shared = new Set<unknown>([...Object.values(kit.mats), kit.edge, kit.edgeOn, kit.unitBox]);
  g.traverse((o) => {
    // An instanced mesh's own per-instance data; its shape and look below, unless shared.
    if (o instanceof T.InstancedMesh) o.dispose();
    const m = o as unknown as { geometry?: Geo; material?: Mat & { map?: Tex | null } };
    // Sprites share one shape inside three.js; stack shapes belong to the kit.
    if (m.geometry && !shared.has(m.geometry) && !(o instanceof T.Sprite) && m.geometry.userData.stack !== true) m.geometry.dispose();
    if (m.material && !shared.has(m.material)) {
      m.material.map?.dispose();
      m.material.dispose();
    }
  });
}

/**
 * A sprite label facing the camera, `width` metres wide — never shown
 * smaller than `minPx` pixels high or bigger than `maxPx` (0: as it falls),
 * so a chamber's name stays readable from far away (see sizeLabels).
 */
export function label(T: Three, title: string, sub: string, width: number, dark = false, minPx = 0, maxPx = 0, fill?: string) {
  const c = labelCanvas(title, sub, dark, fill);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const h = (width * c.height) / c.width;
  s.scale.set(width, h, 1);
  s.renderOrder = 10;
  s.userData.label = { w: width, h, minPx, maxPx };
  return s;
}

/** Keep labels between their smallest and biggest size on screen (`px`: metres per pixel at 1 m away). */
export function sizeLabels(labels: InstanceType<Three['Sprite']>[], camera: InstanceType<Three['Camera']>, px: number) {
  for (const s of labels) {
    const l = s.userData.label as { w: number; h: number; minPx: number; maxPx: number } | undefined;
    if (!l || (!l.minPx && !l.maxPx)) continue;
    // The store's groups stand at the world's origin, so a label's position is where it is.
    const per = camera.position.distanceTo(s.position) * px;
    let h = l.h;
    if (l.minPx) h = Math.max(h, l.minPx * per);
    if (l.maxPx) h = Math.min(h, l.maxPx * per);
    s.scale.set((h * l.w) / l.h, h, 1);
  }
}

/** Repeat a texture every `every` metres across a box face. */
function tile(geo: Geo, su: number, sv: number) {
  const uv = geo.getAttribute('uv') as import('three').BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}

export interface Shell {
  group: Obj;
  /** Invisible boxes, one per chamber, to tap a chamber. */
  hits: Mesh[];
  /** Each chamber's outline (to show the open one). */
  outlines: InstanceType<Three['LineSegments']>[];
  /**
   * Every wall, with which way it faces out (userData.out, world x and z)
   * and whose it is (userData.of: 'hall' | 'chamber'): from outside the ones
   * facing the camera turn see-through; walking, all look solid.
   */
  walls: Mesh[];
  /** Labels kept readable at any distance. */
  labels: InstanceType<Three['Sprite']>[];
  /** Ceilings, the roof and the lights under them: shown only when walking (from outside the roof is off). */
  walkOnly: Obj;
}

/** Make the walls between the camera and the inside see-through (orbit), or every wall solid (walk). In x-ray mode every wall turns glass at once, whatever the eye does. */
export function faceWalls(kit: Kit, walls: Mesh[], eye: { x: number; z: number } | null, xray = false) {
  for (const m of walls) {
    const out = m.userData.out as { x: number; z: number } | undefined;
    const hall = m.userData.of === 'hall';
    let near = false;
    if (xray) near = true;
    else if (eye && out) {
      const c = m.userData.mid as { x: number; z: number };
      near = (eye.x - c.x) * out.x + (eye.z - c.z) * out.z > 0;
    }
    const mat = hall ? (near ? kit.mats.wallNear : kit.mats.wall) : near ? kit.mats.chamberNear : kit.mats.chamberWall;
    if (m.material !== mat) m.material = mat;
  }
}

/** Everything that does not change while farmers choose places. */
export function buildShell(kit: Kit, scene: StoreScene, o: Origin): Shell {
  const { T, mats } = kit;
  const group = new T.Group();
  const hits: Mesh[] = [];
  const outlines: Shell['outlines'] = [];
  const walls: Mesh[] = [];
  const labels: Shell['labels'] = [];
  const add = (m: Obj) => (group.add(m), m);
  // Every row's number plate (storeScene rowPlates): a yellow plate on a slim steel post at the row's aisle end.
  const plates = rowPlates(scene);
  const postGeo = new T.BoxGeometry(0.04, 1, 0.04);
  const plateGeo = new T.PlaneGeometry(0.42, 0.26);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: Mat) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  /** A rectangle on the ground (building frame) as a thin slab. */
  const slab = (r: Rect, y: number, t: number, mat: Mat, every = 0) => {
    const g = new T.BoxGeometry(r.w, t, r.d);
    if (every) tile(g, r.w / every, r.d / every);
    const m = new T.Mesh(g, mat);
    m.position.set(wx(o, r.x + r.w / 2), y - t / 2, wz(o, r.y + r.d / 2));
    group.add(m);
    return m;
  };
  /** A wall along a line, from `y0` up to `y1`. */
  const wallOn = (s: Seg, y0: number, y1: number, t: number, mat: Mat, panels = 0) => {
    const len = segLength(s);
    if (len < 0.02 || y1 - y0 < 0.02) return null;
    const along = Math.abs(s.y2 - s.y1) < 1e-6;
    const g = new T.BoxGeometry(along ? len : t, y1 - y0, along ? t : len);
    if (panels) tile(g, len / panels, (y1 - y0) / (panels * 2));
    const m = new T.Mesh(g, mat);
    const c = midOf(s);
    m.position.set(wx(o, c.x), (y0 + y1) / 2, wz(o, c.y));
    group.add(m);
    return m;
  };
  /** A wall of the room `r` (hall or chamber): it faces out, away from the room's middle. */
  const roomWall = (s: Seg, y0: number, y1: number, t: number, r: Rect, of: 'hall' | 'chamber') => {
    const m = wallOn(s, y0, y1, t, of === 'hall' ? mats.wall : mats.chamberWall, of === 'hall' ? 2.4 : 1.15);
    if (!m) return null;
    const c = midOf(s);
    const along = Math.abs(s.y2 - s.y1) < 1e-6;
    const ny = along ? Math.sign(c.y - (r.y + r.d / 2)) || 1 : 0;
    const nx = along ? 0 : Math.sign(c.x - (r.x + r.w / 2)) || 1;
    m.userData.out = { x: nx, z: -ny };
    m.userData.mid = { x: wx(o, c.x), z: wz(o, c.y) };
    m.userData.of = of;
    walls.push(m);
    return m;
  };

  // The ground: a yard round the building, the building's concrete floor, an apron in front of the main door.
  const b = scene.bounds;
  const pad = Math.max(12, Math.max(b.w, b.d) * 0.35);
  slab({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, d: b.d + 2 * pad }, -0.03, 0.04, mats.yard);
  slab(scene.hall, 0, 0.05, mats.hall, 4);
  // The passage from the main door: painted on the floor between two yellow lines.
  const pass = scene.passage;
  if (pass) {
    slab(pass, 0.008, 0.006, mats.passage);
    const t = 0.12;
    const upright = pass.d >= pass.w;
    for (const r of upright
      ? [{ x: pass.x, y: pass.y, w: t, d: pass.d }, { x: pass.x + pass.w - t, y: pass.y, w: t, d: pass.d }]
      : [{ x: pass.x, y: pass.y, w: pass.w, d: t }, { x: pass.x, y: pass.y + pass.d - t, w: pass.w, d: t }])
      slab(r, 0.012, 0.01, mats.stripe);
  }
  const md = scene.mainDoor;
  if (md) {
    const n = md.inward;
    const depth = 6;
    const w = md.width + 4;
    const r: Rect =
      n.y !== 0
        ? { x: md.mid.x - w / 2, y: n.y > 0 ? md.mid.y - depth : md.mid.y, w, d: depth }
        : { x: n.x > 0 ? md.mid.x - depth : md.mid.x, y: md.mid.y - w / 2, w: depth, d: w };
    slab(r, -0.005, 0.03, mats.apron);
  }

  // The building: its walls (the ones facing the camera turn see-through), the main door as the owner says it opens.
  if (scene.building) {
    const H = scene.building.height;
    // The owner's insulated wall thickness (a store measured before it was
    // asked: the usual 25 cm panel).
    const wallT = scene.building.wallThickness ?? 0.25;
    for (const s of scene.walls) roomWall(s, 0, H, wallT, scene.hall, 'hall');
    const outline = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(scene.hall.w, H, scene.hall.d)), kit.edge);
    outline.position.set(wx(o, scene.hall.w / 2), H / 2, wz(o, scene.hall.d / 2));
    add(outline);
    // The building's measurements, written the way the owner reads them:
    // length along the front, width front to back, height to the roof —
    // in the owner's own unit, on the grown shell the drawing encloses.
    const u = scene.building.unit;
    const dim = (title: string, sub: string, width: number) => {
      const t = label(T, title, sub, width, true, 24, 60);
      labels.push(t);
      add(t);
      return t;
    };
    dim(showLength(scene.building.length, u), 'Length (along the front)', Math.min(6, Math.max(3, scene.hall.w * 0.3))).position.set(wx(o, scene.hall.w / 2), 0.5, wz(o, -2.4));
    dim(showLength(scene.building.width, u), 'Width (front to back)', Math.min(4, Math.max(2.6, scene.hall.d * 0.25))).position.set(wx(o, -2.4), 0.5, wz(o, scene.hall.d / 2));
    dim(showLength(H, u), 'Height (to the roof)', Math.min(3.6, Math.max(2.4, H * 0.35))).position.set(wx(o, -1.8), H * 0.55, wz(o, -1.8));
    if (md) {
      roomWall(md.seg, md.height, H, wallT, scene.hall, 'hall');
      const along = md.wall === 'front' || md.wall === 'back';
      for (const end of [{ x: md.seg.x1, y: md.seg.y1 }, { x: md.seg.x2, y: md.seg.y2 }]) box(0.3, md.height, 0.3, wx(o, end.x), md.height / 2, wz(o, end.y), mats.door);
      box(along ? md.width + 0.3 : 0.3, 0.3, along ? 0.3 : md.width + 0.3, wx(o, md.mid.x), md.height + 0.15, wz(o, md.mid.y), mats.door);
      const kind = md.kind ?? 'roll-up';
      if (kind === 'roll-up') {
        // A roll-up door: its shutter wound on the roller over the opening.
        const roll = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, md.width, 20), mats.shutter);
        roll.rotation.set(along ? 0 : Math.PI / 2, 0, along ? Math.PI / 2 : 0);
        roll.position.set(wx(o, md.mid.x - md.inward.x * 0.45), md.height + 0.5, wz(o, md.mid.y - md.inward.y * 0.45));
        add(roll);
      } else {
        // A sliding door: the insulated leaf pushed open along the wall —
        // outside the wall (Outside sliding) or just inside it (Inside
        // sliding) — running on a track beam over the opening.
        const outside = kind === 'outside-slide';
        const off = md.width / 2 + 0.2;
        const ux = along ? 1 : 0;
        const uy = along ? 0 : 1;
        const lx = md.mid.x + ux * off - md.inward.x * (outside ? -0.18 : 0.18);
        const ly = md.mid.y + uy * off - md.inward.y * (outside ? -0.18 : 0.18);
        box(along ? md.width : 0.12, md.height, along ? 0.12 : md.width, wx(o, lx), md.height / 2, wz(o, ly), mats.leaf);
        const trackLen = md.width * 2 + 0.8;
        box(along ? trackLen : 0.16, 0.14, along ? 0.16 : trackLen, wx(o, md.mid.x + ux * off * 0.5), md.height + 0.55, wz(o, md.mid.y + uy * off * 0.5), mats.beam);
      }
      const tag = label(T, 'Main door', `${showLength(md.width, u)} wide · ${md.wall} wall · ${DOOR_KIND_TEXT[kind]}`, Math.min(4, Math.max(2.4, md.width)), true, 26, 64);
      tag.position.set(wx(o, md.mid.x - md.inward.x * 1.2), md.height + 1.4, wz(o, md.mid.y - md.inward.y * 1.2));
      add(tag);
      labels.push(tag);
    }
    // The passage in from the main door, named on the drawing like on the floor.
    if (pass) {
      const wide = pass.d >= pass.w ? pass.w : pass.d;
      dim('Passage', `${showLength(wide, u)} wide · from the main door`, Math.min(3.2, Math.max(2.2, wide))).position.set(wx(o, pass.x + pass.w / 2), 1.2, wz(o, pass.y + pass.d / 2));
    }
    // The work zones painted on the real floor (storeScene workZones): a
    // tinted slab and a small sign over each — the dock at the main door,
    // the lines of work where the free floor has room for them.
    const zoneMats = new Map<string, Mat>();
    for (const z of scene.zones) {
      let zm = zoneMats.get(z.key);
      if (!zm) {
        zm = new T.MeshStandardMaterial({ color: ZONE_LOOK[z.key], transparent: true, opacity: 0.38, depthWrite: false, roughness: 0.9 });
        zoneMats.set(z.key, zm);
      }
      slab(z.rect, 0.02, 0.015, zm);
      const tag = label(T, z.label, `${showLength(z.rect.w, u)} × ${showLength(z.rect.d, u)}`, Math.min(4.5, Math.max(2, Math.min(z.rect.w, z.rect.d))), true, 20, 46);
      tag.position.set(wx(o, z.rect.x + z.rect.w / 2), 1.5, wz(o, z.rect.y + z.rect.d / 2));
      add(tag);
      labels.push(tag);
    }
    // Procedural equipment inside each work zone — a washing trough, a
    // grading conveyor, packing tables, the plant's skid blocks and the
    // dock leveller — sized from the zone's own rect, so an owner-sized
    // zone holds kit that fits exactly what they measured.
    const gear = (z: SceneZone) => {
      const r = z.rect;
      const alongX = r.w >= r.d;
      const len = Math.min(alongX ? r.w : r.d, 16);
      const cross = Math.min(alongX ? r.d : r.w, 5);
      if (len < 1 || cross < 0.5) return;
      const midX = wx(o, r.x + r.w / 2);
      const midZ = wz(o, r.y + r.d / 2);
      /** One piece: `l` along the zone's line, `w` across it, `off` along the line from its middle. */
      const piece = (l: number, w: number, h: number, y: number, off: number, mat: Mat) =>
        alongX ? box(l, h, w, midX + off, y, midZ, mat) : box(w, h, l, midX, y, midZ + off, mat);
      switch (z.key) {
        case 'cleaning': {
          // The washing trough in stainless, a brush roller over it.
          piece(Math.min(len, cross * 3), Math.min(0.9, cross), 0.65, 0.33, 0, mats.condenser);
          piece(Math.min(len * 0.8, cross * 2.4), 0.22, 0.22, 0.85, 0, mats.guard);
          break;
        }
        case 'grading': {
          // A roller conveyor at waist height on slim steel legs.
          const belt = Math.min(len, cross * 3);
          piece(belt, Math.min(0.8, cross), 0.07, 0.78, 0, mats.guard);
          piece(0.07, Math.max(0.2, Math.min(0.7, cross - 0.2)), 0.75, 0.38, -belt / 2 + 0.1, mats.beam);
          piece(0.07, Math.max(0.2, Math.min(0.7, cross - 0.2)), 0.75, 0.38, belt / 2 - 0.1, mats.beam);
          break;
        }
        case 'packing': {
          // Two packing tables along the line.
          const tw = Math.min(1.5, len / 2 - 0.2);
          if (tw >= 0.6) {
            piece(tw, Math.min(0.8, cross), 0.06, 0.85, -len / 4, mats.leaf);
            piece(tw, Math.min(0.8, cross), 0.06, 0.85, len / 4, mats.leaf);
          }
          break;
        }
        case 'machinery': {
          // The plant: two skid blocks along the line.
          piece(Math.min(1.4, len * 0.45), Math.min(1.1, cross), 1.1, 0.55, -len / 4, mats.condenser);
          piece(Math.min(1.4, len * 0.45), Math.min(1.1, cross), 1.1, 0.55, len / 4, mats.condenser);
          break;
        }
        case 'dock': {
          // The dock leveller: a plate across the passage, tipped a little.
          const plate = piece(Math.min(2.2, len), cross, 0.06, 0.42, 0, mats.shutter);
          if (alongX) plate.rotation.z = 0.09; else plate.rotation.x = 0.09;
          break;
        }
      }
    };
    for (const z of scene.zones) gear(z);
  }

  // The chambers.
  for (const c of scene.chambers) {
    const r = c.rect;
    const cx = wx(o, r.x + r.w / 2);
    const cz = wz(o, r.y + r.d / 2);
    const H = c.h;
    // Its insulated floor, its walls of insulated panels (open at the door), the wall over the door.
    slab({ x: r.x + 0.07, y: r.y + 0.07, w: r.w - 0.14, d: r.d - 0.14 }, 0.01, 0.008, mats.chamberFloor, 3);
    for (const s of c.walls) roomWall(s, 0, H, 0.14, r, 'chamber');
    if (c.door) {
      roomWall(c.door, c.doorH, H, 0.14, r, 'chamber');
      // The door frame, and the insulated sliding door pushed open beside it, outside.
      const along = c.doorWall === 'front' || c.doorWall === 'back';
      const dw = segLength(c.door);
      const dm = midOf(c.door);
      for (const end of [{ x: c.door.x1, y: c.door.y1 }, { x: c.door.x2, y: c.door.y2 }]) box(0.14, c.doorH, 0.2, wx(o, end.x), c.doorH / 2, wz(o, end.y), mats.door).rotation.y = along ? 0 : Math.PI / 2;
      box(along ? dw + 0.14 : 0.2, 0.14, along ? 0.2 : dw + 0.14, wx(o, dm.x), c.doorH, wz(o, dm.y), mats.door);
      const wallLen = along ? r.w : r.d;
      const startAlong = along ? Math.min(c.door.x1, c.door.x2) - r.x : Math.min(c.door.y1, c.door.y2) - r.y;
      const room = { before: startAlong, after: wallLen - startAlong - dw };
      if (c.toScale && Math.max(room.before, room.after) >= dw * 0.9) {
        const side = room.after >= room.before ? 1 : -1;
        const shiftBy = side * (dw + 0.05);
        const out = 0.16;
        const lx = dm.x + (along ? shiftBy : 0) - c.inward.x * out;
        const ly = dm.y + (along ? 0 : shiftBy) - c.inward.y * out;
        box(along ? dw : 0.1, c.doorH, along ? 0.1 : dw, wx(o, lx), c.doorH / 2, wz(o, ly), mats.leaf);
      }
      // Its name on a sign over the door, flat on the wall outside (as stores paint them): read
      // from the passage, so a farmer finds "Chamber 2" without counting doors.
      const signW = Math.min(1.8, Math.max(1.1, dw * 0.9));
      const can = labelCanvas(c.name, '', true, '#0f3b2e');
      const signH = (signW * can.height) / can.width;
      const overDoor = H - c.doorH;
      if (overDoor > signH * 0.6) {
        const tex = new T.CanvasTexture(can);
        tex.colorSpace = T.SRGBColorSpace;
        const sign = new T.Mesh(new T.PlaneGeometry(signW, signH), new T.MeshBasicMaterial({ map: tex, transparent: true }));
        const up = c.doorH + Math.min(overDoor / 2, 0.2 + signH / 2);
        // Just off the wall's outer face, facing out of the chamber (a plane faces +z: turn it).
        sign.position.set(wx(o, dm.x - c.inward.x * 0.09), up, wz(o, dm.y - c.inward.y * 0.09));
        sign.rotation.y = Math.atan2(-c.inward.x, c.inward.y);
        add(sign);
      }
    } else {
      // No measured door, no painted sign: the chamber's name floats over
      // its middle, so "Chamber 2" stays findable in the 3D view.
      const tag = label(T, c.name, '', Math.min(3, Math.max(1.6, Math.min(r.w, r.d) * 0.6)), true, 24, 56);
      tag.position.set(cx, H + 0.9, cz);
      add(tag);
      labels.push(tag);
    }
    // Windows and vents (older measured chambers).
    for (const win of c.windows) {
      const m = wallOn(win.seg, win.sill, win.sill + win.height, 0.2, mats.glass);
      if (m) m.renderOrder = 2;
    }
    // Floors above the lowest: steel grating decks on blue beams, with posts at the corners.
    for (const f of c.floors) {
      if (f.floor > 1) {
        const inset = 0.08;
        const deck = slab({ x: r.x + inset, y: r.y + inset, w: r.w - 2 * inset, d: r.d - 2 * inset }, f.z0, 0.05, mats.deck, 0.4);
        deck.renderOrder = 1;
        for (const [w, d, x, y] of [
          [r.w, 0.14, r.x + r.w / 2, r.y + 0.1],
          [r.w, 0.14, r.x + r.w / 2, r.y + r.d - 0.1],
          [0.14, r.d, r.x + 0.1, r.y + r.d / 2],
          [0.14, r.d, r.x + r.w - 0.1, r.y + r.d / 2],
        ]) box(w, 0.18, d, wx(o, x), f.z0 - 0.09, wz(o, y), mats.beam);
        const tag = label(T, `Floor ${f.floor}`, '', 1.5, true);
        const at = c.door ? midOf(c.door) : { x: r.x + r.w / 2, y: r.y };
        tag.position.set(wx(o, at.x + c.inward.x * 0.6), f.z0 + 0.45, wz(o, at.y + c.inward.y * 0.6));
        add(tag);
      }
      if (f.walkway) {
        const w = f.walkway;
        slab(w, f.z0 + 0.012, 0.01, mats.walk);
        // Yellow lines along both edges of the walkway, as on the passage: keep clear.
        const t = 0.08;
        const upright = c.inward.y !== 0;
        for (const r of upright ? [{ x: w.x, y: w.y, w: t, d: w.d }, { x: w.x + w.w - t, y: w.y, w: t, d: w.d }] : [{ x: w.x, y: w.y, w: w.w, d: t }, { x: w.x, y: w.y + w.d - t, w: w.w, d: t }])
          slab(r, f.z0 + 0.018, 0.008, mats.stripe);
      }
      // Row numbers just outside the first stack of each row (Row 1, every fifth, the last).
      const rows = f.row.rows;
      const left = { x: -c.inward.y, y: c.inward.x };
      for (const p of f.places) {
        if (p.col !== 0 || (p.row !== 1 && p.row !== rows && p.row % 5)) continue;
        const t = label(T, `Row ${p.row}`, '', 0.9, true);
        const cxp = p.rect.x + p.rect.w / 2 + left.x * (Math.abs(left.x) * p.rect.w / 2 + Math.abs(left.y) * p.rect.d / 2 + 0.35);
        const cyp = p.rect.y + p.rect.d / 2 + left.y * (Math.abs(left.x) * p.rect.w / 2 + Math.abs(left.y) * p.rect.d / 2 + 0.35);
        t.position.set(wx(o, cxp), f.z0 + 0.3, wz(o, cyp));
        add(t);
      }
    }
    for (const p of plates) {
      if (p.chamber !== c.index) continue;
      const base = c.floors[p.floor].z0;
      const post = new T.Mesh(postGeo, mats.beam);
      post.scale.y = p.z + 0.13 - base;
      post.position.set(wx(o, p.at.x), base + post.scale.y / 2, wz(o, p.at.y));
      add(post);
      const tex = plateTexture(T, p.row);
      const plate = new T.Mesh(plateGeo, new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
      // Just in front of the post, facing the aisle (plan y runs the other way from the scene's z).
      plate.position.set(wx(o, p.at.x + p.facing.x * 0.03), p.z, wz(o, p.at.y + p.facing.y * 0.03));
      plate.rotation.y = Math.atan2(p.facing.x, -p.facing.y);
      plate.userData.plate = p.row;
      add(plate);
    }
    if (c.floors.length > 1) {
      for (const [x, y] of [[r.x + 0.1, r.y + 0.1], [r.x + r.w - 0.1, r.y + 0.1], [r.x + 0.1, r.y + r.d - 0.1], [r.x + r.w - 0.1, r.y + r.d - 0.1]]) {
        const top = c.floors[c.floors.length - 1].z0;
        box(0.14, top, 0.14, wx(o, x), top / 2, wz(o, y), mats.beam);
      }
    }
    // Its outline (blue when it is the open chamber), and a box to tap it by.
    const line = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(r.w, H, r.d)), kit.edge);
    line.position.set(cx, H / 2, cz);
    line.userData.chamber = c.index;
    add(line);
    outlines.push(line);
    const hit = new T.Mesh(new T.BoxGeometry(r.w, H, r.d), mats.hit);
    hit.position.set(cx, H / 2, cz);
    hit.userData.chamber = c.index;
    add(hit);
    hits.push(hit);
  }
  // Cooling units, pipes, strip curtains, condensers; ceilings and lights for walking.
  const fixtures = buildFixtures(kit, scene, o);
  group.add(fixtures.group);
  return { group, hits, outlines, walls, labels, walkOnly: fixtures.walkOnly };
}

/** What a place's mark on the floor looks like, and how strongly its bins are tinted. */
const MARK: Record<Look, { tile: string; tint: string | null; amount: number }> = {
  free: { tile: PLACE_LOOK.free.hex, tint: '#7dd3fc', amount: 1 },
  part: { tile: PLACE_LOOK.part.hex, tint: null, amount: 0 },
  selected: { tile: PLACE_LOOK.selected.hex, tint: '#10b981', amount: 1 },
  held: { tile: PLACE_LOOK.held.hex, tint: '#f59e0b', amount: 1 },
  booked: { tile: PLACE_LOOK.booked.hex, tint: null, amount: 0 },
  mine: { tile: PLACE_LOOK.mine.hex, tint: '#7c3aed', amount: 0.8 },
  blocked: { tile: PLACE_LOOK.blocked.hex, tint: null, amount: 0 },
};

export interface Places {
  group: Obj;
  /** Instance → cell, for each mesh that can be tapped. */
  picks: { mesh: IMesh; cells: Cell[] }[];
  /** The chambers' labels (kept readable at any distance). */
  labels: InstanceType<Three['Sprite']>[];
}

/** What the floor filter and the grower highlight ask the places to show (ColdStore3D's toggles). */
export interface WorldState {
  /** `all`: every floor stacked as it stands; a number: only that floor of every chamber (1 = lowest). */
  floor: number | 'all';
  /** Grower highlight: every stack but the person's own (or, for the owner, the booked ones) dims. */
  mine: boolean;
}

/** One instanced group of places that the floor filter may re-slice at any time. */
interface Slice {
  mesh: IMesh;
  /** The cell behind each instance, in instance order. */
  cells: Cell[];
  /** When true the meshes carry per-instance colours (restore + dim them on a re-slice). */
  colors: boolean;
  /** `stack`: a stack of bins/crates; `ghost`: an outline of a stack being chosen; tile / open: the floor marks. */
  kind: 'stack' | 'ghost' | 'tile' | 'open';
  /** The instance data as it was built (matrices, then colours): everything is put back from these. */
  base: { m: Float32Array; c: Float32Array | null };
}

/** What the safety cap drew, when it trimmed a very large store. */
export interface InstSummary {
  /** Places actually drawn (a representative sample). */
  shown: number;
  /** Places the store really has: one place at one level is one slot. */
  total: number;
  /** Boxes the whole store holds at full capacity. */
  boxes: number;
}

/** The whole set of places plus the handles that drive their floor slice, racks and apples (ColdStore3D). */
export interface PlacesState extends Places {
  /** Apply the floor filter and the grower highlight (cheap: only counts, matrices and colours are touched). */
  applyWorld: (s: WorldState) => void;
  /** Apples lying on the booked places, instanced (the floor filter hides them together with their stacks). */
  applyWorldApples: (s: WorldState) => void;
  /** Set when the safety cap trimmed a very large store: the honest badge the viewer shows. */
  instSummary: InstSummary | null;
}

const APPLE_COUNT = 3; // a crown of apples across the top crate: two corners and the middle

/**
 * The safety cap for massive stores (Al Noor: 1,556 places over five levels —
 * tens of thousands of rack posts, rails and stack instances at once, beyond
 * what a phone's WebGL context survives). Past 2,000 slots the view draws
 * 1,000 evenly spread representative places instead and says so honestly.
 */
const SLOT_CAP_TRIGGER = 2000;
const SLOT_CAP_SHOWN = 1000;

/**
 * The places for the months looked at. `cells[i]` belongs to
 * `scene.chambers[cell.chamber].floors[cell.floor].places[cell.place]`.
 */
export function buildPlaces(kit: Kit, scene: StoreScene, cells: Cell[], o: Origin, freeOf: (chamber: number) => number, mineName?: string): PlacesState {
  const { T, mats } = kit;
  const group = new T.Group();
  const picks: Places['picks'] = [];
  const slices: Slice[] = [];
  const m4 = new T.Matrix4();
  const col = new T.Color();
  const white = new T.Color('#ffffff');

  type Item = { cell: Cell; y: number; h: number; units: number; tint: string | null; amount: number };
  const stacks = new Map<string, { kind: Kind; units: number; items: Item[] }>();
  // Outlines of the stacks being chosen or held.
  const ghosts = new Map<string, Item[]>();
  const strong = (look: Look) => look === 'selected' || look === 'held';
  const tiles: Cell[] = [];
  const put = <K, V>(map: Map<K, V[]>, key: K, it: V) => {
    const list = map.get(key);
    if (list) list.push(it);
    else map.set(key, [it]);
  };

  // The batching tier: past the cap, draw a stride sample across the whole
  // store (chambers and levels stay proportionally covered), always drawing
  // places being chosen or held so choosing never loses its outline. Every
  // downstream group — stacks, ghosts, floor bays, racks, apples — is built
  // from the sample only.
  let draw = cells;
  let instSummary: InstSummary | null = null;
  if (cells.length > SLOT_CAP_TRIGGER) {
    const stride = Math.ceil(cells.length / SLOT_CAP_SHOWN);
    const shown = new Set<Cell>();
    for (let i = 0; i < cells.length && shown.size < SLOT_CAP_SHOWN; i += stride) shown.add(cells[i]);
    for (const cell of cells) if (strong(cell.look)) shown.add(cell);
    const boxes = cells.reduce((n, cell) => n + (scene.chambers[cell.chamber]?.floors[cell.floor]?.k ?? 0), 0);
    draw = Array.from(shown);
    instSummary = { shown: draw.length, total: cells.length, boxes };
  }

  for (const cell of draw) {
    const c = scene.chambers[cell.chamber];
    const f = c?.floors[cell.floor];
    const p = f?.places[cell.place];
    if (!p) continue;
    // Floor left over in a wizard chamber is not a place: nothing to draw.
    if (cell.look === 'blocked' && c.storage !== 'boxes') continue;
    tiles.push(cell);
    if (cell.look === 'blocked') continue;
    const unitH = f.stackH / Math.max(1, f.layers);
    const mk = MARK[cell.look];
    if (cell.look === 'booked' || cell.look === 'mine' || cell.look === 'part') {
      const units = cell.look === 'part' ? Math.max(1, Math.min(f.layers - 1, Math.round(f.layers * cell.full))) || 1 : f.layers;
      const key = `${c.kind}:${units}`;
      let s = stacks.get(key);
      if (!s) {
        s = { kind: c.kind, units, items: [] };
        stacks.set(key, s);
      }
      s.items.push({ cell, y: f.z0, h: units * unitH, units, tint: mk.tint, amount: mk.amount });
    } else if (strong(cell.look)) {
      // A place being chosen or held: the outline of the stack that will stand there.
      put(ghosts, `strong:${f.layers}`, { cell, y: f.z0, h: f.stackH, units: f.layers, tint: mk.tint, amount: 1 });
    }
    // A free place is only its painted bay on the floor (as in a real store): no stacks of air.
  }

  const place = (cell: Cell) => scene.chambers[cell.chamber].floors[cell.floor].places[cell.place].rect;
  const fill = (mesh: IMesh, items: Item[], shrink: number) => {
    items.forEach((it, i) => {
      const r = place(it.cell);
      m4.makeScale(r.w * shrink, it.h, r.d * shrink).setPosition(wx(o, r.x + r.w / 2), it.y + 0.012, wz(o, r.y + r.d / 2));
      mesh.setMatrixAt(i, m4);
      if (it.tint) col.copy(white).lerp(col.clone().set(it.tint), it.amount);
      else col.copy(white);
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  };
  for (const s of stacks.values()) {
    const geo = kit.stackGeo(s.units, s.kind);
    const mesh = new T.InstancedMesh(geo, s.kind === 'bin' ? mats.bin : s.kind === 'crate' ? mats.crate : mats.carton, s.items.length);
    fill(mesh, s.items, 0.94);
    group.add(mesh);
    picks.push({ mesh, cells: s.items.map((x) => x.cell) });
    slices.push({ mesh, cells: s.items.map((x) => x.cell), colors: true, kind: 'stack', base: { m: mesh.instanceMatrix.array.slice() as Float32Array, c: null } });
  }
  for (const [key, items] of ghosts) {
    const units = key.split(':')[1];
    const mesh = new T.InstancedMesh(kit.stackGeo(Number(units)), mats.ghostOn, items.length);
    fill(mesh, items, 0.9);
    mesh.renderOrder = 3;
    group.add(mesh);
    picks.push({ mesh, cells: items.map((x) => x.cell) });
    slices.push({ mesh, cells: items.map((x) => x.cell), colors: true, kind: 'ghost', base: { m: mesh.instanceMatrix.array.slice() as Float32Array, c: null } });
  }
  if (tiles.length) {
    const mesh = new T.InstancedMesh(kit.unitBox, mats.tile, tiles.length);
    tiles.forEach((cell, i) => {
      const r = place(cell);
      const f = scene.chambers[cell.chamber].floors[cell.floor];
      // A painted bay, a little smaller than the place: the gaps between bays show on the floor.
      m4.makeScale(r.w * 0.9, 0.02, r.d * 0.9).setPosition(wx(o, r.x + r.w / 2), f.z0 + 0.004, wz(o, r.y + r.d / 2));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(MARK[cell.look].tile));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    picks.push({ mesh, cells: tiles });
    slices.push({ mesh, cells: tiles, colors: true, kind: 'tile', base: { m: mesh.instanceMatrix.array.slice() as Float32Array, c: null } });
  }
  // A free place is only a painted bay, but it can be pointed at anywhere in the space its stack would take
  // (walking, the ring need not be aimed at the floor): an unseen box over each bay, for choosing only.
  const open = tiles.filter((cell) => cell.look === 'free');
  if (open.length) {
    const mesh = new T.InstancedMesh(kit.unitBox, mats.tile, open.length);
    open.forEach((cell, i) => {
      const r = place(cell);
      const f = scene.chambers[cell.chamber].floors[cell.floor];
      m4.makeScale(r.w * 0.9, f.stackH, r.d * 0.9).setPosition(wx(o, r.x + r.w / 2), f.z0 + 0.03, wz(o, r.y + r.d / 2));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.visible = false;
    group.add(mesh);
    picks.push({ mesh, cells: open });
    slices.push({ mesh, cells: open, colors: false, kind: 'open', base: { m: mesh.instanceMatrix.array.slice() as Float32Array, c: null } });
  }

  // Steel racking under the places: a post at each corner and a rail along the front
  // and back edge of every level, instanced (two draws for the whole store). The floor
  // filter slices them level for level, like the stacks they hold.
  const posts: { c: Cell; r: Rect; z0: number; h: number; corners: [number, number][] }[] = [];
  const rails: { c: Cell; r: Rect; y: number }[] = [];
  for (const cell of tiles.filter((c) => c.look !== 'blocked')) {
    const r = place(cell);
    const f = scene.chambers[cell.chamber].floors[cell.floor];
    posts.push({ c: cell, r, z0: f.z0, h: f.stackH, corners: [[0.06, 0.06], [0.06, -0.06], [-0.06, 0.06], [-0.06, -0.06]] });
    for (let k = 0; k <= f.layers; k++) {
      rails.push({ c: cell, r, y: f.z0 + k * (f.stackH / Math.max(1, f.layers)) });
    }
  }
  let rackMeshes: { posts: IMesh; rails: IMesh } | null = null;
  let postRows: Cell[] = [];
  let railRows: Cell[] = [];
  let postBase: Float32Array = new Float32Array(0);
  let railBase: Float32Array = new Float32Array(0);
  if (posts.length) {
    // The kit's real uprights and beams when the Blender GLB is in — the
    // same unit-cube matrices scale them into place either way.
    const pm = new T.InstancedMesh(kit.protos?.post ?? kit.unitBox, mats.beam, posts.length * 4);
    posts.forEach((p, i) => {
      p.corners.forEach(([dx, dz], k) => {
        m4.makeScale(0.07, p.h, 0.07).setPosition(wx(o, p.r.x + p.r.w / 2 + dx * p.r.w * 0.94), p.z0, wz(o, p.r.y + p.r.d / 2 + dz * p.r.d * 0.94));
        pm.setMatrixAt(i * 4 + k, m4);
      });
    });
    pm.instanceMatrix.needsUpdate = true;
    pm.computeBoundingSphere();
    pm.frustumCulled = false;
    group.add(pm);
    const rm = new T.InstancedMesh(kit.protos?.beam ?? kit.unitBox, mats.beam, rails.length * 2);
    rails.forEach((p, i) => {
      const uw = 0.055;
      m4.makeScale(p.r.w - 0.1, uw, uw).setPosition(wx(o, p.r.x + p.r.w / 2), p.y, wz(o, p.r.y + p.r.d / 2 - p.r.d * 0.47));
      rm.setMatrixAt(i * 2, m4);
      m4.makeScale(p.r.w - 0.1, uw, uw).setPosition(wx(o, p.r.x + p.r.w / 2), p.y, wz(o, p.r.y + p.r.d / 2 + p.r.d * 0.47));
      rm.setMatrixAt(i * 2 + 1, m4);
    });
    rm.instanceMatrix.needsUpdate = true;
    rm.computeBoundingSphere();
    rm.frustumCulled = false;
    group.add(rm);
    rackMeshes = { posts: pm, rails: rm };
    postRows = posts.flatMap((p) => [p.c, p.c, p.c, p.c]);
    railRows = rails.flatMap((p) => [p.c, p.c]);
    postBase = pm.instanceMatrix.array.slice() as Float32Array;
    railBase = rm.instanceMatrix.array.slice() as Float32Array;
  }

  // Apples on the places holding produce: a crown of fruit across the top crate,
  // so a grower sees apples, not only crates. One instanced draw for the whole store.
  type AppleIt = { cell: Cell; x: number; y: number; z: number; mine: boolean; s?: number };
  const appleIt: AppleIt[] = [];
  const crown = kit.protos?.apples ?? null;
  for (const s of stacks.values()) {
    for (const it of s.items) {
      if (it.cell.look !== 'booked' && it.cell.look !== 'mine') continue;
      const r = place(it.cell);
      const top = it.y + it.h;
      if (crown) {
        // The Blender cluster (a real checkerboard crown, gold apples in, stems
        // up): about two-fifths of the place wide, sitting on the top crate.
        const size = 0.42 * Math.min(r.w, r.d);
        appleIt.push({ cell: it.cell, x: r.x + r.w / 2, y: top + 0.012, z: r.y + r.d / 2, mine: it.cell.look === 'mine', s: size });
      } else {
        appleIt.push(
          { cell: it.cell, x: r.x + r.w * 0.3, y: top, z: r.y + r.d * 0.5, mine: it.cell.look === 'mine' },
          { cell: it.cell, x: r.x + r.w * 0.5, y: top, z: r.y + r.d * 0.72, mine: it.cell.look === 'mine' },
          { cell: it.cell, x: r.x + r.w * 0.7, y: top, z: r.y + r.d * 0.5, mine: it.cell.look === 'mine' },
        );
      }
    }
  }
  let apples: { mesh: IMesh; items: AppleIt[] } | null = null;
  let applyWorldApples: (s: WorldState) => void = () => {};
  if (appleIt.length) {
    let geo: Geo;
    let mat: Mat | Mat[];
    let radius = 0.05;
    if (crown) {
      geo = crown;
      // The kit carries three slots — red skin, gold skin, stems — in group order.
      const apple = (hex: string, rough: number) => new T.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0.02 });
      mat = [apple('#6b0806', 0.32), apple('#ad700f', 0.35), apple('#291a0b', 0.8)];
    } else {
      radius = Math.min(0.11, Math.max(0.035, place(appleIt[0].cell).w * 0.14));
      geo = new T.SphereGeometry(radius, 9, 6);
      mat = new T.MeshStandardMaterial({ color: '#d42a1e', roughness: 0.3, metalness: 0.02 });
    }
    const mesh = new T.InstancedMesh(geo, mat, appleIt.length);
    appleIt.forEach((a, i) => {
      if (a.s) m4.makeScale(a.s, a.s, a.s).setPosition(wx(o, a.x), a.y, wz(o, a.z));
      else m4.makeTranslation(wx(o, a.x), a.y + radius * 1.02, wz(o, a.z));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.copy(white));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.frustumCulled = false;
    group.add(mesh);
    apples = { mesh, items: appleIt };
    const appleBase = mesh.instanceMatrix.array.slice() as Float32Array;
    const appleColors = (mesh.instanceColor?.array.slice() as Float32Array | undefined) ?? null;
    applyWorldApples = (s: WorldState) => {
      sliceMesh({
        mesh,
        rows: apples!.items.map((a) => ({ c: a.cell, mine: a.mine })),
        cellsOf: (row) => row.c,
        label: floorLabel,
        floor: s.floor,
        baseM: appleBase,
        baseC: appleColors,
        tint: (row) => (s.mine && !row.mine ? 0.38 : null),
        col,
      });
    };
  }

  // A label over each chamber: its number, what it holds and what is free.
  const labels: Places['labels'] = [];
  for (const c of scene.chambers) {
    const g = c.group;
    const free = freeOf(c.index);
    const sub = `${g.floors.length > 1 ? `${g.floors.length} floors · ` : ''}${countText(g.count, c.storage)} · ${free.toLocaleString('en-IN')} free`;
    const tag = label(T, c.name, sub, Math.min(Math.max(c.rect.w * 0.85, 3.2), 8), false, 40, 84);
    tag.position.set(wx(o, c.rect.x + c.rect.w / 2), c.h + 1.3, wz(o, c.rect.y + c.rect.d / 2));
    group.add(tag);
    labels.push(tag);
  }

  // The farmer's own stacks: a violet label over them on each chamber floor, with their name.
  const mine = new Map<string, Cell[]>();
  for (const cell of cells) if (cell.look === 'mine') put(mine, `${cell.chamber}:${cell.floor}`, cell);
  for (const [key, list] of mine) {
    const [ci, fi] = key.split(':').map(Number);
    const c = scene.chambers[ci];
    const f = c?.floors[fi];
    if (!f) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const cell of list) {
      const r = place(cell);
      x0 = Math.min(x0, r.x);
      x1 = Math.max(x1, r.x + r.w);
      y0 = Math.min(y0, r.y);
      y1 = Math.max(y1, r.y + r.d);
    }
    const who = mineName?.trim() ? `${mineName.trim().split(/\s+/)[0]}’s ${c.storage}` : `Your ${c.storage}`;
    const where = `${c.name}${c.floors.length > 1 ? ` · Floor ${f.floor}` : ''} · ${list.length} place${list.length === 1 ? '' : 's'}`;
    const tag = label(T, who, where, 2.6, true, 30, 70, '#6d28d9');
    tag.position.set(wx(o, (x0 + x1) / 2), f.z0 + f.stackH + 0.9, wz(o, (y0 + y1) / 2));
    group.add(tag);
    labels.push(tag);
  }

  // The places being chosen: a green sign over them on each chamber floor.
  const choice = new Map<string, Cell[]>();
  for (const cell of cells) if (cell.look === 'selected') put(choice, `${cell.chamber}:${cell.floor}`, cell);
  for (const [key, list] of choice) {
    const [ci, fi] = key.split(':').map(Number);
    const c = scene.chambers[ci];
    const f = c?.floors[fi];
    if (!f) continue;
    const xs = list.map((cell) => place(cell));
    const mx = (Math.min(...xs.map((r) => r.x)) + Math.max(...xs.map((r) => r.x + r.w))) / 2;
    const my = (Math.min(...xs.map((r) => r.y)) + Math.max(...xs.map((r) => r.y + r.d))) / 2;
    const where = `${c.name}${c.floors.length > 1 ? ` · Floor ${f.floor}` : ''} · ${list.length} place${list.length === 1 ? '' : 's'}`;
    const tag = label(T, 'Your choice', where, 2.6, true, 30, 70, '#047857');
    tag.position.set(wx(o, mx), f.z0 + f.stackH + 0.9, wz(o, my));
    group.add(tag);
    labels.push(tag);
  }

  // A light rising from each chosen place (green) and each of the farmer's own (violet), with a
  // marker pointing down at it: seen from across the store and through the gratings of upper
  // floors. One draw for each colour (instanced), and not lit, so it costs nothing on a phone.
  const glow = (look: 'selected' | 'mine', color: string) => {
    const list = cells.filter((cell) => cell.look === look);
    if (!list.length) return;
    const column = new T.InstancedMesh(
      new T.CylinderGeometry(0.5, 0.5, 1, 14, 1, true),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }),
      list.length,
    );
    const marker = new T.InstancedMesh(new T.ConeGeometry(0.28, 0.5, 4), new T.MeshBasicMaterial({ color }), list.length);
    const down = new T.Matrix4().makeRotationX(Math.PI);
    list.forEach((cell, i) => {
      const r = place(cell);
      const f = scene.chambers[cell.chamber].floors[cell.floor];
      const x = wx(o, r.x + r.w / 2);
      const z = wz(o, r.y + r.d / 2);
      const top = f.z0 + f.stackH;
      m4.makeScale(Math.min(r.w, r.d) * 0.55, 2.2, Math.min(r.w, r.d) * 0.55).setPosition(x, top + 1.1, z);
      column.setMatrixAt(i, m4);
      m4.copy(down).setPosition(x, top + 2.55, z);
      marker.setMatrixAt(i, m4);
    });
    for (const m of [column, marker]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      m.renderOrder = 4;
      group.add(m);
    }
  };
  glow('selected', '#10b981');
  glow('mine', '#8b5cf6');

  // Per-instance colours, as they were built (stacks, their outlines, the bays): the
  // floor filter restores them, the grower highlight dims the stacks that are not yours.
  for (const part of slices) {
    if (part.colors && part.mesh.instanceColor) part.base.c = part.mesh.instanceColor.array.slice() as Float32Array;
  }
  const floorLabel = (c: Cell | null): number => (c && scene.chambers[c.chamber]?.floors[c.floor] ? scene.chambers[c.chamber].floors[c.floor].floor : -99);
  const applyWorld = (s: WorldState) => {
    for (const part of slices) {
      sliceMesh({
        mesh: part.mesh,
        rows: part.cells,
        cellsOf: (c) => c,
        label: floorLabel,
        floor: s.floor,
        baseM: part.base.m,
        baseC: part.base.c,
        tint: part.kind === 'stack' ? (c) => (s.mine && c.look !== 'mine' ? 0.38 : null) : () => null,
        col,
      });
    }
    if (rackMeshes) {
      const pm = rackMeshes.posts;
      sliceMesh({
        mesh: pm,
        rows: postRows,
        cellsOf: (c) => c,
        label: floorLabel,
        floor: s.floor,
        baseM: postBase,
        baseC: null,
        tint: () => null,
        col,
      });
      sliceMesh({
        mesh: rackMeshes.rails,
        rows: railRows,
        cellsOf: (c) => c,
        label: floorLabel,
        floor: s.floor,
        baseM: railBase,
        baseC: null,
        tint: () => null,
        col,
      });
    }
  };

  return { group, picks, labels, applyWorld, applyWorldApples, instSummary };
}

/**
 * The way to a farmer's place on the floor (walk/route): arrows every metre
 * along it, pointing the way, on the floor each part of it is on. Instanced:
 * one draw however long the way.
 */
export function buildRoute(kit: Kit, scene: StoreScene, route: Route, o: Origin): Obj {
  const { T } = kit;
  const group = new T.Group();
  const spots: { x: number; y: number; z: number; angle: number }[] = [];
  const floorZ = (p: Route['points'][number]) => (p.inside >= 0 ? (scene.chambers[p.inside]?.floors[p.level - 1]?.z0 ?? 0) : 0);
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1];
    const b = route.points[i];
    if (a.level !== b.level) continue; // going up a floor: no arrows in the air
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const z = floorZ(b);
    // World angle of the way (building y runs to world −z).
    const angle = Math.atan2(b.x - a.x, -(b.y - a.y));
    for (let d = 0.5; d < len - 0.2; d += 1) spots.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len, z, angle });
  }
  if (!spots.length) return group;
  // A flat chevron pointing along +z before it is turned; laid on the floor.
  const shape = new T.Shape();
  shape.moveTo(0, 0.32);
  shape.lineTo(0.3, -0.08);
  shape.lineTo(0.14, -0.08);
  shape.lineTo(0, 0.12);
  shape.lineTo(-0.14, -0.08);
  shape.lineTo(-0.3, -0.08);
  shape.closePath();
  const geo = new T.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2); // lie flat: the shape's +y now points to world −z
  geo.rotateY(Math.PI); // …and to +z, so a turn by `angle` points it along the way
  const arrows = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ color: '#059669', side: T.DoubleSide }), spots.length);
  const m4 = new T.Matrix4();
  const turn = new T.Matrix4();
  spots.forEach((s, i) => {
    m4.makeTranslation(wx(o, s.x), s.z + 0.03, wz(o, s.y)).multiply(turn.makeRotationY(s.angle));
    arrows.setMatrixAt(i, m4);
  });
  arrows.instanceMatrix.needsUpdate = true;
  arrows.computeBoundingSphere();
  arrows.renderOrder = 5;
  group.add(arrows);
  return group;
}
