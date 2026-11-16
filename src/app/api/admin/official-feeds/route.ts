/**
 * /api/admin/official-feeds — the Super Admin's control of the official lists that keep
 * themselves up to date (src/lib/officialFeed.ts).
 *
 *   GET                                     the feeds and how their last check went
 *   POST {action:'add', kind, source, source_url, file_url, replace_missing}
 *   POST {action:'check', id}               read the file now (even if unchanged)
 *   POST {action:'active', id, active}      pause / resume the daily check
 *   POST {action:'remove', id}              stop keeping the list up to date (its products stay)
 *   POST {action:'search_datagov', q}       what data.gov.in publishes on a subject (with the server's key)
 *
 * The caller is asked of the database (kr_is_super_admin) on every call: the server then reads
 * an official web address on their behalf, so only the Super Admin may set one.
 */
import { NextResponse } from 'next/server';

import { isSuperAdminCaller } from '@/lib/server/callerRole';
import { FEED_PUBLIC_COLUMNS, FEED_RUN_COLUMNS, serviceDb, tableMissing } from '@/lib/server/officialFeedDb';
import { ipLimited, tooMany } from '@/lib/server/sign';
import { searchCatalog } from '@/lib/dataGovCatalog';
import { feedUrlProblem, refreshFeed, type Feed } from '@/lib/officialFeed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KINDS = ['pesticide', 'fertiliser', 'seed', 'other'];
const SETUP = { error: 'Automatic updates are not set up in the database yet. Run the SQL update (Setup check tab) and try again.', setupNeeded: true };
const NO_KEY = { error: 'This site has no database service key (SUPABASE_SERVICE_ROLE_KEY), so it cannot keep a list up to date. Add it in Vercel.' };

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET(request: Request) {
  if (ipLimited(request, 'official-feeds', 30)) return tooMany();
  if (!(await isSuperAdminCaller(request))) return NextResponse.json({ error: 'Only the Super Admin can set up automatic updates.' }, { status: 403 });
  const db = serviceDb();
  if (!db) return NextResponse.json(NO_KEY, { status: 503 });
  const { data, error } = await db.from('official_feeds').select(FEED_PUBLIC_COLUMNS).order('created_at', { ascending: true });
  if (error) return NextResponse.json(tableMissing(error) ? SETUP : { error: 'Could not read the automatic updates.' }, { status: tableMissing(error) ? 503 : 502 });
  return NextResponse.json({ feeds: data ?? [], dataGovKey: Boolean((process.env.DATA_GOV_IN_API_KEY ?? '').trim()) });
}

export async function POST(request: Request) {
  if (ipLimited(request, 'official-feeds', 30)) return tooMany();
  if (!(await isSuperAdminCaller(request))) return NextResponse.json({ error: 'Only the Super Admin can set up automatic updates.' }, { status: 403 });
  const db = serviceDb();
  if (!db) return NextResponse.json(NO_KEY, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  }
  const action = text(body.action, 20);

  if (action === 'search_datagov') {
    const answer = await searchCatalog(text(body.q, 80), { DATA_GOV_IN_API_KEY: process.env.DATA_GOV_IN_API_KEY });
    return 'problem' in answer ? NextResponse.json({ error: answer.problem }, { status: 502 }) : NextResponse.json(answer);
  }

  if (action === 'add') {
    const kind = text(body.kind, 20);
    const source = text(body.source, 200);
    const sourceUrl = text(body.source_url, 500);
    const fileUrl = text(body.file_url, 1000);
    if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Choose what the list is.' }, { status: 400 });
    if (source.length < 2) return NextResponse.json({ error: 'Write the name of the list — the same name the list was imported under.' }, { status: 400 });
    if (!/^https?:\/\/\S+\.\S+/.test(sourceUrl)) return NextResponse.json({ error: 'Add the link of the page where the Government publishes the list (https://…).' }, { status: 400 });
    const bad = feedUrlProblem(fileUrl);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const { data, error } = await db
      .from('official_feeds')
      .insert({ kind, source, source_url: sourceUrl, file_url: fileUrl, replace_missing: body.replace_missing !== false })
      .select(FEED_PUBLIC_COLUMNS)
      .single();
    if (error) {
      if (tableMissing(error)) return NextResponse.json(SETUP, { status: 503 });
      if (error.code === '23505') return NextResponse.json({ error: 'This list already has an automatic update.' }, { status: 409 });
      return NextResponse.json({ error: 'Could not save the automatic update.' }, { status: 502 });
    }
    return NextResponse.json({ feed: data });
  }

  const id = text(body.id, 60);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Unknown list.' }, { status: 400 });

  if (action === 'check') {
    const { data, error } = await db.from('official_feeds').select(FEED_RUN_COLUMNS).eq('id', id).maybeSingle();
    if (error) return NextResponse.json(tableMissing(error) ? SETUP : { error: 'Could not read the automatic update.' }, { status: 502 });
    if (!data) return NextResponse.json({ error: 'Unknown list.' }, { status: 404 });
    const outcome = await refreshFeed(data as Feed, { db, env: { DATA_GOV_IN_API_KEY: process.env.DATA_GOV_IN_API_KEY } }, true);
    return NextResponse.json({ outcome });
  }

  if (action === 'active') {
    const { error } = await db.from('official_feeds').update({ active: body.active === true }).eq('id', id);
    return error ? NextResponse.json({ error: 'Could not change it.' }, { status: 502 }) : NextResponse.json({ ok: true });
  }

  if (action === 'remove') {
    const { error } = await db.from('official_feeds').delete().eq('id', id);
    return error ? NextResponse.json({ error: 'Could not remove it.' }, { status: 502 }) : NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
