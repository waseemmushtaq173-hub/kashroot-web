/**
 * The machines and people in the store's work zones, modelled the way the photos of working packhouses show them —
 * stainless-steel conveyors on legs with side guards, a white optical sorter with its cameras and lights, a weighbridge with its
 * display post, a dump tank and brush washer, packing tables, pallets of cartons wrapped in film, a forklift, workers in
 * hi-vis vests (the people are there for scale), and, for the owner, the refrigeration plant room (screw compressors, oil
 * separators, receivers, the control cabinet).
 *
 * Everything is authored in the zone's own frame, in metres: x along the zone's long side, z across it, y up from the floor,
 * the zone's middle at the origin. The caller sets the group's place and turn. Every box and cylinder of a zone is merged into
 * one mesh per material (about a dozen draw calls per zone however many parts it has), so a large store stays smooth on a phone.
 * The parts are sized from the zone the owner measured: a big zone gets more of them, never one toy in a corner.
 */
import type { Kit } from '@/components/rental/three/buildStore';

type Three = typeof import('three');
type Obj = InstanceType<Three['Object3D']>;
type Mat = InstanceType<Three['Material']>;
type Geo = import('three').BufferGeometry;

export type ZoneKey = 'cleaning' | 'grading' | 'sorting' | 'packing' | 'machinery' | 'dock';

/** Collects boxes, cylinders and spheres and merges them into one mesh per material. */
class Bag {
  private parts = new Map<Mat, Geo[]>();
  private T: Three;
  constructor(T: Three) {
    this.T = T;
  }
  private put(geo: Geo, mat: Mat, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    const { T } = this;
    // 'YXZ': the part is first laid along its axis (x, z), then turned about the vertical.
    const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'YXZ')), new T.Vector3(1, 1, 1));
    geo.applyMatrix4(m);
    const list = this.parts.get(mat);
    if (list) list.push(geo);
    else this.parts.set(mat, [geo]);
  }
  /** A box `w` × `h` × `d` (x, y, z) centred at (x, y, z), turned `ry` about the vertical. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, mat: Mat, ry = 0) {
    this.put(new this.T.BoxGeometry(w, h, d), mat, x, y, z, 0, ry, 0);
  }
  /** A cylinder of radius `r` and length `len` lying along `axis` (or standing, for y), centred at (x, y, z). */
  cyl(r: number, len: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z', mat: Mat, seg = 12, ry = 0) {
    const g = new this.T.CylinderGeometry(r, r, len, seg);
    this.put(g, mat, x, y, z, axis === 'z' ? Math.PI / 2 : 0, ry, axis === 'x' ? Math.PI / 2 : 0);
  }
  sphere(r: number, x: number, y: number, z: number, mat: Mat) {
    this.put(new this.T.SphereGeometry(r, 10, 8), mat, x, y, z);
  }
  /** One mesh per material, all in a group. */
  build(): Obj {
    const { T } = this;
    const group = new T.Group();
    for (const [mat, geos] of this.parts) {
      let verts = 0;
      let idx = 0;
      for (const g of geos) {
        verts += g.getAttribute('position').count;
        idx += g.index ? g.index.count : g.getAttribute('position').count;
      }
      const pos = new Float32Array(verts * 3);
      const nor = new Float32Array(verts * 3);
      const uv = new Float32Array(verts * 2);
      const ind = new Uint32Array(idx);
      let v = 0;
      let i = 0;
      for (const g of geos) {
        const p = g.getAttribute('position');
        const n = g.getAttribute('normal');
        const u = g.getAttribute('uv');
        pos.set(p.array as ArrayLike<number>, v * 3);
        if (n) nor.set(n.array as ArrayLike<number>, v * 3);
        if (u) uv.set(u.array as ArrayLike<number>, v * 2);
        if (g.index) for (let k = 0; k < g.index.count; k++) ind[i++] = g.index.getX(k) + v;
        else for (let k = 0; k < p.count; k++) ind[i++] = v + k;
        v += p.count;
        g.dispose();
      }
      const out = new T.BufferGeometry();
      out.setAttribute('position', new T.BufferAttribute(pos, 3));
      out.setAttribute('normal', new T.BufferAttribute(nor, 3));
      out.setAttribute('uv', new T.BufferAttribute(uv, 2));
      out.setIndex(new T.BufferAttribute(ind, 1));
      out.computeBoundingSphere();
      group.add(new T.Mesh(out, mat));
    }
    return group;
  }
}

