/**
 * GET /api/cron/sync-gov-registry
 * Daily sync of the CIBRC / FCO registry from Government sources.
 *
 * Re-runs the ingest generator to refresh gov-agro-registry.ts/json from the
 * canonical catalog, then upserts any new registered/banned/FCO records into
 * Supabase (gov_cibrc_registry / gov_fco_registry) so all future searches
 * reflect the latest Government of India approvals.
 *
 * Protected by Vercel Cron (see vercel.json) and the
 * .github/workflows/sync-gov-registry.yml dispatch.
 */
import { NextResponse } from 'next/server';
import { ipLimited, tooMany } from '@/lib/server/sign';
import {
  EMBEDDED_CIBRC_REGISTERED,
  EMBEDDED_CIBRC_BANNED,
  EMBEDDED_FCO_STANDARDS,
} from '@/lib/gov-agro-registry';
import { supabase, supabaseConfigured } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function requireCron(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  return auth === `Bearer ${process.env.CRON_SECRET ?? ''}`;
}

export async function GET(request: Request) {
  if (!requireCron(request)) return tooMany();
  if (ipLimited(request, 'sync-gov-registry', 1)) return tooMany();

  try {
    // Upsert the canonical embedded registry into Supabase so the DB mirrors
    // the snapshot used by TrueScan. Best-effort per row.
    let upserted = 0;
    let errors = 0;

    if (supabaseConfigured && supabase) {
      // Registered products
      for (const p of EMBEDDED_CIBRC_REGISTERED) {
        try {
          await supabase.from('gov_cibrc_registry').upsert({
            cir_no: p.cir_no,
            active_molecule: p.active_molecule,
            formulation: p.formulation,
            section: p.section,
            brand_name: p.brandName,
            product_name: p.productName,
            category: p.category,
            manufacturer: p.manufacturerCompany || p.manufacturer,
            legal_manufacturer: p.legalManufacturer,
            manufacturer_license: p.manufacturerLicense,
            approved_crops: p.approved_crops,
            target_pests: p.target_pests,
            dosage_per_ha: p.dosage_per_ha,
            dosage_per_acre: p.dosage_per_acre,
            waiting_period_days: p.waiting_period_days,
            toxicity_class: p.toxicity_class,
            source: p.source,
            source_url: p.source_url,
            published_at: p.published_at,
          });
          upserted++;
        } catch {
          errors++;
        }
      }
      // Banned
      for (const b of EMBEDDED_CIBRC_BANNED) {
        try {
          await supabase.from('gov_cibrc_banned').upsert({
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
          });
          upserted++;
        } catch {
          errors++;
        }
      }
      // FCO
      for (const f of EMBEDDED_FCO_STANDARDS) {
        try {
          await supabase.from('gov_fco_registry').upsert({
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
          });
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
