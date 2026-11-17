/**
 * GET /api/cron/sync-gov-registry — switched off.
 *
 * This job used to copy KashRoot's own typed catalogue (lib/gov-agro-registry: brand names, manufacturers, doses typed in by
 * hand) into the official-list tables gov_cibrc_products, gov_cibrc_banned and gov_fco_standards every day, stamped
 * "CIB&RC Registered Pesticides (ppqs.gov.in)". A typed row stamped with an official source reads as the Government's own
 * word, which it is not (a molecule has many registered makers, not the one typed here), so the job no longer runs and is
 * no longer scheduled (vercel.json). Those tables are filled only from the publishers' own files, by the Super Admin's
 * official-feed import (lib/server/officialFeedDb, Admin → Official lists), and always carry who imported them.
 * Rows an earlier run left behind are listed, and removed on request, by supabase/cleanup/remove_typed_registry_rows.sql.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { ok: false, disabled: true, note: 'This job is switched off: KashRoot does not copy its own typed list into the official-list tables.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