type Mats = Kit['mats'];

const spread = (n: number, span: number) => Array.from({ length: n }, (_, i) => -span / 2 + ((i + 0.5) * span) / n);
const count = (room: number, each: number, max: number) => Math.max(1, Math.min(max, Math.floor(room / each)));

// ─────────────────────────── parts ───────────────────────────

/** A conveyor along x: stainless side rails on legs, a dark belt between, a low guard on each side. */
function conveyor(b: Bag, m: Mats, len: number, w: number, x: number, z: number, top = 0.82, belt: Mat = m.beltDark) {
  for (const s of [-1, 1]) {
    b.box(len, 0.1, 0.05, x, top - 0.02, z + (s * w) / 2, m.stainless);
    b.box(len, 0.09, 0.02, x, top + 0.07, z + (s * w) / 2, m.stainless);
  }
  b.box(len - 0.06, 0.03, w - 0.1, x, top - 0.03, z, belt);
  const legs = Math.max(2, Math.round(len / 1.6) + 1);
  for (let i = 0; i < legs; i++) {
    const lx = x - len / 2 + 0.12 + ((len - 0.24) * i) / (legs - 1);
    for (const s of [-1, 1]) b.box(0.05, top - 0.07, 0.05, lx, (top - 0.07) / 2, z + (s * (w - 0.04)) / 2, m.stainless);
    b.box(0.04, 0.04, w, lx, 0.25, z, m.stainless);
  }
  // Drive drum at the head and the motor beside it.
  b.cyl(0.07, w - 0.06, x + len / 2 - 0.05, top - 0.03, z, 'z', m.steel, 10);
  b.box(0.3, 0.22, 0.22, x + len / 2 - 0.3, top - 0.4, z + w / 2 + 0.2, m.machineWhite);
}

/** A wooden pallet bin of apples: pallet, slatted sides, a red crown of fruit on top. */
function bin(b: Bag, m: Mats, x: number, z: number, high = 1, ry = 0) {
  for (let i = 0; i < high; i++) {
    const y = 0.07 + i * 0.76;
    if (i === 0) {
      b.box(1.2, 0.12, 1, x, 0.06, z, m.timber, ry);
      for (const s of [-0.45, 0, 0.45]) b.box(0.12, 0.06, 1, x + s * Math.cos(ry), 0.03, z - s * Math.sin(ry), m.steel, ry);
    }
    b.box(1.2, 0.7, 1, x, y + 0.12 + 0.35, z, m.timber, ry);
  }
  b.box(1.1, 0.06, 0.9, x, 0.12 + high * 0.76 + 0.01, z, m.apple, ry);
}

/** A carton pallet: layers of brown cartons (alternating), optionally wrapped in clear film. */
function cartons(b: Bag, m: Mats, x: number, z: number, layers: number, wrapped: boolean) {
  b.box(1.2, 0.14, 1, x, 0.07, z, m.timber);
  for (let i = 0; i < layers; i++) {
    const y = 0.14 + 0.2 + i * 0.4;
    b.box(1.12, 0.38, 0.92, x, y, z, m.timber);
    b.box(1.14, 0.03, 0.12, x, y + 0.2, z, m.beltDark);
  }
  if (wrapped) b.box(1.18, layers * 0.4, 0.98, x, 0.14 + (layers * 0.4) / 2, z, m.curtain);
}

