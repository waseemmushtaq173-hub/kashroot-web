'use client';

/**
 * The KashRoot cold store's real digital twin in 3D (components/rental/ColdStoreTwin):
 * the facility itself, built by the headless twin pipeline (public/models/
 * kashroot_coldstore_twin.glb) and described by its published metadata JSON.
 * Unlike ColdStore3D (which draws the owner's typed numbers from scratch),
 * this is the built store: instance i of Crates_CHxx stands exactly where the
 * engine's cell i stands. Same raw three.js API as ColdStore3D — no wrapper
 * libraries — so it behaves the same in a browser and on a phone.
 *
 *   orbit/zoom/pan   drag to turn, pinch or scroll, right-drag to push
 *   roof off         the roof and gutters lift away so the chambers show
 *   see-through      the PUF panels and doors turn to glass
 *   floor chips      one rack level stays, the other levels empty out
 *   click a chamber  the camera walks to it (or "Whole store" for outside)
 *   click a crate    whose crates they are: grower, place, weight
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { cellAt, cratesText, tonnesOf } from '@/lib/twin/engine';
import { crateInfoAt, fetchTwinMeta, growersOf, type TwinChamberMeta, type TwinCrateInfo, type TwinMetadata } from '@/lib/twin/metadata';

/** Engine space (X across, Y depth, Z up) → three.js space (x, z_up, −y). */
const G3 = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

/** A chamber's bounds in three.js space, from the metadata rect [x0,y0,z0,x1,y1,z1]. */
const threeBox = (rect: TwinChamberMeta['rect']): { min: [number, number, number]; max: [number, number, number] } => {
  const [x0, y0, z0, x1, y1, z1] = rect;
  return { min: G3(x0, y1, z0), max: G3(x1, y0, z1) };
};

/** Panels and doors that turn see-through (the exporter's material names). */
const GLASSY_MATS = ['krt.puf_panel_out', 'krt.puf_panel_in', 'krt.partition_panel', 'krt.ca_door'] as const;

/** The published crate id, from the engine's grid standing point. */
const crateIdAt = (ch: TwinChamberMeta, i: number): string => {
  const c = cellAt(i, { crates_per_level: ch.crates_per_level, crates_per_row_fit: ch.crates_per_row_fit, rows_per_level_fit: ch.rows_per_level_fit, levels_per_chamber: ch.levels_per_chamber, booked_count: ch.booked_count });
  return `Crate_${ch.id}_L${c.level}_R${c.row}_C${(c.subrow - 1) * ch.crates_per_row_fit + c.col}`;
};

type ThreeNS = typeof import('three');

/** One instanced crate fixture, remembered so the floor filter can empty and restore it. */
interface Inst {
  mesh: InstanceType<ThreeNS['InstancedMesh']>;
  chamber: TwinChamberMeta;
  saved: Float32Array;
}

export interface ColdStoreTwinProps {
  /** Grower to light up in the racks (a twin metadata grower id), or null. */
  grower?: string | null;
}

