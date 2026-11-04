/**
 * LOCAL TEST DATA (scripts/seed-demo.mjs): one TEST cold store, built by the app's own model
 * (lib/coldStore storeModel), exactly as the owner wizard saves it: the store row, its building,
 * and every chamber floor (kr_save_cold_chambers). Same sizes as tests/coldstore-model.spec.ts:
 * a 40 × 30 m building, a bins chamber (480 bins) and a 3-floor crates chamber (9,000 crates).
 */
import { blankChamber, blankStore, storeModel } from '@/lib/coldStore';

export function demoColdStore() {
  const d = blankStore(null);
  d.title = 'TEST Cold Store, Shopian';
  d.ownerName = 'TEST Cold Store Owner';
  d.ownerPhone = '9000000001';
  d.managerName = 'TEST Manager';
  d.managerPhone = '9000000002';
  d.district = 'Shopian';
  d.area = 'TEST area';
  d.address = 'TEST address (sample data)';
  d.unit = 'm';
  d.building = { length: '40', width: '30', height: '12', door: { wall: 'front', from: '18', width: '4', height: '5' }, sides: 'both' };
  const bins = blankChamber(1, 'bins');
  Object.assign(bins, { count: '480', kg: '250', floors: '1', length: '14', width: '12', height: '8', rate: '45', door: { wall: 'front', from: '5', width: '3', height: '4' } });
  const crates = blankChamber(2, 'crates');
  Object.assign(crates, { count: '9000', kg: '20', floors: '3', length: '12', width: '10', height: '9', rate: '6', floorHeights: '3.2, 3, 2.8', door: { wall: 'front', from: '4', width: '2', height: '2.8' } });
  d.chambers = [bins, crates];
  const m = storeModel(d);
  const errors = m.issues.filter((i) => i.level === 'error');
  if (errors.length) throw new Error(`Sample store has errors: ${errors.map((e) => e.message).join('; ')}`);
  return { store: m.store, building: m.building, rows: m.rows };
}