/** A worker in a hi-vis vest and white helmet, `ry` turned about the vertical (about 1.75 m tall). */
function person(b: Bag, m: Mats, x: number, z: number, ry = 0) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (dx: number, dz: number) => ({ x: x + dx * c + dz * s, z: z - dx * s + dz * c });
  for (const side of [-1, 1]) {
    const leg = at(0, side * 0.1);
    b.box(0.14, 0.85, 0.14, leg.x, 0.425, leg.z, m.trousers, ry);
    const arm = at(0, side * 0.27);
    b.box(0.1, 0.6, 0.1, arm.x, 1.2, arm.z, m.shirt, ry);
  }
  b.box(0.26, 0.58, 0.4, x, 1.17, z, m.vest, ry);
  b.sphere(0.12, x, 1.6, z, m.skin);
  b.sphere(0.135, x, 1.65, z, m.helmet);
}

/** A forklift: yellow body, counterweight, two-part mast, forks, overhead guard, four wheels. Faces +x (turned by `ry`). */
function forklift(b: Bag, m: Mats, x: number, z: number, ry = 0) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (dx: number, dz = 0) => ({ x: x + dx * c + dz * s, z: z - dx * s + dz * c });
  const p = (dx: number, dy: number, dz: number, w: number, h: number, d: number, mat: Mat) => {
    const q = at(dx, dz);
    b.box(w, h, d, q.x, dy, q.z, mat, ry);
  };
  p(-0.2, 0.55, 0, 1.7, 0.6, 1.0, m.forkliftBody);
  p(-1.0, 0.8, 0, 0.5, 0.75, 0.95, m.steel);
  p(0.45, 0.55, 0, 0.5, 0.9, 0.95, m.forkliftBody);
  for (const side of [-1, 1]) {
    p(0.75, 1.0, side * 0.25, 0.08, 2.0, 0.1, m.steel);
    p(0.8, 0.07, side * 0.3, 1.1, 0.06, 0.12, m.steel);
    p(-0.3, 1.5, side * 0.45, 0.06, 1.0, 0.06, m.steel);
    p(0.3, 1.5, side * 0.45, 0.06, 1.0, 0.06, m.steel);
  }
  p(0, 2.02, 0, 0.9, 0.05, 1.0, m.steel);
  p(-0.35, 0.95, 0, 0.4, 0.1, 0.5, m.rubber);
  for (const [dx, dz] of [[0.35, 0.45], [0.35, -0.45], [-0.75, 0.45], [-0.75, -0.45]] as const) {
    const q = at(dx, dz);
    b.cyl(0.28, 0.22, q.x, 0.28, q.z, 'z', m.rubber, 12, ry);
  }
}

// ─────────────────────────── the zones ───────────────────────────

function receiving(b: Bag, m: Mats, len: number, cross: number) {
  // Two floor weighbridges side by side, each with its display post.
  const bridges = cross >= 3.2 ? 2 : 1;
  const bl = Math.min(len * 0.3, 4);
  const bw = Math.min((cross / bridges) * 0.8, 2.8);
  const bx = -len / 2 + bl / 2;
  for (const cz of spread(bridges, cross)) {
    b.box(bl, 0.14, bw, bx, 0.07, cz, m.plate);
    for (const s of [-1, 1]) {
      b.box(bl + 0.1, 0.03, 0.09, bx, 0.155, cz + (s * bw) / 2, m.safety);
      b.box(0.5, 0.05, bw, bx + s * (bl / 2 + 0.24), 0.025, cz, m.plate);
    }
    b.box(0.12, 1.2, 0.12, bx + bl / 2 + 0.55, 0.6, cz + bw / 2 + 0.1, m.steel);
    b.box(0.46, 0.3, 0.09, bx + bl / 2 + 0.55, 1.32, cz + bw / 2 + 0.1, m.rubber);
    b.box(0.38, 0.18, 0.02, bx + bl / 2 + 0.55, 1.32, cz + bw / 2 + 0.16, m.btnRed);
  }
  // Rows of arriving bins.
  const from = -len / 2 + bl + 1.4;
  const run = len / 2 - from;
  const washing = len >= 14 && cross >= 5;
  const lanes = washing ? Math.max(1, Math.floor((cross - 2.2) / 1.5)) : count(cross, 1.5, 4);
  if (run >= 1.2) {
    const cols = count(run * (washing ? 0.5 : 1), 1.5, 6);
    spread(cols, run * (washing ? 0.5 : 1)).forEach((a, i) => spread(lanes, washing ? cross - 2.2 : cross).forEach((cz, j) => bin(b, m, from + (run * (washing ? 0.5 : 1)) / 2 + a, cz - (washing ? 1.1 : 0), 1 + ((i + j) % 2))));
  }
  // The washing line along the far side: dump tank, brush bed, dryer.
  if (washing) {
    const zl = cross / 2 - 0.8;
    const x0 = from + run * 0.55;
    b.box(2.2, 0.9, 1.3, x0, 0.45, zl, m.stainless);
    b.box(2.0, 0.02, 1.1, x0, 0.91, zl, m.glass);
    b.box(3.2, 0.5, 1.0, x0 + 3.0, 0.75, zl, m.stainless);
    for (let i = 0; i < 6; i++) b.cyl(0.09, 0.9, x0 + 1.7 + i * 0.5, 1.05, zl, 'z', m.paint, 10);
    b.box(2.6, 1.0, 1.0, x0 + 6.0, 0.95, zl, m.machineWhite);
    b.cyl(0.22, 1.2, x0 + 6.0, 1.9, zl, 'y', m.steel, 10);
    conveyor(b, m, 1.6, 0.6, x0 + 7.9, zl);
  }
  person(b, m, bx + bl / 2 + 1.0, cross / 2 - 0.5, -2.2);
}

