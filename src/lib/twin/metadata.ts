/**
 * The cold-store twin's published metadata (lib/twin/metadata): the JSON the
 * headless pipeline ships beside the GLB (public/models/
 * kashroot_coldstore_metadata.json, written by glb_exporter). The web reads
 * it to name chambers, count their crates and tell growers and spans apart —
 * always the engine's own numbers, never ones invented on the page.
 *
 * Field names follow the JSON exactly (snake_case), so the contract with the
 * blender package stays wordless and direct. `crate_records.fields_per_cell`
 * documents the per-instance fields the viewer derives on the fly from the
 * instance index (see lib/twin/engine.cellAt): the shipped JSON keeps the
 * per-cell table out (2160 × 4 chambers would be dead weight in every page
 * load), and `crate_cells` stays an empty list by design.
 */
import { cellAt, cellId } from '@/lib/twin/engine';

/** The whole published metadata document. */
export interface TwinMetadata {
  $schema: string;
  facility_name: string;
  generated_at: string;
  generator: string;
  units: { length: string; mass: string; temperature: string; humidity: string };
  glb: {
    filename: string;
    bytes: number;
    sha256: string;
    nodes: number;
    meshes: number;
    accessors: number;
    materials: number;
    instanced_nodes: number;
    extras_nodes: number;
  };
  totals: {
    chambers_count: number;
    levels_total: number;
    total_crate_count: number;
    booked_crate_count: number;
    max_theoretical_capacity_kg: number;
    actual_usable_capacity_kg: number;
    occupied_capacity_kg: number;
    remaining_capacity_kg: number;
    occupancy_pct: number;
    apples_modelled: number;
    appled_crate_nodes: number;
    interior_volume_m3: number;
    usable_volume_m3: number;
  };
  chambers: TwinChamberMeta[];
  conventions: {
    axes: string;
    units: string;
    crate_order: string;
    apple_cluster_grid: string;
    crate_id: string;
  };
  crate_records: {
    /** The instance contract, in the exporter's own words. */
    how: string;
    /** The per-instance fields the viewer derives from the index. */
    fields_per_cell: string[];
  };
  methodology?: string;
}

/** One chamber as the metadata publishes it. */
export interface TwinChamberMeta {
  id: string;
  label: string;
  /** Engine-space bounds (X across, Y depth, Z up), metres: [x0, y0, z0, x1, y1, z1]. */
  rect: [number, number, number, number, number, number];
  temperature_c: number;
  humidity_pct: number;
  ca: boolean;
  aisle_width_m: number;
  door: { face_y: number; x0: number; width: number; height: number; slide_x0: number; ca: boolean };
  evaporators: { center: [number, number, number]; size: [number, number, number] }[];
  lights: { center: [number, number, number]; size: [number, number, number] }[];
  pipes: { from: [number, number, number]; to: [number, number, number]; radius: number }[];
  racks: { index: number; origin: [number, number, number]; bays: number }[];
  interior_volume_m3: number;
  usable_volume_m3: number;
  levels_per_chamber: number;
  crates_per_level: number;
  crates_per_row_fit: number;
  rows_per_level_fit: number;
  rack_rows: number;
  deck_area_m2: number;
  max_deck_kg: number;
  crate_count: number;
  booked_count: number;
  max_theoretical_capacity_kg: number;
  actual_usable_capacity_kg: number;
  occupied_capacity_kg: number;
  remaining_capacity_kg: number;
  growers: TwinGrower[];
  /** Kept out of the JSON on purpose (see the module note). */
  crate_cells: unknown[];
  appled_crates: number[];
  booked_spans: TwinSpan[];
}

/** One grower's place in one chamber. */
export interface TwinGrower {
  grower_id: string;
  name: string;
  product_type: string;
  crates: number;
  kg: number;
  span_start: number;
  span_end: number;
  /** Set when some of the grower's crates did not fit (recorded, never invented). */
  short?: boolean;
  note?: string;
}

/** A booked stretch of crate instances, these indices inclusive. */
export interface TwinSpan {
  grower_id: string;
  start: number;
  end: number;
}

/** One crate place, what the viewer's drawer shows. */
export interface TwinCrateInfo {
  chamberId: string;
  cellId: string;
  level: number;
  row: number;
  subrow: number;
  col: number;
  grower: TwinGrower | null;
  /** kg the place is booked for in it; 0 when the place stands empty. */
  occupiedKg: number;
  capacityKg: number;
}

/** The fetched metadata, cached module-wide so many panels share one fetch. */
let metaNow: Promise<TwinMetadata> | null = null;

/** Fetch (and remember) the twin metadata JSON for the session. */
export function fetchTwinMeta(): Promise<TwinMetadata> {
  if (!metaNow) {
    metaNow = fetch('/models/kashroot_coldstore_metadata.json')
      .then((r) => {
        if (!r.ok) throw new Error(`twin metadata ${r.status}`);
        return r.json() as Promise<TwinMetadata>;
      })
      .catch((e) => {
        metaNow = null;
        throw e;
      });
  }
  return metaNow;
}

/** The booked stretch a crate instance sits in, `start..end` inclusive. */
export function spanOf(index: number, spans: TwinSpan[]): TwinSpan | null {
  for (const s of spans) {
    if (index >= s.start && index <= s.end) return s;
  }
  return null;
}

/** The grower whose crates stand at instance `index` (null = an empty place). */
export function growerAt(index: number, chamber: TwinChamberMeta): TwinGrower | null {
  const span = spanOf(index, chamber.booked_spans);
  if (!span) return null;
  return chamber.growers.find((g) => g.grower_id === span.grower_id) ?? null;
}

/** Everything the crate drawer needs, derived from the instance index. */
export function crateInfoAt(index: number, chamber: TwinChamberMeta): TwinCrateInfo {
  const c = cellAt(index, {
    crates_per_level: chamber.crates_per_level,
    crates_per_row_fit: chamber.crates_per_row_fit,
    rows_per_level_fit: chamber.rows_per_level_fit,
    levels_per_chamber: chamber.levels_per_chamber,
    booked_count: chamber.booked_count,
  });
  const grower = growerAt(index, chamber);
  return {
    chamberId: chamber.id,
    cellId: cellId(
      chamber.id,
      c.level,
      c.row,
      c.subrow,
      c.col,
      chamber.crates_per_row_fit,
    ),
    level: c.level,
    row: c.row,
    subrow: c.subrow,
    col: c.col,
    grower,
    occupiedKg: grower ? Math.round((chamber.occupied_capacity_kg / Math.max(1, chamber.booked_count)) * 10) / 10 : 0,
    capacityKg: chamber.booked_count > 0 ? Math.round((chamber.occupied_capacity_kg / chamber.booked_count) * 10) / 10 : 0,
  };
}

/** Crates stand on one level per rack pass: instances per level. */
export const perLevel = (chamber: TwinChamberMeta): number => chamber.crates_per_level;

/** Every grower named across the whole twin (deduped by id, chamber first). */
export function growersOf(meta: TwinMetadata): TwinGrower[] {
  const out: TwinGrower[] = [];
  const seen = new Set<string>();
  for (const ch of meta.chambers) {
    for (const g of ch.growers) {
      if (seen.has(g.grower_id)) continue;
      seen.add(g.grower_id);
      out.push(g);
    }
  }
  return out;
}
