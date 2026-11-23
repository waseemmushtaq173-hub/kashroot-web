'use client';

/**
 * Sharing a bin needs the first farmer's yes (lib/db/coldShare, supabase/migrations/20261202000000_cold_share_consent.sql).
 *   ShareRequests     for the farmer who is on a bin: another farmer asks to use the room left in it — a first name and how
 *                     many, a big Yes and a No, and the hour the request ends. Shown at the top of Cold storage → My bookings.
 *   ShareWaiting      for the farmer who asked: "waiting for the other farmer's yes" (checked again every 20 seconds), or the
 *                     no. The payment box appears only after every yes.
 *   useShareStatus    where a booking stands, kept fresh while it waits.
 * Nobody learns who: the farmer asked sees a first name and how many; the one waiting only sees "waiting", "yes" or "no".
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Hourglass, Users, XCircle } from 'lucide-react';

import { Btn, Panel, PORTAL_THEMES } from '@/components/portal/kit';
import { countText } from '@/lib/coldStore';
import { answerShare, shareInbox, shareStatus, waitingText, type ShareRequest, type ShareStatus } from '@/lib/db/coldShare';
import { toast } from '@/lib/client/toast';

const theme = PORTAL_THEMES.rental;

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Where one booking stands on sharing; looks again every 20 seconds while a farmer has still to answer. */
export function useShareStatus(bookingId: string | null | undefined, on = true) {
  const [status, setStatus] = useState<ShareStatus | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    if (!bookingId) return;
    setChecking(true);
    try {
      setStatus((await shareStatus([bookingId])).get(bookingId));
    } catch {
      /* the next look tries again; a payment is still refused by the database until the yes */
    } finally {
      setChecking(false);
    }
  }, [bookingId]);
  const state = status?.state;
  useEffect(() => {
    if (!on || !bookingId) return;
    // Reading the booking's state when the screen opens: the request goes out first, the state is set when it answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only the "looking…" flag is set at once
    void check();
  }, [on, bookingId, check]);
  useEffect(() => {
    if (!on || !bookingId || state !== 'asked') return;
    const t = window.setInterval(() => void check(), 20_000);
    return () => window.clearInterval(t);
  }, [on, bookingId, state, check]);
  return { status, checking, check };
}

/** The farmer who asked: still waiting for a yes, or told no. Nothing while nobody else is on the places, or after every yes. */
export function ShareWaiting({ status, checking, onCheck }: { status: ShareStatus | undefined; checking: boolean; onCheck: () => void }) {
  const text = waitingText(status);
  if (!text || !status) return null;
  const no = status.state === 'declined';
  return (
    <div role="status" aria-live="polite" data-testid="share-waiting" className={`rounded-xl p-3 text-sm ring-1 ${no ? 'bg-rose-50 text-rose-900 ring-rose-200' : 'bg-amber-50 text-amber-950 ring-amber-200'}`}>
      <p className="flex items-start gap-2 font-semibold">
        {no ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <Hourglass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
        {no ? 'The other farmer said no' : 'Waiting for the other farmer’s yes'}
      </p>
      <p className="mt-1">{text}</p>
      {!no && (
        <>
          <p className="mt-1 text-xs">Your places stay held for 24 hours from when you booked. If there is no answer by then, the booking ends and the bin stays as it was. We also e-mailed the other farmer.</p>
          <Btn theme={theme} variant="soft" size="sm" className="mt-2 min-h-[44px]" disabled={checking} onClick={onCheck}>{checking ? 'Looking…' : 'Check again'}</Btn>
        </>
      )}
    </div>
  );
}

/** The requests from other farmers for the room left in a bin the caller is on: answer yes or no. */
export function ShareRequests({ onChange }: { onChange?: () => void }) {
  const [rows, setRows] = useState<ShareRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await shareInbox());
      setProblem(null);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not load the requests.');
      setRows((r) => r ?? []);
    }
  }, []);
  useEffect(() => {
    // Loading the requests when the list opens (and again each minute): state is set when the answer comes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state only after its request answers
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  const answer = async (r: ShareRequest, allow: boolean) => {
    setBusy(r.request_id);
    try {
      await answerShare(r.request_id, allow);
      toast.success(allow ? 'Yes, saved. The other farmer can now pay for their bins.' : 'No, saved. Their booking is cancelled and your bin stays as it is.');
      await load();
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your answer.');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const waiting = (rows ?? []).filter((r) => r.state === 'asked');
  const answered = (rows ?? []).filter((r) => r.state !== 'asked');
  if (!rows || (!waiting.length && !answered.length && !problem)) return null;

  return (
    <Panel theme={theme} title="Another farmer wants to share your bin" icon={Users} id="share-requests">
      {problem && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{problem}</p>}
      {waiting.length > 0 && (
        <>
          <p className="mb-3 text-sm text-slate-700">
            Your bin has room left, and a farmer would like to use it so the bin is full. They can do it only if you say <strong>yes</strong>. Your own {waiting[0].storage === 'bins' ? 'bins' : 'boxes'} stay exactly yours, and nobody sees your name or phone.
          </p>
          <ul className="space-y-3">
            {waiting.map((r) => (
              <li key={r.request_id} data-testid="share-request" className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <p className="text-base font-semibold text-slate-900">
                  {r.asker} asks for <strong>{countText(r.boxes, r.storage)}</strong> in your bin
                </p>
                <p className="mt-0.5 text-sm text-slate-700">
                  {r.store} · {r.place} · {r.months} month{r.months === 1 ? '' : 's'} from {when(r.start_date).replace(/, .*$/, '')}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-900">
                  <Clock className="h-3.5 w-3.5" aria-hidden /> Answer before {when(r.ends_at)}. After that the request ends and your bin stays as it is.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn theme={theme} icon={CheckCircle2} className="min-h-[48px] flex-1 text-base sm:flex-none" disabled={busy === r.request_id} onClick={() => void answer(r, true)}>Yes, allow</Btn>
                  <Btn theme={theme} variant="ghost" icon={XCircle} className="min-h-[48px] flex-1 text-base sm:flex-none" disabled={busy === r.request_id} onClick={() => void answer(r, false)}>No</Btn>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {answered.length > 0 && (
        <ul className={`space-y-1 text-sm text-slate-600 ${waiting.length ? 'mt-4' : ''}`} aria-label="Answered requests">
          {answered.map((r) => (
            <li key={r.request_id}>
              {r.state === 'allowed' ? 'You said yes' : 'You said no'} · {r.asker}, {countText(r.boxes, r.storage)} · {r.place}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