function grading(b: Bag, m: Mats, len: number, cross: number) {
  const lanes = count(cross, 1.3, 4);
  const lw = Math.min(0.95, (cross / lanes) * 0.72);
  for (const cz of spread(lanes, cross)) {
    conveyor(b, m, len, lw, 0, cz);
    // A hopper at the head and a drop bin at the foot of each lane.
    b.box(0.9, 0.5, lw + 0.3, -len / 2 + 0.4, 1.05, cz, m.stainless);
    bin(b, m, len / 2 + 0.7, cz, 1, Math.PI / 2);
  }
  // The optical sorter: a white cabinet across every lane, a blue band round it, cameras on top, lamps under it.
  const hood = Math.min(len * 0.2, 3.2);
  const hx = -len * 0.12;
  b.box(hood, 0.7, cross + 0.4, hx, 1.62, 0, m.machineWhite);
  b.box(hood + 0.02, 0.1, cross + 0.42, hx, 1.62, 0, m.paint);
  b.box(hood * 0.85, 0.03, cross, hx, 1.26, 0, m.lamp);
  for (const s of [-1, 1]) for (const a of [-1, 1]) b.box(0.1, 1.3, 0.1, hx + (a * hood) / 2, 0.65, (s * (cross + 0.3)) / 2, m.stainless);
  for (const cz of spread(Math.max(2, Math.round(cross / 0.8)), cross)) b.cyl(0.07, 0.12, hx, 2.02, cz, 'y', m.rubber, 8);
  // Its control panel on a post, and a worker at it.
  b.box(0.08, 1.2, 0.08, hx + hood / 2 + 0.5, 0.6, cross / 2 + 0.6, m.steel);
  b.box(0.55, 0.38, 0.06, hx + hood / 2 + 0.5, 1.35, cross / 2 + 0.6, m.rubber);
  b.box(0.48, 0.3, 0.02, hx + hood / 2 + 0.5, 1.35, cross / 2 + 0.64, m.paint);
  person(b, m, hx + hood / 2 + 0.5, cross / 2 + 1.1, Math.PI);
}

