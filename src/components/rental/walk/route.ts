/**
 * The way from the main door to a farmer's own place, worked out from the
 * store's scene (three/storeScene) — for the arrows on the floor in 3D, the
 * guided walk, and the directions said aloud:
 *
 *   outside the main door → in through it → along the passage to the level of
 *   the chamber's door → in through the chamber's door → (up to its floor) →
 *   along the chamber's walkway to the row → facing the place.
 *
 * Each step in words in English, Hindi and Urdu (Kashmiri shows the English
 * until the editors add theirs). Left and right are as the person walks.
 * Pure: no three.js, no React.
 */
import { insideDoor, midOf, startPoint, type Rect, type SceneChamber, type StoreScene, type Vec } from '@/components/rental/three/storeScene';
import type { Storage } from '@/lib/coldStore';

export interface RoutePoint extends Vec {
  /** Floor (1: the ground) and the chamber stood in above the ground (-1 on the ground). */
  level: number;
  inside: number;
}

export type RouteLang = 'en' | 'hi' | 'ur';
export interface RouteStep {
  /** Said when the walk reaches this point. */
  at: number;
  text: Record<RouteLang, string>;
}

export interface Route {
  points: RoutePoint[];
  steps: RouteStep[];
  /** The place it leads to. */
  chamber: number;
  floor: number;
  place: number;
  /** Where to look at the end: the place itself. */
  face: Vec;
}

const UNITS: Record<Storage, Record<RouteLang, string>> = {
  bins: { en: 'bins', hi: 'बिन', ur: 'بِن' },
  crates: { en: 'crates', hi: 'क्रेट', ur: 'کریٹ' },
  boxes: { en: 'boxes', hi: 'पेटियाँ', ur: 'پیٹیاں' },
};

const centre = (r: Rect): Vec => ({ x: r.x + r.w / 2, y: r.y + r.d / 2 });
const clampTo = (p: Vec, r: Rect, inset: number): Vec => ({
  x: Math.min(Math.max(p.x, r.x + Math.min(inset, r.w / 2)), r.x + r.w - Math.min(inset, r.w / 2)),
  y: Math.min(Math.max(p.y, r.y + Math.min(inset, r.d / 2)), r.y + r.d - Math.min(inset, r.d / 2)),
});
/** The point on the line through `c` along `dir` level with `p`. */
const along = (c: Vec, dir: Vec, p: Vec): Vec => {
  const t = (p.x - c.x) * dir.x + (p.y - c.y) * dir.y;
  return { x: c.x + dir.x * t, y: c.y + dir.y * t };
};
const far = (a: Vec, b: Vec, min = 0.4) => Math.hypot(a.x - b.x, a.y - b.y) > min;

/** Left, right or ahead of someone walking along `dir`, for something at `to` seen from `from`. */
function sideOf(dir: Vec, from: Vec, to: Vec): 'left' | 'right' | 'ahead' {
  // Facing into the building (y), x is on the right: the right of (hx, hy) is (hy, -hx).
  const s = (to.x - from.x) * dir.y - (to.y - from.y) * dir.x;
  if (Math.abs(s) < 0.6) return 'ahead';
  return s > 0 ? 'right' : 'left';
}
const SIDE: Record<'left' | 'right' | 'ahead', Record<RouteLang, string>> = {
  left: { en: 'on your left', hi: 'आपके बाएँ', ur: 'آپ کے بائیں' },
  right: { en: 'on your right', hi: 'आपके दाएँ', ur: 'آپ کے دائیں' },
  ahead: { en: 'in front of you', hi: 'आपके सामने', ur: 'آپ کے سامنے' },
};

/**
 * The way to one place (`chamber`, `floor` index from 0, `place` index in
 * that floor). `others`: how many more of the person's places there are (they
 * glow too). `directions`: the place's own directions inside the chamber, in
 * English ("4.8 m in from the door, left of the walkway…"), when known.
 */
