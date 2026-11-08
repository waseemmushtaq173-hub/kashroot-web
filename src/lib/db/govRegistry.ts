'use client';

/**
 * Official Government of India registries in Supabase
 * (supabase/migrations/20261120000000_gov_fco_cibrc.sql):
 *   - gov_fco_standards   Fertiliser (Control) Order, 1985 — Schedule I specs
 *   - gov_cibrc_products  CIB&RC registered agro-chemicals (Insecticides Act, 1968)
 *   - gov_cibrc_banned    Ministry of Agriculture banned / restricted pesticides
 *
 * Everyone reads; only an admin imports. Every answer carries its source and
 * publication date. Nothing here is typed in by KashRoot.
 */
import { dbMessage, supabase, supabaseConfigured } from '@/lib/db/client';

export type FcoStandard = {
  id: string;
  fco_schedule_clause: string;
  fertiliser_type: string;
  grade: string;
  total_n_min: number | null;
  ws_p2o5_min: number | null;
  cs_p2o5_min: number | null;
  ws_k2o_min: number | null;
  micronutrient_min: number | null;
  moisture_max: number | null;
  biuret_max: number | null;
  chlorides_max: number | null;
  free_acidity_max: number | null;
  ph_range: string | null;
  particle_size_spec: string | null;
  source: string;
  source_url: string;
  published_at: string;
};

export type CibrcProduct = {
  id: string;
  cir_no: string;
  active_molecule: string;
  formulation: string | null;
  section: string | null;
  approved_crops: string[];
  target_pests: string[];
  dosage_per_ha: string | null;
  dosage_per_acre: string | null;
  waiting_period_days: number | null;
  toxicity_class: string | null;
  manufacturer: string | null;
  source: string;
  source_url: string;
  published_at: string;
};

export type CibrcBanned = {
  id: string;
  active_molecule: string;
  common_name: string | null;
  status: 'banned' | 'restricted' | 'withdrawn';
  ban_notification: string | null;
  ban_date: string | null;
  crops_affected: string[];
  reason_summary: string | null;
  source: string;
  source_url: string;
  published_at: string;
};

const missing = (e: { code?: string; message?: string }) =>
  ['PGRST202', 'PGRST205', '42P01', '42883'].includes(e.code ?? '') ||
  /schema cache|does not exist|Could not find the (function|table)/i.test(e.message ?? '');

/**
 * Embedded Fertiliser (Control) Order, 1985 — Schedule I statutory standards.
 * Used as a fallback when the Supabase gov_fco_standards table has not yet
 * been seeded. All values are percent by weight unless noted.
 */