export function ColdStoreTwin({ grower = null }: ColdStoreTwinProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const api = useRef<{
    cutaway: (on: boolean) => void;
    seeThrough: (on: boolean) => void;
    paint: (growerId: string | null, tap: TwinCrateInfo | null, floorN: number | null) => void;
    enter: (id: string | null) => void;
    at: (nx: number, ny: number) => { crate: TwinCrateInfo | null; chamber: string | null };
  } | null>(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [meta, setMeta] = useState<TwinMetadata | null>(null);
  const [cutaway, setCutaway] = useState(true);
  const [walls, setWalls] = useState(true);
  const [floor, setFloor] = useState<number | null>(null);
  const [entered, setEntered] = useState<string | null>(null);
  const [picked, setPicked] = useState<TwinCrateInfo | null>(null);

  const chambers = useMemo(() => meta?.chambers ?? [], [meta]);
  const levels = useMemo(() => chambers.reduce((n, c) => Math.max(n, c.levels_per_chamber), 0), [chambers]);
  const enteredChamber = chambers.find((c) => c.id === entered) ?? null;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const T = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      try {
        const [loaded, warm] = await Promise.all([
          new Promise<{ scene: InstanceType<typeof T.Group> }>((ok, bad) => {
            new GLTFLoader().load('/models/kashroot_coldstore_twin.glb', (g: { scene: InstanceType<typeof T.Group> }) => ok({ scene: g.scene }), undefined, () => bad(new Error('glb')));
          }),
          fetchTwinMeta().catch(() => null),
        ]);
        const meta0 = warm;
        if (!meta0) throw new Error('world');
        if (disposed) return;
        setMeta(meta0);

        const phone = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640;
        const renderer = new T.WebGLRenderer({ antialias: !phone, powerPreference: phone ? 'low-power' : 'default' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2));
        renderer.setClearColor('#e3edf5');
        const cv = renderer.domElement;
        cv.className = 'block h-full w-full rounded-3xl outline-none';
        cv.setAttribute('role', 'img');
        cv.setAttribute('aria-label', 'The KashRoot cold store digital twin. Drag to turn it, pinch or scroll to zoom, tap a crate to see whose it is.');
        el.prepend(cv);

        const world = new T.Scene();
        const camera = new T.PerspectiveCamera(46, 1, 0.1, 400);
        camera.rotation.order = 'YXZ';
        const controls = new OrbitControls(camera, cv);
        controls.maxPolarAngle = Math.PI * 0.495;
        controls.minDistance = 1.5;
        world.add(new T.HemisphereLight('#ffffff', '#8aa0b4', 1.35));
        const sun = new T.DirectionalLight('#fff7ed', 1.5);
        sun.position.set(-30, 60, 40);
        world.add(sun);
        const fill = new T.DirectionalLight('#dbeafe', 0.5);
        fill.position.set(45, 40, -50);
        world.add(fill);

        const root = loaded.scene;
        world.add(root);

        // ── What the exporter shipped ──
        const roofs: InstanceType<typeof T.Object3D>[] = [];
        root.traverse((o) => {
          if (o.name === 'Building/Roof' || o.name.startsWith('Roof_')) roofs.push(o);
        });
        const glass = new Map<string, { m: InstanceType<typeof T.Material>; opacity: number; transparent: boolean }>();
        root.traverse((o) => {
          const mesh = o as { isMesh?: boolean; material?: unknown };
          if (!mesh.isMesh || !mesh.material) return;
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const raw of list) {
            const m = raw as InstanceType<typeof T.Material>;
            const named = m as unknown as { name?: string; opacity: number; transparent: boolean };
            if (!named.name || glass.has(named.name)) continue;
            glass.set(named.name, { m, opacity: named.opacity, transparent: named.transparent });
          }
        });
        const insts: Inst[] = [];
        const apples: InstanceType<typeof T.Object3D>[] = [];
        root.traverse((o) => {
          const mesh = o as unknown as InstancedMeshProbe;
          if (!(mesh as { isInstancedMesh?: boolean }).isInstancedMesh) return;
          const room = /^Crates_(CH\d\d)$/.exec(o.name);
          if (room) {
            const ch = meta0.chambers.find((c) => c.id === room[1]);
            if (ch) insts.push({ mesh: mesh as unknown as Inst['mesh'], chamber: ch, saved: Float32Array.from((mesh.instanceMatrix.array as Float32Array).slice(0)) });
          } else if (/^Apples_(CH\d\d)$/.test(o.name)) {
            apples.push(o);
          }
        });
        const shells: { id: string; object: InstanceType<typeof T.Object3D> }[] = [];
        root.traverse((o) => {
          const room = /^Chamber_(CH\d\d)/.exec(o.name);
          const door = /^Door_(CH\d\d)/.exec(o.name);
          if ((o as { isMesh?: boolean }).isMesh && (room ?? door)) shells.push({ id: (room ?? door)![1], object: o });
        });
        const chamberOf = (o: InstanceType<typeof T.Object3D>): string | null => {
          let p: InstanceType<typeof T.Object3D> | null = o;
          while (p) {
            if (/^Chamber_(CH\d\d)$/.test(p.name) || /^Door_CH\d\d/.test(p.name)) {
              const hit = shells.find((sh) => sh.object === p);
              if (hit) return hit.id;
            }
            p = p.parent;
          }
          return null;
        };

        // ── Camera ──
        const whole = new T.Box3().setFromObject(root);
        const wc = whole.getCenter(new T.Vector3());
        const ws = whole.getSize(new T.Vector3());
        let flight: { from: number[]; to: number[]; t0: number } | null = null;
        const poseWhole = (): { pos: number[]; target: number[] } => {
          const dir = new T.Vector3(0, 0.62, 1).normalize();
          const dist = Math.max(ws.length() * 0.64, 30);
          return { pos: wc.clone().add(dir.multiplyScalar(dist)).toArray(), target: wc.toArray() };
        };
        const poseChamber = (rect: TwinChamberMeta['rect']): { pos: number[]; target: number[] } => {
          const b = threeBox(rect);
          const cx = (b.min[0] + b.max[0]) / 2;
          const cy = (b.min[1] + b.max[1]) / 2;
          const cz = (b.min[2] + b.max[2]) / 2;
          const size = Math.max(b.max[0] - b.min[0], (b.max[1] - b.min[1]) * 2.1, (b.max[2] - b.min[2]) * 1.5);
          return { pos: [cx, cy * 1.25 + 2.2, cz + size * 1.5], target: [cx, cy, cz] };
        };
        const start = poseWhole();
        camera.position.set(start.pos[0], start.pos[1], start.pos[2]);
        controls.target.set(start.target[0], start.target[1], start.target[2]);
        controls.update();
        const flyTo = (p: { pos: number[]; target: number[] }) => {
          flight = { from: [camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z], to: [...p.pos, ...p.target], t0: performance.now() };
          kick();
        };

        // Frames: only while the camera flies; free renders on each change.
        const render = () => renderer.render(world, camera);
        let raf = 0;
        function loop(now: number) {
          raf = 0;
          if (!flight) return;
          const k = Math.min(1, (now - flight.t0) / 620);
          const e = 1 - (1 - k) ** 2.4;
          const a = flight.from;
          const b = flight.to;
          camera.position.set(a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e);
          controls.target.set(a[3] + (b[3] - a[3]) * e, a[4] + (b[4] - a[4]) * e, a[5] + (b[5] - a[5]) * e);
          camera.lookAt(controls.target);
          render();
          if (k < 1) raf = requestAnimationFrame(loop);
          else flight = null;
        }
        const kick = () => {
          if (!raf) raf = requestAnimationFrame(loop);
        };
        controls.addEventListener('change', () => {
          if (!flight && !raf) render();
        });

        // ── Toggles ──
        const ac = new AbortController();
        const sig = { signal: ac.signal } as AddEventListenerOptions;
        const zero = new T.Matrix4().makeScale(0, 0, 0);
        let marks: { mesh: InstanceType<typeof T.InstancedMesh>; material: InstanceType<typeof T.MeshStandardMaterial> }[] = [];

        const paint = (growerId: string | null, tap: TwinCrateInfo | null, floorN: number | null) => {
          for (const m of marks) {
            m.mesh.parent?.remove(m.mesh);
            m.material.dispose();
          }
          marks = [];
          // The base racks obey the floor filter.
          for (const inst of insts) {
            const per = inst.chamber.crates_per_level;
            const count = inst.chamber.levels_per_chamber;
            for (let i = 0; i < inst.mesh.count; i++) {
              const lv = count > 0 ? 1 + Math.floor(i / per) : 1;
              inst.mesh.setMatrixAt(i, floorN === null || lv === floorN ? new T.Matrix4().fromArray(inst.saved, i * 16) : zero);
            }
            inst.mesh.instanceMatrix.needsUpdate = true;
          }
          for (const a of apples) a.visible = floorN === null;
          // Grower's crates glow in a separate overlay mesh: the shipped look
          // of every other crate stays exactly as the exporter painted it.
          if (growerId || tap) {
            for (const inst of insts) {
              const green: number[] = [];
              if (growerId) {
                for (const s of inst.chamber.booked_spans) {
                  if (s.grower_id !== growerId) continue;
                  for (let i = s.start; i <= s.end; i++) {
                    if (floorN !== null && 1 + Math.floor(i / inst.chamber.crates_per_level) !== floorN) continue;
                    green.push(i);
                  }
                }
              }
              let amber = -1;
              if (tap && tap.chamberId === inst.chamber.id && floorN === null) {
                for (let i = 0; i < inst.mesh.count; i++) {
                  if (crateIdAt(inst.chamber, i) === tap.cellId) {
                    amber = i;
                    break;
                  }
                }
              }
              const plain = amber >= 0 ? green.filter((i) => i !== amber) : green;
              const add = (idx: number[], color: string) => {
                if (!idx.length) return;
                const mat = new T.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
                const hl = new T.InstancedMesh(inst.mesh.geometry, mat, idx.length);
                idx.forEach((i, k) => hl.setMatrixAt(k, new T.Matrix4().fromArray(inst.saved, i * 16)));
                hl.instanceMatrix.needsUpdate = true;
                (inst.mesh.parent ?? root).add(hl);
                marks.push({ mesh: hl, material: mat });
              };
              add(plain, '#12a575');
              if (amber >= 0) add([amber], '#e8a317');
            }
          }
          render();
        };

        const at = (nx: number, ny: number) => {
          const ray = new T.Raycaster();
          ray.setFromCamera(new T.Vector2(nx, ny), camera);
          ray.far = Infinity;
          // Crates first (a tap on a crate belongs to the crate), then the shell.
          const hits = ray.intersectObjects(insts.map((s) => s.mesh), false);
          for (const hit of hits) {
            if (hit.instanceId === undefined) continue;
            const inst = insts.find((s) => s.mesh === hit.object);
            if (inst) return { crate: crateInfoAt(hit.instanceId, inst.chamber), chamber: null };
          }
          const shellHit = ray.intersectObjects(shells.map((sh) => sh.object), false)[0];
          return { crate: null, chamber: shellHit ? chamberOf(shellHit.object as InstanceType<typeof T.Object3D>) : null };
        };

        api.current = {
          cutaway: (on) => {
            for (const r of roofs) r.visible = !on;
            render();
          },
          seeThrough: (on) => {
            for (const name of GLASSY_MATS) {
              const rec = glass.get(name);
              if (!rec) continue;
              const mat = rec.m as unknown as { transparent: boolean; opacity: number; depthWrite: boolean };
              if (on) {
                mat.transparent = true;
                mat.opacity = 0.22;
                mat.depthWrite = false;
              } else {
                mat.transparent = rec.transparent;
                mat.opacity = rec.opacity;
                mat.depthWrite = true;
              }
            }
            render();
          },
          paint,
          enter: (id) => {
            const ch = meta0.chambers.find((c) => c.id === id);
            flyTo(ch ? poseChamber(ch.rect) : poseWhole());
          },
          at,
        };

        // Resize with the panel.
        const ro = new ResizeObserver(() => {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return;
          camera.aspect = r.width / r.height;
          camera.updateProjectionMatrix();
          renderer.setSize(r.width, r.height);
          render();
        });
        ro.observe(el);

        // A tap (not a drag): a crate to read, or a chamber to walk into.
        const pt = (e: PointerEvent) => {
          const r = cv.getBoundingClientRect();
          return { nx: ((e.clientX - r.left) / r.width) * 2 - 1, ny: -((e.clientY - r.top) / r.height) * 2 + 1 };
        };
        let down: { x: number; y: number; at: number } | null = null;
        cv.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, at: Date.now() }), sig);
        cv.addEventListener('pointerup', (e) => {
          if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && Date.now() - down.at < 500) {
            const { nx, ny } = pt(e);
            const f = at(nx, ny);
            if (f.crate) {
              setPicked(f.crate);
              setEntered(null);
              setWalls(true);
            } else if (f.chamber) {
              setPicked(null);
              setEntered(f.chamber);
              setWalls(true);
            } else {
              setPicked(null);
            }
          }
          down = null;
        }, sig);
        cv.addEventListener('pointercancel', () => (down = null), sig);

        api.current.cutaway(cutawayRef.current);
        api.current.seeThrough(wallsRef.current);
        setReady(true);

        cleanup = () => {
          ac.abort();
          ro.disconnect();
          controls.dispose();
          for (const m of marks) m.material.dispose();
          root.traverse((o) => {
            const mesh = o as { isMesh?: boolean; geometry?: unknown; material?: unknown };
            if (mesh.isMesh) {
              (mesh.geometry as { dispose: () => void }).dispose();
            }
          });
          renderer.dispose();
          renderer.forceContextLoss();
          cv.remove();
          api.current = null;
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // Load once; state reaches the scene through api, not re-mounts.
  }, []);

  // Latest toggle values, read once at load to restore React's defaults.
  const cutawayRef = useRef(cutaway);
  const wallsRef = useRef(walls);
  cutawayRef.current = cutaway;
  wallsRef.current = walls;

  // Toggles → the scene.
  useEffect(() => {
    api.current?.cutaway(cutaway);
  }, [ready, cutaway]);
  useEffect(() => {
    api.current?.seeThrough(walls);
  }, [ready, walls]);
  useEffect(() => {
    api.current?.paint(grower, picked, floor);
  }, [ready, grower, picked, floor]);
  useEffect(() => {
    api.current?.enter(entered);
  }, [ready, entered]);

  const chip = (on: boolean) =>
    `min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-semibold ring-2 transition ${on ? 'bg-sky-800 text-white ring-sky-800' : 'bg-white/90 text-sky-900 ring-sky-200 hover:bg-sky-50'}`;

  if (failed) {
    return (
      <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">
        The 3D twin could not load here. The drawings and the chamber tables still show the same store, with the same counts.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative h-[380px] overflow-hidden rounded-3xl bg-[#e3edf5] sm:h-[460px]">
        <div ref={host} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start gap-1.5">
          <button type="button" className={`${chip(cutaway)} pointer-events-auto`} aria-pressed={cutaway} onClick={() => setCutaway((v) => !v)}>Roof off</button>
          <button type="button" className={`${chip(walls)} pointer-events-auto`} aria-pressed={walls} onClick={() => setWalls((v) => !v)}>See-through walls</button>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap gap-1.5">
          {chambers.map((c) => (
            <button key={`in-${c.id}`} type="button" className={`${chip(entered === c.id)} pointer-events-auto`} aria-pressed={entered === c.id} onClick={() => { setPicked(null); setEntered(c.id); }}>
              {c.id}
            </button>
          ))}
          {entered && (
            <button type="button" className={`${chip(true)} pointer-events-auto`} onClick={() => { setPicked(null); setEntered(null); }}>
              Whole store
            </button>
          )}
          {Array.from({ length: levels }, (_, i) => i + 1).map((n) => (
            <button key={`fl-${n}`} type="button" className={`${chip(floor === n)} pointer-events-auto`} aria-pressed={floor === n} onClick={() => setFloor(floor === n ? null : n)}>
              Floor {n}
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute right-2 top-2 rounded-xl bg-white/85 px-2.5 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200">
          {meta ? meta.facility_name : 'Loading the twin…'}
        </div>
      </div>

      {(picked || enteredChamber) && (
        <div className={picked ? 'rounded-2xl bg-white/95 p-4 text-sm ring-1 ring-amber-200' : 'rounded-2xl bg-white/95 p-4 text-sm ring-1 ring-sky-200'}>
          {picked ? (
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-slate-900">{picked.cellId}</p>
                <p className="text-slate-700">
                  Level {picked.level} · rack row {picked.row} · bay {picked.subrow} · place {picked.col} · {Math.round(picked.capacityKg)} kg in one
                </p>
                {picked.grower ? (
                  <p className="text-slate-800">
                    <span className="font-semibold text-sky-800">{picked.grower.name}</span> ({picked.grower.grower_id}) · {picked.grower.product_type}
                  </p>
                ) : (
                  <p className="text-slate-600">An empty place — nobody has booked this crate yet.</p>
                )}
              </div>
              <button type="button" className="min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-semibold text-slate-600 ring-2 ring-slate-200 hover:bg-slate-50" onClick={() => setPicked(null)}>Close</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-slate-900">{enteredChamber!.id} — {enteredChamber!.label}</p>
                <p className="text-slate-700">
                  {cratesText(enteredChamber!.crate_count)} · {tonnesOf(enteredChamber!.actual_usable_capacity_kg)} t usable · {tonnesOf(enteredChamber!.occupied_capacity_kg)} t stored
                  {enteredChamber!.ca ? ' · CA room' : ''}
                </p>
                <p className="text-slate-600">
                  {enteredChamber!.growers.map((g) => `${g.name.split(' - ')[0]} (${g.crates.toLocaleString('en-IN')})`).join(' · ') || 'empty'}
                </p>
              </div>
              <button type="button" className="min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-semibold text-slate-600 ring-2 ring-slate-200 hover:bg-slate-50" onClick={() => { setPicked(null); setEntered(null); }}>Back out</button>
            </div>
          )}
        </div>
      )}
      {meta && (
        <p className="text-xs text-slate-500">
          The real twin: {meta.totals.total_crate_count.toLocaleString('en-IN')} crate places, {cratesText(meta.totals.booked_crate_count)} booked, loaded in the order “{meta.conventions.crate_order}”. Tap a crate to see whose it is.
        </p>
      )}
    </div>
  );
}

/** Shape of an instanced mesh without importing three at module scope. */
interface InstancedMeshProbe {
  instanceMatrix: { array: Float32Array | number[] };
}