function sorting(b: Bag, m: Mats, len: number, cross: number) {
  const cols = count(len, 2.6, 4);
  const rows = count(cross, 1.9, 2);
  const tw = Math.min(2.1, (len / cols) * 0.78);
  const td = Math.min(0.95, (cross / rows) * 0.6);
  spread(cols, len).forEach((a, i) =>
    spread(rows, cross).forEach((cz, j) => {
      // A roller inspection table, its leg frame, a reject bin under it and a lit canopy over it.
      b.box(tw, 0.05, td, a, 0.88, cz, m.stainless);
      for (let k = 0; k < Math.floor(tw / 0.18); k++) b.cyl(0.04, td - 0.06, a - tw / 2 + 0.12 + k * 0.18, 0.93, cz, 'z', m.steel, 8);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, 0.86, 0.05, a + sx * (tw / 2 - 0.06), 0.43, cz + sz * (td / 2 - 0.05), m.stainless);
      b.box(0.6, 0.5, 0.35, a, 0.3, cz, m.timber);
      b.box(tw * 0.85, 0.08, td * 0.7, a, 1.95, cz, m.machineWhite);
      b.box(tw * 0.75, 0.02, td * 0.5, a, 1.9, cz, m.lamp);
      for (const sx of [-1, 1]) b.box(0.04, 1.0, 0.04, a + sx * (tw / 2 - 0.08), 1.42, cz + td / 2 - 0.05, m.stainless);
      if ((i + j) % 2 === 0) person(b, m, a, cz + td / 2 + 0.45, Math.PI);
    }),
  );
}

function packing(b: Bag, m: Mats, len: number, cross: number) {
  // Packing conveyors over the first three-fifths: tables with flat cartons beside them, a strapping frame at each end.
  const lines = count(cross, 2.2, 3);
  const run = len * 0.58;
  const at = -len / 2 + run / 2;
  for (const cz of spread(lines, cross)) {
    conveyor(b, m, run, 0.7, at, cz, 0.82, m.paint);
    for (const s of [-1, 1]) {
      const tx = at + s * run * 0.22;
      b.box(0.9, 0.05, 0.6, tx, 0.9, cz + 0.85, m.stainless);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.04, 0.88, 0.04, tx + sx * 0.4, 0.44, cz + 0.85 + sz * 0.26, m.stainless);
      b.box(0.5, 0.16, 0.4, tx, 1.0, cz + 0.85, m.timber);
    }
    const end = at + run / 2 + 0.3;
    for (const s of [-1, 1]) b.box(0.09, 1.5, 0.09, end, 0.75, cz + s * 0.5, m.stainless);
    b.box(0.09, 0.09, 1.09, end, 1.5, cz, m.stainless);
    // A scale with a label printer on a stand.
    b.box(0.4, 0.05, 0.4, at - run * 0.05, 1.0, cz - 0.8, m.stainless);
    b.box(0.05, 0.95, 0.05, at - run * 0.05, 0.5, cz - 0.8, m.steel);
    b.box(0.3, 0.2, 0.25, at - run * 0.05, 1.15, cz - 0.8, m.enclosure);
  }
  // Packed pallets staged after the lines, some wrapped in film, and a stretch-wrapper turntable.
  const from = -len / 2 + run + 1.3;
  const room = len / 2 - from;
  if (room >= 1.1) {
    const cols = count(room, 1.4, 4);
    const rows = count(cross, 1.4, 4);
    spread(cols, room).forEach((a, i) => spread(rows, cross).forEach((cz, j) => cartons(b, m, from + room / 2 + a, cz, 3 + ((i + j) % 3), (i + j) % 2 === 0)));
    if (cross >= 2.6) {
      b.cyl(0.8, 0.1, from - 0.4, 0.05, -cross / 2 + 0.5, 'y', m.enclosure, 20);
      b.box(0.06, 2.0, 0.1, from - 0.4, 1.0, -cross / 2 + 1.35, m.steel);
    }
  }
  person(b, m, at, cross / 2 + 0.2, Math.PI);
}

function dock(b: Bag, m: Mats, L: number, C: number, len: number) {
  // The dock leveller across the way in, with yellow edges and a rubber bumper at each side; pallets staged down both sides.
  b.box(Math.min(2.2, L), 0.06, C * 0.5, 0, 0.45, 0, m.plate);
  for (const s of [-1, 1]) {
    b.box(Math.min(2.2, L), 0.03, 0.08, 0, 0.49, (s * C * 0.5) / 2, m.safety);
    b.box(0.25, 0.4, 0.25, 0, 0.3, s * (C * 0.5 / 2 + 0.3), m.rubber);
  }
  if (C >= 4.5 && L >= 1.4) {
    const n = count(len, 1.5, 5);
    spread(n, len).forEach((a, i) => {
      for (const s of [-1, 1]) cartons(b, m, a, s * (C / 2 - 0.75), 3 + ((i + (s > 0 ? 1 : 0)) % 3), (i + (s > 0 ? 1 : 0)) % 2 === 0);
    });
  }
  if (C >= 5 && L >= 4) forklift(b, m, -L / 2 + 1.5, C / 2 - 1.4, -0.3);
}

