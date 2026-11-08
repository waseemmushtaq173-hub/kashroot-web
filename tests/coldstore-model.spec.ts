/**
 * Cold store accuracy: the store built from the owner's numbers (lib/coldStore
 * storeModel → previewChambers → three/storeScene buildScene, the same path the
 * drawing, the 3D view and the walk use) must match what the owner entered.
 * Pure: no browser. Run: npx playwright test tests/coldstore-model.spec.ts
 */
import { expect, test } from '@playwright/test';

import { buildScene, PLATE_GAP, rowPlates, type StoreScene } from '@/components/rental/three/storeScene';
import { routeTo } from '@/components/rental/walk/route';
import { planOf } from '@/lib/coldLayout';
import { pickNearest } from '@/lib/db/coldMap';
import { blankChamber, blankStore, draftFromSaved, previewChambers, storeModel, type ChamberDraft, type StoreDraft } from '@/lib/coldStore';

const CM = 0.01;

/** A real-looking store, in metres: 40 × 30 m building, one bins chamber, one crates chamber with 3 floors. */
function sample(change: (d: StoreDraft, bins: ChamberDraft, crates: ChamberDraft) => void = () => {}): StoreDraft {
  const d = blankStore(null);
  d.title = 'Test cold store';
  d.ownerName = 'Owner';
  d.ownerPhone = '9876543210';
  d.managerPhone = '9876543210';
  d.district = 'Shopian';
  d.area = 'Test';
  d.unit = 'm';
  d.building = { length: '40', width: '30', height: '12', door: { wall: 'front', from: '18', width: '4', height: '5' }, sides: 'both' };
  const bins = blankChamber(1, 'bins');
  Object.assign(bins, { count: '480', kg: '250', floors: '1', length: '14', width: '12', height: '8', rate: '45', unitL: '1.2', unitW: '1', unitH: '0.76', floorHeights: '8', aisle: '3.5', stackGap: '0.1', wallGap: '0.3', stackHigh: '8', door: { wall: 'front', from: '5', width: '3', height: '4' } });
  const crates = blankChamber(2, 'crates');
  Object.assign(crates, { count: '3000', kg: '20', floors: '3', length: '12', width: '10', height: '9', rate: '6', unitL: '0.6', unitW: '0.4', unitH: '0.3', aisle: '3', stackGap: '0.05', wallGap: '0.2', stackHigh: '9', floorHeights: '3.2, 3, 2.8', door: { wall: 'front', from: '4', width: '2', height: '2.8' } });
  change(d, bins, crates);
  d.chambers = [bins, crates];
  return d;
}

function built(d: StoreDraft): { model: ReturnType<typeof storeModel>; scene: StoreScene } {
  const model = storeModel(d);
  const rows = previewChambers(model, 'test');
  return { model, scene: buildScene(rows, model.building) };
}

test('the sample store is accepted with no errors', () => {
  const { model } = built(sample());
  const errors = model.issues.filter((i) => i.level === 'error');
  expect(errors, JSON.stringify(errors)).toHaveLength(0);
  expect(model.chambers.every((c) => c.ready)).toBe(true);
});

test('the places drawn hold exactly the bins and crates entered, chamber by chamber and floor by floor', () => {
  const { model, scene } = built(sample());
  for (const mc of model.chambers) {
    const sc = scene.chambers.find((c) => c.name === mc.name)!;
    expect(sc, mc.name).toBeTruthy();
    const drawn = sc.floors.reduce((sum, f) => sum + f.places.filter((p) => !p.blocked).length * f.k, 0);
    expect(drawn, `${mc.name} in the scene`).toBe(mc.count);
    // Each floor: its share, as saved.
    mc.floors.forEach((mf, i) => expect(sc.floors[i].places.filter((p) => !p.blocked).length * sc.floors[i].k, `${mc.name} floor ${i + 1}`).toBe(mf.count));
  }
  expect(model.totals.bins).toBe(480);
  expect(model.totals.crates).toBe(3000);
});

