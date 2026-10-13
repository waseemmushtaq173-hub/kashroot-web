'use client';

/**
 * Admin → Contributors: the work of Mandi Helpers and agronomists.
 *   • Rates to check — rates someone reported wrong, then ones nobody has
 *     checked yet: Accurate / Wrong (final; wrong rates are hidden).
 *   • Answers to check — experts' answers the farmer has not confirmed,
 *     those marked "did not help" first: Accept / Reject.
 *   • Pay — ₹ for each accepted contribution, by kind (0 = not decided).
 *   • Contributors — accepted / waiting work, what is owed, where to pay,
 *     and "Mark paid" after paying them by UPI or bank.
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, GraduationCap, IndianRupee, Loader2, Megaphone, Phone, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import { RefreshBtn } from '@/components/admin/RefreshBtn';
import { UpiQr } from '@/components/payments/UpiQr';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { ago } from '@/lib/db/client';
import {
  answersToCheck,
  contributors,
  decideRate,
  decideWork,
  markPaid,
  payRates,
  ratesToCheck,
  setPayRate,
  WORK_LABEL,
  type AnswerToCheck,
  type Contributor,
  type PayRate,
  type RateCheck,
  type WorkKind,
} from '@/lib/db/contributions';
import type { MandiRate } from '@/lib/db/mandiRates';
import { upiLink } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const KINDS: WorkKind[] = ['mandi_rate', 'answer', 'soil_test', 'video_call'];
const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

export function ContributorsPanel() {
  const [rates, setRates] = useState<{ rates: MandiRate[]; checks: RateCheck[] } | null>(null);
  const [answers, setAnswers] = useState<AnswerToCheck[] | null>(null);
  const [pay, setPay] = useState<PayRate[] | null>(null);
  const [people, setPeople] = useState<Contributor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState<Contributor | null>(null);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([ratesToCheck(), answersToCheck(), payRates(), contributors()]);
    const [r, a, p, c] = results;
    setRates(r.status === 'fulfilled' ? r.value : { rates: [], checks: [] });
    setAnswers(a.status === 'fulfilled' ? a.value : []);
    setPay(p.status === 'fulfilled' ? p.value : []);
    setPeople(c.status === 'fulfilled' ? c.value : []);
    const failed = results.find((x) => x.status === 'rejected') as PromiseRejectedResult | undefined;
    setError(failed ? message(failed.reason) : null);
  }, []);

  useEffect(() => {
    let live = true;
    const first = async () => {
      if (live) await load();
    };
    void first();
    return () => {
      live = false;
    };
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (err) {
      toast.error(message(err));
    } finally {
      setBusy(null);
    }
  };

  if (!rates || !answers || !pay || !people) return <p className="flex items-center gap-2 p-6 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;

  const checksFor = (id: string) => rates.checks.filter((c) => c.rate_id === id);

  return (
    <div className="grid gap-6">
      {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}

      <Panel theme={theme} title="Rates to check" icon={Megaphone} action={<RefreshBtn onRefresh={load} variant="ghost" />}>
        <p className="mb-4 text-sm text-slate-600">Rates someone reported wrong come first. Phone the mandi or another trader, then decide. Your decision is final: wrong rates are hidden from farmers and are not paid.</p>
        {rates.rates.length === 0 ? (
          <EmptyState theme={theme} icon={Megaphone} title="Nothing to check" text="Rates from the last few days that are not yet confirmed appear here." />
        ) : (
          <ul className="space-y-3">
            {rates.rates.map((r) => {
              const checks = checksFor(r.id);
              return (
                <li key={r.id} className="flex flex-col gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-900/5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                      {r.commodity}{r.variety ? ` ${r.variety}` : ''}{r.grade ? ` · ${r.grade}` : ''} · {r.mandi}
                      {r.status === 'disputed' ? <Badge tone="amber">Reported wrong</Badge> : <Badge tone="slate">Not yet checked</Badge>}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      <strong>{rupees(r.modal_price)}</strong> per {r.unit}{r.unit === 'box' && r.box_kg ? ` (${r.box_kg} kg)` : ''} · min {rupees(r.min_price)} · max {rupees(r.max_price)} · {r.rate_date}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                      <span>By {r.reporter_name}</span>
                      {r.phone && <a href={`tel:+91${r.phone.replace(/\D/g, '').slice(-10)}`} className="inline-flex items-center gap-1 font-semibold text-sky-800"><Phone className="h-3 w-3" aria-hidden /> {r.phone}</a>}
                      <span>{r.confirms ?? 0} said correct · {r.reports ?? 0} said wrong</span>
                    </p>
                    {checks.filter((c) => c.verdict === 'wrong').map((c) => (
                      <p key={c.user_id} className="mt-1 text-sm text-rose-800">Reported wrong{c.note ? `: “${c.note}”` : ''} <span className="text-xs text-slate-500">{ago(c.created_at)}</span></p>
                    ))}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Btn theme={theme} size="sm" icon={Check} disabled={busy !== null} onClick={() => void act(`r${r.id}`, () => decideRate(r.id, true), 'Marked accurate')}>Accurate</Btn>
                    <Btn theme={theme} size="sm" variant="danger" icon={X} disabled={busy !== null} onClick={() => void act(`r${r.id}`, () => decideRate(r.id, false), 'Marked wrong — hidden from farmers')}>Wrong</Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel theme={theme} title="Answers to check" icon={GraduationCap}>
        <p className="mb-4 text-sm text-slate-600">When a farmer presses “Yes, it helped”, the expert’s answer is accepted by itself. Answers the farmer said did not help come first; open them, read the answer, then decide.</p>
        {answers.length === 0 ? (
          <EmptyState theme={theme} icon={GraduationCap} title="Nothing to check" text="Experts’ answers that farmers have not confirmed appear here." />
        ) : (
          <ul className="space-y-3">
            {answers.map(({ contribution: c, request: q }) => (
              <li key={c.id} className="flex flex-col gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-900/5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {c.title ?? WORK_LABEL[c.kind]}
                    {q?.farmer_rating === 'not_helpful' ? <Badge tone="red">Farmer: did not help</Badge> : <Badge tone="slate">Farmer has not said</Badge>}
                  </p>
                  {q && <p className="mt-1 line-clamp-2 text-sm text-slate-700">{q.message}</p>}
                  <p className="mt-1 text-xs text-slate-500">{q?.expert_name ? `Expert: ${q.expert_name} · ` : ''}{ago(c.created_at)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {q && <Btn theme={theme} size="sm" variant="ghost" icon={ExternalLink} href={`/expert?request=${q.id}`}>Open</Btn>}
                  <Btn theme={theme} size="sm" icon={Check} disabled={busy !== null} onClick={() => void act(`a${c.id}`, () => decideWork(c.id, true), 'Answer accepted')}>Accept</Btn>
                  <Btn theme={theme} size="sm" variant="danger" icon={X} disabled={busy !== null} onClick={() => void act(`a${c.id}`, () => decideWork(c.id, false), 'Answer not accepted')}>Reject</Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <PayRates rates={pay} onSaved={load} />

      <Panel theme={theme} title="Contributors" icon={Users}>
        {people.length === 0 ? (
          <EmptyState theme={theme} icon={Users} title="No contributions yet" text="When Mandi Helpers post rates and experts answer farmers, they appear here with what they are owed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2 text-right">Accepted</th>
                  <th className="px-3 py-2 text-right">Waiting</th>
                  <th className="px-3 py-2 text-right">Not accepted</th>
                  <th className="px-3 py-2 text-right">Owed</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2">Pay to</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/5">
                {people.map((p) => (
                  <tr key={p.user_id} className="bg-white/70">
                    <td className="px-3 py-2">
                      <span className="font-semibold text-slate-900">{p.name}</span> {(p.roles ?? []).map((r) => <Badge key={r} tone={r === 'REPORTER' ? 'green' : r === 'EXPERT' ? 'violet' : 'blue'}>{r === 'REPORTER' ? 'Mandi Helper' : r === 'EXPERT' ? 'Agronomist' : r}</Badge>)}
                      <span className="block text-xs text-slate-500">{p.phone ? <a href={`tel:+91${p.phone.replace(/\D/g, '').slice(-10)}`} className="text-sky-800">{p.phone}</a> : p.email} · active {ago(p.last_at)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.accepted}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.pending}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.rejected}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{p.due > 0 ? rupees(p.due) : p.unpaid ? <span className="text-xs font-normal text-slate-500">{p.unpaid} unpaid</span> : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.paid > 0 ? rupees(p.paid) : '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">{p.upi_id ?? (p.account_number ? `A/c ••${p.account_number.slice(-4)} · ${p.ifsc ?? ''}` : <span className="text-amber-800">No payment details yet</span>)}</td>
                    <td className="px-3 py-2 text-right">
                      {p.due > 0 && <Btn theme={theme} size="sm" icon={IndianRupee} disabled={busy !== null} onClick={() => setPaying(p)}>Mark paid</Btn>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {paying && <MarkPaidModal person={paying} onClose={() => setPaying(null)} onDone={async () => { setPaying(null); await load(); }} />}
    </div>
  );
}

function PayRates({ rates, onSaved }: { rates: PayRate[]; onSaved: () => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const shown = (k: WorkKind) => values[k] ?? String(rates.find((r) => r.kind === k)?.amount ?? 0);

  const save = async () => {
    setBusy(true);
    try {
      for (const k of KINDS) {
        const v = Number(shown(k));
        if (!(v >= 0 && v <= 100000)) throw new Error(`${WORK_LABEL[k]}: write an amount from 0 to 100000.`);
        if (v !== (rates.find((r) => r.kind === k)?.amount ?? 0)) await setPayRate(k, v);
      }
      toast.success('Pay saved');
      setValues({});
      await onSaved();
    } catch (err) {
      toast.error(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel theme={theme} title="Pay for each accepted contribution" icon={IndianRupee}>
      <p className="mb-4 text-sm text-slate-600">Leave at ₹0 until you decide. Every accepted contribution is already counted, so when you set an amount, past accepted work is owed too.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KINDS.map((k) => (
          <Field key={k} label={`${WORK_LABEL[k]} (₹)`}>
            <input type="number" min={0} max={100000} className={INPUT} value={shown(k)} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <Btn theme={theme} className="mt-4" icon={Check} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save pay'}</Btn>
    </Panel>
  );
}

function MarkPaidModal({ person, onClose, onDone }: { person: Contributor; onClose: () => void; onDone: () => Promise<void> }) {
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (ref.trim().length < 4) return toast.error('Write the UPI transaction ID or bank reference.');
    setBusy(true);
    try {
      const total = await markPaid(person.user_id, ref);
      toast.success(`Recorded ${rupees(total)} paid to ${person.name}`);
      await onDone();
    } catch (err) {
      toast.error(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Pay ${person.name}`} footer={<><Btn theme={theme} variant="ghost" onClick={onClose}>Cancel</Btn><Btn theme={theme} icon={IndianRupee} disabled={busy} onClick={() => void send()}>{busy ? 'Saving…' : 'I have paid'}</Btn></>}>
      <p className="text-sm text-slate-700">
        Pay <strong>{rupees(person.due)}</strong> for {person.unpaid} accepted contribution{person.unpaid === 1 ? '' : 's'} from your UPI app or bank to{' '}
        <strong>{person.upi_id ?? (person.account_number ? `account ••${person.account_number.slice(-4)}, IFSC ${person.ifsc ?? ''}` : 'their payment details (not added yet — ask them to add UPI in My work & pay)')}</strong>. Then write the payment reference here.
      </p>
      {person.upi_id && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <a href={upiLink({ upi: person.upi_id, name: person.name, amount: person.due, note: 'KashRoot contributor pay' })} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-indigo-800 hover:no-underline">
            <IndianRupee className="h-4 w-4" aria-hidden /> Pay {rupees(person.due)} with UPI app
          </a>
          <UpiQr upi={person.upi_id} name={person.name} amount={person.due} note="KashRoot contributor pay" size={140} />
        </div>
      )}
      <div className="mt-4">
        <Field label="UPI transaction ID or bank reference">
          <input className={INPUT} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 428311234567" />
        </Field>
      </div>
    </Modal>
  );
}
