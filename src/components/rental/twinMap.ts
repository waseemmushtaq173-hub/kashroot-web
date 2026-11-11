'use client';

/**
 * The bridge between the real chamber plans (lib/db/coldMap) and the
 * industrial digital twin (components/rental/IndustrialColdStoreTwin3D).
 *
 * Each ColdChamber row is one floor of a chamber (lib/coldStore), so each row
 * becomes one twin "chamber" with a single level, and the twin's slot grid is
 * derived from that row's own rows × stacks: the twin then draws exactly the
 * places the store has, its slot keys map back to the real "3B" place codes,
 * and nothing on screen is a place the database does not know. Unit sizes are
 * the owner's own measured box and stack gap (ChamberSize, always metres);
 * the defaults are the kit's wooden bin and blue crate.
 */
import type { Chamber3DConfig, StorageSlotRecord, StorageUnitMode } from '@/components/rental/IndustrialColdStoreTwin3D';
import { parsePlace, placeName, type ColdChamber } from '@/lib/db/coldMap';

const pad3 = (n: number) => String(n).padStart(3, '0');

/** One place's own size: the owner's measured box and stack gap when they gave them. */
function unitOf(c: Pick<ColdChamber, 'storage' | 'size'>): { l: number; w: number; h: number; gap: number; type: StorageUnitMode } {
  const box = c.size?.box;
  if (box && box.l > 0 && box.w > 0 && box.h > 0) {
    return {
      l: box.l,
      w: box.w,
      h: box.h,
      gap: Math.max(0, c.size?.stackGap ?? 0),
      type: c.storage === 'bins' ? 'WOODEN_BIN' : 'PLASTIC_CRATE',
    };
  }
  return c.storage === 'bins'
    ? { l: 1.2, w: 1.0, h: 0.78, gap: 0.12, type: 'WOODEN_BIN' }
    : { l: 0.54, w: 0.36, h: 0.29, gap: 0.08, type: 'PLASTIC_CRATE' };
}

export interface TwinPlan {
  configs: Chamber3DConfig[];
  /** The chamber row behind each twin chamber code. */
  byCode: Map<string, ColdChamber>;
  /** The twin's slot key for a real place ("3B") of a row. */
  keyOf: (c: ColdChamber, slot: string) => string;
  /** Every twin slot key of a row (its whole floor grid). */
  slotsOf: (c: ColdChamber) => string[];
  /** The real place behind a twin slot record — null when it is off the row's plan. */
  placeOf: (rec: StorageSlotRecord) => { chamber: ColdChamber; slot: string } | null;
}

export function twinPlanOf(chambers: ColdChamber[]): TwinPlan {
  const counts = new Map<string, number>();
  for (const c of chambers) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  const configs: Chamber3DConfig[] = [];
  const byCode = new Map<string, ColdChamber>();
  const codeOf = new Map<string, string>();
  const gridOf = new Map<string, { cols: number; prefix: string }>();

  chambers.forEach((c, i) => {
    const u = unitOf(c);
    const stepX = u.l + u.gap;
    const stepZ = u.w + u.gap;
    // The shell fits the row's own grid exactly: stacks × steps + the twin's
    // own 1.4 m wall margin, so the twin generates exactly rows × cols slots.
    const lengthM = c.cols * stepX + 1.4 + 1e-4;
    const widthM = c.rows * stepZ + 1.4 + 1e-4;
    const n = (seen.get(c.name) ?? 0) + 1;
    seen.set(c.name, n);
    const code = (counts.get(c.name) ?? 1) > 1 ? `${c.name} (${n})` : c.name;
    const prefix = u.type === 'WOODEN_BIN' ? 'BIN' : 'CRATE';
    configs.push({
      id: c.id,
      code,
      name: c.name,
      side: i % 2 === 0 ? 'LEFT' : 'RIGHT',
      lengthM,
      widthM,
      heightM: Math.max(2.4, c.size?.height ?? 2.4),
      levels: 1,
      unitType: u.type,
      unitCapacityKg: c.unit_kg ?? 0,
      unitLengthM: u.l,
      unitWidthM: u.w,
      unitHeightM: u.h,
      spacingM: u.gap,
    });
    byCode.set(code, c);
    codeOf.set(c.id, code);
    gridOf.set(code, { cols: c.cols, prefix });
  });

  // The twin numbers its slots level → row → column with one running counter,
  // so with a single level a place's unit is (row − 1) × cols + stack.
  const keyFor = (c: ColdChamber, row: number, stack: number): string => {
    const code = codeOf.get(c.id) ?? c.name;
    const grid = gridOf.get(code);
    if (!grid) return `${code}:LEVEL-01:BIN-000`;
    return `${code}:LEVEL-01:${grid.prefix}-${pad3((row - 1) * grid.cols + stack)}`;
  };
  const keyOf = (c: ColdChamber, slot: string): string => {
    const { row, stack } = parsePlace(slot);
    return keyFor(c, row, stack);
  };
  const slotsOf = (c: ColdChamber): string[] => {
    const out: string[] = [];
    for (let r = 1; r <= c.rows; r++) for (let i = 0; i < c.cols; i++) out.push(keyOf(c, placeName(r, i)));
    return out;
  };
  const placeOf = (rec: StorageSlotRecord): { chamber: ColdChamber; slot: string } | null => {
    const c = byCode.get(rec.chamberCode);
    if (!c) return null;
    const stack = rec.col - 1;
    if (rec.row < 1 || rec.row > c.rows || stack < 0 || stack >= c.cols) return null;
    return { chamber: c, slot: placeName(rec.row, stack) };
  };

  return { configs, byCode, keyOf, slotsOf, placeOf };
}
