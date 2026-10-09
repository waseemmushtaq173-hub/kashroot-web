'use client';

/**
 * FertilizerChecker — two honest checks a grower can do before spreading a bag:
 *   1. Batch code → the shared KashRoot registry (Supabase table
 *      fertilizer_batches), filled by dealers and manufacturers an admin has
 *      approved. Found = registered by an approved account; not found is NOT
 *      proof of a fake, and the result says so.
 *   2. Lab or label analysis → Fertiliser (Control) Order, 1985 minimums.
 */
import { useState } from 'react';
import { CheckCircle2, CircleAlert, FlaskConical, Loader2, ScanLine, ShieldCheck, XCircle } from 'lucide-react';

import { checkAgainstFco, FCO_PRODUCTS } from '@/lib/fertilizer/fco';
import { supabase, supabaseConfigured } from '@/lib/supabase';

interface BatchRow {
  batch_code: string;
  product: string;
  manufacturer: string;
  grade: string | null;
  mfg_date: string | null;
  expiry_date: string | null;
  registered_at: string;
}

type Lookup =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'found'; row: BatchRow }
  | { state: 'missing'; code: string }
  | { state: 'error'; message: string };

const INPUT = 'block w-full rounded-xl border-0 bg-white px-4 py-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600';

export function FertilizerChecker({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<'batch' | 'lab'>('batch');
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [productId, setProductId] = useState(FCO_PRODUCTS[0].id);
  const [values, setValues] = useState<Record<string, string>>({});

  const product = FCO_PRODUCTS.find((p) => p.id === productId)!;
  const measured = Object.fromEntries(product.parameters.map((p) => [p.key, values[p.key] === undefined || values[p.key] === '' ? undefined : Number(values[p.key])]));
  const report = checkAgainstFco(product, measured);

  const verify = async () => {
    const batch = code.trim().toUpperCase();
    if (batch.length < 3) return setLookup({ state: 'error', message: 'Enter the batch number printed on the bag.' });
    if (!supabaseConfigured) return setLookup({ state: 'error', message: 'The batch registry is not connected on this site yet.' });
    setLookup({ state: 'loading' });
    const { data, error } = await supabase.from('fertilizer_batches').select('batch_code, product, manufacturer, grade, mfg_date, expiry_date, registered_at').eq('batch_code', batch).maybeSingle();
    if (error) {
      const notSetUp = error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message);
      return setLookup({ state: 'error', message: notSetUp ? 'The batch registry has not been set up on this site yet.' : 'Could not reach the registry. Try again.' });
    }
    setLookup(data ? { state: 'found', row: data as BatchRow } : { state: 'missing', code: batch });
  };

  const expired = lookup.state === 'found' && lookup.row.expiry_date && lookup.row.expiry_date < new Date().toISOString().slice(0, 10);

  return (
    <div className={compact ? '' : 'rounded-[2rem] bg-white/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] ring-1 ring-white/70 backdrop-blur-xl sm:p-8'}>
      <div role="group" aria-label="Check type" className="inline-flex rounded-xl bg-slate-900/5 p-1">
        {([
          ['batch', 'Batch code', ScanLine],
          ['lab', 'Lab report vs FCO', FlaskConical],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${mode === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {mode === 'batch' ? (
        <div className="mt-5">
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
            <label htmlFor="batch-code" className="sr-only">Batch number</label>
            <input id="batch-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Batch number on the bag, e.g. MZ-24-1187" className={`${INPUT} flex-1 font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`} />
            <button type="submit" disabled={lookup.state === 'loading'} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60">
              {lookup.state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} Verify batch
            </button>
          </form>
          <div aria-live="polite" className="mt-4">
            {lookup.state === 'found' && (
              <div className={`rounded-2xl p-4 ring-1 ${expired ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-200'}`}>
                <p className={`flex items-center gap-2 font-semibold ${expired ? 'text-amber-900' : 'text-emerald-900'}`}>
                  {expired ? <CircleAlert className="h-5 w-5" aria-hidden /> : <CheckCircle2 className="h-5 w-5" aria-hidden />}
                  {expired ? 'Registered — but past its expiry date' : 'Registered by an approved dealer or manufacturer'}
                </p>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {[
                    ['Product', `${lookup.row.product}${lookup.row.grade ? ` (${lookup.row.grade})` : ''}`],
                    ['Manufacturer', lookup.row.manufacturer],
                    ['Manufactured', lookup.row.mfg_date ?? '—'],
                    ['Expiry', lookup.row.expiry_date ?? '—'],
                  ].map(([k, v]) => (
                    <div key={k}><dt className="text-xs uppercase tracking-wider text-slate-500">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-slate-600">Also match the batch number, MRP and manufacturer printed on the bag with your bill.</p>
              </div>
            )}
            {lookup.state === 'missing' && (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
                <p className="flex items-center gap-2 font-semibold"><CircleAlert className="h-5 w-5" aria-hidden /> {lookup.code} is not in the registry</p>
                <p className="mt-1">That does not prove it is fake — the dealer may not have registered it yet. Ask for a GST bill, check the seal and MRP, and buy from licensed dealers. Report suspected fakes to your district agriculture officer.</p>
              </div>
            )}
            {lookup.state === 'error' && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{lookup.message}</p>}
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <label className="block text-sm font-medium text-slate-800" htmlFor="fco-product">Fertiliser</label>
          <select id="fco-product" value={productId} onChange={(e) => { setProductId(e.target.value); setValues({}); }} className={`${INPUT} mt-1.5`}>
            {FCO_PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.grade}</option>)}
          </select>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {report.rows.map((r) => (
              <label key={r.key} className="block text-sm">
                <span className="font-medium text-slate-800">{r.label}</span>
                <span className="ms-1 text-xs text-slate-500">({r.min !== undefined ? `min ${r.min}%` : `max ${r.max}%`})</span>
                <span className="relative mt-1.5 block">
                  <input type="number" inputMode="decimal" step="0.01" min={0} max={100} value={values[r.key] ?? ''} onChange={(e) => setValues({ ...values, [r.key]: e.target.value })} placeholder="Lab value %" className={`${INPUT} pr-10`} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {r.verdict === 'pass' && <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Meets FCO" />}
                    {r.verdict === 'fail' && <XCircle className="h-5 w-5 text-rose-600" aria-label="Fails FCO" />}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {report.rows.some((r) => r.verdict !== 'missing') && (
            <p aria-live="polite" className={`mt-4 rounded-2xl p-4 text-sm font-medium ring-1 ${report.pass ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-rose-50 text-rose-900 ring-rose-200'}`}>
              {report.pass
                ? report.complete
                  ? 'Every tested value meets the Fertiliser (Control) Order minimums.'
                  : 'Values entered so far meet the FCO — enter the rest for a full check.'
                : 'Below FCO standard. Keep the bag and bill, and take the lab report to your district agriculture office.'}
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">Standards: Fertiliser (Control) Order, 1985, Schedule I headline values. A state fertiliser quality control lab report is the legal test.</p>
        </div>
      )}
    </div>
  );
}
