/**
 * What makes the 3D store look like a working cold store, placed from the
 * owner's measurements:
 *
 *   coolers   evaporator units high on the wall the owner named (unsaid:
 *             the wall facing the door),
 *             their fans blowing towards the door, with the refrigerant
 *             pipes (insulated suction line, copper liquid line) running
 *             along that wall under the ceiling;
 *   curtains  clear PVC strip curtains hanging in each chamber's doorway;
 *   outside   condensing units along the building's back wall;
 *   walkOnly  the ceilings, the hall's roof with its trusses, and the LED
 *             lights under them — shown only when walking (from outside the
 *             roof stays off, so you can look in).
 *
 * How many there are follows the size of each room: they show what a cold
 * store looks like inside, not this store's own machines (the page says so).
 * Older chambers not drawn to scale get only their curtain. Repeated parts
 * (fans, lights, strips) are instanced, so phones stay smooth.
 */
import type { Kit, Origin } from '@/components/rental/three/buildStore';
import type { Rect, SceneChamber, StoreScene } from '@/components/rental/three/storeScene';

type Three = typeof import('three');
type Obj = InstanceType<Three['Object3D']>;
type Geo = import('three').BufferGeometry;
type Mat = InstanceType<Three['Material']>;

export interface Fixtures {
  group: Obj;
  /** Ceilings, roof and lights: visible only when walking. */
  walkOnly: Obj;
}