/** The refrigeration plant room (owner's view only): compressor skids, oil separators, receiver, control cabinet, lines. */
function machinery(b: Bag, m: Mats, len: number, cross: number) {
  const skids = count(len, 3.4, 3);
  const sw = Math.min(2.8, (len / skids) * 0.8);
  const sd = Math.min(1.3, cross * 0.3);
  spread(skids, len).forEach((a) => {
    const cz = -cross / 2 + sd / 2 + 0.6;
    b.box(sw, 0.12, sd, a, 0.06, cz, m.steel);
    // Motor, the screw compressor and its oil separator standing beside them.
    b.cyl(0.32, 0.9, a - sw * 0.3, 0.55, cz, 'x', m.paint, 14);
    b.box(0.75, 0.55, 0.6, a + sw * 0.02, 0.5, cz, m.stainless);
    b.cyl(0.3, 1.2, a + sw * 0.32, 0.72, cz, 'y', m.machineWhite, 14);
    b.cyl(0.04, sw * 0.9, a, 1.25, cz + sd / 2 - 0.1, 'x', m.copper, 8);
    b.cyl(0.07, sw * 0.9, a, 1.12, cz - sd / 2 + 0.1, 'x', m.pipe, 8);
  });
  // A horizontal receiver vessel and the electrical control cabinet along the far wall.
  const rz = cross / 2 - 0.9;
  b.cyl(0.4, Math.min(3.2, len * 0.4), -len * 0.15, 0.6, rz, 'x', m.machineWhite, 16);
  for (const sx of [-1, 1]) b.box(0.1, 0.4, 0.5, -len * 0.15 + sx * Math.min(1.2, len * 0.15), 0.2, rz, m.steel);
  b.box(Math.min(2.4, len * 0.3), 2.0, 0.5, len * 0.3, 1.0, cross / 2 - 0.35, m.enclosure);
  b.box(0.06, 0.06, 0.02, len * 0.3 - 0.4, 1.7, cross / 2 - 0.09, m.btnGreen);
  b.box(0.06, 0.06, 0.02, len * 0.3 - 0.25, 1.7, cross / 2 - 0.09, m.btnRed);
  // A yellow guard rail across the front of the plant, and a hazard line on the floor.
  b.box(len * 0.9, 0.05, 0.05, 0, 1.0, -cross / 2 + 0.1, m.safety);
  for (const a of spread(Math.max(2, Math.round(len / 2)), len * 0.9)) b.box(0.05, 1.0, 0.05, a, 0.5, -cross / 2 + 0.1, m.safety);
}

/**
 * The equipment of one work zone, in the zone's own frame. `L` and `C` are the zone's long and short sides (metres).
 * Null for a zone too small to hold any.
 */
export function zoneEquipment(kit: Kit, key: ZoneKey, L: number, C: number): Obj | null {
  if (L < 1 || C < 0.5) return null;
  const m = kit.mats;
  const b = new Bag(kit.T);
  // The machines take about four-fifths of the zone each way.
  const len = L * 0.82;
  const cross = C * 0.78;
  switch (key) {
    case 'cleaning':
      receiving(b, m, len, cross);
      break;
    case 'grading':
      grading(b, m, len, cross);
      break;
    case 'sorting':
      sorting(b, m, len, cross);
      break;
    case 'packing':
      packing(b, m, len, cross);
      break;
    case 'machinery':
      machinery(b, m, len, cross);
      break;
    case 'dock':
      dock(b, m, L, C, len);
      break;
  }
  return b.build();
}