export function routeTo(scene: StoreScene, at: { chamber: number; floor: number; place: number }, others = 0, directions = ''): Route | null {
  const c: SceneChamber | undefined = scene.chambers[at.chamber];
  const f = c?.floors[at.floor];
  const p = f?.places[at.place];
  if (!c || !f || !p) return null;

  const points: RoutePoint[] = [];
  const steps: RouteStep[] = [];
  const ground = (v: Vec): RoutePoint => ({ ...v, level: 1, inside: -1 });
  const push = (v: RoutePoint) => {
    const last = points[points.length - 1];
    if (!last || far(last, v) || last.level !== v.level) points.push(v);
    return points.length - 1;
  };
  const say = (point: number, text: Record<RouteLang, string>) => steps.push({ at: point, text });

  const start = startPoint(scene);
  const door = c.door ? midOf(c.door) : { x: c.rect.x + c.rect.w / 2, y: c.rect.y };
  const outside = { x: door.x - c.inward.x * 1.0, y: door.y - c.inward.y * 1.0 };
  const first = push(ground(start.at));
  const md = scene.mainDoor;
  if (md) {
    say(first, { en: 'Start at the main door and go in.', hi: 'मुख्य दरवाज़े से अंदर जाइए।', ur: 'مین دروازے سے اندر جائیے۔' });
    push(ground({ x: md.mid.x + md.inward.x * 1.2, y: md.mid.y + md.inward.y * 1.2 }));
  } else {
    say(first, { en: 'Start at the front of the corridor.', hi: 'गलियारे के आगे से शुरू कीजिए।', ur: 'راہداری کے سامنے سے شروع کیجیے۔' });
  }
  // Along the passage to the level of the chamber's door, then to the door.
  if (scene.passage && md) {
    const pc = centre(scene.passage);
    const level = clampTo(along(pc, md.inward, door), scene.passage, 0.4);
    const i = push(ground(level));
    const side = sideOf(md.inward, level, door);
    say(i, {
      en: `Walk along the passage. ${c.name} is ${SIDE[side].en}.`,
      hi: `रास्ते पर आगे चलिए। ${c.name} ${SIDE[side].hi} है।`,
      ur: `راستے پر آگے چلیے۔ ${c.name} ${SIDE[side].ur} ہے۔`,
    });
  }
  push(ground(outside));
  const inDoor = push(ground(insideDoor(c, 0.9)));
  say(inDoor, { en: `Go in through the door of ${c.name}.`, hi: `${c.name} के दरवाज़े से अंदर जाइए।`, ur: `${c.name} کے دروازے سے اندر جائیے۔` });
  let level = 1;
  let inside = -1;
  if (f.floor > 1) {
    level = f.floor;
    inside = c.index;
    const up = push({ ...insideDoor(c, 0.9), level, inside });
    say(up, { en: `Go up to floor ${f.floor}.`, hi: `मंज़िल ${f.floor} पर ऊपर जाइए।`, ur: `منزل ${f.floor} پر اوپر جائیے۔` });
  }
  // Along the walkway to the place's row. Without a walkway, along the clear floor inside the
  // door (never stacked) until in line with the place, facing down its line: never through stacks.
  const pc = centre(p.rect);
  let end: Vec;
  if (f.walkway) end = clampTo(along(centre(f.walkway), c.inward, pc), f.walkway, 0.3);
  else {
    const strip = insideDoor(c, 0.75);
    const across = { x: -c.inward.y, y: c.inward.x };
    end = clampTo(along(strip, across, pc), c.rect, 0.5);
  }
  const last = push({ ...end, level, inside });
  const u = UNITS[c.storage];
  const stack = p.col + 1;
  const ahead = !f.walkway;
  say(last, {
    en: `Your ${u.en} are ${ahead ? 'straight ahead of you' : 'here'}: Row ${p.row}, stack ${stack}${directions ? ` (${directions})` : ''}.${others ? ' Your other places glow too.' : ''}`,
    hi: `आपके ${u.hi} ${ahead ? 'आपके ठीक सामने' : 'यहाँ'} हैं: पंक्ति ${p.row}, स्टैक ${stack}।${others ? ' आपकी बाक़ी जगहें भी चमक रही हैं।' : ''}`,
    ur: `آپ کے ${u.ur} ${ahead ? 'آپ کے بالکل سامنے' : 'یہاں'} ہیں: قطار ${p.row}، اسٹیک ${stack}۔${others ? ' آپ کی باقی جگہیں بھی چمک رہی ہیں۔' : ''}`,
  });
  return { points, steps, chamber: c.index, floor: at.floor, place: at.place, face: pc };
}
