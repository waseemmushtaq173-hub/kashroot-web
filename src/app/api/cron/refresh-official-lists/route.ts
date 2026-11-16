/**
 * GET /api/cron/refresh-official-lists
 * Daily: reads the official file of every list that is kept up to date and
 * brings the list up to date when the file has changed (src/lib/officialFeed.ts).
 * Protected by Vercel Cron (vercel.json), which sends CRON_SECRET.
 *
 * The answer says how each list went (by its name), never the file's address:
 * a data.gov.in address carries the key.
 */
import { NextResponse } from 'next/server';

import { FEED_RUN_COLUMNS, serviceDb, tableMissing } from '@/lib/server/officialFeedDb';
import { refreshFeed, type Feed } from '@/lib/officialFeed';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Stop starting new lists after this long, so the run ends inside its time limit. */
const BUDGET_MS = 240_000;

function allowed(request: Request): boolean {
  const secret = (process.env.CRON_SECRET ?? '').trim();
  // No secret set: nobody gets in (an empty "Bearer " must not match an empty secret).
  return secret.length >= 8 && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!allowed(request)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401 });
  const db = serviceDb();
  if (!db) return NextResponse.json({ error: 'No database service key.' }, { status: 503 });

  const { data, error } = await db
    .from('official_feeds')
    .select(FEED_RUN_COLUMNS)
    .eq('active', true)
    .order('last_checked_at', { ascending: true, nullsFirst: true });
  if (error) return NextResponse.json({ error: tableMissing(error) ? 'Automatic updates are not set up in the database yet.' : 'Could not read the automatic updates.' }, { status: 503 });

  const started = Date.now();
  const lists: { list: string; status: string; detail?: string }[] = [];
  for (const feed of (data ?? []) as Feed[]) {
    if (Date.now() - started > BUDGET_MS) {
      lists.push({ list: feed.source, status: 'skipped', detail: 'Out of time; it is first in line tomorrow.' });
      continue;
    }
    const outcome = await refreshFeed(feed, { db, env: { DATA_GOV_IN_API_KEY: process.env.DATA_GOV_IN_API_KEY } });
    lists.push(
      outcome.status === 'ok'
        ? { list: feed.source, status: 'updated', detail: `${outcome.rows} products read, ${outcome.added} new, ${outcome.removed} removed` }
        : outcome.status === 'failed'
          ? { list: feed.source, status: 'failed', detail: outcome.error }
          : { list: feed.source, status: 'unchanged' },
    );
  }
  return NextResponse.json({ checked: lists.length, lists, at: new Date().toISOString() });
}
