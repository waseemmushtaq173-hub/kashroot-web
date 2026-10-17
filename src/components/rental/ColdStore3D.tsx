'use client';

/**
 * The whole cold store in 3D: every chamber as a room along the corridor,
 * each place as a stack of crates coloured by what it is — booked stacks
 * stand full height, free places are blue floor spaces, your boxes are
 * violet, your choice is green. Drag to turn, pinch / scroll to zoom, tap a
 * place to choose it (when booking) or to see whose it is (owner).
 * A chamber with a measured size is built to scale in metres: its walls,
 * height, the door and windows where the owner measured them, the walkway, and every stack where it stands, as many boxes
 * high as the store stacks them (lib/coldLayout).
 *
 * three.js is imported inside the effect (only when this view opens), the
 * scene renders only when something moves or changes, and the WebGL context
 * is released when the view closes. Without WebGL the floor plan is the way.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';

import { PLACE_LOOK, placesOf, type Look } from '@/components/rental/placeLook';
import { parsePlace, placeLabel, usablePlaces, type ColdChamber } from '@/lib/db/coldMap';
import { placeDirections, planOf, showLength, type ChamberPlan, type ChamberSize } from '@/lib/coldLayout';

const PITCH = 1.2; // between the centres of two places
const PAD = 0.7; // wall to the first stack
const GAP = 2; // between two chambers (room for the next room's row numbers)
const WALL_H = 1.1;
const STACK_H = 1.4;
const CORRIDOR = 3;

interface Cell {
  room: number;
  row: number;
  col: number;
  slot: string;
  look: Look;
  /** Boxes that still fit on the place. */
  free: number;
  /** How full the place is (0–1), for a place shared with other farmers. */
  full: number;
}

interface Room {
  c: ColdChamber;
  x0: number;
  w: number;
  d: number;
  /** Wall height. */
  h: number;
  /** A measured chamber, built to scale. */
  sized: { size: ChamberSize; plan: ChamberPlan } | null;
}

function layout(chambers: ColdChamber[]): { rooms: Room[]; width: number; depth: number } {
  const rooms: Room[] = [];
  let x = 0;
  for (const c of chambers) {
    const sized = c.size ? { size: c.size, plan: planOf(c.size) } : null;
    const w = sized ? sized.size.width : c.cols * PITCH + 2 * PAD;
    const d = sized ? sized.size.length : c.rows * PITCH + 2 * PAD;
    rooms.push({ c, x0: x, w, d, h: sized ? sized.size.height : WALL_H, sized });
    x += w + GAP;
  }
  const width = Math.max(0, x - GAP);
  for (const r of rooms) r.x0 -= width / 2;
  return { rooms, width, depth: Math.max(1, ...rooms.map((r) => r.d)) };
}

/** Where a place stands (its centre): row 1 by the front wall (z = 0), rooms go back (−z). */
function spot(room: Room, row: number, col: number) {
  const s = room.sized;
  if (s && s.plan.colX[col] !== undefined && s.plan.rowZ[row - 1] !== undefined) {
    return { x: room.x0 + s.plan.colX[col] + s.plan.placeW / 2, z: -(s.plan.rowZ[row - 1] + s.plan.placeD / 2) };
  }
  return { x: room.x0 + PAD + (col + 0.5) * PITCH, z: -(PAD + (row - 0.5) * PITCH) };
}
/** A place's footprint on the floor. */
const footprint = (room: Room) => (room.sized ? { w: room.sized.plan.placeW * 0.98, d: room.sized.plan.placeD * 0.98 } : { w: PITCH * 0.82, d: PITCH * 0.82 });
/** How tall a stack of boxes stands at this place (a shared place: as full as it is). */
function stackHeight(room: Room, look: Look, part = 1) {
  const full = room.sized ? room.sized.plan.stackHeight : STACK_H;
  return look === 'held' ? full * 0.75 : look === 'part' ? full * Math.min(1, Math.max(0.12, part)) : full;
}

interface Api {
  setData: (chambers: ColdChamber[], cells: Cell[]) => void;
  focus: (roomIndex: number | null) => void;
}