test('every place and stack stands inside its chamber, under its floor', () => {
  const { scene } = built(sample());
  for (const c of scene.chambers) {
    const r = c.rect;
    for (const f of c.floors) {
      expect(f.z0 + f.stackH, `${c.name} floor ${f.floor}: stack under the floor above`).toBeLessThanOrEqual(f.z0 + f.h + CM);
      for (const p of f.places) {
        expect(p.rect.x, `${c.name} ${p.slot}`).toBeGreaterThanOrEqual(r.x - CM);
        expect(p.rect.y).toBeGreaterThanOrEqual(r.y - CM);
        expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(r.x + r.w + CM);
        expect(p.rect.y + p.rect.d).toBeLessThanOrEqual(r.y + r.d + CM);
      }
    }
    // The chamber inside the building.
    expect(r.x).toBeGreaterThanOrEqual(scene.hall.x - CM);
    expect(r.y).toBeGreaterThanOrEqual(scene.hall.y - CM);
    expect(r.x + r.w).toBeLessThanOrEqual(scene.hall.x + scene.hall.w + CM);
    expect(r.y + r.d).toBeLessThanOrEqual(scene.hall.y + scene.hall.d + CM);
  }
});

test('every row on every floor has one number plate, at its end, inside the chamber and clear of the stacks', () => {
  const { scene } = built(sample());
  const plates = rowPlates(scene);
  for (const c of scene.chambers) {
    c.floors.forEach((f, fi) => {
      const rows = [...new Set(f.places.map((p) => p.row))];
      const mine = plates.filter((p) => p.chamber === c.index && p.floor === fi);
      expect(mine.map((p) => p.row).sort((a, b) => a - b), `${c.name} floor ${fi + 1}: one plate per row`).toEqual(rows.sort((a, b) => a - b));
      for (const plate of mine) {
        const r = c.rect;
        expect(plate.at.x > r.x && plate.at.x < r.x + r.w && plate.at.y > r.y && plate.at.y < r.y + r.d, `${c.name} row ${plate.row}: inside`).toBe(true);
        for (const q of f.places) {
          const inside = plate.at.x > q.rect.x && plate.at.x < q.rect.x + q.rect.w && plate.at.y > q.rect.y && plate.at.y < q.rect.y + q.rect.d;
          expect(inside, `${c.name} row ${plate.row}: not inside a stack`).toBe(false);
        }
        // Right at the end of its own row: PLATE_GAP from the nearest stack of that row.
        const gap = Math.min(...f.places.filter((q) => q.row === plate.row).map((q) => Math.hypot(Math.max(q.rect.x - plate.at.x, 0, plate.at.x - q.rect.x - q.rect.w), Math.max(q.rect.y - plate.at.y, 0, plate.at.y - q.rect.y - q.rect.d))));
        expect(gap, `${c.name} row ${plate.row}: at the row's end`).toBeCloseTo(PLATE_GAP, 5);
        // Between this floor and the next, at eye level or under the floor above.
        expect(plate.z).toBeGreaterThan(f.z0);
        expect(plate.z).toBeLessThan(f.z0 + f.h);
        expect(Math.hypot(plate.facing.x, plate.facing.y)).toBeCloseTo(1, 5);
        // On the side people walk: nearer the walkway than the middle of its row is.
        const w = f.walkway;
        if (w) {
          const reach = (v: { x: number; y: number }) => Math.hypot(Math.max(w.x - v.x, 0, v.x - w.x - w.w), Math.max(w.y - v.y, 0, v.y - w.y - w.d));
          const row = f.places.filter((q) => q.row === plate.row);
          const mid = { x: row.reduce((t, q) => t + q.rect.x + q.rect.w / 2, 0) / row.length, y: row.reduce((t, q) => t + q.rect.y + q.rect.d / 2, 0) / row.length };
          expect(reach(plate.at), `${c.name} row ${plate.row}: on the walkway side`).toBeLessThanOrEqual(reach(mid));
        }
      }
    });
  }
  expect(plates.length).toBeGreaterThan(0);
});

test('aisle widths, doors and sizes match the inputs to the centimetre', () => {
  const { model, scene } = built(sample((d, bins) => Object.assign(bins, { aisle: '3.5' })));
  const bins = model.chambers.find((c) => c.no === 1)!;
  const plan = planOf(bins.floors[0].size);
  expect(plan.aisleX, 'the bins chamber has an aisle').not.toBeNull();
  expect(Math.abs(plan.aisleX![1] - plan.aisleX![0] - 3.5)).toBeLessThanOrEqual(CM);
  // Crates default aisle: 3.0 m.
  const crates = model.chambers.find((c) => c.no === 2)!;
  const cp = planOf(crates.floors[0].size);
  if (cp.aisleX) expect(Math.abs(cp.aisleX[1] - cp.aisleX[0] - 3.0)).toBeLessThanOrEqual(CM);
  for (const c of scene.chambers) {
    const mc = model.chambers.find((m) => m.name === c.name)!;
    const door = mc.outline.door!;
    const seg = c.door!;
    expect(Math.abs(Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) - door.width), `${c.name} door width`).toBeLessThanOrEqual(CM);
    expect(Math.abs(c.doorH - door.height), `${c.name} door height`).toBeLessThanOrEqual(CM);
    expect(Math.abs(c.rect.w * c.rect.d - mc.outline.length * mc.outline.width), `${c.name} floor area`).toBeLessThanOrEqual(CM);
    expect(Math.abs(c.h - mc.outline.height), `${c.name} height`).toBeLessThanOrEqual(CM);
  }
  // The main door, where the owner measured it.
  expect(Math.abs(scene.mainDoor!.width - 4)).toBeLessThanOrEqual(CM);
  expect(Math.abs(scene.mainDoor!.from - 18)).toBeLessThanOrEqual(CM);
});

