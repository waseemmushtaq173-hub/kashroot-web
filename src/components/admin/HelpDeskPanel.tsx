'use client';

/**
 * Admin → Help desk: the help requests customers sent from Help & support
 * (app/support) — sign-in trouble, payments, orders, anything. Waiting ones
 * first; call the person (their number is a tap away), reply in writing, set
 * the status the customer sees (Received → Being looked at → Answered →
 * Resolved), and keep internal notes for the team that the customer never
 * sees. A reply, and "Resolved", email the person when they gave an email.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LifeBuoy, Lock, Phone, Search, Send } from 'lucide-react';
import { toast } from 'sonner';

import { RefreshBtn } from '@/components/admin/RefreshBtn';
import { Badge, Btn, EmptyState, PORTAL_THEMES, Panel, Skeleton } from '@/components/portal/kit';
import { addInternalNote, deskRequests, replyToRequest, setRequestStatus, type DeskRequest, type SupportStatus } from '@/lib/db/support';
import { TOPIC_LABEL } from '@/lib/helpTopics';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const STATUS: Record<SupportStatus, { tone: 'amber' | 'blue' | 'green' | 'slate'; text: string }> = {
  open: { tone: 'amber', text: 'Received' },
  in_progress: { tone: 'blue', text: 'Being looked at' },
  answered: { tone: 'green', text: 'Answered' },
  closed: { tone: 'slate', text: 'Resolved' },
};

function Request({ r, onDone }: { r: DeskRequest; onDone: () => void }) {
  const [reply, setReply] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };
  const emailNote = r.email ? ' They get an email too.' : '';
  const sendReply = (resolve: boolean) =>
    void act(
      async () => {
        await replyToRequest(r.id, reply, resolve);
        setReply('');
      },
      `${resolve ? 'Reply sent and marked resolved.' : 'Reply sent: they see it under Check my request.'}${emailNote}`,
    );
  const saveNote = () =>
    void act(async () => {
      await addInternalNote(r.id, note);
      setNote('');
    }, 'Note saved. The customer does not see it.');
  return (
    <li data-desk-request={r.code} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-bold">{r.code}</span>
        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].text}</Badge>
        <Badge tone="blue">{TOPIC_LABEL[r.topic]}</Badge>
        {r.portal && <Badge tone="violet">{r.portal}</Badge>}
        <span className="text-xs text-slate-500">{when(r.created_at)}</span>
      </div>
      <p className="text-sm text-slate-700">
        <strong className="text-slate-900">{r.name}</strong> ·{' '}
        <a href={`tel:+91${r.phone}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-sky-800 underline">
          <Phone className="h-4 w-4" aria-hidden /> {r.phone}
        </a>
        {r.email && <> · {r.email}</>} · {r.signedIn ? 'signed in' : 'not signed in'} · writes in {r.lang}
      </p>
      <p className="whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-800">{r.message}</p>
      {r.messages.map((m, i) => (
        <p
          key={i}
          className={`whitespace-pre-line rounded-xl p-3 text-sm ${m.author === 'kashroot' ? 'bg-emerald-50 text-emerald-950' : m.author === 'internal' ? 'border border-dashed border-amber-400 bg-amber-50 text-amber-950' : 'bg-slate-50 text-slate-800'}`}
        >
          <span className="block text-xs font-semibold text-slate-500">
            {m.author === 'kashroot' ? 'KashRoot' : m.author === 'internal' ? 'Internal note — the customer does not see this' : r.name} · {when(m.created_at)}
          </span>
          {m.body}
        </p>
      ))}

      {/* The status the customer sees */}
      <div role="group" aria-label={`Status of ${r.code}`} className="flex flex-wrap gap-2">
        {(['in_progress', 'answered', 'closed'] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy || r.status === s}
            aria-pressed={r.status === s}
            onClick={() => void act(() => setRequestStatus(r.id, s), s === 'closed' ? `Marked resolved.${emailNote}` : `Status: ${STATUS[s].text}.`)}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ring-1 disabled:cursor-default ${r.status === s ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50'}`}
          >
            {s === 'in_progress' ? <Search className="h-4 w-4" aria-hidden /> : s === 'closed' ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : null}
            {s === 'closed' ? 'Resolved' : STATUS[s].text}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="grid gap-1 text-sm font-semibold text-slate-800">
            Reply to the customer (plain words — many listen rather than read)
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} className="min-h-24 rounded-xl border-0 p-3 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-700" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Btn theme={theme} icon={Send} className="min-h-11" disabled={busy || !reply.trim()} onClick={() => sendReply(false)}>
              Send reply
            </Btn>
            <Btn theme={theme} variant="ghost" icon={CheckCircle2} className="min-h-11" disabled={busy || !reply.trim()} onClick={() => sendReply(true)}>
              Send and resolve
            </Btn>
          </div>
        </div>
        <div className="space-y-2">
          <label className="grid gap-1 text-sm font-semibold text-slate-800">
            <span className="inline-flex items-center gap-1">
              <Lock className="h-4 w-4" aria-hidden /> Internal note (the team only)
            </span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="min-h-24 rounded-xl border-0 bg-amber-50/50 p-3 text-sm ring-1 ring-amber-300 focus:ring-2 focus:ring-amber-500" />
          </label>
          <Btn theme={theme} variant="ghost" icon={Lock} className="min-h-11" disabled={busy || !note.trim()} onClick={saveNote}>
            Save note
          </Btn>
        </div>
      </div>
    </li>
  );
}

export function HelpDeskPanel() {
  const [show, setShow] = useState<'waiting' | 'all'>('waiting');
  const [rows, setRows] = useState<DeskRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await deskRequests(show));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the help requests.');
    }
  }, [show]);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  return (
    <Panel theme={theme} title="Help desk" icon={LifeBuoy} className="lg:col-span-2" action={<RefreshBtn onRefresh={load} />}>
      <div role="group" aria-label="Show" className="mb-4 flex gap-2">
        {(['waiting', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={show === s}
            onClick={() => setShow(s)}
            className={`min-h-11 cursor-pointer rounded-xl px-4 text-sm font-bold ring-1 ${show === s ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-800 ring-slate-300'}`}
          >
            {s === 'waiting' ? 'Not answered yet' : 'All'}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-rose-800">{error}</p>
      ) : rows === null ? (
        <Skeleton label="Loading the help requests…" />
      ) : rows.length === 0 ? (
        <EmptyState theme={theme} icon={LifeBuoy} title={show === 'waiting' ? 'Nobody is waiting' : 'No help requests yet'} text="Requests sent from Help & support appear here." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <Request key={r.id} r={r} onDone={() => void load()} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
