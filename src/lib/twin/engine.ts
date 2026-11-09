/**
 * The cold-store twin's capacity math in the browser (lib/twin/engine).
 *
 * A line-for-line mirror of the Python engine
 * (blender_digital_twin/kashroot_coldstore_twin): the same constants, the
 * same formulas, rounded the same way to the millimetre. It is what lets
 * the web twin quote exact counts — how many apple crates stand on pallet
 * racking in a chamber of a given size, what they weigh — without sending
 * anything to a server and without inventing a single number.
 *
 * All lengths in metres, weights in kilograms. The fixture constants
 * (racking system, crate sizes, panel allowances) are the KashRoot
 * reference system's, as they live in the twin package by default.
 */

import { nice } from '@/lib/coldStore';

/** Round to the millimetre, exactly as the Python engine's r() does. */
const r = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Panels and allowances: airflow and insulation wakes around what is stored.
 * (blender_digital_twin …/properties.py, PanelConfig defaults.)
 */
export const TWIN_PANELS = {
  top_clearance_m: 0.45,
  crate_gap_m: 0.02,
  rack_bay_pitch_m: 1.2,
  crate_stack_slack_m: 0.05,
  evaporator_height_m: 0.9,
  door_slide_allowance_m: 0.15,
  wall_clearance_m: 0.3,
  partition_thickness_m: 0.12,
} as const;

/**
 * The reference racking system: structural steel pallet racking, one system
 * shared by the chamber. (properties.py, RackConfig defaults.)
 */
export const TWIN_RACK = {
  rack_length_m: 9.6,
  rack_width_m: 2.0,
  rack_height_m: 7.0,
  num_rack_rows: 3,
  num_levels: 12,
  level_clearance_m: 0.1,
  rack_spacing_m: 1.4,
  floor_load_limit_kg: 1500,
  upright_width_m: 0.1,
} as const;

/**
 * The reference apple crate: its proportions, its weight rating and the
 * packing pattern it nests in. (properties.py, CrateConfig defaults.)
 */
export const TWIN_CRATE = {
  crate_length_m: 0.6,
  crate_width_m: 0.4,
  crate_height_m: 0.33,
  weight_capacity_kg: 20.0,
  crates_per_row: 15,
  rows_per_level: 4,
} as const;

/** One chamber's safe standing load as the reference spec sets it (kg). */
export const TWIN_MAX_LOAD_KG = 60000;

/** Where the shipped web twin lives (the GLB and its metadata JSON). */
export const TWIN_GLB_URL = '/models/kashroot_coldstore_twin.glb';
export const TWIN_META_URL = '/models/kashroot_coldstore_metadata.json';

/** A chamber measured the way the engine takes it. */
export interface TwinDims {
  /** Across the door wall (engine X), wall to wall inside. */
  widthM: number;
  /** From the door to the back wall (engine Y). */
  lengthM: number;
  /** Floor to ceiling (engine Z). */
  heightM: number;
  /** The chamber door's clear width. */
  doorWidthM: number;
  /** The main fork-lift aisle, if the chamber is meant to have one. */
  aisleWidthM?: number;
}

/**
 * What the engine computes for one chamber: every field is one the Python
 * engine reads out of a built model, computed the same way.
 */
export interface TwinFit {
  /** How many crates stand along one rack level (15 in the reference). */
  crates_per_row_fit: number;
  /** How many rows of crates stand across the rack depth (4). */
  rows_per_level_fit: number;
  /** Crates on one level of every rack row together (180). */
  crates_per_level: number;
  /** How high the racking stacks here (12). */
  levels_per_chamber: number;
  /** The racking's rows (front zone first, walking to the back wall). */
  rack_rows: number;
  /** Every crate station in the chamber (all levels together). */
  crate_count: number;
  /** Rated weight of one crate station (kg). */
  unit_kg: number;
  /** Every station fully loaded (kg), geometric total. */
  max_theoretical_capacity_kg: number;
  /** What may actually be stacked: the smaller of the chamber's max load and the whole level's deck restraint. */
  actual_usable_capacity_kg: number;
  /** One level's pitch: crate height + clearance, metres. */
  payload_pitch_m: number;
  /** Rack length after the chamber's own width has its say, metres. */
  rack_length_used_m: number;
  /** One level's deck area (m²) and its load limit (kg). */
  deck_area_m2: number;
  max_deck_kg: number;
  /** Bays per rack row (1.2 m pitch). */
  bays: number;
  /** Where the door and aisle end and the racks start, metres. */
  front_zone_m: number;
  /** Depth left over behind the racking, metres (the airflow gap included). */
  spare_depth_m: number;
}

/**
 * The engine's chamber fit (capacity_engine.layout_crates), done on the
 * owner's own measured chamber. Same formulas, same constants.
 */
