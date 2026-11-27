/**
 * Every chamber is inside the building, and its door opens onto open floor inside — never onto the outside wall, another chamber
 * or the passage's blocked end (pure: no browser; the path the Drawing, the 3D view and the walk all use:
 * lib/coldStore storeModel → previewChambers → three/storeScene buildScene).
 *
 * The rule the owner set: "the doors of all chambers are inside the whole store". A chamber too big for the bank its number gives
 * (a 61 m chamber on a side with 17 m beside the passage) goes to a bank that holds it, its door turning with it; only when no bank
 * holds it does the drawn building grow around it. So over any owner numbers the Drawing shows no chamber outside the walls.
 * Run: npx playwright test tests/coldstore-inside.spec.ts
 */
import { expect, test } from '@playwright/test';

import { buildScene, type StoreScene } from '@/components/rental/three/storeScene';
import { blankChamber, blankStore, previewChambers, storeModel, type StoreDraft } from '@/lib/coldStore';

/** A small seeded random, so a failure is the same every run. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function store(over: { unit?: 'm' | 'ft'; length: number; width: number; height: number; doorFrom: number; sides: string; chambers: { length: number; width: number; height: number; wall?: string }[] }): StoreDraft {
  const d = blankStore(null);
  Object.assign(d, { title: 'Inside test store', ownerName: 'Owner', ownerPhone: '9876543210', managerPhone: '9876543210', district: 'Shopian', area: 'Test', unit: over.unit ?? 'm' });
  Object.assign(d.building, { length: String(over.length), width: String(over.width), height: String(over.height), door: { wall: 'front', from: String(over.doorFrom), width: '4', height: '5' }, sides: over.sides, passageWidth: '4' });
  d.chambers = over.chambers.map((o, i) => {
    const c = blankChamber(i + 1, 'bins');
    Object.assign(c, { count: '20', kg: '250', floors: '1', length: String(o.length), width: String(o.width), height: String(o.height), door: { wall: 'front', from: '1', width: '3', height: '4' }, rate: '45', unitL: '1.2', unitW: '1', unitH: '0.76', floorHeights: String(o.height), aisle: '2', stackGap: '0.1', wallGap: '0.3', stackHigh: '4', wallPosition: o.wall ?? '' });
    return c;
  });
  return d;
}

function built(d: StoreDraft): { scene: StoreScene; errors: string[] } | null {
  const model = storeModel(d);
  const errors = model.issues.filter((i) => i.level === 'error').map((i) => i.message);
  const rows = previewChambers(model, 'test');
  if (errors.length || !rows.length) return null;
  return { scene: buildScene(rows, model.building), errors };
}

const inside = (r: { x: number; y: number; w: number; d: number }, hall: { x: number; y: number; w: number; d: number }, slack = 0.05) =>
  r.x >= hall.x - slack && r.y >= hall.y - slack && r.x + r.w <= hall.x + hall.w + slack && r.y + r.d <= hall.y + hall.d + slack;
const within = (p: { x: number; y: number }, r: { x: number; y: number; w: number; d: number }) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.d;

/** Everything that must hold for one built store; the messages name the chamber and the rule. */
function broken(label: string, scene: StoreScene): string[] {
  const out: string[] = [];
  for (const c of scene.chambers) {
    if (!inside(c.rect, scene.hall)) out.push(`${label}: ${c.name} is outside the building`);
    if (!c.door) {
      out.push(`${label}: ${c.name} has no door`);
      continue;
    }
    const mid = { x: (c.door.x1 + c.door.x2) / 2, y: (c.door.y1 + c.door.y2) / 2 };
    const before = { x: mid.x - c.inward.x * 0.7, y: mid.y - c.inward.y * 0.7 };
    if (!within(before, scene.hall)) out.push(`${label}: ${c.name}'s door opens onto the outside of the building`);
    for (const o of scene.chambers) if (o !== c && within(before, o.rect)) out.push(`${label}: ${c.name}'s door opens into ${o.name}`);
  }
  for (let i = 0; i < scene.chambers.length; i++) {
    for (let j = i + 1; j < scene.chambers.length; j++) {
      const a = scene.chambers[i].rect;
      const b = scene.chambers[j].rect;
      if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.1 && Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y) > 0.1) out.push(`${label}: ${scene.chambers[i].name} overlaps ${scene.chambers[j].name}`);
    }
  }
  return out;
}

test('the Al Noor store (313 × 223 ft, one chamber 200 × 45 × 50 ft): inside, door open to the passage, whatever side is chosen', () => {
  for (const sides of ['both', 'left', 'right', 'lbank']) {
    for (const wall of ['', 'LEFT', 'RIGHT', 'FRONT', 'BACK']) {
      const d = store({ unit: 'ft', length: 313, width: 223, height: 60, doorFrom: 55, sides, chambers: [{ length: 200, width: 45, height: 50, wall }] });
      d.chambers[0].door = { wall: 'front', from: '17', width: '10', height: '14' } as StoreDraft['chambers'][0]['door'];
      Object.assign(d.chambers[0], { count: '1560', kg: '300', unitL: '4', unitW: '3.3', unitH: '2.5', aisle: '4.9', stackGap: '0.3', wallGap: '1', cratesPerBin: '300', stackHigh: '20' });
      const b = built(d);
      expect(b, `${sides}/${wall || '-'} builds`).not.toBeNull();
      const bad = broken(`${sides}/${wall || '-'}`, b!.scene);
      expect(bad, bad.join('\n')).toEqual([]);
      expect(b!.scene.problems, `${sides}/${wall || '-'}: nothing is drawn where it should not be`).toEqual([]);
    }
  }
});

