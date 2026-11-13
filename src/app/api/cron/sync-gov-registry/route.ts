/**
 * GET /api/cron/sync-gov-registry
 * Daily sync of the CIBRC / FCO registry from Government sources.
 *
 * Upserts the embedded canonical catalog (lib/gov-agro-registry) into the
 * Supabase official-list tables the TrueScan lookups read — gov_cibrc_products,
 * gov_fco_standards and gov_cibrc_banned (created by
 * supabase/migrations/20261120000000_gov_fco_cibrc.sql) — so all future
 * searches reflect the latest Government of India approvals. The service-role
 * key is used because the import policies are admin-only and the cron has no
 * user session. Best-effort per row: a rejected row counts as an error and
 * never breaks the run.
 *
 * Protected by Vercel Cron (see vercel.json) and the
 * .github/workflows/sync-gov-registry.yml dispatch.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ipLimited, tooMany } from '@/lib/server/sign';
import {
  EMBEDDED_CIBRC_REGISTERED,
  EMBEDDED_CIBRC_BANNED,
  EMBEDDED_FCO_STANDARDS,
} from '@/lib/gov-agro-registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function requireCron(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${process.env.CRON_SECRET ?? ''}`;
}

/** The server-side client: service-role key first (the import policies are admin-only). */
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  if (!requireCron(request)) return tooMany();
  if (ipLimited(request, 'sync-gov-registry', 1)) return tooMany();

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const db = url && key ? getSupabase() : null;

    // Upsert the canonical embedded registry into Supabase so the DB mirrors
    // the snapshot used by TrueScan. Best-effort per row.
    let upserted = 0;
    let errors = 0;

    if (db) {
      // Registered products → gov_cibrc_products (unique: cir_no + formulation).
      for (const p of EMBEDDED_CIBRC_REGISTERED) {
        try {
          const { error } = await db.from('gov_cibrc_products').upsert(
            {
              cir_no: p.cir_no,
              active_molecule: p.active_molecule,
              formulation: p.formulation,
              section: p.section,
              approved_crops: p.approved_crops,
              target_pests: p.target_pests,
              dosage_per_ha: p.dosage_per_ha,
              dosage_per_acre: p.dosage_per_acre,
              waiting_period_days: p.waiting_period_days,
              toxicity_class: p.toxicity_class,
              manufacturer: p.manufacturerCompany || p.manufacturer,
              source: p.source,
              source_url: p.source_url,
              published_at: p.published_at,
            },
            { onConflict: 'cir_no,formulation' },
          );
          if (error) throw error;
          upserted++;
        } catch {
          errors++;
        }
      }
      // Banned & restricted → gov_cibrc_banned (unique: active_molecule + status).
      for (const b of EMBEDDED_CIBRC_BANNED) {
        try {
          const { error } = await db.from('gov_cibrc_banned').upsert(
            {
              active_molecule: b.active_molecule,
              common_name: b.common_name,
              status: b.status,
              ban_notification: b.ban_notification,
              ban_date: b.ban_date,
              crops_affected: b.crops_affected,
              reason_summary: b.reason_summary,
              source: b.source,
              source_url: b.source_url,
              published_at: b.published_at,
            },
            { onConflict: 'active_molecule,status' },
          );
          if (error) throw error;
          upserted++;
        } catch {
          errors++;
        }
      }
      // FCO Schedule I standards → gov_fco_standards (unique: type + grade + clause).
      for (const f of EMBEDDED_FCO_STANDARDS) {
        try {
          const { error } = await db.from('gov_fco_standards').upsert(
            {
              fco_schedule_clause: f.fco_schedule_clause,
              fertiliser_type: f.fertiliser_type,
              grade: f.grade,
              total_n_min: f.total_n_min,
              ws_p2o5_min: f.ws_p2o5_min,
              ws_k2o_min: f.ws_k2o_min,
              micronutrient_min: f.micronutrient_min,
              moisture_max: f.moisture_max,
              biuret_max: f.biuret_max,
              source: f.source,
              source_url: f.source_url,
              published_at: f.published_at,
            },
            { onConflict: 'fertiliser_type,grade,fco_schedule_clause' },
          );
          if (error) throw error;
          upserted++;
        } catch {
          errors++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      upserted,
      errors,
      source: 'CIB&RC (ppqs.gov.in) + FCO 1985 canonical catalog',
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('sync-gov-registry failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
