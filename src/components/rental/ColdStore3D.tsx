'use client';

/**
 * The whole cold store in 3D, built to scale from the owner's numbers
 * (three/storeScene, three/buildStore): the building with its roof off and
 * its front wall see-through, the main door where it was measured, every
 * chamber where it stands with its own door, the floors inside a chamber as
 * grating decks, and every bin or crate stacked where the plan puts it.
 * Colours say what each place is (components/rental/placeLook): booked
 * stacks stand full, a free place is a marked space with the outline of the
 * stack that fits there.
 *
 *   orbit  drag to turn, pinch or scroll to zoom; one tap for the whole store,
 *          the view from the main door or from above; tap a chamber for what
 *          it holds, tap a place to choose it (booking) or see whose it is.
 *   walk   a visitor at eye height (1.6 m) starting outside the main door:
 *          arrows and keys to walk, drag to look; walls and stacks stop you,
 *          doors let you through; "Go to floor 2" inside a chamber with
 *          floors; a small map shows where you are; tap a place in front of
 *          you, or the mark in the middle, to choose it.
 *
 * three.js is imported inside the effect (only when the view opens), stacks
 * are instanced, a frame is drawn only when something moves or changes, the
 * pixel ratio is lower on phones, and everything is freed when the view
 * closes. Without WebGL the Drawing is the way.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { DoorOpen, Footprints, Maximize2, ScanEye, Volume2, X } from 'lucide-react';

import { PLACE_LOOK, type Look } from '@/components/rental/placeLook';
import { buildPlaces, buildRoute, buildShell, disposeGroup, faceWalls, makeKit, sizeLabels, wx, wz, type Cell, type Origin, type Places, type Shell } from '@/components/rental/three/buildStore';
import { routeTo, type Route, type RouteLang } from '@/components/rental/walk/route';
import { speak, stopSpeaking } from '@/lib/client/speech';
import { rememberedLang } from '@/lib/langDetect';
import { buildScene, chamberAt, EYE, insideDoor, midOf, sceneText, startPoint, type SceneChamber, type StoreScene } from '@/components/rental/three/storeScene';
import { drawMiniMap } from '@/components/rental/walk/miniMap';
import { noInput, usePageZoom, WalkHud, type Press, type Target, type WalkInput, type Where } from '@/components/rental/walk/WalkHud';
import { canStand, walk, walkWorld, type Walker, type WalkWorld } from '@/components/rental/walk/walker';
import { placeDirections, showLength } from '@/lib/coldLayout';
import { countText, nice, unitWord, type Building, type PreviewRows, type Storage } from '@/lib/coldStore';
import { placeLabel, type ColdChamber } from '@/lib/db/coldMap';

export type View3D = 'orbit' | 'walk';

/** A place in words: "Chamber 2 · Floor 1 · Row 3, stack 4 · 4 bins free". */
export function placeText(c: SceneChamber, cell: Cell): string {
  const f = c.floors[cell.floor];
  const st = c.storage;
  const at = `${f.row.name} · ${placeLabel(cell.slot)}`;
  switch (cell.look) {
    case 'free':
      return `${at} · ${countText(cell.free, st)} free`;
    case 'part':
      return `${at} · shared, room for ${cell.free.toLocaleString('en-IN')} of ${countText(f.k, st)}`;
    case 'selected':
      return `${at} · your choice (${countText(cell.free, st)})`;
    case 'held':
      return `${at} · ${PLACE_LOOK.held.label}`;
    case 'booked':
      return `${at} · ${PLACE_LOOK.booked.label}`;
    case 'mine':
      return `${at} · your ${unitWord(st)}`;
    default:
      return `${at} · no place here`;
  }
}

/** The places of the store as cells, with what each is for the months looked at. */
export function cellsOf(scene: StoreScene, stateOf: (c: ColdChamber, slot: string) => Look, roomOf: (c: ColdChamber, slot: string) => number): Cell[] {
  const out: Cell[] = [];
  for (const c of scene.chambers) {
    c.floors.forEach((f, fi) => {
      f.places.forEach((p, pi) => {
        const look: Look = p.blocked ? 'blocked' : stateOf(f.row, p.slot);
        const free = look === 'blocked' ? 0 : Math.max(0, roomOf(f.row, p.slot));
        out.push({ chamber: c.index, floor: fi, place: pi, row: p.row, col: p.col, slot: p.slot, look, free, full: 1 - free / Math.max(1, f.k) });
      });
    });
  }
  return out;
}

/** The shapes of a chamber in words: "12.2 m × 7.6 m, 8.5 m high". */
const sizeText = (c: SceneChamber, unit: 'ft' | 'm') => `${showLength(c.rect.w, unit)} × ${showLength(c.rect.d, unit)}, ${showLength(c.h, unit)} high`;

interface Api {
  setData: (scene: StoreScene, cells: Cell[], free: number[], mineName?: string) => void;
  setActive: (index: number) => void;
  setView: (v: View3D) => void;
  frame: (what: 'all' | 'door' | 'top' | number) => void;
  walkTo: (index: number | null) => void;
  /** Where the next walk starts (a chamber's door), instead of the main door. */
  walkFrom: (index: number) => void;
  goFloor: (n: number) => void;
  /** Say again where the visitor is and draw the small map (when the buttons over the view appear). */
  showWhere: () => void;
  choose: () => void;
  kick: () => void;
  /** Show the way to the farmer's place on the floor (null: none). */
  setRoute: (route: Route | null) => void;
  /** Walk the way from the main door (walking only). False when there is no way to walk. */
  guide: () => boolean;
  stopGuide: () => void;
}

/**
 * The farmer's place to lead them to: their own bins when looking at their
 * booking, their choice while booking — the first one in the store's order
 * (nearest the main door). Null when there is none.
 */
function routeFor(scene: StoreScene, cells: Cell[], mode: 'book' | 'owner' | 'view'): Route | null {
  const look: Look | null = mode === 'view' ? 'mine' : mode === 'book' ? 'selected' : null;
  if (!look) return null;
  const theirs = cells.filter((c) => c.look === look);
  const first = theirs[0];
  if (!first) return null;
  const f = scene.chambers[first.chamber]?.floors[first.floor];
  const directions = f?.plan && f.row.size ? placeDirections(f.row.size, f.plan, first.row, first.col + 1) : '';
  return routeTo(scene, first, theirs.length - 1, directions);
}

const TURN = 1.7; // radians a second
const LOOK = 1.1;
const PITCH = 1.05;
/** Field of view: looking at the whole store, and walking (wider, as your eyes see). */
const FOV = { orbit: 45, walk: 68 } as const;

