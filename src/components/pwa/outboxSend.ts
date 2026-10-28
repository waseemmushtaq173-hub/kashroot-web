'use client';

/**
 * Keeping safe actions for later, and sending them when the signal is back.
 * Only three things are ever kept (idb.ts): a question to the experts, a
 * Mandi Helper's rate, and a listing draft in the Farmer portal (saved
 * hidden from buyers: never put on sale without signal). Orders, bookings,
 * payments and the identity check are never kept.
 *
 * Each item is sent as the account that wrote it, only while that account
 * is signed in on this phone, with the database's own rules (row-level
 * security) checking it as for any other request.
 */
import { authFetch } from '@/lib/auth-fetch';
import { toast } from '@/lib/client/toast';
import { needsDevanagari } from '@/lib/client/speech';
import { sendMessage, type AdvisoryRequest } from '@/lib/db/advisory';
import { dbMessage, supabase } from '@/lib/db/client';
import type { ListingInput } from '@/lib/db/market';
import type { RateInput } from '@/lib/db/mandiRates';
import { refusedForPass } from '@/lib/client/humanPass';

import { newId, outbox, type OutboxItem } from './idb';
import { isOfflineError, offlineNow } from './net';

/** A question, soil test or video call, as createRequest (lib/db/advisory) would send it. */
export interface QuestionRow {
  farmer_name: string;
  farmer_phone: string | null;
  district: string | null;
  kind: AdvisoryRequest['kind'];
  crop: string | null;
  message: string;
  photo: string | null;
  preferred_time: string | null;
  lang: AdvisoryRequest['lang'];
}
/** A rate as postRate would send it, plus the day it was written (posting checks it is today or yesterday). */
export type RateRow = RateInput & { rate_date: string };
/** A listing draft: hidden from buyers until the farmer puts it on sale. */
export type ListingRow = ListingInput & { active: false };

type Payload = { row: QuestionRow } | { row: RateRow } | { row: ListingRow };

/** The table each kind of item becomes a row of. */
const TABLE = { question: 'advisory_requests', rate: 'mandi_rates', listing: 'market_listings' } as const;

/** Today in India (yyyy-mm-dd), as the database dates a rate. */
const indiaDay = (ms = Date.now()) => new Date(ms + 5.5 * 3600_000).toISOString().slice(0, 10);
const dayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const short = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

// ── Keeping ─────────────────────────────────────────────────────────────────

async function keep(kind: OutboxItem['kind'], userId: string, label: string, payload: Payload): Promise<void> {
  await outbox.add({ id: newId(), kind, userId, label, payload });
  // Kept because the send failed on a weak signal, not because the phone is offline: try again now.
  if (!offlineNow()) void flushOutbox(userId);
}

/** A question to the experts (AskForm), sent with the same limits as createRequest. */
export function keepQuestion(userId: string, q: { farmer_name: string; farmer_phone?: string; district?: string; kind: QuestionRow['kind']; crop?: string; message: string; photo?: string | null; preferred_time?: string; lang: QuestionRow['lang'] }) {
  const row: QuestionRow = {
    farmer_name: q.farmer_name.slice(0, 80),
    farmer_phone: q.farmer_phone?.slice(0, 20) || null,
    district: q.district?.slice(0, 80) || null,
    kind: q.kind,
    crop: q.crop?.slice(0, 60) || null,
    message: q.message.slice(0, 2000),
    photo: q.photo ?? null,
    preferred_time: q.preferred_time?.slice(0, 80) || null,
    lang: q.lang,
  };
  const label = q.kind === 'question' ? `Question: ${short(row.message)}` : q.kind === 'soil_test' ? 'Soil test request' : 'Video call request';
  return keep('question', userId, label, { row });
}

/** A Mandi Helper's rate (PostedRates), dated the day it was written. */
export function keepRate(userId: string, rate: RateInput) {
  const row: RateRow = { ...rate, rate_date: indiaDay() };
  return keep('rate', userId, `Rate: ${rate.commodity} at ${rate.mandi}, ₹${rate.modal_price} per ${rate.unit}`, { row });
}

/** A new listing in the Farmer portal (SellerDesk), kept as a hidden draft. */
export function keepListingDraft(userId: string, listing: ListingInput) {
  const row: ListingRow = { ...listing, active: false };
  return keep('listing', userId, `Draft: ${short(listing.product)}`, { row });
}

// ── Sending ─────────────────────────────────────────────────────────────────

type Outcome = { ok: true; already?: boolean } | { ok: false; offline: true } | { ok: false; offline?: false; retry: boolean; error: string };
type DbError = { message?: string; code?: string } | null;