export function mirrorChamberFit(d: TwinDims): TwinFit | null {
  const p = TWIN_PANELS;
  const rack = TWIN_RACK;
  const crate = TWIN_CRATE;
  if (!(d.widthM > 1 && d.lengthM > 1 && d.heightM > 0.5 && d.doorWidthM > 0.3)) return null;

  // The door and the sliding behind it claim the front of the chamber,
  // unless the aisle is wider.
  const front_zone = Math.max(d.aisleWidthM ?? 0, p.door_slide_allowance_m + d.doorWidthM);

  // Inner usable rectangle behind the front zone.
  const x0 = p.wall_clearance_m;
  const x1 = d.widthM - p.wall_clearance_m;
  const usable_len = x1 - x0;
  if (usable_len < 0.5) return null;
  const rack_length = Math.min(rack.rack_length_m, usable_len);

  // Crates per level: between the uprights, then the packing pattern,
  // then the deck's load restraint (whatever count is smallest wins).
  const big = Math.max(crate.crate_length_m, crate.crate_width_m);
  const small = Math.min(crate.crate_length_m, crate.crate_width_m);
  const along_pitch = big + p.crate_gap_m;
  const across_pitch = small + p.crate_gap_m;
  const fit_along = Math.floor((rack_length - 2 * rack.upright_width_m) / along_pitch);
  const fit_across = Math.floor((rack.rack_width_m - 2 * rack.upright_width_m) / across_pitch);
  const crates_per_row = fit_along >= 1 ? Math.min(crate.crates_per_row, fit_along) : 0;
  const rows_per_level = fit_across >= 1 ? Math.min(crate.rows_per_level, fit_across) : 0;
  let crates_per_rowlevel = crates_per_row * rows_per_level;

  // Deck area + the per-level load cap (kg/m² restraint).
  const deck_area = rack_length * rack.rack_width_m;
  const max_deck_kg = rack.floor_load_limit_kg * deck_area;
  const load_cap = crate.weight_capacity_kg > 0 ? Math.floor(max_deck_kg / crate.weight_capacity_kg) : 0;
  if (load_cap > 0 && crates_per_rowlevel > 0) crates_per_rowlevel = Math.min(crates_per_rowlevel, load_cap);
  const crates_per_level = crates_per_rowlevel * rack.num_rack_rows;

  // Levels: fit by stack pitch, respecting the rack height and level count.
  const payload_pitch = crate.crate_height_m + rack.level_clearance_m;
  const height_cap = Math.floor((d.heightM - p.top_clearance_m - p.evaporator_height_m) / payload_pitch);
  const rack_cap = Math.floor(rack.rack_height_m / payload_pitch);
  const levels = Math.max(0, Math.min(rack.num_levels, height_cap, rack_cap, rack.num_levels));

  // Racking rows: all the reference system's rows always run behind the
  // front zone (capacity_engine.layout_crates — no depth-fit reduction),
  // starting right behind it and spaced rack width + spacing apart.
  const rack_span = rack.num_rack_rows * rack.rack_width_m + Math.max(0, rack.num_rack_rows - 1) * rack.rack_spacing_m;
  const spare_depth = d.lengthM - p.wall_clearance_m - (front_zone + rack_span);

  const crate_count = crates_per_level * levels;
  const max_theoretical = crate_count * crate.weight_capacity_kg;
  const chamber_cap = TWIN_MAX_LOAD_KG > 0 ? TWIN_MAX_LOAD_KG : max_theoretical;
  const level_load_limited = load_cap * rack.num_rack_rows * levels * crate.weight_capacity_kg;
  const actual_usable = Math.min(max_theoretical, chamber_cap, level_load_limited);
  const bays = Math.max(1, Math.ceil(rack_length / p.rack_bay_pitch_m - 1e-9));

  return {
    crates_per_row_fit: crates_per_row,
    rows_per_level_fit: rows_per_level,
    crates_per_level,
    levels_per_chamber: levels,
    rack_rows: rack.num_rack_rows,
    crate_count,
    unit_kg: crate.weight_capacity_kg,
    max_theoretical_capacity_kg: r(max_theoretical),
    actual_usable_capacity_kg: r(actual_usable),
    payload_pitch_m: r(payload_pitch),
    rack_length_used_m: r(rack_length),
    deck_area_m2: r(deck_area),
    max_deck_kg: r(max_deck_kg),
    bays,
    front_zone_m: r(front_zone),
    spare_depth_m: r(spare_depth),
  };
}

/** Enough of a metadata chamber to walk its crate grid the engine's way. */
export interface TwinGrid {
  crates_per_level: number;
  crates_per_row_fit: number;
  rows_per_level_fit: number;
  levels_per_chamber: number;
  booked_count: number;
}

/** Where crate instance `index` stands: the engine's published order (level -> rack row -> subrow -> col). */
export function cellAt(index: number, g: TwinGrid): { level: number; row: number; subrow: number; col: number } {
  const rem = index % g.crates_per_level;
  const per_rowlevel = g.crates_per_row_fit * g.rows_per_level_fit;
  // `col` counts along the rack within one subrow; the published crate id
  // numbers the columns across the whole rack row (C = (subrow-1)*per-rowfit + col).
  return {
    level: 1 + Math.floor(index / g.crates_per_level),
    row: 1 + Math.floor(rem / per_rowlevel),
    subrow: 1 + Math.floor((rem % per_rowlevel) / g.crates_per_row_fit),
    col: 1 + ((rem % per_rowlevel) % g.crates_per_row_fit),
  };
}

/** The engine's crate id for a station: Crate_CH03_L7_R2_C33 by its convention. */
export function cellId(chamber: string, level: number, row: number, subrow: number, col: number, cratesPerRowFit: number): string {
  return `Crate_${chamber}_L${level}_R${row}_C${subrow * cratesPerRowFit - cratesPerRowFit + col}`;
}

/**
 * The published conventions, as the engine prints them into the metadata;
 * the viewer and the panels quote this, so the web and the engine agree.
 */
export const TWIN_CONVENTIONS = {
  axes: 'Y-up, right-handed; X = long side of the building, Y = depth (door faces -Y), Z = up',
  crate_order: 'level -> rack row -> subrow across rack depth -> crate along the rack length',
  apple_cluster_grid: '4x3 top-layer apples per booked crate',
  unit_word: 'crate',
} as const;

/** Tonnes to one decimal for display, as the panels show bookloads. */
export const tonnesOf = (kg: number) => Math.round(kg / 100) / 10;

/** A count in words the way pages show it elsewhere ("8,640 crates"). */
export const cratesText = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? 'crate' : 'crates'}`;

export { nice };