/** What a chamber holds: over the 3D view's corner, or under the view on a phone (`zoom`: bigger words there). */
function InfoCard({ c, free, rate, unit, onClose, onWalk, zoom }: { c: SceneChamber; free: number; rate: number | null; unit: 'ft' | 'm'; onClose: () => void; onWalk?: () => void; zoom: number }) {
  const g = c.group;
  const st: Storage = c.storage;
  const r = g.rate ?? rate;
  const below = zoom > 1.3;
  return (
    <section
      aria-label={`${c.name}: what it holds`}
      style={below ? { zoom: Math.min(1.8, zoom * 0.8) } : undefined}
      className={`pointer-events-auto rounded-2xl bg-white/95 p-3 text-sm text-slate-800 shadow-xl ring-1 ring-slate-900/10 backdrop-blur ${below ? 'w-full' : 'absolute bottom-2 left-2 z-20 w-[min(300px,calc(100%-16px))]'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-base font-bold text-slate-900">{c.name}</h4>
        <button type="button" onClick={onClose} aria-label="Close" className="-m-1 grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-slate-500">Holds</dt>
        <dd className="font-semibold">{countText(g.count, st)}{g.floors.length > 1 ? ` on ${g.floors.length} floors` : ''}</dd>
        {g.unitKg ? (
          <>
            <dt className="text-slate-500">Each {UNIT_ONE[st]}</dt>
            <dd>{nice(g.unitKg)} kg of apples</dd>
          </>
        ) : null}
        {g.capacityMt ? (
          <>
            <dt className="text-slate-500">Capacity</dt>
            <dd>{nice(g.capacityMt)} tonnes</dd>
          </>
        ) : null}
        <dt className="text-slate-500">Free now</dt>
        <dd className="font-semibold text-sky-800">{countText(free, st)}</dd>
        {r ? (
          <>
            <dt className="text-slate-500">Rent</dt>
            <dd>₹{nice(r)} a {UNIT_ONE[st]} a month</dd>
          </>
        ) : null}
        {c.toScale && (
          <>
            <dt className="text-slate-500">Size</dt>
            <dd>{sizeText(c, unit)}</dd>
          </>
        )}
      </dl>
      {onWalk && (
        <button type="button" onClick={onWalk} className="mt-2 inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 font-semibold text-white hover:bg-emerald-800">
          <Footprints className="h-4 w-4" aria-hidden /> Walk in here
        </button>
      )}
    </section>
  );
}
const UNIT_ONE: Record<Storage, string> = { bins: 'bin', crates: 'crate', boxes: 'box' };

export function ColdStore3D({
  chambers,
  stateOf,
  roomOf,
  mode,
  onPlace,
  active,
  onActive,
  building,
  rate = null,
  view = 'orbit',
  onView,
  mineName,
}: {
  chambers: ColdChamber[];
  stateOf: (c: ColdChamber, slot: string) => Look;
  /** Bins / crates / boxes that still fit on a place (stable, like stateOf). */
  roomOf: (c: ColdChamber, slot: string) => number;
  mode: 'book' | 'owner' | 'view';
  onPlace?: (c: ColdChamber, slot: string, look: Look) => void;
  active: string | null;
  onActive: (id: string) => void;
  /** The store's building (rental_listings.building); without it the chambers stand side by side. Not given: the preview rows' own (owner wizard). */
  building?: Building | null;
  /** The store's rent for chambers without their own. */
  rate?: number | null;
  /** Look around from outside (orbit) or walk inside. */
  view?: View3D;
  onView?: (v: View3D) => void;
  /** The farmer's name, shown over their own places ('mine'). */
  mineName?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const api = useRef<Api | null>(null);
  const input = useRef<WalkInput>(noInput());
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<number | null>(null);
  const [where, setWhere] = useState<Where>({ text: 'You are outside the main door.', chamber: -1, level: 1, floors: 1 });
  const [target, setTarget] = useState<Target | null>(null);
  // On a phone the page is shrunk to fit: a taller view and bigger buttons.
  const zoom = usePageZoom();
  const textId = useId();

  // The owner's live preview brings its building with its rows (lib/coldStore previewChambers).
  const shownBuilding = building !== undefined ? building : ((chambers as PreviewRows).building ?? null);
  const scene = useMemo(() => buildScene(chambers, shownBuilding), [chambers, shownBuilding]);
  const cells = useMemo(() => cellsOf(scene, stateOf, roomOf), [scene, stateOf, roomOf]);
  const free = useMemo(() => {
    const out = scene.chambers.map(() => 0);
    for (const c of cells) out[c.chamber] += c.free;
    return out;
  }, [scene, cells]);
  const activeIndex = useMemo(() => scene.chambers.findIndex((c) => c.group.floors.some((r) => r.id === active)), [scene, active]);
  // The way to the farmer's place, and the guided walk along it: the step reached (null: not
  // guiding), whether they have arrived, and the language the steps are said in.
  const route = useMemo(() => routeFor(scene, cells, mode), [scene, cells, mode]);
  const [guideAt, setGuideAt] = useState<number | null>(null);
  const [guideDone, setGuideDone] = useState(false);
  const [guideLang, setGuideLang] = useState<RouteLang>('en');
  const guidePending = useRef(false);
  const onStep = useCallback((k: number | null, done = false) => {
    setGuideAt(k);
    setGuideDone(done);
  }, []);

  // The latest data and callbacks, for the scene (which is set up once).
  const latest = useRef({ scene, cells, free, mode, onPlace, onActive, view, activeIndex, mineName, route, onStep });
  useEffect(() => {
    latest.current = { scene, cells, free, mode, onPlace, onActive, view, activeIndex, mineName, route, onStep };
  }, [scene, cells, free, mode, onPlace, onActive, view, activeIndex, mineName, route, onStep]);
  useEffect(() => api.current?.setRoute(route), [route]);
  // Each step said aloud as the walk reaches it, in the person's language.
  useEffect(() => {
    if (guideAt === null || !route) return;
    const step = route.steps[guideAt];
    if (step) void speak(step.text[guideLang], guideLang);
  }, [guideAt, guideLang, route]);
  // Leaving the walk, or the page: stop talking.
  useEffect(() => {
    if (view !== 'walk') {
      api.current?.stopGuide();
      stopSpeaking();
    }
  }, [view]);
  useEffect(() => () => stopSpeaking(), []);
  // The places are built again only when the store or what its places are changes (not when the page around it redraws).
  useEffect(() => api.current?.setData(scene, cells, free, mineName), [scene, cells, free, mineName]);
  useEffect(() => api.current?.setActive(activeIndex), [activeIndex]);
  useEffect(() => api.current?.setView(view), [view]);
  // The small map is drawn into the walk's buttons, which appear once the view is ready.
  useEffect(() => {
    if (view === 'walk' && ready) api.current?.showWhere();
    // "Show me the way" from outside: the walk starts once the view has switched.
    if (view === 'walk' && ready && guidePending.current) {
      guidePending.current = false;
      api.current?.guide();
    }
  }, [view, ready]);
  const press = useCallback<Press>((k, on) => {
    input.current[k] = on;
    if (on) api.current?.kick();
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const T = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (disposed) return;

      const phone = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640;
      // A low-cost phone (4 GB or less, or 4 cores or fewer): one pixel per screen pixel, no smoothing.
      const nav = navigator as Navigator & { deviceMemory?: number };
      const weak = phone && ((nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4);
      let renderer: InstanceType<typeof T.WebGLRenderer>;
      try {
        renderer = new T.WebGLRenderer({ antialias: !phone, powerPreference: phone ? 'low-power' : 'default' });
      } catch {
        setFailed(true);
        return;
      }
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Sharp when still. On a slow phone, fewer pixels while something moves (see the loop).
      const fullRatio = Math.min(window.devicePixelRatio || 1, weak ? 1 : phone ? 1.5 : 2);
      let moveRatio = fullRatio;
      let slowFrames = 0;
      let handHeld = false;
      renderer.setPixelRatio(fullRatio);
      renderer.setClearColor('#e3edf5');
      const cv = renderer.domElement;
      cv.className = 'block h-full w-full rounded-3xl outline-none';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-describedby', textId);
      cv.setAttribute('aria-label', 'The whole cold store in 3D. Drag to turn it, pinch or scroll to zoom.');
      el.prepend(cv);

      const world3 = new T.Scene();
      const camera = new T.PerspectiveCamera(FOV.orbit, 1, 0.05, 2000);
      camera.rotation.order = 'YXZ';
      const controls = new OrbitControls(camera, cv);
      controls.enableDamping = !reduceMotion;
      controls.dampingFactor = 0.12;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.minDistance = 2;
      controls.screenSpacePanning = false;

      world3.add(new T.HemisphereLight('#ffffff', '#94a3b8', 1.9));
      const sun = new T.DirectionalLight('#fff7ed', 1.6);
      sun.position.set(-40, 80, 55);
      world3.add(sun);
      const fill = new T.DirectionalLight('#dbeafe', 0.55);
      fill.position.set(50, 30, -40);
      world3.add(fill);

      const kit = makeKit(T, phone);
      // Walking: a light haze gives the long rooms their depth.
      const haze = new T.Fog('#e6edf3', 14, 70);
      const root = new T.Group();
      world3.add(root);
      let shell: Shell | null = null;
      let places: Places | null = null;
      // The way to the farmer's place (arrows on the floor), and the guided walk along it:
      // `i` the next point, `said` the last step told.
      let routeNow: Route | null = null;
      let routeGroup: InstanceType<typeof T.Object3D> | null = null;
      let guide: { i: number; said: number } | null = null;
      // The guided walk's points: the way, with its last part carried on over empty bays up to the place.
      let guidePts: Route['points'] = [];
      let shown: StoreScene | null = null;
      let origin: Origin = { ox: 0, oy: 0 };
      let walkWorldNow: WalkWorld | null = null;
      let mode3: View3D = 'orbit';
      // Labels: on top of everything from outside; walking, hidden behind walls like real signs (null: set them again).
      let labelsWalk: boolean | null = null;
      let dirty = true;
      // The frame loop's state (kick() may run before the loop is defined below).
      let raf = 0;
      let running = false;
      let last = 0;
      let held = 0;
      const me: Walker & { heading: number; pitch: number } = { x: 0, y: 0, level: 1, inside: -1, heading: Math.PI / 2, pitch: -0.08 };
      let orbitPose: { pos: [number, number, number]; target: [number, number, number] } | null = null;
      let startAt: number | null = null;

      // ── Camera ──
      let flight: { from: number[]; to: number[]; t0: number } | null = null;
      // The view last chosen (whole store, from the door, from above, a chamber) until the camera is moved by hand:
      // when the view changes size (a phone turned, buttons growing on a phone) it is framed again, so nothing is cut off.
      let framed: 'all' | 'door' | 'top' | number | null = null;
      const setPose = (pos: number[], target: number[], instant: boolean) => {
        if (instant || reduceMotion) {
          camera.position.set(pos[0], pos[1], pos[2]);
          controls.target.set(target[0], target[1], target[2]);
          controls.update();
          flight = null;
        } else {
          flight = { from: [camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z], to: [...pos, ...target], t0: performance.now() };
        }
        dirty = true;
        kick();
      };
      const aspect = () => camera.aspect || 1;
      /**
       * A box (building frame) filling the view, seen from the front, a little to the right and above
       * (higher on a tall phone view, so the store fills it): the camera steps back until all eight
       * corners of the box are on screen, with a small margin.
       */
      const probe = new T.PerspectiveCamera();
      const fit = (x: number, y: number, w: number, d: number, h: number, instant = false) => {
        const cx = wx(origin, x + w / 2);
        const cz = wz(origin, y + d / 2);
        const cy = Math.min(h, 12) * 0.22;
        const v = T.MathUtils.degToRad(camera.fov / 2);
        const hv = Math.atan(Math.tan(v) * aspect());
        const dir = new T.Vector3(0.3, aspect() < 1 ? 1 : 0.72, 0.95).normalize();
        const corners: InstanceType<typeof T.Vector3>[] = [];
        for (const px of [x, x + w]) for (const pz of [y, y + d]) for (const py of [0, h]) corners.push(new T.Vector3(wx(origin, px), py, wz(origin, pz)));
        probe.fov = camera.fov;
        probe.aspect = aspect();
        probe.near = camera.near;
        probe.far = camera.far;
        probe.updateProjectionMatrix();
        let dist = (0.5 * Math.hypot(w, d, h)) / Math.sin(Math.min(v, hv));
        const p = new T.Vector3();
        for (let i = 0; i < 8; i++) {
          probe.position.set(cx + dir.x * dist, cy + dir.y * dist, cz + dir.z * dist);
          probe.lookAt(cx, cy, cz);
          probe.updateMatrixWorld();
          let most = 0;
          for (const c of corners) {
            p.copy(c).project(probe);
            // Behind the camera: step well back.
            most = Math.max(most, p.z > 1 ? 2 : Math.abs(p.x), p.z > 1 ? 2 : Math.abs(p.y));
          }
          const k = Math.min(2, Math.max(0.6, most / 0.9));
          if (Math.abs(k - 1) < 0.01) break;
          dist *= k;
        }
        controls.maxDistance = Math.max(60, dist * 4);
        setPose([cx + dir.x * dist, cy + dir.y * dist, cz + dir.z * dist], [cx, cy, cz], instant);
      };
      const frame = (what: 'all' | 'door' | 'top' | number, instant = false) => {
        const s = shown;
        if (!s) return;
        framed = what;
        if (typeof what === 'number') {
          // The chamber and its name above it.
          const c = s.chambers[what];
          if (c) fit(c.rect.x, c.rect.y, c.rect.w, c.rect.d, c.h + 2.5, instant);
          return;
        }
        const b = s.bounds;
        if (what === 'all') return fit(b.x, b.y, b.w, b.d, s.height + 1.5, instant); // and the names over the chambers
        if (what === 'top') {
          const v = T.MathUtils.degToRad(camera.fov / 2);
          const hv = Math.atan(Math.tan(v) * aspect());
          const dist = Math.max((b.w * 0.55) / Math.tan(hv), (b.d * 0.55) / Math.tan(v)) + s.height;
          const cx = wx(origin, b.x + b.w / 2);
          const cz = wz(origin, b.y + b.d / 2);
          controls.maxDistance = Math.max(controls.maxDistance, dist * 2);
          return setPose([cx, dist, cz + 0.01], [cx, 0, cz], instant);
        }
        // Standing back from the main door and above it, looking in along the passage: the chambers on either side.
        const st = startPoint(s);
        const n = st.facing;
        const deep = s.building ? (n.x ? s.hall.w : s.hall.d) : 12;
        // Far enough back that the passage and the chamber doors on both sides of it fit across the view (further on a narrow phone).
        const across = (s.passage ? (n.x ? s.passage.d : s.passage.w) : 3) / 2 + 6;
        const hv = Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * aspect());
        const back = Math.min(40, Math.max(6, across / Math.tan(hv) - 3));
        const up = (s.building?.height ?? s.height) + Math.max(3, deep * 0.2, back * 0.3);
        const p = { x: st.at.x - n.x * back, y: st.at.y - n.y * back };
        const t = { x: st.at.x + n.x * (3 + deep * 0.45), y: st.at.y + n.y * (3 + deep * 0.45) };
        setPose([wx(origin, p.x), up, wz(origin, p.y)], [wx(origin, t.x), 0, wz(origin, t.y)], instant);
      };

      // ── Walking ──
      const placeWalker = () => {
        camera.position.set(wx(origin, me.x), eyeY(), wz(origin, me.y));
        // Heading (building frame) → camera yaw: forward is (cos h, 0, −sin h) in the world.
        camera.rotation.set(me.pitch, Math.atan2(-Math.cos(me.heading), Math.sin(me.heading)), 0, 'YXZ');
        dirty = true;
      };
      const eyeY = () => {
        if (!shown || me.level <= 1 || me.inside < 0) return EYE;
        const f = shown.chambers[me.inside]?.floors[me.level - 1];
        return (f?.z0 ?? 0) + EYE;
      };
      let lastWhere = '';
      const tellWhere = () => {
        const s = shown;
        if (!s) return;
        const ci = me.inside >= 0 ? me.inside : chamberAt(s, me);
        const c = ci >= 0 ? s.chambers[ci] : null;
        const inHall = me.x >= s.hall.x && me.x <= s.hall.x + s.hall.w && me.y >= s.hall.y && me.y <= s.hall.y + s.hall.d;
        const text = c
          ? `You are in ${c.name}${c.floors.length > 1 ? ` · Floor ${me.level}` : ''}.`
          : s.building
            ? inHall
              ? 'You are inside the building, in the passage.'
              : 'You are outside the building.'
            : 'You are in the corridor.';
        const key = `${text}|${ci}|${me.level}|${c?.floors.length ?? 1}`;
        if (key !== lastWhere) {
          lastWhere = key;
          setWhere({ text, chamber: ci, level: me.level, floors: c?.floors.length ?? 1 });
        }
        if (mapRef.current) drawMiniMap(mapRef.current, s, me, me.heading, me.level, me.inside);
      };
      const standAt = (p: { x: number; y: number }, heading: number) => {
        pinned = false;
        me.x = p.x;
        me.y = p.y;
        me.level = 1;
        me.inside = -1;
        me.heading = heading;
        me.pitch = -0.08;
        placeWalker();
        tellWhere();
        aim(true);
        kick();
      };
      const toMainDoor = () => {
        if (!shown) return;
        const st = startPoint(shown);
        standAt(st.at, Math.atan2(st.facing.y, st.facing.x));
      };
      const walkTo = (index: number | null) => {
        if (!shown) return;
        if (index === null) return toMainDoor();
        const c = shown.chambers[index];
        if (!c || !walkWorldNow) return;
        const m = c.door ? midOf(c.door) : { x: c.rect.x + c.rect.w / 2, y: c.rect.y };
        for (const back of [1.4, 1.0, 2.2, 0.7]) {
          const p = { x: m.x - c.inward.x * back, y: m.y - c.inward.y * back };
          if (canStand(walkWorldNow, p, 1, -1)) return standAt(p, Math.atan2(c.inward.y, c.inward.x));
        }
        standAt(insideDoor(c), Math.atan2(c.inward.y, c.inward.x));
      };
      const goFloor = (n: number) => {
        const s = shown;
        if (!s || !walkWorldNow) return;
        const ci = me.inside >= 0 ? me.inside : chamberAt(s, me);
        const c = s.chambers[ci];
        if (!c || n < 1 || n > c.floors.length) return;
        const level = n;
        const inside = n > 1 ? ci : -1;
        if (!canStand(walkWorldNow, me, level, inside)) {
          const p = insideDoor(c, 0.9);
          me.x = p.x;
          me.y = p.y;
          me.heading = Math.atan2(c.inward.y, c.inward.x);
        }
        me.level = level;
        me.inside = inside;
        pinned = false;
        placeWalker();
        tellWhere();
        aim(true);
        kick();
      };

      // ── Picking ──
      const ray = new T.Raycaster();
      const ptr = new T.Vector2();
      const cellAt = (nx: number, ny: number): Cell | null => {
        if (!places) return null;
        ray.setFromCamera(ptr.set(nx, ny), camera);
        ray.far = mode3 === 'walk' ? 40 : Infinity;
        const targets: InstanceType<typeof T.Object3D>[] = places.picks.map((p) => p.mesh);
        // Walking, the walls are solid: no choosing through them.
        const walking = mode3 === 'walk';
        if (walking && shell) targets.push(...shell.walls);
        for (const hit of ray.intersectObjects(targets, false)) {
          if (hit.instanceId === undefined) return null; // a wall
          const cell = places.picks.find((p) => p.mesh === hit.object)?.cells[hit.instanceId];
          if (!cell) continue;
          // Walking, only the places of the floor you stand on (the grating between floors is see-through).
          if (walking && (cell.floor !== me.level - 1 || (me.level > 1 && cell.chamber !== me.inside))) continue;
          return cell;
        }
        return null;
      };
      const chamberHit = (nx: number, ny: number): number | null => {
        if (!shell) return null;
        ray.setFromCamera(ptr.set(nx, ny), camera);
        ray.far = Infinity;
        const hit = ray.intersectObjects(shell.hits, false)[0];
        return hit ? (hit.object.userData.chamber as number) : null;
      };
      const choosable = (cell: Cell) => {
        const md = latest.current.mode;
        return md === 'owner' ? cell.look !== 'blocked' : md === 'book' && (cell.look === 'free' || cell.look === 'part' || cell.look === 'selected');
      };
      const act = (cell: Cell) => {
        const s = shown;
        const { onPlace: pick, onActive: activate } = latest.current;
        const f = s?.chambers[cell.chamber]?.floors[cell.floor];
        if (!f) return;
        activate(f.row.id);
        if (choosable(cell)) pick?.(f.row, cell.slot, cell.look);
      };
      let aimed: Cell | null = null;
      let aimAt = 0;
      // After the guided walk: the ring stays on the farmer's place until they look round or move.
      let pinned = false;
      const aim = (force = false) => {
        if (mode3 !== 'walk' || pinned) return;
        const now = performance.now();
        if (!force && now - aimAt < 120) return;
        aimAt = now;
        const cell = cellAt(0, 0);
        aimed = cell;
        const s = shown;
        const next: Target | null = cell && s ? { key: `${cell.chamber}:${cell.floor}:${cell.slot}:${cell.look}:${cell.free}`, text: placeText(s.chambers[cell.chamber], cell), can: choosable(cell), chosen: cell.look === 'selected' } : null;
        setTarget((t) => (t?.key === next?.key && t?.can === next?.can ? t : next));
      };

      // ── Hover and tap ──
      const showTip = (cell: Cell | null, x: number, y: number) => {
        const t = tip.current;
        if (!t) return;
        if (!cell || !shown) {
          t.style.opacity = '0';
          return;
        }
        const rect = el.getBoundingClientRect();
        // What the place is, and how to walk to it from the chamber's door.
        const f = shown.chambers[cell.chamber].floors[cell.floor];
        const way = f.plan && f.row.size ? placeDirections(f.row.size, f.plan, cell.row, cell.col + 1) : '';
        t.textContent = `${placeText(shown.chambers[cell.chamber], cell)}${way ? `\n${way}` : ''}`;
        t.style.opacity = '1';
        t.style.left = `${Math.min(Math.max(8, x - rect.left + 12), rect.width - 236)}px`;
        t.style.top = `${Math.max(8, y - rect.top - 52)}px`;
      };
      const norm = (e: { clientX: number; clientY: number }) => {
        const r = cv.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1] as const;
      };
      let down: { x: number; y: number; id: number; heading: number; pitch: number; moved: boolean } | null = null;
      let hideTip = 0;
      const onDown = (e: PointerEvent) => {
        down = { x: e.clientX, y: e.clientY, id: e.pointerId, heading: me.heading, pitch: me.pitch, moved: false };
        if (mode3 === 'walk') {
          cv.setPointerCapture?.(e.pointerId);
          el.focus({ preventScroll: true });
        }
      };
      const onMoveDrag = (e: PointerEvent) => {
        if (!down || e.pointerId !== down.id) return false;
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > 6) {
          down.moved = true;
          pinned = false;
        }
        if (mode3 === 'walk' && down.moved) {
          // Drag the view: like turning your head (the store moves with your finger).
          const k = 3.2 / Math.max(300, cv.clientWidth);
          me.heading = down.heading + dx * k;
          me.pitch = Math.max(-PITCH, Math.min(PITCH, down.pitch + dy * k));
          placeWalker();
          tellWhere();
          aim();
          kick();
        }
        return true;
      };
      const onUp = (e: PointerEvent) => {
        if (!down || e.pointerId !== down.id) return;
        const tap = !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 6;
        down = null;
        if (!tap) {
          if (mode3 === 'walk') aim(true);
          // Sharp again after looking round.
          dirty = true;
          kick();
          return;
        }
        const [nx, ny] = norm(e);
        const cell = cellAt(nx, ny);
        showTip(cell, e.clientX, e.clientY);
        window.clearTimeout(hideTip);
        if (e.pointerType !== 'mouse') hideTip = window.setTimeout(() => showTip(null, 0, 0), 2600);
        if (cell) {
          act(cell);
          return;
        }
        if (mode3 === 'orbit') {
          const ci = chamberHit(nx, ny);
          setInfo(ci);
          if (ci !== null) {
            const row = shown?.chambers[ci]?.floors[0]?.row;
            if (row) latest.current.onActive(row.id);
          }
        }
      };
      let moveQueued = false;
      const onMove = (e: PointerEvent) => {
        if (onMoveDrag(e)) return;
        if (e.pointerType !== 'mouse' || e.buttons || moveQueued || mode3 === 'walk') return;
        moveQueued = true;
        requestAnimationFrame(() => {
          moveQueued = false;
          const [nx, ny] = norm(e);
          const cell = cellAt(nx, ny);
          showTip(cell, e.clientX, e.clientY);
          cv.style.cursor = cell && choosable(cell) ? 'pointer' : 'grab';
        });
      };
      const onLeave = () => showTip(null, 0, 0);
      cv.addEventListener('pointerdown', onDown);
      cv.addEventListener('pointerup', onUp);
      cv.addEventListener('pointercancel', () => (down = null));
      cv.addEventListener('pointermove', onMove);
      cv.addEventListener('pointerleave', onLeave);
      controls.addEventListener('change', () => {
        dirty = true;
        kick();
      });
      controls.addEventListener('start', () => {
        framed = null;
        handHeld = true;
        kick();
      });
      controls.addEventListener('end', () => {
        // Sharp again once the finger lifts.
        handHeld = false;
        dirty = true;
        kick();
      });

      // Keys while walking: W A S D or arrows to walk, ← → (Q E) to turn, R F to look up and down.
      const keyMap: Record<string, keyof WalkInput> = {
        w: 'fwd', arrowup: 'fwd', s: 'back', arrowdown: 'back', a: 'left', d: 'right',
        arrowleft: 'turnL', q: 'turnL', arrowright: 'turnR', e: 'turnR', r: 'up', pageup: 'up', f: 'down', pagedown: 'down',
      };
      const onKey = (on: boolean) => (e: KeyboardEvent) => {
        if (mode3 !== 'walk') return;
        const t = e.target as HTMLElement | null;
        if (t && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName)) return;
        const k = keyMap[e.key.toLowerCase()];
        if (!k) return;
        e.preventDefault();
        input.current[k] = on;
        if (on) kick();
      };
      const keyDown = onKey(true);
      const keyUp = onKey(false);
      const clearKeys = () => Object.assign(input.current, noInput());
      el.addEventListener('keydown', keyDown);
      el.addEventListener('keyup', keyUp);
      window.addEventListener('blur', clearKeys);

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        if (framed !== null && mode3 === 'orbit') frame(framed, true);
        dirty = true;
        kick();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      // ── The data ──
      let shownCells = '';
      const setData = (s: StoreScene, cs: Cell[], freeBy: number[], who?: string) => {
        const fresh = s !== shown;
        // The same store with the same places: nothing to build again.
        const sign = `${cs.map((c) => `${c.look}${c.free}`).join()}|${freeBy.join()}|${who ?? ''}`;
        if (!fresh && sign === shownCells) return;
        shownCells = sign;
        if (fresh) {
          if (shell) {
            root.remove(shell.group);
            disposeGroup(T, kit, shell.group);
          }
          const b = s.bounds;
          origin = { ox: b.x + b.w / 2, oy: b.y + b.d / 2 };
          shell = buildShell(kit, s, origin);
          root.add(shell.group);
        }
        // A new store (or new measurements): the way is drawn again from its own numbers.
        if (fresh) {
          routeNow = latest.current.route;
          stopGuide();
        }
        if (places) {
          root.remove(places.group);
          disposeGroup(T, kit, places.group);
        }
        places = buildPlaces(kit, s, cs, origin, (i) => freeBy[i] ?? 0, who);
        root.add(places.group);
        labelsWalk = null;
        const stops = new Set<string>();
        for (const c of cs) {
          const ch = s.chambers[c.chamber];
          if (c.look === 'booked' || c.look === 'mine' || c.look === 'part' || (c.look === 'blocked' && ch?.storage === 'boxes')) stops.add(`${c.chamber}:${c.floor}:${c.place}`);
        }
        walkWorldNow = walkWorld(s, (ci, fi, pi) => stops.has(`${ci}:${fi}:${pi}`));
        const first = !shown;
        const moved = shown && (shown.bounds.w !== s.bounds.w || shown.bounds.d !== s.bounds.d || shown.chambers.length !== s.chambers.length);
        shown = s;
        if (fresh) showRoute();
        setActive(latest.current.activeIndex);
        if (first || moved) {
          frame('all', true);
          if (mode3 === 'walk') toMainDoor();
        } else if (mode3 === 'walk') {
          placeWalker();
          tellWhere();
          aim(true);
        }
        dirty = true;
        kick();
      };
      const setActive = (index: number) => {
        if (!shell) return;
        for (const line of shell.outlines) line.material = line.userData.chamber === index ? kit.edgeOn : kit.edge;
        dirty = true;
        kick();
      };
      /**
       * One frame. From outside, the walls between the camera and the inside
       * are see-through (a cutaway from any side); walking, every wall looks
       * solid. Labels stay readable however far away they are.
       */
      const render = () => {
        if (shell) faceWalls(kit, shell.walls, mode3 === 'walk' ? null : { x: camera.position.x, z: camera.position.z });
        // Ceilings, roof and lights only when walking: from outside the roof is off so you can look in.
        if (shell) shell.walkOnly.visible = mode3 === 'walk';
        world3.fog = mode3 === 'walk' ? haze : null;
        if (labelsWalk !== (mode3 === 'walk')) {
          labelsWalk = mode3 === 'walk';
          root.traverse((o) => {
            if (o instanceof T.Sprite) o.material.depthTest = labelsWalk === true;
          });
        }
        const px = (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, el.clientHeight);
        sizeLabels([...(shell?.labels ?? []), ...(places?.labels ?? [])], camera, px);
        renderer.render(world3, camera);
      };
      const setView = (v: View3D) => {
        if (v === mode3) return;
        mode3 = v;
        Object.assign(input.current, noInput());
        camera.fov = FOV[v];
        camera.updateProjectionMatrix();
        showTip(null, 0, 0);
        if (v === 'walk') {
          orbitPose = { pos: [camera.position.x, camera.position.y, camera.position.z], target: [controls.target.x, controls.target.y, controls.target.z] };
          controls.enabled = false;
          flight = null;
          cv.setAttribute('aria-label', 'Walking inside the cold store. Use the arrows to walk and turn, drag to look around.');
          cv.style.cursor = 'grab';
          walkTo(startAt);
          startAt = null;
        } else {
          controls.enabled = true;
          cv.setAttribute('aria-label', 'The whole cold store in 3D. Drag to turn it, pinch or scroll to zoom.');
          setTarget(null);
          if (orbitPose) setPose(orbitPose.pos, orbitPose.target, true);
          else frame('all', true);
        }
        dirty = true;
        kick();
      };
      const choose = () => {
        if (aimed) act(aimed);
      };

      // ── The way to the farmer's place ──
      const showRoute = () => {
        if (routeGroup) {
          root.remove(routeGroup);
          disposeGroup(T, kit, routeGroup);
          routeGroup = null;
        }
        if (routeNow && shown && shown.chambers[routeNow.chamber]) {
          routeGroup = buildRoute(kit, shown, routeNow, origin);
          root.add(routeGroup);
        }
        dirty = true;
        kick();
      };
      /** Tell the page the newest step the walk has reached (it is said aloud there). */
      const announce = (point: number, done = false) => {
        const r = routeNow;
        if (!r || !guide) return;
        let k = -1;
        r.steps.forEach((s, n) => {
          if (s.at <= point) k = n;
        });
        if (k > guide.said || done) {
          guide.said = Math.max(guide.said, k);
          latest.current.onStep(guide.said, done);
        }
      };
      const stopGuide = (tell = true) => {
        if (!guide) return;
        guide = null;
        if (tell) latest.current.onStep(null);
      };
      const startGuide = () => {
        const r = routeNow;
        if (!r || mode3 !== 'walk' || r.points.length < 2) return false;
        // From the walkway, on over empty bays (floor, nothing stacked) towards the place: as far as
        // the walk itself may go, stopping a little short of the place. Never through a stack.
        pinned = false;
        guidePts = [...r.points];
        const end = guidePts[guidePts.length - 1];
        if (walkWorldNow) {
          const dx = r.face.x - end.x;
          const dy = r.face.y - end.y;
          const d = Math.hypot(dx, dy);
          let reach = 0;
          for (let s = 0.2; s < d - 0.9; s += 0.2) {
            if (!canStand(walkWorldNow, { x: end.x + (dx / d) * s, y: end.y + (dy / d) * s }, end.level, end.inside)) break;
            reach = s;
          }
          if (reach > 0.3) guidePts.push({ x: end.x + (dx / d) * reach, y: end.y + (dy / d) * reach, level: end.level, inside: end.inside });
        }
        const [p0, p1] = guidePts;
        Object.assign(input.current, noInput());
        standAt(p0, Math.atan2(p1.y - p0.y, p1.x - p0.x));
        guide = { i: 1, said: -1 };
        announce(0);
        kick();
        return true;
      };
      /** One step of the guided walk: towards the next point at walking pace, turning smoothly. */
      const guideStep = (dt: number): boolean => {
        const r = routeNow;
        if (!guide || !r) return false;
        if (Object.values(input.current).some(Boolean)) {
          // The person takes over.
          stopGuide();
          return false;
        }
        const to = guidePts[guide.i];
        if (!to) {
          stopGuide();
          return false;
        }
        if (to.level !== me.level || to.inside !== me.inside) {
          // Up (or down) to this floor, where the walk goes on.
          me.level = to.level;
          me.inside = to.inside;
          guide.i++;
          announce(guide.i - 1);
        } else {
          const dx = to.x - me.x;
          const dy = to.y - me.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.05) {
            const diff = ((Math.atan2(dy, dx) - me.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            me.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
          }
          me.pitch += (-0.12 - me.pitch) * Math.min(1, dt * 3);
          const v = 1.3 * dt;
          if (d <= v) {
            me.x = to.x;
            me.y = to.y;
            guide.i++;
            announce(guide.i - 1);
          } else {
            me.x += (dx / d) * v;
            me.y += (dy / d) * v;
          }
        }
        if (guide && guide.i >= guidePts.length) {
          // Arrived: face the place, looking at the middle of its stack (the ring rests on it).
          me.heading = Math.atan2(r.face.y - me.y, r.face.x - me.x);
          const fl = shown?.chambers[r.chamber]?.floors[r.floor];
          if (fl) me.pitch = Math.max(-PITCH, Math.min(PITCH, Math.atan2(fl.z0 + fl.stackH / 2 - eyeY(), Math.max(0.5, Math.hypot(r.face.x - me.x, r.face.y - me.y)))));
          // The ring rests on their place (empty bays in between can be pointed at too: not now).
          const cell = latest.current.cells.find((c) => c.chamber === r.chamber && c.floor === r.floor && c.place === r.place);
          if (cell && shown) {
            placeWalker();
            aimed = cell;
            setTarget({ key: `${cell.chamber}:${cell.floor}:${cell.slot}:${cell.look}:${cell.free}`, text: placeText(shown.chambers[cell.chamber], cell), can: choosable(cell), chosen: cell.look === 'selected' });
            pinned = true;
          }
          announce(guidePts.length - 1, true);
          guide = null;
        }
        return true;
      };
      const setRoute = (r: Route | null) => {
        stopGuide();
        routeNow = r;
        showRoute();
      };

      // ── The loop: runs only while something moves ──
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);
      let moving = false;
      const step = (dt: number) => {
        const i = input.current;
        if (pinned && Object.values(i).some(Boolean)) pinned = false;
        let busy = guideStep(dt);
        const turn = (i.turnL ? 1 : 0) - (i.turnR ? 1 : 0);
        if (turn) {
          me.heading += turn * TURN * dt;
          busy = true;
        }
        const look = (i.up ? 1 : 0) - (i.down ? 1 : 0);
        if (look) {
          me.pitch = Math.max(-PITCH, Math.min(PITCH, me.pitch + look * LOOK * dt));
          busy = true;
        }
        const go = (i.fwd ? 1 : 0) - (i.back ? 1 : 0);
        const side = (i.left ? 1 : 0) - (i.right ? 1 : 0);
        if ((go || side) && walkWorldNow) {
          held += dt;
          // A slow first step, then a brisk walk.
          const speed = Math.min(4, 1.4 + held * 1.4);
          const hx = Math.cos(me.heading);
          const hy = Math.sin(me.heading);
          walk(walkWorldNow, me, (hx * go - hy * side) * speed * dt, (hy * go + hx * side) * speed * dt);
          busy = true;
        } else held = 0;
        if (busy) {
          placeWalker();
          tellWhere();
          aim();
        } else if (moving) aim(true); // stopped: say exactly what the ring rests on
        moving = busy;
        return busy;
      };
      function loop(t: number) {
        // Real time, even on a slow phone (walk() goes in small steps, so walls still stop you).
        const gap = last ? (t - last) / 1000 : 0;
        const dt = last ? Math.min(0.2, gap) : 1 / 60;
        last = t;
        let busy = false;
        if (flight) {
          const k = ease(Math.min(1, (performance.now() - flight.t0) / 700));
          const f = flight.from;
          const to = flight.to;
          camera.position.set(f[0] + (to[0] - f[0]) * k, f[1] + (to[1] - f[1]) * k, f[2] + (to[2] - f[2]) * k);
          controls.target.set(f[3] + (to[3] - f[3]) * k, f[4] + (to[4] - f[4]) * k, f[5] + (to[5] - f[5]) * k);
          if (k >= 1) flight = null;
          busy = true;
          dirty = true;
        }
        if (mode3 === 'walk') busy = step(dt) || busy;
        else if (controls.update()) busy = true;
        // Slower than 20 frames a second while moving: a slow phone. Draw fewer pixels while
        // moving (sharp again when still) and stop gliding as soon as the finger lifts.
        if (busy && gap > 0.05) {
          if (++slowFrames >= 6) {
            slowFrames = 0;
            moveRatio = Math.max(0.5, moveRatio * 0.8);
            controls.enableDamping = false;
          }
        } else if (busy) slowFrames = 0;
        const moving = busy || handHeld || Boolean(down?.moved);
        if (dirty || busy) {
          const want = moving ? moveRatio : fullRatio;
          if (renderer.getPixelRatio() !== want) renderer.setPixelRatio(want);
          render();
          dirty = false;
        }
        if (busy || flight) raf = requestAnimationFrame(loop);
        else {
          running = false;
          last = 0;
          if (!moving && renderer.getPixelRatio() !== fullRatio) {
            renderer.setPixelRatio(fullRatio);
            render();
          }
        }
      }
      function kick() {
        if (running) return;
        running = true;
        raf = requestAnimationFrame(loop);
      }

      api.current = {
        setData,
        setActive,
        setView,
        frame: (w) => frame(w),
        walkTo,
        walkFrom: (i) => (startAt = i),
        goFloor,
        choose,
        kick,
        setRoute,
        guide: startGuide,
        stopGuide: () => stopGuide(false),
        showWhere: () => {
          lastWhere = '';
          if (mode3 === 'walk') tellWhere();
        },
      };
      setData(latest.current.scene, latest.current.cells, latest.current.free, latest.current.mineName);
      setView(latest.current.view);
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(hideTip);
        ro.disconnect();
        el.removeEventListener('keydown', keyDown);
        el.removeEventListener('keyup', keyUp);
        window.removeEventListener('blur', clearKeys);
        controls.dispose();
        if (shell) disposeGroup(T, kit, shell.group);
        if (places) disposeGroup(T, kit, places.group);
        if (routeGroup) disposeGroup(T, kit, routeGroup);
        kit.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        cv.remove();
        api.current = null;
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
    // Set up once (textId never changes); data and callbacks reach the scene through `latest` and `api`.
  }, [textId]);

  if (failed) {
    return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">This phone or browser cannot show 3D. Use the Drawing — it shows the same chambers and places.</p>;
  }

  const walking = view === 'walk';
  // "Show me the way": walks from the main door to the farmer's place, saying each step.
  const showWay = () => {
    const l = rememberedLang();
    setGuideLang(l === 'hi' || l === 'ur' ? l : 'en');
    stopSpeaking();
    if (walking) api.current?.guide();
    else {
      guidePending.current = true;
      onView?.('walk');
    }
  };
  const stopWay = () => {
    api.current?.stopGuide();
    setGuideAt(null);
    setGuideDone(false);
    stopSpeaking();
  };
  const wayLabel = route ? (mode === 'view' ? `Show me the way to my ${scene.chambers[route.chamber]?.storage ?? 'boxes'}` : 'Show the way to your choice') : '';
  const WAY_WORDS: Record<RouteLang, { follow: string; here: string; again: string; stop: string }> = {
    en: { follow: 'Follow the green arrows', here: 'You are there', again: 'Say it again', stop: 'Stop' },
    hi: { follow: 'हरे तीरों के साथ चलिए', here: 'आप पहुँच गए', again: 'फिर से सुनिए', stop: 'रोकिए' },
    ur: { follow: 'سبز تیروں کے ساتھ چلیے', here: 'آپ پہنچ گئے', again: 'پھر سے سنیے', stop: 'روکیے' },
  };
  const ww = WAY_WORDS[guideLang];
  const chip = (on: boolean) => `inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${on ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100'}`;
  const shownInfo = info !== null ? scene.chambers[info] : null;
  const note = scene.problems.length ? (mode === 'owner' ? scene.problems.slice(0, 2).join(' ') : 'As the owner measured them, some chambers do not fit inside the building, so they are drawn outside it.') : '';
  const big = zoom > 1.3;
  const height = walking ? (big ? 'min(78vh, 1050px)' : 'min(70vh, 560px)') : big ? 'min(62vh, 820px)' : 'min(62vh, 520px)';
  const card =
    !walking && shownInfo ? (
      <InfoCard
        zoom={zoom}
        c={shownInfo}
        free={free[shownInfo.index] ?? 0}
        rate={rate}
        unit={scene.unit}
        onClose={() => setInfo(null)}
        onWalk={
          onView
            ? () => {
                api.current?.walkFrom(shownInfo.index);
                onView('walk');
              }
            : undefined
        }
      />
    ) : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label={walking ? 'Walk to' : 'Look at'}>
        {route && onView && (
          <button type="button" onClick={showWay} className={`${chip(true)} bg-emerald-600 shadow-sm hover:bg-emerald-700`}>
            <Footprints className="h-4 w-4" aria-hidden /> {wayLabel}
          </button>
        )}
        {walking ? (
          <button type="button" onClick={() => api.current?.walkTo(null)} className={chip(false)}>
            <DoorOpen className="h-4 w-4" aria-hidden /> Back to the main door
          </button>
        ) : (
          <>
            <button type="button" onClick={() => api.current?.frame('all')} className={chip(false)}>
              <Maximize2 className="h-4 w-4" aria-hidden /> Whole store
            </button>
            <button type="button" onClick={() => api.current?.frame('door')} className={chip(false)}>
              <DoorOpen className="h-4 w-4" aria-hidden /> View from the door
            </button>
            <button type="button" onClick={() => api.current?.frame('top')} className={chip(false)}>
              <ScanEye className="h-4 w-4" aria-hidden /> Top view
            </button>
          </>
        )}
        {scene.chambers.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={activeIndex === c.index}
            onClick={() => {
              const row = c.floors[0]?.row;
              if (row && activeIndex !== c.index) onActive(row.id);
              if (walking) api.current?.walkTo(c.index);
              else {
                setInfo(c.index);
                api.current?.frame(c.index);
              }
            }}
            className={chip(activeIndex === c.index)}
          >
            {walking ? `Go to ${c.name}` : c.name}
          </button>
        ))}
      </div>
      <div
        ref={host}
        tabIndex={walking ? 0 : -1}
        className="relative w-full touch-none select-none overflow-hidden rounded-3xl bg-gradient-to-b from-sky-50 to-slate-100 outline-none ring-1 ring-slate-900/10 focus-visible:ring-2 focus-visible:ring-sky-600"
        style={{ height }}
      >
        {!ready && <p className="absolute inset-0 grid place-items-center text-sm text-slate-500">Opening the 3D view…</p>}
        <p id={textId} data-scene-text className="sr-only">{sceneText(scene)}</p>
        <div ref={tip} aria-live="polite" className="pointer-events-none absolute z-30 max-w-[228px] whitespace-pre-line rounded-xl bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity" />
        {walking && ready && (
          <WalkHud press={press} where={where} onFloor={(n) => api.current?.goFloor(n)} target={target} onChoose={() => api.current?.choose()} mapRef={mapRef} mode={mode} zoom={zoom} />
        )}
        {!big && card}
      </div>
      {big && card}
      {route && guideAt !== null && (
        <section aria-label="The way to your place" className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 dir={guideLang === 'ur' ? 'rtl' : undefined} className="font-semibold text-emerald-900">{guideDone ? ww.here : ww.follow}</h4>
            <div className="flex gap-2">
              <button type="button" onClick={() => void speak(route.steps[guideAt]?.text[guideLang] ?? '', guideLang)} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100">
                <Volume2 className="h-4 w-4" aria-hidden /> {ww.again}
              </button>
              <button type="button" onClick={stopWay} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
                <X className="h-4 w-4" aria-hidden /> {ww.stop}
              </button>
            </div>
          </div>
          <ol dir={guideLang === 'ur' ? 'rtl' : undefined} aria-live="polite" className="mt-2 space-y-1 text-sm">
            {route.steps.map((s, k) => (
              <li key={k} className={`rounded-lg px-2 py-1 ${k === guideAt ? 'bg-emerald-600 font-semibold text-white' : k < guideAt ? 'text-emerald-800' : 'text-slate-600'}`}>
                {k + 1}. {s.text[guideLang]}
              </li>
            ))}
          </ol>
        </section>
      )}
      {note &&<p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 ring-1 ring-amber-300">{note}</p>}
      {scene.beside && <p className="text-xs text-slate-600">Chambers set up before the building was measured stand beside it, outside its walls.</p>}
      <p className="text-xs text-slate-500">Sizes, chambers, doors and places are the owner’s. Cooling units, lights and curtains are drawn as in a typical cold store — the Photos tab shows this store as it really is, when the owner has added photos.</p>
      <p className="text-xs text-slate-600">
        {walking
          ? `Walk with the arrows (or the keys W A S D, ← →) · drag to look around · ${mode === 'book' ? 'tap a free place in front of you, or aim the ring at it, to choose it.' : mode === 'owner' ? 'tap a stack to see whose it is.' : 'your stacks are tinted violet.'}`
          : `Drag to turn the store · pinch or scroll to zoom · two fingers to move. Tap a chamber to see what it holds. ${mode === 'book' ? 'Tap a free place (an outlined stack) to choose it; tap it again to undo.' : mode === 'owner' ? 'Tap a stack to see whose it is.' : 'Your stacks are tinted violet.'}`}
      </p>
    </div>
  );
}