test('each floor stands at the owner’s own heights', () => {
  const { scene } = built(sample());
  const crates = scene.chambers.find((c) => c.name === 'Chamber 2')!;
  const want = [3.2, 3, 2.8];
  let z = 0;
  crates.floors.forEach((f, i) => {
    expect(Math.abs(f.z0 - z), `floor ${i + 1} starts at ${z} m`).toBeLessThanOrEqual(CM);
    expect(Math.abs(f.h - want[i]), `floor ${i + 1} is ${want[i]} m high`).toBeLessThanOrEqual(CM);
    z += want[i];
  });
});

test('the stated tonnes are checked against what fits by size (10%)', () => {
  const far = storeModel(sample((d, bins) => Object.assign(bins, { tonnes: '20000' })));
  const warn = far.issues.find((i) => i.field.endsWith('.tonnes') && i.level === 'warn' && /By its size/.test(i.message));
  expect(warn, 'warns with "By its size …"').toBeTruthy();
  expect(warn!.fix?.label).toMatch(/^Use [\d,.]+ tonnes$/);
  const fits = far.chambers.find((c) => c.no === 1)!;
  expect(fits.fitsByMeasure).toBeGreaterThan(0);
  // Within 10% of what fits by size: no such warning.
  const near = storeModel(sample((d, bins) => Object.assign(bins, { tonnes: String(Math.round(fits.tonnesByMeasure * 1.05)) })));
  expect(near.issues.some((i) => i.field.endsWith('.tonnes') && /By its size/.test(i.message))).toBe(false);
});

test('impossible values are refused', () => {
  const tall = storeModel(sample((d, bins) => Object.assign(bins, { stackHigh: '40' })));
  expect(tall.issues.some((i) => i.level === 'error' && i.field.endsWith('.stackHigh'))).toBe(true);
  const door = storeModel(sample((d, bins) => Object.assign(bins, { door: { wall: 'front', from: '2', width: '20', height: '4' } })));
  expect(door.issues.some((i) => i.level === 'error' && i.field.includes('.door'))).toBe(true);
  const floors = storeModel(sample((d, b, crates) => Object.assign(crates, { floorHeights: '5, 5, 5' })));
  expect(floors.issues.some((i) => i.level === 'error' && i.field.endsWith('.floorHeights'))).toBe(true);
  const outside = storeModel(sample((d, bins) => Object.assign(bins, { spotX: '35', spotY: '25' })));
  expect(outside.issues.some((i) => /outside the building/.test(i.message))).toBe(true);
  const unit = storeModel(sample((d, bins) => Object.assign(bins, { unitL: '9' })));
  expect(unit.issues.some((i) => i.level === 'error' && i.field.endsWith('.unitL'))).toBe(true);
});

test('a saved store opens and saves again unchanged', () => {
  const first = storeModel(sample((d, bins) => Object.assign(bins, { aisle: '3.5', coolerWall: 'back', coolant: 'ammonia', ca: 'yes', temperature: '0 to 2 °C', humidity: '92' })));
  const rows = previewChambers(first, '00000000-0000-0000-0000-000000000001');
  const d = draftFromSaved({ title: 'Test cold store', owner_name: 'Owner', phone: '9876543210', district: 'Shopian', address: null, building: first.building }, rows);
  const again = storeModel(d);
  expect(again.rows.map((r) => ({ ...r, size: JSON.stringify(r.size) }))).toEqual(first.rows.map((r) => ({ ...r, size: JSON.stringify(r.size) })));
  expect(first.rows[0].size.cooling).toEqual({ wall: 'back', kind: 'ammonia', ca: true, temperature: '0 to 2 °C', humidity: 92 });
});

