'use client';

/**
 * FertilizerChecker — checks a farmer can do before using a bag or bottle:
 *   1. Photo of the label → the AI reads product, batch, registration number
 *      (CIB&RC for pesticides, FCO for fertilisers), dates and MRP, points out
 *      what is missing or suspicious, and the batch is looked up in the
 *      registry. Can be read aloud.
 *   2. Batch number → the shared KashRoot registry (fertilizer_batches via
 *      kr_check_batch), filled by dealers; shows whether KashRoot has verified
 *      that dealer and how many farmers reported the batch. Not found is NOT
 *      proof of a fake, and the result says so.
 *   3. Lab report → Fertiliser (Control) Order, 1985 minimums.
 * Signed-in farmers can report a suspicious product to the KashRoot admin.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Camera, CheckCircle2, CircleAlert, Flag, FlaskConical, Loader2, ScanLine, ShieldCheck, XCircle } from 'lucide-react';

import { LangPicker, SpeakButton } from '@/components/voice/VoiceButtons';
import { checkAgainstFco, FCO_PRODUCTS } from '@/lib/fertilizer/fco';
import { compressImage } from '@/lib/client/image';
import { isRtl, type SpeechLang } from '@/lib/client/speech';
import { dbMessage, loadAccount, supabase, supabaseConfigured, type Account } from '@/lib/db/client';

interface BatchRow {
  batch_code: string;
  product: string;
  product_type: string;
  manufacturer: string;
  grade: string | null;
  registration_no: string | null;
  mfg_date: string | null;
  expiry_date: string | null;
  dealer_name: string | null;
  dealer_district: string | null;
  dealer_verified: boolean;
  reports: number;
  registered_at: string;
}

interface LabelReading {
  readable: boolean;
  product_type: string;
  product_name: string;
  manufacturer: string;
  batch_code: string;
  registration_no: string;
  grade_or_composition: string;
  mfg_date: string;
  expiry_date: string;
  mrp: string;
  missing_details: string[];
  warning_signs: string[];
  summary_spoken: string;
}

type Lookup =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'found'; row: BatchRow }
  | { state: 'missing'; code: string }
  | { state: 'error'; message: string };

const INPUT = 'block w-full rounded-xl border-0 bg-white px-4 py-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600';

async function lookupBatch(raw: string): Promise<Lookup> {
  const batch = raw.trim().toUpperCase();
  if (batch.length < 3) return { state: 'error', message: 'Enter the batch number printed on the bag.' };
  if (!supabaseConfigured) return { state: 'error', message: 'The batch registry is not connected on this site yet.' };
  const { data, error } = await supabase.rpc('kr_check_batch', { p_code: batch });
  if (error) return { state: 'error', message: dbMessage(error, 'Could not reach the registry. Try again.') };
  return data ? { state: 'found', row: data as BatchRow } : { state: 'missing', code: batch };
}

export function FertilizerChecker({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<'photo' | 'batch' | 'lab'>('photo');
  const [account, setAccount] = useState<Account | null>(null);
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [productId, setProductId] = useState(FCO_PRODUCTS[0].id);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  const product = FCO_PRODUCTS.find((p) => p.id === productId)!;
  const measured = Object.fromEntries(product.parameters.map((p) => [p.key, values[p.key] === undefined || values[p.key] === '' ? undefined : Number(values[p.key])]));
  const report = checkAgainstFco(product, measured);

  const verify = async (batch = code) => {
    setLookup({ state: 'loading' });
    setLookup(await lookupBatch(batch));
  };

  return (
    <div className={compact ? '' : 'rounded-[2rem] bg-white/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] ring-1 ring-white/70 backdrop-blur-xl sm:p-8'}>
      <div role="group" aria-label="Check type" className="inline-flex flex-wrap rounded-xl bg-slate-900/5 p-1">
        {([
          ['photo', 'Photo of the label', Camera],
          ['batch', 'Batch number', ScanLine],
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

      {mode === 'photo' && <LabelPhoto account={account} />}

      {mode === 'batch' && (
        <div className="mt-5">
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
            <label htmlFor="batch-code" className="sr-only">Batch number</label>
            <input id="batch-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Batch number on the bag, e.g. MZ-24-1187" className={`${INPUT} flex-1 font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`} />
            <button type="submit" disabled={lookup.state === 'loading'} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60">
              {lookup.state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />} Verify batch
            </button>
          </form>
          <div aria-live="polite" className="mt-4">
            <BatchResult lookup={lookup} account={account} onPhoto={() => setMode('photo')} />
          </div>
        </div>
      )}

      {mode === 'lab' && (
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

function BatchResult({ lookup, account, onPhoto }: { lookup: Lookup; account: Account | null; onPhoto?: () => void }) {
  if (lookup.state === 'idle' || lookup.state === 'loading') return lookup.state === 'loading' ? <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the registry…</p> : null;
  if (lookup.state === 'error') return <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{lookup.message}</p>;
  if (lookup.state === 'missing') {
    return (
      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
        <p className="flex items-center gap-2 font-semibold"><CircleAlert className="h-5 w-5" aria-hidden /> {lookup.code} is not in the KashRoot registry</p>
        <p className="mt-1">That does not prove it is fake. India has no public government list of batch numbers, so this check only knows batches that dealers have registered in KashRoot’s Agro-dealer portal — ask your dealer to register theirs.</p>
        {onPhoto && (
          <>
            <p className="mt-2">Meanwhile, photograph the label: KashRoot reads it and checks that the details the law requires — registration number, batch, dates, manufacturer and grade — are there and look right.</p>
            <button type="button" onClick={onPhoto} className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800">
              <Camera className="h-4 w-4" aria-hidden /> Check the label photo
            </button>
          </>
        )}
        <ReportBatch code={lookup.code} account={account} />
      </div>
    );
  }
  const row = lookup.row;
  const expired = row.expiry_date && row.expiry_date < new Date().toISOString().slice(0, 10);
  const good = row.dealer_verified && !expired && row.reports === 0;
  return (
    <div className={`rounded-2xl p-4 ring-1 ${good ? 'bg-emerald-50 ring-emerald-200' : 'bg-amber-50 ring-amber-200'}`}>
      <p className={`flex items-center gap-2 font-semibold ${good ? 'text-emerald-900' : 'text-amber-900'}`}>
        {good ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <CircleAlert className="h-5 w-5" aria-hidden />}
        {expired ? 'Registered — but past its expiry date' : row.dealer_verified ? 'Registered by a KashRoot-verified dealer' : 'Registered by a dealer KashRoot has not verified yet'}
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {[
          ['Product', `${row.product}${row.grade ? ` (${row.grade})` : ''}`],
          ['Type', row.product_type],
          ['Manufacturer', row.manufacturer],
          ['Registration no.', row.registration_no ?? '—'],
          ['Manufactured', row.mfg_date ?? '—'],
          ['Expiry', row.expiry_date ?? '—'],
          ['Dealer', `${row.dealer_name ?? '—'}${row.dealer_district ? `, ${row.dealer_district}` : ''}`],
        ].map(([k, v]) => (
          <div key={k}><dt className="text-xs uppercase tracking-wider text-slate-500">{k}</dt><dd className="font-medium capitalize text-slate-900">{v}</dd></div>
        ))}
      </dl>
      {row.reports > 0 && <p className="mt-3 rounded-xl bg-rose-100 p-2 text-sm font-semibold text-rose-900">{row.reports} farmer{row.reports === 1 ? ' has' : 's have'} reported this batch as suspicious.</p>}
      <p className="mt-3 text-xs text-slate-600">Also match the batch number, MRP and manufacturer printed on the bag with your bill.</p>
      <ReportBatch code={row.batch_code} account={account} />
    </div>
  );
}

function ReportBatch({ code, account }: { code: string; account: Account | null }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  if (state === 'sent') return <p className="mt-3 text-sm font-semibold text-emerald-800">Reported to the KashRoot admin. Thank you.</p>;
  if (!account) return <p className="mt-3 text-xs text-slate-600">Suspect a fake? <Link href="/login/farmer" className="font-semibold underline">Sign in</Link> to report it, and tell your district agriculture officer.</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-rose-800 hover:underline">
        <Flag className="h-4 w-4" aria-hidden /> Report as suspicious
      </button>
    );
  }
  const send = async () => {
    if (note.trim().length < 3) return setState('Say what looked wrong.');
    setState('sending');
    const { error } = await supabase.from('batch_reports').insert({ batch_code: code.slice(0, 40), note: note.trim().slice(0, 500) });
    setState(error ? dbMessage(error, 'Could not send the report.') : 'sent');
  };
  return (
    <div className="mt-3 space-y-2">
      <textarea rows={2} className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What looked wrong? e.g. torn seal, different MRP, no registration number" />
      <button type="button" disabled={state === 'sending'} onClick={() => void send()} className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60">
        <Flag className="h-4 w-4" aria-hidden /> Send report
      </button>
      {state !== 'idle' && state !== 'sending' && <p role="alert" className="text-sm text-rose-800">{state}</p>}
    </div>
  );
}

function LabelPhoto({ account }: { account: Account | null }) {
  const [lang, setLang] = useState<SpeechLang>('en');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<LabelReading | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const [langFrom, setLangFrom] = useState<Account | null>(null);
  if (account !== langFrom) {
    setLangFrom(account);
    if (account?.lang) setLang(account.lang);
  }

  const read = async (file?: File) => {
    if (!file) return;
    setError(null);
    setReading(null);
    setLookup({ state: 'idle' });
    try {
      const image = await compressImage(file, 1600, 0.85);
      setPhoto(image);
      setBusy(true);
      const res = await fetch('/api/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: image, lang }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The label could not be read.');
      const r = data as LabelReading;
      setReading(r);
      if (r.batch_code) {
        setLookup({ state: 'loading' });
        setLookup(await lookupBatch(r.batch_code));
      }
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'No internet connection. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const rtl = isRtl(lang) ? 'rtl' : undefined;

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <LangPicker value={lang} onChange={setLang} />
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-6 text-center text-emerald-900 hover:bg-emerald-50">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview
          <img src={photo} alt="Label photo" className="max-h-48 rounded-xl object-contain" />
        ) : (
          <Camera className="h-9 w-9" aria-hidden />
        )}
        <span className="font-semibold">{busy ? 'Reading the label…' : photo ? 'Take another photo' : 'Photograph the label on the bag or bottle'}</span>
        <span className="text-xs text-emerald-800">The side with the batch number, dates and registration number</span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => void read(e.target.files?.[0])} />
      </label>
      {busy && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Reading the label…</p>}
      {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
      {reading && (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          {!reading.readable ? (
            <p className="text-sm text-amber-900">The label was not clear enough. Take the photo closer, in daylight, without glare.</p>
          ) : (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {[
                ['Product', `${reading.product_name}${reading.grade_or_composition ? ` (${reading.grade_or_composition})` : ''}`],
                ['Manufacturer', reading.manufacturer],
                ['Batch no.', reading.batch_code],
                ['Registration no.', reading.registration_no],
                ['Manufactured', reading.mfg_date],
                ['Expiry', reading.expiry_date],
                ['MRP', reading.mrp],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-xs uppercase tracking-wider text-slate-500">{k}</dt><dd className={`font-medium ${v ? 'text-slate-900' : 'text-rose-700'}`}>{v || 'Not visible'}</dd></div>
              ))}
            </dl>
          )}
          {reading.warning_signs.length > 0 && (
            <div dir={rtl} className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900">
              <p className="font-semibold">Be careful</p>
              <ul className="mt-1 list-disc ps-5">{reading.warning_signs.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          {reading.missing_details.length > 0 && (
            <div dir={rtl} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Missing or unreadable</p>
              <ul className="mt-1 list-disc ps-5">{reading.missing_details.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          <p dir={rtl} className="text-sm text-slate-800">{reading.summary_spoken}</p>
          <SpeakButton text={reading.summary_spoken} lang={lang} label="Listen" />
          {reading.batch_code && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">KashRoot registry check for batch {reading.batch_code}</p>
              <BatchResult lookup={lookup} account={account} />
            </div>
          )}
          <p className="text-xs text-slate-500">AI reading of a photo. A state quality-control lab test is the legal proof.</p>
        </div>
      )}
    </div>
  );
}