/** Repeat a texture every `every` metres across the top of a flat box. */
function tileTop(geo: Geo, su: number, sv: number) {
  const uv = geo.getAttribute('uv') as import('three').BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function buildFixtures(kit: Kit, scene: StoreScene, o: Origin): Fixtures {
  const { T, mats } = kit;
  const group = new T.Group();
  const walkOnly = new T.Group();
  group.add(walkOnly);
  const X = (x: number) => x - o.ox;
  const Z = (y: number) => o.oy - y;

  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: Mat, parent: Obj = group) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  /** A pipe `len` long, along world x or world z. */
  const pipe = (len: number, r: number, x: number, y: number, z: number, alongX: boolean, mat: Mat) => {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 10), mat);
    if (alongX) m.rotation.z = Math.PI / 2;
    else m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    group.add(m);
  };
  /** A ceiling (a flat panel at height `y`, plan rectangle `r`), seen only when walking. */
  const ceiling = (r: Rect, y: number, mat: Mat, every: number) => {
    const g = new T.BoxGeometry(r.w, 0.08, r.d);
    tileTop(g, r.w / every, r.d / every);
    const m = new T.Mesh(g, mat);
    m.position.set(X(r.x + r.w / 2), y + 0.04, Z(r.y + r.d / 2));
    walkOnly.add(m);
  };

  // Instances gathered from every room, drawn in one go per kind.
  type Fan = { x: number; y: number; z: number; nx: number; ny: number; nz: number; r: number };
  const fans: Fan[] = [];
  const lamps: { x: number; y: number; z: number; len: number; alongX: boolean }[] = [];
  const bays: { x: number; y: number; z: number }[] = [];
  const strips: { x: number; y: number; z: number; h: number; alongX: boolean }[] = [];

  /** LED battens in rows under a ceiling at height `top` over the plan rectangle `r`. */
  const lightRows = (r: Rect, top: number) => {
    const alongX = r.w >= r.d;
    const long = alongX ? r.w : r.d;
    const short = alongX ? r.d : r.w;
    const rows = clamp(Math.round(short / 3), 1, 8);
    const per = clamp(Math.round(long / 3.5), 1, 12);
    const len = Math.min(1.2, (long / per) * 0.6);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < per; j++) {
        const a = ((j + 0.5) / per) * long;
        const b = ((i + 0.5) / rows) * short;
        const px = alongX ? r.x + a : r.x + b;
        const py = alongX ? r.y + b : r.y + a;
        lamps.push({ x: X(px), y: top - 0.05, z: Z(py), len, alongX });
      }
    }
  };

  const chamber = (c: SceneChamber) => {
    const r = c.rect;
    const H = c.h;
    const inw = c.inward;
    // Clear PVC strips in the doorway, just inside the wall.
    if (c.door) {
      const alongX = Math.abs(c.door.y2 - c.door.y1) < 1e-6;
      const dw = Math.hypot(c.door.x2 - c.door.x1, c.door.y2 - c.door.y1);
      const n = Math.max(2, Math.ceil(dw / 0.17));
      const h = Math.max(0.5, c.doorH - 0.06);
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        const px = c.door.x1 + (c.door.x2 - c.door.x1) * t + inw.x * 0.12;
        const py = c.door.y1 + (c.door.y2 - c.door.y1) * t + inw.y * 0.12;
        strips.push({ x: X(px), y: c.doorH - h / 2, z: Z(py), h, alongX });
      }
    }
    if (!c.toScale || H < 2.4) return;

    // Ceiling, and lights under it and under each steel deck.
    ceiling({ x: r.x + 0.07, y: r.y + 0.07, w: r.w - 0.14, d: r.d - 0.14 }, H - 0.08, mats.ceiling, 1.15);
    const tops = c.floors.map((f, i) => (i + 1 < c.floors.length ? c.floors[i + 1].z0 - 0.1 : H - 0.08));
    for (const top of tops) lightRows(r, top);

    // Evaporators on the wall the owner named (unsaid: the one facing the door), blowing into the room.
    const to = c.coolerTo;
    const alongX = Math.abs(to.y) > 0.5;
    const wallLen = alongX ? r.w : r.d;
    const n = clamp(Math.round(wallLen / 6), 1, 6);
    const uw = Math.min(2.2, (wallLen / n) * 0.75);
    const uh = 0.7;
    const ud = 0.75;
    const cy = H - 0.3 - uh / 2;
    const far = alongX ? (to.y > 0 ? r.y + r.d : r.y) : to.x > 0 ? r.x + r.w : r.x;
    // The unit's front (fans) faces away from its wall: -to in the plan; world z is the plan's y reversed.
    const nx = -to.x;
    const nz = to.y;
    const fansEach = Math.max(1, Math.round(uw / 0.75));
    const fr = Math.min(0.27, uh * 0.38);
    for (let i = 0; i < n; i++) {
      const a = (alongX ? r.x : r.y) + (wallLen * (i + 0.5)) / n;
      const off = ud / 2 + 0.1;
      const px = alongX ? a : far - to.x * off;
      const py = alongX ? far - to.y * off : a;
      box(alongX ? uw : ud, uh, alongX ? ud : uw, X(px), cy, Z(py), mats.cooler);
      // The drip tray under it.
      box(alongX ? uw + 0.1 : ud + 0.1, 0.05, alongX ? ud + 0.1 : uw + 0.1, X(px), cy - uh / 2 - 0.03, Z(py), mats.guard);
      for (let k = 0; k < fansEach; k++) {
        const s = ((k + 0.5) / fansEach - 0.5) * uw;
        const fx = (alongX ? px + s : px) - to.x * (ud / 2 + 0.012);
        const fy = (alongX ? py : py + s) - to.y * (ud / 2 + 0.012);
        fans.push({ x: X(fx), y: cy + 0.03, z: Z(fy), nx, ny: 0, nz, r: fr });
      }
    }
    // The refrigerant lines along that wall, under the ceiling.
    const lineAt = (off: number) => {
      const px = alongX ? r.x + r.w / 2 : far - to.x * off;
      const py = alongX ? far - to.y * off : r.y + r.d / 2;
      return { x: X(px), z: Z(py) };
    };
    const suction = lineAt(0.12);
    pipe(wallLen * 0.96, 0.05, suction.x, H - 0.16, suction.z, alongX, mats.pipe);
    const liquid = lineAt(0.24);
    pipe(wallLen * 0.96, 0.014, liquid.x, H - 0.14, liquid.z, alongX, mats.copper);
  };
  for (const c of scene.chambers) chamber(c);

  // The hall: its roof on steel trusses, high-bay lights between the chambers; condensers outside at the back.
  if (scene.building) {
    const hall = scene.hall;
    const H = scene.building.height;
    ceiling(hall, H, mats.roof, 3);
    const trusses = clamp(Math.round(hall.d / 6), 1, 20);
    for (let i = 0; i < trusses; i++) {
      const py = hall.y + ((i + 0.5) / trusses) * hall.d;
      box(hall.w, 0.32, 0.14, X(hall.x + hall.w / 2), H - 0.2, Z(py), mats.beam, walkOnly);
    }
    const under = (px: number, py: number) => scene.chambers.some((c) => px > c.rect.x - 0.3 && px < c.rect.x + c.rect.w + 0.3 && py > c.rect.y - 0.3 && py < c.rect.y + c.rect.d + 0.3);
    const cols = clamp(Math.round(hall.w / 6), 1, 20);
    const rows = clamp(Math.round(hall.d / 6), 1, 20);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const px = hall.x + ((i + 0.5) / cols) * hall.w;
        const py = hall.y + ((j + 0.5) / rows) * hall.d;
        if (!under(px, py)) bays.push({ x: X(px), y: H - 0.7, z: Z(py) });
      }
    }
    // Condensing units on the ground behind the building, fans on top, lines into the wall.
    const units = clamp(scene.chambers.filter((c) => c.toScale).length, 1, 6);
    const back = hall.y + hall.d;
    const cw = Math.min(2.4, (hall.w / units) * 0.7);
    for (let i = 0; i < units; i++) {
      const px = hall.x + ((i + 0.5) / units) * hall.w;
      const py = back + 1.4;
      box(cw, 1.3, 1.1, X(px), 0.65, Z(py), mats.condenser);
      for (const s of cw > 1.6 ? [-0.25, 0.25] : [0]) fans.push({ x: X(px + s * cw), y: 1.31, z: Z(py), nx: 0, ny: 1, nz: 0, r: Math.min(0.42, cw * 0.2) });
      pipe(0.9, 0.05, X(px), 1.0, Z(back + 0.45), false, mats.pipe);
    }
  }

  // ── The repeated parts, one draw each ──
  const m4 = new T.Matrix4();
  const q = new T.Quaternion();
  const pos = new T.Vector3();
  const scl = new T.Vector3();
  const up = new T.Vector3(0, 1, 0);
  const fwd = new T.Vector3(0, 0, 1);
  const dir = new T.Vector3();
  const add = (geo: Geo, mat: Mat, count: number, set: (i: number) => void, parent: Obj = group) => {
    if (!count) {
      geo.dispose();
      return;
    }
    const mesh = new T.InstancedMesh(geo, mat, count);
    for (let i = 0; i < count; i++) {
      set(i);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
    return mesh;
  };
  // Fan faces: a disc turned to face its way; the guard ring round it.
  add(new T.CylinderGeometry(1, 1, 0.03, 24), mats.fan, fans.length, (i) => {
    const f = fans[i];
    q.setFromUnitVectors(up, dir.set(f.nx, f.ny, f.nz).normalize());
    m4.compose(pos.set(f.x, f.y, f.z), q, scl.set(f.r, 1, f.r));
  });
  add(new T.TorusGeometry(1, 0.06, 6, 28), mats.guard, fans.length, (i) => {
    const f = fans[i];
    q.setFromUnitVectors(fwd, dir.set(f.nx, f.ny, f.nz).normalize());
    m4.compose(pos.set(f.x + f.nx * 0.02, f.y + f.ny * 0.02, f.z + f.nz * 0.02), q, scl.set(f.r, f.r, f.r));
  });
  // LED battens under the ceilings, round high-bay lights in the hall.
  add(new T.BoxGeometry(1, 1, 1), mats.lamp, lamps.length, (i) => {
    const l = lamps[i];
    q.identity();
    m4.compose(pos.set(l.x, l.y, l.z), q, l.alongX ? scl.set(l.len, 0.04, 0.09) : scl.set(0.09, 0.04, l.len));
  }, walkOnly);
  add(new T.CylinderGeometry(0.3, 0.38, 0.12, 20), mats.lamp, bays.length, (i) => {
    q.identity();
    m4.compose(pos.set(bays[i].x, bays[i].y, bays[i].z), q, scl.set(1, 1, 1));
  }, walkOnly);
  // Strip curtains: overlapping clear strips, 20 cm wide.
  const curtain = add(new T.BoxGeometry(1, 1, 1), mats.curtain, strips.length, (i) => {
    const s = strips[i];
    q.identity();
    m4.compose(pos.set(s.x, s.y, s.z), q, s.alongX ? scl.set(0.2, s.h, 0.006) : scl.set(0.006, s.h, 0.2));
  });
  if (curtain) curtain.renderOrder = 2;

  return { group, walkOnly };
}