test('a draft kept on a phone before the new boxes still opens', () => {
  const d = sample();
  // As an older version kept it: no unit size, floor heights, gaps or cooling.
  const old = JSON.parse(JSON.stringify(d)) as StoreDraft;
  for (const c of old.chambers as unknown as Record<string, unknown>[]) {
    for (const k of ['unitL', 'unitW', 'unitH', 'floorHeights', 'aisle', 'stackGap', 'wallGap', 'coolerWall', 'coolant', 'ca', 'temperature', 'humidity']) delete c[k];
  }
  const m = storeModel(old);
  expect(m.issues.filter((i) => i.level === 'error').length).toBeGreaterThan(0);
  expect(m.chambers.some((c) => !c.ready)).toBe(true);
});

test('the way to a place on an upper floor is said in Kashmiri, Urdu, Hindi and English', () => {
  const { scene } = built(sample());
  const crates = scene.chambers.findIndex((c) => c.storage === 'crates');
  const floor = scene.chambers[crates].floors.findIndex((f) => f.floor === 2);
  const place = scene.chambers[crates].floors[floor].places.findIndex((p) => !p.blocked);
  const route = routeTo(scene, { chamber: crates, floor, place })!;
  expect(route).toBeTruthy();
  expect(route.steps.length).toBeGreaterThanOrEqual(4);
  for (const step of route.steps) {
    for (const l of ['en', 'hi', 'ur', 'ks'] as const) expect(step.text[l], `${l}: ${step.text.en}`).toBeTruthy();
    expect(step.text.ks).toMatch(/[\u0600-\u06FF]/);
    expect(step.text.hi).toMatch(/[\u0900-\u097F]/);
  }
  // Up to floor 2, and the place's own row and stack, in every language.
  expect(route.steps.some((s) => s.text.ks.includes('منزل 2'))).toBe(true);
  const last = route.steps[route.steps.length - 1].text;
  const p = scene.chambers[crates].floors[floor].places[place];
  for (const l of ['en', 'hi', 'ur', 'ks'] as const) expect(last[l]).toContain(String(p.row));
  // Every point of the way stands in the store, ending on the place's floor.
  expect(route.points[route.points.length - 1].level).toBe(2);
});

test('"I have 40 bins": the nearest places, filled whole, row 1 at the door first', () => {
  const { model } = built(sample());
  const rows = previewChambers(model, 'test');
  const bins = rows.filter((c) => c.storage === 'bins');
  const full = (c: (typeof rows)[number]) => c.boxes_per_slot;
  const { picked, placed } = pickNearest({ chambers: bins, want: 40, roomFor: full });
  expect(placed).toBe(40);
  const chosen = [...picked.values()];
  expect(chosen.reduce((n, p) => n + p.boxes, 0)).toBe(40);
  // 8 bins a place → exactly 5 whole places, all in row 1 (at the door).
  expect(chosen.map((p) => p.boxes)).toEqual([8, 8, 8, 8, 8]);
  expect(chosen.map((p) => p.slot)).toEqual(['1A', '1B', '1C', '1D', '1E']);
});

test('auto-pick skips full places, tops up a shared one, and says when there is not enough room', () => {
  const { model } = built(sample());
  const bins = previewChambers(model, 'test').filter((c) => c.storage === 'bins');
  // 1A is full, 1B has room for 4 (shared), the rest are free.
  const room = (c: (typeof bins)[number], slot: string) => (slot === '1A' ? 0 : slot === '1B' ? 4 : c.boxes_per_slot);
  const { picked, placed } = pickNearest({ chambers: bins, want: 25, roomFor: room });
  expect(placed).toBe(25);
  expect([...picked.values()].map((p) => `${p.slot}:${p.boxes}`)).toEqual(['1B:4', '1C:8', '1D:8', '1E:5']);
  // More than the chamber holds: every free bin is given, and the count says how many.
  const all = pickNearest({ chambers: bins, want: 10_000, roomFor: (c) => c.boxes_per_slot });
  expect(all.placed).toBe(480);
});

test('crates on 3 floors: one floor when it has room, lowest first', () => {
  const { model } = built(sample());
  const crates = previewChambers(model, 'test').filter((c) => c.storage === 'crates');
  const { picked, placed } = pickNearest({ chambers: crates, want: 600, roomFor: (c) => c.boxes_per_slot });
  expect(placed).toBe(600);
  const floors = new Set([...picked.values()].map((p) => p.chamber.floor));
  expect([...floors]).toEqual([1]);
});
