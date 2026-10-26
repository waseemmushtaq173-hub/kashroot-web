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
import { binTexture, cartonTexture, concreteTexture, crateTexture, ghostTexture, gratingTexture, labelCanvas, panelTexture } from '@/components/rental/three/textures';
import { midOf, segLength, type Kind, type Rect, type Seg, type StoreScene } from '@/components/rental/three/storeScene';
import { countText } from '@/lib/coldStore';

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

/** Materials, textures and shapes shared by everything drawn (made once per 3D view). */
export interface Kit {
  T: Three;
  unitBox: Geo;
  stackGeo: (units: number) => Geo;
  /** `wall` / `chamberWall` solid, `wallNear` / `chamberNear` see-through (the walls between the camera and the inside). */
  mats: Record<'bin' | 'crate' | 'carton' | 'ghost' | 'ghostOn' | 'tile' | 'hall' | 'yard' | 'apron' | 'walk' | 'passage' | 'stripe' | 'chamberFloor' | 'wall' | 'wallNear' | 'chamberWall' | 'chamberNear' | 'door' | 'leaf' | 'deck' | 'beam' | 'glass' | 'hit' | 'shutter', Mat>;
  edge: InstanceType<Three['LineBasicMaterial']>;
  edgeOn: InstanceType<Three['LineBasicMaterial']>;
  textures: Tex[];
  dispose: () => void;
}

/** The side of every stack shows one bin per unit of height; the top shows the top (two halves of one picture). */
function makeStackGeo(T: Three, units: number): Geo {
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

export function makeKit(T: Three, phone: boolean): Kit {
  const tex = { bin: binTexture(T), crate: crateTexture(T), carton: cartonTexture(T), ghost: ghostTexture(T), concrete: concreteTexture(T), grating: gratingTexture(T), panel: panelTexture(T) };
  if (phone) for (const t of Object.values(tex)) t.anisotropy = 1;
  const unitBox = new T.BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0);
  const geos = new Map<number, Geo>();
  const stackGeo = (units: number) => {
    let g = geos.get(units);
    if (!g) {
      g = makeStackGeo(T, units);
      geos.set(units, g);
    }
    return g;
  };
  const see = { transparent: true, depthWrite: false, side: T.DoubleSide } as const;
  const mats = {
    bin: new T.MeshStandardMaterial({ map: tex.bin, roughness: 0.82 }),
    crate: new T.MeshStandardMaterial({ map: tex.crate, roughness: 0.55 }),
    carton: new T.MeshStandardMaterial({ map: tex.carton, roughness: 0.9 }),
    // An empty place: a faint outline of the stack that fits there; stronger when chosen or waiting for payment.
    // Front faces only: half the see-through layers to draw over a floor full of free places.
    ghost: new T.MeshBasicMaterial({ map: tex.ghost, ...see, side: T.FrontSide, opacity: 0.38 }),
    ghostOn: new T.MeshBasicMaterial({ map: tex.ghost, ...see, side: T.FrontSide, opacity: 0.88 }),
    tile: new T.MeshBasicMaterial({ color: '#ffffff' }),
    hall: new T.MeshStandardMaterial({ map: tex.concrete, roughness: 0.95 }),
    yard: new T.MeshStandardMaterial({ color: '#d9e4d3', roughness: 1 }),
    apron: new T.MeshStandardMaterial({ color: '#b8c0c8', roughness: 1 }),
    walk: new T.MeshStandardMaterial({ color: '#fcd34d', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }),
    passage: new T.MeshStandardMaterial({ color: '#fde68a', roughness: 1, transparent: true, opacity: 0.45, depthWrite: false }),
    stripe: new T.MeshStandardMaterial({ color: '#eab308', roughness: 0.8 }),
    chamberFloor: new T.MeshStandardMaterial({ color: '#e9eef4', roughness: 0.9 }),
    wall: new T.MeshStandardMaterial({ map: tex.panel, color: '#e2e8f0', roughness: 0.9 }),
    wallNear: new T.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.9, ...see, opacity: 0.12 }),
    chamberWall: new T.MeshStandardMaterial({ map: tex.panel, roughness: 0.6 }),
    chamberNear: new T.MeshStandardMaterial({ map: tex.panel, roughness: 0.6, ...see, opacity: 0.22 }),
    door: new T.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.6 }),
    leaf: new T.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.5 }),
    deck: new T.MeshStandardMaterial({ map: tex.grating, roughness: 0.6, ...see, opacity: 1, metalness: 0.2 }),
    beam: new T.MeshStandardMaterial({ color: '#1e5a8c', roughness: 0.5, metalness: 0.3 }),
    glass: new T.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0ea5e9', emissiveIntensity: 0.25, transparent: true, opacity: 0.7, roughness: 0.2 }),
    hit: new T.MeshBasicMaterial({ visible: false }),
    shutter: new T.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.4, metalness: 0.5 }),
  };
  const edge = new T.LineBasicMaterial({ color: '#334155', transparent: true, opacity: 0.55 });
  const edgeOn = new T.LineBasicMaterial({ color: '#0284c7' });
  const textures = Object.values(tex);
  return {
    T,
    unitBox,
    stackGeo,
    mats,
    edge,
    edgeOn,
    textures,
    dispose: () => {
      unitBox.dispose();
      for (const g of geos.values()) g.dispose();
      for (const m of Object.values(mats)) m.dispose();
      edge.dispose();
      edgeOn.dispose();
      for (const t of textures) t.dispose();
    },
  };
}

