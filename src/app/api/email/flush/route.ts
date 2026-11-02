/**
 * Send the emails the database queued (lib/server/mail flushOutbox).
 *
 * GET|POST /api/email/flush → { sent, failed }
 *
 * Anyone may ask: it only sends what was already queued, to the addresses the
 * database holds — it takes no address or text. Asked right after a Help desk
 * reply or a payout change, and once a day by Vercel Cron (vercel.json) to
 * send anything still waiting. Limited per network.
 */
import { NextResponse } from 'next/server';

import { flushOutbox } from '@/lib/server/mail';
import { sharedIpLimited } from '@/lib/server/sharedLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function flush(req: Request) {
  if (await sharedIpLimited(req, 'email-flush', 20, 60_000)) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  return NextResponse.json(await flushOutbox(10), { headers: { 'cache-control': 'no-store' } });
}

export { flush as GET, flush as POST };