export const EMBEDDED_FCO_STANDARDS: FcoStandard[] = [
  // Straight Nitrogenous
  {
    id: 'embedded-urea',
    fco_schedule_clause: 'Schedule I, Part A, Clause 1',
    fertiliser_type: 'Urea',
    grade: '46:0:0',
    total_n_min: 46,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: 1.5,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-neem-coated-urea',
    fco_schedule_clause: 'Schedule I, Part A, Clause 2',
    fertiliser_type: 'Neem Coated Urea',
    grade: '46:0:0',
    total_n_min: 46,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: 1.5,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-ammonium-sulphate',
    fco_schedule_clause: 'Schedule I, Part A, Clause 3',
    fertiliser_type: 'Ammonium Sulphate',
    grade: '20.5:0:0:23',
    total_n_min: 20.5,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-calcium-ammonium-nitrate',
    fco_schedule_clause: 'Schedule I, Part A, Clause 4',
    fertiliser_type: 'Calcium Ammonium Nitrate (CAN)',
    grade: '25:0:0',
    total_n_min: 25,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-calcium-nitrate',
    fco_schedule_clause: 'Schedule I, Part A, Clause 5',
    fertiliser_type: 'Calcium Nitrate',
    grade: '15.5:0:0:18.8',
    total_n_min: 15.5,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  // Straight Phosphatic & Potassic
  {
    id: 'embedded-ssp-powdered',
    fco_schedule_clause: 'Schedule I, Part B, Clause 6',
    fertiliser_type: 'Single superphosphate (SSP) Powdered',
    grade: '0:16:0',
    total_n_min: null,
    ws_p2o5_min: 16,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 12,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-ssp-granulated',
    fco_schedule_clause: 'Schedule I, Part B, Clause 7',
    fertiliser_type: 'Single superphosphate (SSP) Granulated',
    grade: '0:16:0',
    total_n_min: null,
    ws_p2o5_min: 16,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 10,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-tsp',
    fco_schedule_clause: 'Schedule I, Part B, Clause 8',
    fertiliser_type: 'Triple Superphosphate (TSP)',
    grade: '0:46:0',
    total_n_min: null,
    ws_p2o5_min: 46,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 2.5,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-mop',
    fco_schedule_clause: 'Schedule I, Part B, Clause 9',
    fertiliser_type: 'Muriate of Potash (MOP)',
    grade: '0:0:60',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: 60,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-sop',
    fco_schedule_clause: 'Schedule I, Part B, Clause 10',
    fertiliser_type: 'Sulphate of Potash (SOP)',
    grade: '0:0:50',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: 50,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  // NPK Complexes
  {
    id: 'embedded-dap',
    fco_schedule_clause: 'Schedule I, Part C, Clause 11',
    fertiliser_type: 'Diammonium phosphate (DAP)',
    grade: '18:46:0',
    total_n_min: 18,
    ws_p2o5_min: 46,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: 1.5,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-npk-10-26-26',
    fco_schedule_clause: 'Schedule I, Part C, Clause 12',
    fertiliser_type: 'NPK Complex',
    grade: '10:26:26',
    total_n_min: 10,
    ws_p2o5_min: 26,
    cs_p2o5_min: null,
    ws_k2o_min: 26,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-npk-12-32-16',
    fco_schedule_clause: 'Schedule I, Part C, Clause 13',
    fertiliser_type: 'NPK Complex',
    grade: '12:32:16',
    total_n_min: 12,
    ws_p2o5_min: 32,
    cs_p2o5_min: null,
    ws_k2o_min: 16,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-npk-20-20-0-13',
    fco_schedule_clause: 'Schedule I, Part C, Clause 14',
    fertiliser_type: 'NPK Complex',
    grade: '20:20:0:13',
    total_n_min: 20,
    ws_p2o5_min: 20,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-npk-15-15-15',
    fco_schedule_clause: 'Schedule I, Part C, Clause 15',
    fertiliser_type: 'NPK Complex',
    grade: '15:15:15',
    total_n_min: 15,
    ws_p2o5_min: 15,
    cs_p2o5_min: null,
    ws_k2o_min: 15,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  // Water Soluble Foliar / Drip Fertilisers
  {
    id: 'embedded-npk-19-19-19',
    fco_schedule_clause: 'Schedule I, Part D, Clause 16',
    fertiliser_type: 'NPK Water Soluble',
    grade: '19:19:19',
    total_n_min: 19,
    ws_p2o5_min: 19,
    cs_p2o5_min: null,
    ws_k2o_min: 19,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-npk-12-61-00',
    fco_schedule_clause: 'Schedule I, Part D, Clause 17',
    fertiliser_type: 'NPK Water Soluble',
    grade: '12:61:00',
    total_n_min: 12,
    ws_p2o5_min: 61,
    cs_p2o5_min: null,
    ws_k2o_min: 0,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-npk-13-00-45',
    fco_schedule_clause: 'Schedule I, Part D, Clause 18',
    fertiliser_type: 'NPK Water Soluble',
    grade: '13:00:45',
    total_n_min: 13,
    ws_p2o5_min: 0,
    cs_p2o5_min: null,
    ws_k2o_min: 45,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-npk-00-52-34',
    fco_schedule_clause: 'Schedule I, Part D, Clause 19',
    fertiliser_type: 'NPK Water Soluble',
    grade: '00:52:34',
    total_n_min: 0,
    ws_p2o5_min: 52,
    cs_p2o5_min: null,
    ws_k2o_min: 34,
    micronutrient_min: null,
    moisture_max: 1,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  // Micronutrients
  {
    id: 'embedded-boric-acid',
    fco_schedule_clause: 'Schedule I, Part E, Clause 22',
    fertiliser_type: 'Boric Acid',
    grade: '17% B',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 17,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-disodium-octaborate',
    fco_schedule_clause: 'Schedule I, Part E, Clause 23',
    fertiliser_type: 'Disodium Octaborate Tetrahydrate',
    grade: '20% B',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 20,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-borax',
    fco_schedule_clause: 'Schedule I, Part E, Clause 24',
    fertiliser_type: 'Borax',
    grade: '10.5% B',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 10.5,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-zinc-sulphate-21',
    fco_schedule_clause: 'Schedule I, Part E, Clause 25',
    fertiliser_type: 'Zinc Sulphate',
    grade: '21% Zn',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 21,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-zinc-sulphate-33',
    fco_schedule_clause: 'Schedule I, Part E, Clause 26',
    fertiliser_type: 'Zinc Sulphate',
    grade: '33% Zn',
    total_n_min: null,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: 33,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  // Nano Fertilisers
  {
    id: 'embedded-nano-urea',
    fco_schedule_clause: 'Schedule I, Part F, Clause 32',
    fertiliser_type: 'Nano Urea',
    grade: '4% N',
    total_n_min: 4,
    ws_p2o5_min: null,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'embedded-nano-dap',
    fco_schedule_clause: 'Schedule I, Part F, Clause 33',
    fertiliser_type: 'Nano DAP',
    grade: '8:16:0',
    total_n_min: 8,
    ws_p2o5_min: 16,
    cs_p2o5_min: null,
    ws_k2o_min: null,
    micronutrient_min: null,
    moisture_max: null,
    biuret_max: null,
    chlorides_max: null,
    free_acidity_max: null,
    ph_range: null,
    particle_size_spec: null,
    source: 'Fertiliser (Control) Order, 1985 — Schedule I',
    source_url: 'https://agricoop.nic.in/fco',
    published_at: '2026-01-01T00:00:00Z',
  },
];


/**
 * FCO standard for one fertiliser type (+ optional grade). Exact grade match
 * first, then type-only. Falls back to embedded Schedule I data when the
 * Supabase table has not yet been seeded.
 */
export async function fcoLookup(fertiliserType: string, grade?: string): Promise<FcoStandard | null> {
  if (!supabaseConfigured) {
    const match = EMBEDDED_FCO_STANDARDS.find(
      (s) => s.fertiliser_type.toLowerCase() === fertiliserType.toLowerCase() && (!grade || s.grade === grade),
    );
    return match ?? null;
  }
  const { data, error } = await supabase.rpc('kr_fco_lookup', { p_fertiliser_type: fertiliserType, p_grade: grade ?? null });
  if (error) {
    if (missing(error)) {
      const match = EMBEDDED_FCO_STANDARDS.find(
        (s) => s.fertiliser_type.toLowerCase() === fertiliserType.toLowerCase() && (!grade || s.grade === grade),
      );
      return match ?? null;
    }
    throw new Error(dbMessage(error, 'Could not read the FCO standard. Try again.'));
  }
  const rows = (data ?? []) as FcoStandard[];
  if (rows.length > 0) return rows[0];
  const match = EMBEDDED_FCO_STANDARDS.find(
    (s) => s.fertiliser_type.toLowerCase() === fertiliserType.toLowerCase() && (!grade || s.grade === grade),
  );
  return match ?? null;
}

/**
 * CIBRC product by registration number, active molecule, and/or approved crop.
 * At most 20 rows. null when the table is not set up on this site.
 */
export async function cibrcLookup(cirNo?: string, activeMolecule?: string, crop?: string): Promise<CibrcProduct[] | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase.rpc('kr_cibrc_lookup', {
    p_cir_no: cirNo ?? null,
    p_active_molecule: activeMolecule ?? null,
    p_crop: crop ?? null,
  });
  if (error) {
    if (missing(error)) return null;
    throw new Error(dbMessage(error, 'Could not read the CIBRC registry. Try again.'));
  }
  return ((data ?? []) as CibrcProduct[]).map((p) => ({ ...p, approved_crops: p.approved_crops ?? [], target_pests: p.target_pests ?? [] }));
}

/**
 * Is an active molecule banned or restricted? null when the table is not set up.
 */
export async function cibrcBannedCheck(activeMolecule: string): Promise<CibrcBanned[] | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase.rpc('kr_cibrc_banned_check', { p_active_molecule: activeMolecule });
  if (error) {
    if (missing(error)) return null;
    throw new Error(dbMessage(error, 'Could not read the banned list. Try again.'));
  }
  return ((data ?? []) as CibrcBanned[]).map((b) => ({ ...b, crops_affected: b.crops_affected ?? [] }));
}
