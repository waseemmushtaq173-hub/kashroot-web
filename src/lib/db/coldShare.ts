'use client';

/**
 * Sharing a bin needs the first farmer's yes (supabase/migrations/20261202000000_cold_share_consent.sql). A bin that already
 * holds another farmer's boxes goes to the next farmer only when that farmer agrees: the booking is made and its places held
 * as always, but it cannot be paid (nor confirmed by the owner) until every farmer on those places has said yes. A no cancels
 * the next farmer's booking at once, no answer in the 24 hours ends it with the hold. Nobody learns who: the farmer asked
 * sees a first name and how many; the one waiting only learns "waiting", "yes" or "no".
 */
import type { Storage } from '@/lib/coldStore';
import { dbMessage, supabase } from '@/lib/db/client';

/** Where a booking stands on sharing: nobody else on its places, a farmer still to answer, a no, or every yes. */
export type ShareState = 'none' | 'asked' | 'declined' | 'allowed';

export interface ShareStatus {
  booking_id: string;
  state: ShareState;
  /** How many farmers have not answered yet. */
  waiting: number;
}

/** A request to the farmer who is on a place: another farmer asks to use the room left in it. */
export interface ShareRequest {
  request_id: string;
  store: string;
  chamber: string;
  /** "Chamber 1 · Row 3, stack 2" */
  place: string;
  storage: Storage;
  boxes: number;
  months: number;
  start_date: string;
  /** The other farmer's first name. */
  asker: string;
  state: 'asked' | 'allowed' | 'declined';
  asked_at: string;
  /** When the other farmer's 24 hours end (and with them the request). */
  ends_at: string;
}

/** The database's own sentences are written for farmers: shown as they are. */
const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  const m = error?.message ?? '';
  if (/not yours to answer|already answered|has ended|Please sign in|Say yes or no/i.test(m)) throw new Error(m);
  throw new Error(dbMessage(error, fallback));
};

const missingFunction = (e: { code?: string; message?: string } | null) => e?.code === 'PGRST202' || /Could not find the function/i.test(e?.message ?? '');

/** Where these bookings stand (the caller's own, or those of a store they run). Before the SQL is run: every booking is 'none'. */
export async function shareStatus(bookingIds: string[]): Promise<Map<string, ShareStatus>> {
  const ids = [...new Set(bookingIds)].slice(0, 100);
  if (!ids.length) return new Map();
  const { data, error } = await supabase.rpc('kr_cold_share_status', { p_bookings: ids });
  if (error) {
    if (missingFunction(error)) return new Map();
    fail(error, 'Could not check whether the other farmer has answered.');
  }
  return new Map(((data ?? []) as ShareStatus[]).map((r) => [r.booking_id, { booking_id: r.booking_id, state: r.state, waiting: r.waiting ?? 0 }]));
}

/** Requests from farmers who want the room left in a place the caller is on: the waiting ones, and those answered in the last 3 days. */
export async function shareInbox(): Promise<ShareRequest[]> {
  const { data, error } = await supabase.rpc('kr_cold_share_inbox');
  if (error) {
    if (missingFunction(error)) return [];
    fail(error, 'Could not load the requests to share your bins.');
  }
  return (data ?? []) as ShareRequest[];
}

/** Say yes or no to one request. */
export async function answerShare(requestId: string, allow: boolean): Promise<'allowed' | 'declined'> {
  const { data, error } = await supabase.rpc('kr_cold_share_decide', { p_request: requestId, p_allow: allow });
  if (error) fail(error, 'Could not save your answer.');
  return data === 'allowed' ? 'allowed' : 'declined';
}

/** What a booking waiting on sharing says to the farmer who made it. */
export function waitingText(status: ShareStatus | undefined): string | null {
  if (!status) return null;
  if (status.state === 'asked') {
    return status.waiting > 1
      ? `${status.waiting} farmers already have bins on a place you chose. They were asked: you can pay once all of them say yes.`
      : 'A farmer already has bins on a place you chose. They were asked: you can pay as soon as they say yes.';
  }
  if (status.state === 'declined') return 'A farmer who already has bins on a place you chose said no. This booking is cancelled: choose other places.';
  return null;
}