function judge(item: OutboxItem, error: DbError, status: number): Outcome {
  if (!error) return { ok: true };
  // Already there: an earlier try reached KashRoot but its answer was lost.
  if (error.code === '23505') return { ok: true, already: true };
  const m = error.message ?? '';
  if (error.code === 'KR_OFFLINE' || status === 0 || isOfflineError(m)) return { ok: false, offline: true };
  if (status === 401 || /JWT|not authenticated/i.test(m)) return { ok: false, retry: true, error: 'Sign in again on this phone. It is sent as soon as you do.' };
  if (status === 429 || status >= 500) return { ok: false, retry: true, error: 'KashRoot did not answer. It will be sent again in a minute.' };
  if (/row-level security/i.test(m) && item.kind === 'rate') {
    const day = (item.payload as { row: RateRow }).row.rate_date;
    if (day < indiaDay(Date.now() - 86_400_000)) {
      return { ok: false, retry: false, error: `This rate is for ${dayName(day)}. Rates can be posted for today or yesterday only, so it was not posted. Remove it, and post today’s rate instead.` };
    }
    return { ok: false, retry: false, error: 'Only approved Mandi Helpers can post rates. If KashRoot approved you, sign in again and tap Try again.' };
  }
  return { ok: false, retry: false, error: dbMessage(error, 'Could not send this. Please check it and try again.') };
}

/** The instant first answer, as AskForm gets it; the expert still replies. */
async function firstAnswer(id: string, row: QuestionRow) {
  try {
    const speakAs = (await needsDevanagari(row.lang)) ? 'hi' : undefined;
    const res = await authFetch('/api/advisory/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: row.message, crop: row.crop, photo: row.photo, lang: row.lang, speakAs, kind: row.kind }),
    });
    await refusedForPass(res);
    const data = (await res.json().catch(() => ({}))) as { reply?: string; speech?: string };
    if (data.reply) await sendMessage(id, 'ai', 'KashRoot AI', data.speech ? `${data.reply}\n@@SPEAK@@\n${data.speech}` : data.reply);
  } catch {
    // The question is sent either way; the first answer is a bonus.
  }
}

async function sendOne(item: OutboxItem): Promise<Outcome> {
  const { row } = item.payload as Payload;
  const { error, status } = await supabase.from(TABLE[item.kind]).insert({ id: item.id, ...row });
  const outcome = judge(item, error, status);
  // Not waited for: the next item need not wait for the first answer.
  if (outcome.ok && !outcome.already && item.kind === 'question') void firstAnswer(item.id, row as QuestionRow);
  return outcome;
}

/** Fired on window after an item is sent: detail { kind, id }. */
export const OUTBOX_SENT = 'kr-outbox-sent';

/** Sent: say so, and let the page showing that list load it again. */
function announce(item: OutboxItem) {
  const row = (item.payload as Payload).row;
  if (item.kind === 'question') toast.success((row as QuestionRow).kind === 'question' ? 'Sent: your question is with the experts now.' : 'Sent: your request is with the experts now.');
  else if (item.kind === 'rate') toast.success(`Posted: your ${(row as RateRow).commodity} rate at ${(row as RateRow).mandi}. Farmers can see it now.`);
  else toast.success(`Saved: your draft “${short((row as ListingRow).product, 40)}” is in What I sell. Buyers cannot see it yet — press “Show again” there to put it on sale.`, { duration: 9000 });
  window.dispatchEvent(new CustomEvent(OUTBOX_SENT, { detail: { kind: item.kind, id: item.id } }));
}

let flushing: Promise<number> | null = null;

/**
 * Sends this account's items, oldest first, and stops at the first sign of
 * no signal. `again`: also the ones that failed (the person tapped Try
 * again). Resolves with how many were sent.
 */
export function flushOutbox(userId: string, again = false): Promise<number> {
  if (flushing) return flushing;
  const work = async () => {
    let sent = 0;
    const mine = (await outbox.all()).filter((i) => i.userId === userId && (again || i.state !== 'failed'));
    for (const item of mine) {
      if (offlineNow()) break;
      // Sent meanwhile by another tab?
      if (!(await outbox.get(item.id))) continue;
      await outbox.update(item.id, { state: 'sending' });
      let outcome: Outcome;
      try {
        outcome = await sendOne(item);
      } catch (err) {
        outcome = isOfflineError(err) ? { ok: false, offline: true } : { ok: false, retry: true, error: 'Could not send this yet. It will be sent again in a minute.' };
      }
      if (outcome.ok) {
        await outbox.remove(item.id);
        sent += 1;
        announce(item);
      } else if (outcome.offline) {
        await outbox.update(item.id, { state: 'waiting', error: undefined });
        break;
      } else {
        await outbox.update(item.id, { state: outcome.retry ? 'waiting' : 'failed', error: outcome.error, tries: item.tries + 1 });
      }
    }
    return sent;
  };
  // One tab sends at a time (two tabs could otherwise send the same item together).
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const locked = async (): Promise<number> => (locks ? await locks.request('kr-outbox-send', work) : await work());
  const done = locked().finally(() => {
    flushing = null;
  });
  flushing = done;
  return done;
}

/**
 * The account signed in on this phone. With no signal a sign-in that needs
 * renewing reads as signed out to supabase-js, so the account kept on this
 * phone is used then (it only decides whose items show; the database checks
 * every send).
 */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  if (data.session) return data.session.user.id;
  try {
    for (const key of Object.keys(localStorage)) {
      if (!/^sb-.+-auth-token$/.test(key)) continue;
      const kept = JSON.parse(localStorage.getItem(key) ?? 'null') as { user?: { id?: string } } | null;
      if (kept?.user?.id) return String(kept.user.id);
    }
  } catch {
    /* private mode: nothing kept */
  }
  return null;
}