export function ColdStore3D({
  chambers,
  stateOf,
  roomOf,
  mode,
  onPlace,
  active,
  onActive,
}: {
  chambers: ColdChamber[];
  stateOf: (c: ColdChamber, slot: string) => Look;
  /** Boxes that still fit on a place (stable, like stateOf). */
  roomOf: (c: ColdChamber, slot: string) => number;
  mode: 'book' | 'owner' | 'view';
  onPlace?: (c: ColdChamber, slot: string, look: Look) => void;
  active: string | null;
  onActive: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const [failed, setFailed] = useState(false);
  const [focus, setFocus] = useState<string | 'all'>('all');

  const cells = useMemo<Cell[]>(
    () =>
      chambers.flatMap((c, room) =>
        placesOf(c).map(([row, col, slot]) => {
          const free = roomOf(c, slot);
          return { room, row, col, slot, look: stateOf(c, slot), free, full: 1 - free / Math.max(1, c.boxes_per_slot) };
        }),
      ),
    [chambers, stateOf, roomOf],
  );

  // The latest data and callbacks, for the scene (which is built once).
  const latest = useRef({ chambers, cells, mode, onPlace, onActive });
  useEffect(() => {
    latest.current = { chambers, cells, mode, onPlace, onActive };
    api.current?.setData(chambers, cells);
  }, [chambers, cells, mode, onPlace, onActive]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
      } catch {
        setFailed(true);
        return;
      }
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor('#e8f3fa');
      renderer.domElement.className = 'block h-full w-full rounded-3xl';
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', 'The whole cold store in 3D. Drag to turn it, pinch or scroll to zoom.');
      el.prepend(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !reduceMotion;
      controls.dampingFactor = 0.12;
      controls.maxPolarAngle = Math.PI * 0.46;
      controls.minDistance = 3;
      controls.screenSpacePanning = false;

      scene.add(new THREE.HemisphereLight('#ffffff', '#b6c2cf', 2.2));
      const sun = new THREE.DirectionalLight('#ffffff', 1.6);
      sun.position.set(6, 14, 10);
      scene.add(sun);

      // A crate face: slats and layers, tinted per place by the instance colour.
      const crate = document.createElement('canvas');
      crate.width = crate.height = 128;
      const g = crate.getContext('2d');
      if (g) {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, 128, 128);
        g.strokeStyle = '#8b97a6';
        g.lineWidth = 5;
        for (const y of [3, 43, 85, 125]) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(128, y);
          g.stroke();
        }
        g.lineWidth = 3;
        for (const x of [3, 64, 125]) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, 128);
          g.stroke();
        }
      }
      const crateTex = new THREE.CanvasTexture(crate);
      crateTex.colorSpace = THREE.SRGBColorSpace;
      // One box face, repeated box by box and layer by layer on a measured stack.
      const face = document.createElement('canvas');
      face.width = face.height = 64;
      const fg = face.getContext('2d');
      if (fg) {
        fg.fillStyle = '#ffffff';
        fg.fillRect(0, 0, 64, 64);
        fg.strokeStyle = '#7b8794';
        fg.lineWidth = 5;
        fg.strokeRect(2.5, 2.5, 59, 59);
        fg.fillStyle = '#9aa5b1';
        fg.fillRect(22, 12, 20, 7); // hand hole
      }
      const faceTex = new THREE.CanvasTexture(face);
      faceTex.colorSpace = THREE.SRGBColorSpace;
      faceTex.wrapS = faceTex.wrapT = THREE.RepeatWrapping;
      const aisleMat = new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 1 });
      // Measured chambers: lighter walls, and a faint full-height outline on each free place.
      const tallWallMat = new THREE.MeshStandardMaterial({ color: '#64748b', transparent: true, opacity: 0.14, depthWrite: false });
      const ghostMat = new THREE.MeshStandardMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.13, depthWrite: false });
      const edgeMat = new THREE.LineBasicMaterial({ color: '#475569', transparent: true, opacity: 0.5 });

      const unitBox = new THREE.BoxGeometry(1, 1, 1);
      unitBox.translate(0, 0.5, 0);
      const stackMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 });
      const tileMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
      const floorMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 1 });
      const corridorMat = new THREE.MeshStandardMaterial({ color: '#fde9b0', roughness: 1 });
      const doorMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.8 });
      const glassMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0ea5e9', emissiveIntensity: 0.25, transparent: true, opacity: 0.75, roughness: 0.2 });
      const wallMat = new THREE.MeshStandardMaterial({ color: '#64748b', transparent: true, opacity: 0.32, depthWrite: false });
      const hover = new THREE.LineSegments(new THREE.EdgesGeometry(unitBox), new THREE.LineBasicMaterial({ color: '#0f172a' }));
      hover.visible = false;
      scene.add(hover);

      let group = new THREE.Group();
      scene.add(group);
      let rooms: Room[] = [];
      let size = { width: 1, depth: 1 };
      // Instance id → cell, for each picking mesh.
      let picks: { mesh: InstanceType<typeof THREE.InstancedMesh>; cells: Cell[] }[] = [];
      let dirty = true;
      let fitted = '';

      const label = (title: string, sub: string, width: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 168;
        const c = canvas.getContext('2d');
        if (c) {
          c.fillStyle = 'rgba(255,255,255,0.94)';
          if (c.roundRect) {
            c.beginPath();
            c.roundRect(4, 4, 504, 160, 28);
            c.fill();
          } else c.fillRect(4, 4, 504, 160);
          c.textAlign = 'center';
          c.fillStyle = '#0f172a';
          let px = 60;
          do c.font = `700 ${px}px system-ui, sans-serif`;
          while (c.measureText(title).width > 470 && (px -= 4) > 24);
          c.fillText(title, 256, 78);
          c.fillStyle = '#0369a1';
          let sp = 44;
          do c.font = `600 ${sp}px system-ui, sans-serif`;
          while (c.measureText(sub).width > 480 && (sp -= 2) > 18);
          c.fillText(sub, 256, 138);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        s.scale.set(width, (width * 168) / 512, 1);
        s.renderOrder = 10;
        return s;
      };
      // A small "Row 5" marker beside a room.
      const rowTag = (text: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 96;
        const c = canvas.getContext('2d');
        if (c) {
          c.fillStyle = 'rgba(15,23,42,0.78)';
          if (c.roundRect) {
            c.beginPath();
            c.roundRect(4, 4, 248, 88, 22);
            c.fill();
          } else c.fillRect(4, 4, 248, 88);
          c.fillStyle = '#ffffff';
          c.font = '700 50px system-ui, sans-serif';
          c.textAlign = 'center';
          c.fillText(text, 128, 66);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        s.scale.set(1.1, 0.41, 1);
        s.renderOrder = 9;
        return s;
      };

      const disposeGroup = (gr: InstanceType<typeof THREE.Group>) => {
        gr.traverse((o) => {
          const m = o as unknown as { geometry?: { dispose: () => void }; material?: { dispose: () => void; map?: { dispose: () => void } | null } };
          // Sprites share one geometry inside three.js; instanced meshes free their own buffers.
          if (o instanceof THREE.InstancedMesh) o.dispose();
          else if (m.geometry && m.geometry !== unitBox && !(o instanceof THREE.Sprite)) m.geometry.dispose();
          if (m.material && ![stackMat, tileMat, floorMat, corridorMat, doorMat, glassMat, wallMat, aisleMat, edgeMat, tallWallMat, ghostMat].includes(m.material as never)) {
            m.material.map?.dispose();
            m.material.dispose();
          }
        });
      };

      const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: InstanceType<typeof THREE.Material>) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        group.add(m);
        return m;
      };

      const setData = (chs: ColdChamber[], cs: Cell[]) => {
        disposeGroup(group);
        scene.remove(group);
        group = new THREE.Group();
        scene.add(group);
        const L = layout(chs);
        rooms = L.rooms;
        size = { width: L.width, depth: L.depth };

        // Floors, the corridor in front, and low see-through walls with a door.
        box(L.width + 2, 0.04, CORRIDOR, 0, -0.02, CORRIDOR / 2, corridorMat);
        for (const r of rooms) {
          const cx = r.x0 + r.w / 2;
          const H = r.h;
          const wm = r.sized ? tallWallMat : wallMat;
          box(r.w, 0.04, r.d, cx, -0.02, -r.d / 2, floorMat);
          box(r.w, H, 0.12, cx, H / 2, -r.d, wm);
          box(0.12, H, r.d, r.x0, H / 2, -r.d / 2, wm);
          box(0.12, H, r.d, r.x0 + r.w, H / 2, -r.d / 2, wm);
          // The door — in front of the walkway for a measured chamber.
          const [d0, d1] = r.sized ? r.sized.plan.doorX : [(r.w - Math.min(1.6, r.w * 0.4)) / 2, (r.w + Math.min(1.6, r.w * 0.4)) / 2];
          const doorW = d1 - d0;
          if (r.sized) {
            // Cut away: no front wall, so the inside is in plain view — just the door frame, as high as measured.
            const doorH = r.sized.plan.doorH;
            box(0.14, doorH, 0.14, r.x0 + d0, doorH / 2, 0, doorMat);
            box(0.14, doorH, 0.14, r.x0 + d1, doorH / 2, 0, doorMat);
            box(doorW + 0.14, 0.14, 0.14, r.x0 + (d0 + d1) / 2, doorH, 0, doorMat);
          } else {
            if (d0 > 0.01) box(d0, H, 0.12, r.x0 + d0 / 2, H / 2, 0, wallMat);
            if (r.w - d1 > 0.01) box(r.w - d1, H, 0.12, r.x0 + (d1 + r.w) / 2, H / 2, 0, wallMat);
          }
          box(doorW, 0.06, 0.7, r.x0 + (d0 + d1) / 2, 0.01, 0.4, doorMat);
          if (r.sized) {
            // The room's full size as an outline, and the walkway on the floor.
            const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w, H, r.d)), edgeMat);
            outline.position.set(cx, H / 2, -r.d / 2);
            group.add(outline);
            // Windows and vents: glass in their walls (the front ones stand in the cut-away front wall).
            r.sized.plan.windows.forEach((win, i) => {
              const y = win.sill + win.height / 2;
              const along = win.wall === 'front' || win.wall === 'back';
              const z = win.wall === 'back' ? -r.d : 0;
              const m = along
                ? box(win.width, win.height, 0.18, r.x0 + win.at + win.width / 2, y, z, glassMat)
                : box(0.18, win.height, win.width, win.wall === 'left' ? r.x0 : r.x0 + r.w, y, -(win.at + win.width / 2), glassMat);
              m.renderOrder = 2;
              const t = rowTag(`W${i + 1}`);
              t.position.set(m.position.x + (win.wall === 'left' ? 0.5 : win.wall === 'right' ? -0.5 : 0), win.sill + win.height + 0.35, m.position.z + (win.wall === 'back' ? 0.4 : win.wall === 'front' ? -0.4 : 0));
              group.add(t);
            });
            const a = r.sized.plan.aisleX;
            if (a) {
              box(a[1] - a[0], 0.02, r.d - 0.1, r.x0 + (a[0] + a[1]) / 2, 0.012, -r.d / 2, aisleMat);
              const walk = rowTag('Walkway');
              walk.position.set(r.x0 + (a[0] + a[1]) / 2, 0.45, -Math.min(r.d * 0.5, 4));
              group.add(walk);
            }
          }
          const free = cs.filter((x) => x.room === rooms.indexOf(r)).reduce((n, x) => n + x.free, 0);
          const mine = cs.filter((x) => x.room === rooms.indexOf(r) && x.look === 'mine').length;
          const dims = r.sized ? `${showLength(r.sized.size.length, r.sized.size.unit)} × ${showLength(r.sized.size.width, r.sized.size.unit)} × ${showLength(H, r.sized.size.unit)} · ` : '';
          const holds = `holds ${(usablePlaces(r.c) * r.c.boxes_per_slot).toLocaleString('en-IN')} boxes`;
          const tag = label(r.c.name, `${dims}${holds} · ${mine ? `${mine} place${mine === 1 ? '' : 's'} yours · ` : ''}${free.toLocaleString('en-IN')} free`, Math.min(Math.max(r.w * 0.8, 2.8), r.sized ? 7 : 5));
          tag.position.set(cx, H + 1.1, -r.d - 0.2);
          group.add(tag);
          // Row numbers along the left wall: Row 1 by the door, then every fifth, and the last.
          for (let row = 1; row <= r.c.rows; row++) {
            if (row !== 1 && row !== r.c.rows && row % 5) continue;
            const t = rowTag(`Row ${row}`);
            const p = spot(r, row, 0);
            // Just outside its own left wall, so it reads as this chamber's row.
            t.position.set(r.x0 - 0.62, 0.35, p.z);
            group.add(t);
          }
        }
        const hall = label('Corridor', 'Door to each chamber', 2.2);
        hall.position.set(0, 0.45, CORRIDOR - 0.2);
        group.add(hall);

        // Stacks (booked, held, shared, yours, your choice) and floor spaces (free, none).
        const stacks = cs.filter((x) => x.look !== 'free' && x.look !== 'blocked');
        const tiles = cs.filter((x) => x.look === 'free' || x.look === 'blocked');
        const m4 = new THREE.Matrix4();
        const colour = new THREE.Color();
        picks = [];
        const add = (list: Cell[], mat: InstanceType<typeof THREE.Material>, height: (c: Cell) => number) => {
          if (!list.length) return;
          const mesh = new THREE.InstancedMesh(unitBox, mat, list.length);
          list.forEach((cell, i) => {
            const room = rooms[cell.room];
            const p = spot(room, cell.row, cell.col);
            const f = footprint(room);
            m4.makeScale(f.w, height(cell), f.d).setPosition(p.x, 0, p.z);
            mesh.setMatrixAt(i, m4);
            mesh.setColorAt(i, colour.set(PLACE_LOOK[cell.look].hex));
          });
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          group.add(mesh);
          picks.push({ mesh, cells: list });
        };
        // Measured chambers: their own box texture, one box per tile, one layer per row of tiles.
        rooms.forEach((room, ri) => {
          const list = stacks.filter((c) => c.room === ri);
          if (!room.sized) return add(list, stackMat, (c) => stackHeight(room, c.look, c.full));
          const { size: sz, plan } = room.sized;
          const tex = faceTex.clone();
          tex.needsUpdate = true;
          tex.repeat.set(Math.max(1, Math.round(plan.placeW / Math.max(sz.box.l, sz.box.w))), Math.max(1, plan.layers));
          add(list, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), (c) => stackHeight(room, c.look, c.full));
        });
        add(tiles, tileMat, (c) => (c.look === 'free' ? 0.1 : 0.03));
        // How high boxes will stand on each free or shared place of a measured chamber (not tappable).
        const ghosts = cs.filter((c) => (c.look === 'free' || c.look === 'part') && rooms[c.room]?.sized);
        if (ghosts.length) {
          const g = new THREE.InstancedMesh(unitBox, ghostMat, ghosts.length);
          ghosts.forEach((cell, i) => {
            const room = rooms[cell.room];
            const p = spot(room, cell.row, cell.col);
            const f = footprint(room);
            g.setMatrixAt(i, m4.makeScale(f.w, stackHeight(room, 'free'), f.d).setPosition(p.x, 0, p.z));
          });
          g.instanceMatrix.needsUpdate = true;
          g.raycast = () => undefined;
          group.add(g);
        }

        const sig = rooms.map((r) => `${r.c.id}:${r.c.rows}x${r.c.cols}:${r.w}x${r.d}`).join('|');
        if (sig !== fitted) {
          fitted = sig;
          frame(null, true);
        }
        dirty = true;
      };

      // Camera: the whole store, or one chamber, filling the view.
      let flight: { from: [number, number, number, number, number, number]; to: [number, number, number, number, number, number]; t0: number } | null = null;
      const frame = (roomIndex: number | null, instant = false) => {
        const r = roomIndex === null ? null : rooms[roomIndex];
        const w = r ? r.w : size.width + 2;
        const d = (r ? r.d : size.depth) + CORRIDOR;
        const cx = r ? r.x0 + r.w / 2 : 0;
        const cz = r ? -r.d / 2 + 0.8 : -size.depth / 2 + CORRIDOR / 2;
        // Tall measured chambers: keep the full height and the name above it in view.
        const tall = r ? r.h : Math.max(WALL_H, ...rooms.map((x) => x.h));
        const cy = Math.min(tall, 8) * 0.45;
        const v = THREE.MathUtils.degToRad(camera.fov / 2);
        const h = Math.atan(Math.tan(v) * camera.aspect);
        const dist = Math.max((w + 1.5) / 2 / Math.tan(h), (d * 0.8) / 2 / Math.tan(v), (tall + 3) / Math.tan(v)) + 1;
        const dir = new THREE.Vector3(0.28, 0.66, 0.86).normalize().multiplyScalar(dist);
        controls.maxDistance = Math.max(30, dist * 3);
        const to: [number, number, number, number, number, number] = [cx + dir.x, cy + dir.y, cz + dir.z, cx, cy, cz];
        const from: [number, number, number, number, number, number] = [camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z];
        if (instant || reduceMotion) {
          camera.position.set(to[0], to[1], to[2]);
          controls.target.set(to[3], to[4], to[5]);
          controls.update();
          dirty = true;
        } else flight = { from, to, t0: performance.now() };
      };

      // Picking: tap / click a place.
      const ray = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const hit = (clientX: number, clientY: number): Cell | null => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        ray.setFromCamera(pointer, camera);
        const found = ray.intersectObjects(picks.map((p) => p.mesh), false)[0];
        if (!found || found.instanceId === undefined) return null;
        return picks.find((p) => p.mesh === found.object)?.cells[found.instanceId] ?? null;
      };
      const describe = (cell: Cell) => {
        const c = latest.current.chambers[cell.room];
        if (!c) return '';
        const look = PLACE_LOOK[cell.look].label;
        const room = rooms[cell.room];
        const where = room?.sized ? placeDirections(room.sized.size, room.sized.plan, parsePlace(cell.slot).row, parsePlace(cell.slot).stack) : '';
        const boxes = cell.look === 'free' ? ` · ${c.boxes_per_slot} boxes` : cell.look === 'part' ? ` · room for ${cell.free} of ${c.boxes_per_slot} boxes` : '';
        return `${c.name} · ${placeLabel(cell.slot)} · ${look}${boxes}${where ? ` · ${where}` : ''}`;
      };
      const showTip = (cell: Cell | null, x: number, y: number) => {
        const t = tip.current;
        if (!t) return;
        if (!cell) {
          t.style.opacity = '0';
          hover.visible = false;
          dirty = true;
          return;
        }
        const rect = el.getBoundingClientRect();
        t.textContent = describe(cell);
        t.style.opacity = '1';
        t.style.left = `${Math.min(Math.max(8, x - rect.left + 12), rect.width - 220)}px`;
        t.style.top = `${Math.max(8, y - rect.top - 44)}px`;
        const room = rooms[cell.room];
        const p = spot(room, cell.row, cell.col);
        const f = footprint(room);
        const tall = cell.look === 'free' || cell.look === 'blocked' ? 0.12 : stackHeight(room, cell.look, cell.full);
        hover.scale.set(f.w * 1.04, tall + 0.02, f.d * 1.04);
        hover.position.set(p.x, 0, p.z);
        hover.visible = true;
        dirty = true;
      };

      let down: { x: number; y: number } | null = null;
      let hideTip = 0;
      const onDown = (e: PointerEvent) => {
        down = { x: e.clientX, y: e.clientY };
      };
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
        down = null;
        const cell = hit(e.clientX, e.clientY);
        showTip(cell, e.clientX, e.clientY);
        window.clearTimeout(hideTip);
        if (e.pointerType !== 'mouse') hideTip = window.setTimeout(() => showTip(null, 0, 0), 2600);
        if (!cell) return;
        const { chambers: chs, mode: md, onPlace: pick, onActive: act } = latest.current;
        const c = chs[cell.room];
        if (!c) return;
        act(c.id);
        if (md === 'book' && (cell.look === 'free' || cell.look === 'part' || cell.look === 'selected')) pick?.(c, cell.slot, cell.look);
        else if (md === 'owner') pick?.(c, cell.slot, cell.look);
      };
      let moveQueued = false;
      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse' || e.buttons || moveQueued) return;
        moveQueued = true;
        requestAnimationFrame(() => {
          moveQueued = false;
          const cell = hit(e.clientX, e.clientY);
          showTip(cell, e.clientX, e.clientY);
          const { mode: md } = latest.current;
          renderer.domElement.style.cursor = cell && (md === 'owner' || (md === 'book' && (cell.look === 'free' || cell.look === 'part' || cell.look === 'selected'))) ? 'pointer' : 'grab';
        });
      };
      const onLeave = () => showTip(null, 0, 0);
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointerup', onUp);
      renderer.domElement.addEventListener('pointermove', onMove);
      renderer.domElement.addEventListener('pointerleave', onLeave);
      controls.addEventListener('change', () => {
        dirty = true;
      });

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        dirty = true;
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      let raf = 0;
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (flight) {
          const t = Math.min(1, (performance.now() - flight.t0) / 650);
          const k = ease(t);
          const f = flight.from;
          const to = flight.to;
          camera.position.set(f[0] + (to[0] - f[0]) * k, f[1] + (to[1] - f[1]) * k, f[2] + (to[2] - f[2]) * k);
          controls.target.set(f[3] + (to[3] - f[3]) * k, f[4] + (to[4] - f[4]) * k, f[5] + (to[5] - f[5]) * k);
          if (t >= 1) flight = null;
          dirty = true;
        }
        if (controls.update() || dirty) {
          renderer.render(scene, camera);
          dirty = false;
        }
      };

      api.current = { setData, focus: (i) => frame(i) };
      setData(latest.current.chambers, latest.current.cells);
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(hideTip);
        ro.disconnect();
        controls.dispose();
        disposeGroup(group);
        for (const x of [unitBox, hover.geometry, stackMat, tileMat, floorMat, corridorMat, doorMat, glassMat, wallMat, aisleMat, edgeMat, tallWallMat, ghostMat, crateTex, faceTex, hover.material as { dispose: () => void }]) x.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        api.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  const go = (id: string | 'all') => {
    setFocus(id);
    if (id !== 'all') onActive(id);
    api.current?.focus(id === 'all' ? null : chambers.findIndex((c) => c.id === id));
  };

  if (failed) {
    return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">This phone or browser cannot show 3D. Use the Floor plan — it shows the same places.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Look at">
        <button type="button" onClick={() => go('all')} aria-pressed={focus === 'all'} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${focus === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>
          <Maximize2 className="h-4 w-4" aria-hidden /> Whole store
        </button>
        {chambers.map((c) => (
          <button key={c.id} type="button" onClick={() => go(c.id)} aria-pressed={focus === c.id} className={`cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold transition ${focus === c.id ? 'bg-sky-700 text-white' : active === c.id ? 'bg-sky-100 text-sky-900 ring-1 ring-sky-300' : 'bg-sky-50 text-sky-900 hover:bg-sky-100'}`}>
            {c.name}
          </button>
        ))}
      </div>
      <div ref={host} className="relative w-full touch-none select-none overflow-hidden rounded-3xl ring-1 ring-slate-900/10" style={{ height: 'min(62vh, 500px)' }}>
        <div ref={tip} aria-live="polite" className="pointer-events-none absolute z-10 max-w-[220px] rounded-xl bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity" />
      </div>
      <p className="text-xs text-slate-600">
        Drag to turn the store · pinch or scroll to zoom · two fingers to move.{' '}
        {mode === 'book' ? 'Tap a blue floor space to choose it; tap it again to undo.' : mode === 'owner' ? 'Tap a stack to see whose boxes they are.' : 'Your boxes are the violet stacks.'}
      </p>
    </div>
  );
}
