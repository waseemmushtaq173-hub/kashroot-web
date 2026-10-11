'use client';

/**
 * "Today's rates from the mandis": daily rates posted on KashRoot by approved
 * mandi reporters — traders, commission agents and staff at the mandi —
 * grouped by mandi, latest first. Reporters post from here; anyone signed in
 * can apply to become one (an admin approves in Admin → Approvals).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Loader2, Megaphone, PlusCircle, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Badge, Btn, EmptyState, Field, INPUT, Modal, Panel, type PortalTheme } from '@/components/portal/kit';
import { loginHref } from '@/lib/auth/roles';
import { myRoleRequest, requestStaffRole } from '@/lib/db/advisory';
import { loadAccount, type Account } from '@/lib/db/client';
import { KNOWN_CROPS, KNOWN_MANDIS, perKg, postRate, recentRates, removeRate, type MandiRate, type RateInput } from '@/lib/db/mandiRates';

const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
function when(iso: string): string {
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() + 5.5 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function PostedRates({ theme, commodity }: { theme: PortalTheme; commodity?: string }) {
  const [rates, setRates] = useState<MandiRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [request, setRequest] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    try {
      setRates(await recentRates());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the mandi rates.');
      setRates([]);
    }
  }, []);

  useEffect(() => {
    let live = true;
    // Rates load whether or not anyone is signed in.
    const first = async () => {
      if (live) await load();
    };
    void first();
    void loadAccount()
      .then(async (a) => {
        if (!live) return;
        setAccount(a);
        if (a && !a.staff.includes('REPORTER') && !a.staff.includes('ADMIN')) {
          const r = await myRoleRequest('REPORTER', a.id).catch(() => null);
          if (live) setRequest(r?.status ?? null);
        }
      })
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, [load]);

  const canPost = Boolean(account && (account.staff.includes('REPORTER') || account.staff.includes('ADMIN')));
  const wanted = commodity?.trim().toLowerCase() ?? '';
  // The crop chosen below first; every crop when none of it was posted.
  const { matching, byMandi } = useMemo(() => {
    const all = rates ?? [];
    const matching = all.filter((r) => !wanted || r.commodity.toLowerCase().includes(wanted) || wanted.includes(r.commodity.toLowerCase()));
    const groups = new Map<string, MandiRate[]>();
    for (const r of matching.length ? matching : all) groups.set(r.mandi, [...(groups.get(r.mandi) ?? []), r]);
    return { matching, byMandi: [...groups.entries()] };
  }, [rates, wanted]);

  const action = canPost ? (
    <Btn theme={theme} size="sm" icon={PlusCircle} onClick={() => setPosting(true)}>Post today’s rate</Btn>
  ) : account ? (
    request === 'pending' ? <Badge tone="amber">Reporter application waiting for approval</Badge> : <Btn theme={theme} size="sm" variant="soft" icon={UserPlus} onClick={() => setApplying(true)}>Post rates for your mandi</Btn>
  ) : account === null ? (
    <Link href={loginHref('buyer', '/mandi-weather')} className="text-sm font-semibold text-sky-800 underline">Traders: sign in to post rates</Link>
  ) : null;

  return (
    <Panel theme={theme} title="Today’s rates from the mandis" icon={Megaphone} action={action}>
      <p className="mb-4 text-sm text-slate-600">Posted on KashRoot by traders and commission agents at each mandi, approved by KashRoot. Each rate shows who posted it and when.</p>
      {rates === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading rates…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-rose-800">{error}</p>
      ) : byMandi.length === 0 ? (
        <EmptyState theme={theme} icon={Megaphone} title="No rates posted yet" text="Approved mandi reporters post each day’s rates here. Are you at a mandi? Use “Post rates for your mandi” above." />
      ) : (
        <>
          {wanted && !matching.length && <p className="mb-3 text-sm text-amber-800">No {commodity} rate posted in the last few days — showing all crops.</p>}
          <div className="space-y-4">
            {byMandi.map(([mandi, list]) => (
              <div key={mandi} className="overflow-x-auto rounded-2xl ring-1 ring-slate-900/5">
                <p className="bg-emerald-50/80 px-4 py-2 font-semibold text-emerald-950">{mandi} <span className="text-xs font-normal text-emerald-800">{list[0].district ? `${list[0].district}, ` : ''}{list[0].state}</span></p>
                <table className="w-full min-w-[640px] bg-white/80 text-left text-sm">
                  <thead className="text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Crop · variety · grade</th>
                      <th className="px-4 py-2 text-right">Min</th>
                      <th className="px-4 py-2 text-right">Modal</th>
                      <th className="px-4 py-2 text-right">Max</th>
                      <th className="px-4 py-2">Posted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/5">
                    {list.map((r) => {
                      const kg = perKg(r, r.modal_price);
                      return (
                        <tr key={r.id}>
                          <td className="px-4 py-2 text-slate-800">
                            <span className="font-semibold">{r.commodity}</span>{r.variety ? ` · ${r.variety}` : ''}{r.grade ? ` · ${r.grade}` : ''}
                            <span className="block text-xs text-slate-500">per {r.unit}{r.unit === 'box' && r.box_kg ? ` (${r.box_kg} kg)` : ''}{kg !== null && r.unit !== 'kg' ? ` · about ${rupees(kg)}/kg` : ''}</span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-600">{rupees(r.min_price)}</td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">{rupees(r.modal_price)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-600">{rupees(r.max_price)}</td>
                          <td className="px-4 py-2 text-xs text-slate-600">
                            <span className="font-semibold text-slate-800">{when(r.rate_date)}</span> · <BadgeCheck className="inline h-3.5 w-3.5 text-emerald-600" aria-label="Approved reporter" /> {r.reporter_name}
                            {r.note && <span className="block text-slate-500">{r.note}</span>}
                            {account && (r.posted_by === account.id || account.staff.includes('ADMIN')) && (
                              <button type="button" onClick={() => { if (window.confirm('Remove this rate?')) void removeRate(r.id).then(load).catch((e: Error) => toast.error(e.message)); }} className="ms-1 inline-flex cursor-pointer items-center gap-1 text-rose-700 hover:underline">
                                <Trash2 className="h-3 w-3" aria-hidden /> Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </>
      )}
      {posting && account && <PostRateModal theme={theme} account={account} commodity={commodity} onClose={() => setPosting(false)} onPosted={() => { setPosting(false); void load(); }} />}
      {applying && account && <ApplyModal theme={theme} account={account} onClose={() => setApplying(false)} onSent={() => { setApplying(false); setRequest('pending'); }} />}
    </Panel>
  );
}

function PostRateModal({ theme, account, commodity, onClose, onPosted }: { theme: PortalTheme; account: Account; commodity?: string; onClose: () => void; onPosted: () => void }) {
  const [f, setF] = useState({ mandi: '', state: 'Jammu and Kashmir', district: account.district ?? '', commodity: commodity?.trim() || 'Apple', variety: '', grade: '', unit: 'box' as RateInput['unit'], box_kg: '', min: '', modal: '', max: '', note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    const [min, modal, max] = [Number(f.min), Number(f.modal), Number(f.max)];
    if (f.mandi.trim().length < 2) return toast.error('Which mandi?');
    if (f.commodity.trim().length < 2) return toast.error('Which crop?');
    if (!(min > 0 && modal > 0 && max > 0)) return toast.error('Write the minimum, modal and maximum price.');
    if (!(min <= modal && modal <= max)) return toast.error('Minimum ≤ modal ≤ maximum, please check the prices.');
    setBusy(true);
    try {
      await postRate({
        reporter_name: account.business || account.name,
        phone: account.phone || null,
        state: f.state.trim() || 'Jammu and Kashmir',
        district: f.district.trim() || null,
        mandi: f.mandi.trim(),
        commodity: f.commodity.trim(),
        variety: f.variety.trim() || null,
        grade: f.grade.trim() || null,
        unit: f.unit,
        box_kg: f.unit === 'box' && Number(f.box_kg) > 0 ? Number(f.box_kg) : null,
        min_price: min,
        modal_price: modal,
        max_price: max,
        note: f.note.trim() || null,
      });
      toast.success('Rate posted — farmers can see it now');
      onPosted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not post the rate.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open wide onClose={onClose} title="Post today’s rate" footer={<><Btn theme={theme} variant="ghost" onClick={onClose}>Cancel</Btn><Btn theme={theme} icon={PlusCircle} disabled={busy} onClick={() => void save()}>{busy ? 'Posting…' : 'Post rate'}</Btn></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mandi"><input list="kr-mandis" className={INPUT} value={f.mandi} onChange={set('mandi')} placeholder="e.g. Sopore" /></Field>
        <Field label="District (optional)"><input className={INPUT} value={f.district} onChange={set('district')} /></Field>
        <Field label="Crop"><input list="kr-crops" className={INPUT} value={f.commodity} onChange={set('commodity')} /></Field>
        <Field label="Variety (optional)"><input className={INPUT} value={f.variety} onChange={set('variety')} placeholder="e.g. Delicious, American, Kullu" /></Field>
        <Field label="Grade (optional)"><input className={INPUT} value={f.grade} onChange={set('grade')} placeholder="e.g. A, B, Premium" /></Field>
        <Field label="Price per">
          <select className={INPUT} value={f.unit} onChange={set('unit')}>
            <option value="box">box</option>
            <option value="kg">kg</option>
            <option value="quintal">quintal (100 kg)</option>
          </select>
        </Field>
        {f.unit === 'box' && <Field label="Box weight in kg (optional)" hint="So farmers also see the price per kg"><input type="number" min={1} className={INPUT} value={f.box_kg} onChange={set('box_kg')} /></Field>}
        <Field label="State"><input className={INPUT} value={f.state} onChange={set('state')} /></Field>
        <Field label={`Minimum (₹ per ${f.unit})`}><input type="number" min={1} className={INPUT} value={f.min} onChange={set('min')} /></Field>
        <Field label={`Modal — most trades (₹ per ${f.unit})`}><input type="number" min={1} className={INPUT} value={f.modal} onChange={set('modal')} /></Field>
        <Field label={`Maximum (₹ per ${f.unit})`}><input type="number" min={1} className={INPUT} value={f.max} onChange={set('max')} /></Field>
        <Field label="Note (optional)"><input className={INPUT} value={f.note} onChange={set('note')} placeholder="e.g. heavy arrivals, prices falling" /></Field>
      </div>
      <datalist id="kr-mandis">{KNOWN_MANDIS.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="kr-crops">{KNOWN_CROPS.map((c) => <option key={c} value={c} />)}</datalist>
      <p className="mt-3 text-xs text-slate-500">Posted as {account.business || account.name}, dated today. You can remove your own rate if you made a mistake.</p>
    </Modal>
  );
}

function ApplyModal({ theme, account, onClose, onSent }: { theme: PortalTheme; account: Account; onClose: () => void; onSent: () => void }) {
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (details.trim().length < 10) return toast.error('Tell KashRoot which mandi you work at and your role there.');
    setBusy(true);
    try {
      await requestStaffRole('REPORTER', { name: account.name, phone: account.phone, email: account.email, details: details.trim() });
      toast.success('Application sent — KashRoot will approve you');
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send your application.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Post rates for your mandi" footer={<><Btn theme={theme} variant="ghost" onClick={onClose}>Cancel</Btn><Btn theme={theme} icon={UserPlus} disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : 'Apply'}</Btn></>}>
      <p className="text-sm text-slate-700">Traders, commission agents and mandi staff can post each day’s rates for farmers. KashRoot checks who you are before you can post.</p>
      <div className="mt-4">
        <Field label="Your mandi and your role there">
          <textarea rows={3} className={INPUT} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. Commission agent, shop 14, Sopore fruit mandi" />
        </Field>
      </div>
      <p className="mt-2 text-xs text-slate-500">Applying as {account.name} · {account.phone || account.email}</p>
    </Modal>
  );
}