/** Free everything a group made for itself (not the kit's shared parts). */
export function disposeGroup(T: Three, kit: Kit, g: Obj) {
  const shared = new Set<unknown>([...Object.values(kit.mats), kit.edge, kit.edgeOn, kit.unitBox]);
  g.traverse((o) => {
    if (o instanceof T.InstancedMesh) {
      o.dispose();
      return;
    }
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
export function label(T: Three, title: string, sub: string, width: number, dark = false, minPx = 0, maxPx = 0) {
  const c = labelCanvas(title, sub, dark);
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
}

/** Make the walls between the camera and the inside see-through (orbit), or every wall solid (walk). */
export function faceWalls(kit: Kit, walls: Mesh[], eye: { x: number; z: number } | null) {
  for (const m of walls) {
    const out = m.userData.out as { x: number; z: number } | undefined;
    const hall = m.userData.of === 'hall';
    let near = false;
    if (eye && out) {
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

  // The building: its walls (the ones facing the camera turn see-through), the main door with its rolled-up shutter.
  if (scene.building) {
    const H = scene.building.height;
    for (const s of scene.walls) roomWall(s, 0, H, 0.25, scene.hall, 'hall');
    const outline = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(scene.hall.w, H, scene.hall.d)), kit.edge);
    outline.position.set(wx(o, scene.hall.w / 2), H / 2, wz(o, scene.hall.d / 2));
    add(outline);
    if (md) {
      roomWall(md.seg, md.height, H, 0.25, scene.hall, 'hall');
      const along = md.wall === 'front' || md.wall === 'back';
      for (const end of [{ x: md.seg.x1, y: md.seg.y1 }, { x: md.seg.x2, y: md.seg.y2 }]) box(0.3, md.height, 0.3, wx(o, end.x), md.height / 2, wz(o, end.y), mats.door);
      box(along ? md.width + 0.3 : 0.3, 0.3, along ? 0.3 : md.width + 0.3, wx(o, md.mid.x), md.height + 0.15, wz(o, md.mid.y), mats.door);
      const roll = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, md.width, 20), mats.shutter);
      roll.rotation.set(along ? 0 : Math.PI / 2, 0, along ? Math.PI / 2 : 0);
      roll.position.set(wx(o, md.mid.x - md.inward.x * 0.45), md.height + 0.5, wz(o, md.mid.y - md.inward.y * 0.45));
      add(roll);
      const tag = label(T, 'Main door', `${md.wall} wall`, Math.min(4, Math.max(2.4, md.width)), true, 26, 64);
      tag.position.set(wx(o, md.mid.x - md.inward.x * 1.2), md.height + 1.4, wz(o, md.mid.y - md.inward.y * 1.2));
      add(tag);
      labels.push(tag);
    }
  }

  // The chambers.
  for (const c of scene.chambers) {
    const r = c.rect;
    const cx = wx(o, r.x + r.w / 2);
    const cz = wz(o, r.y + r.d / 2);
    const H = c.h;
    // Its insulated floor, its walls of insulated panels (open at the door), the wall over the door.
    slab({ x: r.x + 0.07, y: r.y + 0.07, w: r.w - 0.14, d: r.d - 0.14 }, 0.01, 0.008, mats.chamberFloor);
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
      if (f.walkway) slab(f.walkway, f.z0 + 0.012, 0.01, mats.walk);
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
  return { group, hits, outlines, walls, labels };
}

/** What a place's mark on the floor looks like, and how strongly its bins are tinted. */
const MARK: Record<Look, { tile: string; tint: string | null; amount: number }> = {
  free: { tile: PLACE_LOOK.free.hex, tint: '#7dd3fc', amount: 1 },
  part: { tile: PLACE_LOOK.part.hex, tint: null, amount: 0 },
  selected: { tile: PLACE_LOOK.selected.hex, tint: '#10b981', amount: 1 },
  held: { tile: PLACE_LOOK.held.hex, tint: '#f59e0b', amount: 1 },
  booked: { tile: PLACE_LOOK.booked.hex, tint: null, amount: 0 },
  mine: { tile: PLACE_LOOK.mine.hex, tint: '#8b5cf6', amount: 0.55 },
  blocked: { tile: PLACE_LOOK.blocked.hex, tint: null, amount: 0 },
};

export interface Places {
  group: Obj;
  /** Instance → cell, for each mesh that can be tapped. */
  picks: { mesh: IMesh; cells: Cell[] }[];
  /** The chambers' labels (kept readable at any distance). */
  labels: InstanceType<Three['Sprite']>[];
}

/**
 * The places for the months looked at. `cells[i]` belongs to
 * `scene.chambers[cell.chamber].floors[cell.floor].places[cell.place]`.
 */
export function buildPlaces(kit: Kit, scene: StoreScene, cells: Cell[], o: Origin, freeOf: (chamber: number) => number): Places {
  const { T, mats } = kit;
  const group = new T.Group();
  const picks: Places['picks'] = [];
  const m4 = new T.Matrix4();
  const col = new T.Color();
  const white = new T.Color('#ffffff');

  type Item = { cell: Cell; y: number; h: number; units: number; tint: string | null; amount: number };
  const stacks = new Map<string, { kind: Kind; units: number; items: Item[] }>();
  // Outlines of empty stacks: faint for free room, strong for a choice or a hold.
  const ghosts = new Map<string, Item[]>();
  const strong = (look: Look) => look === 'selected' || look === 'held';
  const tiles: Cell[] = [];
  const put = <K>(map: Map<K, Item[]>, key: K, it: Item) => {
    const list = map.get(key);
    if (list) list.push(it);
    else map.set(key, [it]);
  };

  for (const cell of cells) {
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
      // The room left on a shared place, as an outline above its bins.
      if (cell.look === 'part' && f.layers - units > 0) put(ghosts, `faint:${f.layers - units}`, { cell, y: f.z0 + units * unitH, h: (f.layers - units) * unitH, units: f.layers - units, tint: '#22d3ee', amount: 1 });
    } else {
      put(ghosts, `${strong(cell.look) ? 'strong' : 'faint'}:${f.layers}`, { cell, y: f.z0, h: f.stackH, units: f.layers, tint: mk.tint, amount: 1 });
    }
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
    const geo = kit.stackGeo(s.units);
    const mesh = new T.InstancedMesh(geo, s.kind === 'bin' ? mats.bin : s.kind === 'crate' ? mats.crate : mats.carton, s.items.length);
    fill(mesh, s.items, 0.94);
    group.add(mesh);
    picks.push({ mesh, cells: s.items.map((x) => x.cell) });
  }
  for (const [key, items] of ghosts) {
    const [how, units] = key.split(':');
    const mesh = new T.InstancedMesh(kit.stackGeo(Number(units)), how === 'strong' ? mats.ghostOn : mats.ghost, items.length);
    fill(mesh, items, 0.9);
    mesh.renderOrder = 3;
    group.add(mesh);
    picks.push({ mesh, cells: items.map((x) => x.cell) });
  }
  if (tiles.length) {
    const mesh = new T.InstancedMesh(kit.unitBox, mats.tile, tiles.length);
    tiles.forEach((cell, i) => {
      const r = place(cell);
      const f = scene.chambers[cell.chamber].floors[cell.floor];
      m4.makeScale(r.w * 1.02, 0.02, r.d * 1.02).setPosition(wx(o, r.x + r.w / 2), f.z0 + 0.004, wz(o, r.y + r.d / 2));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(MARK[cell.look].tile));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    picks.push({ mesh, cells: tiles });
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
  return { group, picks, labels };
}