test('a chamber too big for its side goes to the side that holds it, and the owner is told', () => {
  const d = store({ length: 60, width: 40, height: 12, doorFrom: 8, sides: 'both', chambers: [{ length: 30, width: 10, height: 8 }] });
  const b = built(d)!;
  const c = b.scene.chambers[0];
  expect(c.side, 'Chamber 1 would stand left, where there is only 8 m beside the passage').toBe('right');
  expect(c.doorWall, 'its door faces the passage').toBe('left');
  expect(b.scene.notes.join(' ')).toContain('too big for the left of the passage');
  expect(b.scene.problems).toEqual([]);
});

test('over 300 random stores that can physically hold their chambers: perfect — inside, doors open, no overlaps, nothing flagged', () => {
  const rnd = seeded(20261127);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  let made = 0;
  const failures: string[] = [];
  for (let i = 0; i < 300; i++) {
    const length = 50 + Math.round(rnd() * 70);
    const width = 50 + Math.round(rnd() * 50);
    const doorFrom = Math.round(4 + rnd() * (length - 12));
    // Each chamber is no longer than the narrower side of the passage allows, and no more than three stand on a side: it fits, whichever side it gets.
    const roomLeft = doorFrom - 0.5;
    const roomRight = length - doorFrom - 4.5;
    const n = 1 + Math.floor(rnd() * 6);
    const d = store({
      length,
      width,
      height: 12 + Math.round(rnd() * 8),
      doorFrom,
      sides: pick(['both', 'left', 'right', 'lbank']),
      chambers: Array.from({ length: n }, () => ({ length: Math.max(6, Math.floor(Math.min(roomLeft, roomRight, 40) * (0.4 + rnd() * 0.6))), width: 5 + Math.round(rnd() * 7), height: 6 + Math.round(rnd() * 5) })),
    });
    const b = built(d);
    if (!b) continue;
    made++;
    const label = `store ${i} (${length}×${width}, door ${doorFrom}, ${n} chambers, ${d.building.sides})`;
    failures.push(...broken(label, b.scene));
    if (b.scene.problems.length) failures.push(`${label}: flagged "${b.scene.problems[0].slice(0, 90)}"`);
  }
  expect(made, 'the sweep built enough stores to mean something').toBeGreaterThan(150);
  expect(failures.slice(0, 12), `${failures.length} broken`).toEqual([]);
});

test('over 300 stores whose chambers cannot all fit: still every chamber inside the drawn building, and the owner is told', () => {
  const rnd = seeded(7);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  let made = 0;
  const failures: string[] = [];
  for (let i = 0; i < 300; i++) {
    const length = 40 + Math.round(rnd() * 80);
    const width = 40 + Math.round(rnd() * 60);
    const n = 1 + Math.floor(rnd() * 8);
    const d = store({
      length,
      width,
      height: 12 + Math.round(rnd() * 8),
      doorFrom: Math.round(2 + rnd() * (length - 8)),
      sides: pick(['both', 'left', 'right', 'lbank']),
      chambers: Array.from({ length: n }, () => ({ length: 6 + Math.round(rnd() * 54), width: 5 + Math.round(rnd() * 15), height: 6 + Math.round(rnd() * 5), wall: pick(['', '', '', 'LEFT', 'RIGHT', 'BACK', 'FRONT']) })),
    });
    const b = built(d);
    if (!b) continue;
    made++;
    const label = `store ${i} (${length}×${width}, ${n} chambers, ${d.building.sides})`;
    for (const c of b.scene.chambers) if (!inside(c.rect, b.scene.hall)) failures.push(`${label}: ${c.name} is outside the drawn building`);
    // When the layout cannot keep every door open and every chamber apart, it says so (never silent).
    const trouble = broken(label, b.scene).filter((m) => !/is outside/.test(m));
    if (trouble.length && !b.scene.problems.length) {
      const det = b.scene.chambers.map((c) => `${c.name}[${c.side ?? 'spot'} ${c.doorWall} x${c.rect.x.toFixed(1)} y${c.rect.y.toFixed(1)} ${c.rect.w.toFixed(1)}x${c.rect.d.toFixed(1)} fits=${c.fits} wall=${c.group.sidePosition ?? '-'}]`).join(' ');
      failures.push(`${trouble[0]} — and nothing told the owner. hall=${b.scene.hall.w.toFixed(1)}x${b.scene.hall.d.toFixed(1)} passage=${b.scene.passage ? `${b.scene.passage.x.toFixed(1)}+${b.scene.passage.w.toFixed(1)}` : '-'} :: ${det}`);
    }
  }
  expect(made).toBeGreaterThan(150);
  expect(failures.slice(0, 12), `${failures.length} broken`).toEqual([]);
});
