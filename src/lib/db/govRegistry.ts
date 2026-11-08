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
 * FCO standard for one fertiliser type (+ optional grade). Exact grade match
 * first, then type-only. null when the table is not set up on this site.
 */
export async function fcoLookup(fertiliserType: string, grade?: string): Promise<FcoStandard | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase.rpc('kr_fco_lookup', { p_fertiliser_type: fertiliserType, p_grade: grade ?? null });
  if (error) {
    if (missing(error)) return null;
    throw new Error(dbMessage(error, 'Could not read the FCO standard. Try again.'));
  }
  const rows = (data ?? []) as FcoStandard[];
  return rows[0] ?? null;
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
