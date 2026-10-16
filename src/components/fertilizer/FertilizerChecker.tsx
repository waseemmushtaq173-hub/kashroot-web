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
 * Anyone — signed in or not — can report a suspicious product to the KashRoot admin.
 */
import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, CircleAlert, Flag, FlaskConical, Loader2, ScanLine, ShieldCheck, XCircle } from 'lucide-react';

import { LangPicker, SpeakButton } from '@/components/voice/VoiceButtons';
import { checkAgainstFco, FCO_PRODUCTS } from '@/lib/fertilizer/fco';
import { checkLabel, type LabelFacts, type RuleReport } from '@/lib/fertilizer/labelRules';
import { compressImage } from '@/lib/client/image';
import { isRtl, type SpeechLang } from '@/lib/client/speech';
import { dbMessage, loadAccount, supabase, supabaseConfigured, type Account } from '@/lib/db/client';
import { reportBatch } from '@/lib/db/security';

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

interface LabelReading extends LabelFacts {
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
      {!compact && <OfficialChecks />}
    </div>
  );
}

/**
 * What the law requires and where the Government checks a doubtful product.
 * India publishes no batch-number database, and the pesticide registry
 * (CIB&RC, ppqs.gov.in) refuses automatic access — so KashRoot cannot ask the
 * Government about a batch for you; these are the official routes.
 */
function OfficialChecks() {
  return (
    <section aria-labelledby="official-checks" className="mt-6 rounded-2xl bg-sky-50/80 p-4 text-sm text-slate-800 ring-1 ring-sky-200">
      <h3 id="official-checks" className="flex items-center gap-2 font-semibold text-sky-950"><ShieldCheck className="h-5 w-5" aria-hidden /> Official checks (Government of India rules)</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li><strong>Fertiliser bag</strong> (Fertiliser Control Order, 1985): must print the manufacturer’s name, the fertiliser and its grade, net weight, batch number, date of manufacture and the MRP.</li>
        <li><strong>Pesticide bottle or packet</strong> (Insecticides Act, 1968): must print the CIB&amp;RC registration number, batch number, manufacturing and expiry dates, the antidote, and the coloured warning triangle (red = most poisonous, then yellow, blue, green).</li>
        <li>Buy only from a <strong>licensed dealer</strong> and take a <strong>bill with the batch number</strong> — without it a complaint is hard to prove.</li>
        <li>Doubtful product: keep the bag/bottle and bill, and tell your district <strong>Chief Agriculture Officer</strong> (fertilisers) or <strong>Chief Horticulture Officer</strong> (orchard sprays). Their inspector can take a sample to the Government quality-control lab — that test is the legal proof.</li>
        <li>Free advice and complaints: <a href="tel:18001801551" className="font-semibold text-sky-800 underline">Kisan Call Centre 1800-180-1551</a> (Government of India, every day 6 am – 10 pm, Kashmiri, Urdu, Hindi).</li>
      </ul>
      <p className="mt-2 text-xs text-slate-500">KashRoot’s batch registry is filled by dealers KashRoot has verified; it is not a Government list.</p>
    </section>
  );
}

function BatchResult({ lookup, account, onPhoto }: { lookup: Lookup; account: Account | null; onPhoto?: () => void }) {
  if (lookup.state === 'idle' || lookup.state === 'loading') return lookup.state === 'loading' ? <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the registry…</p> : null;
  if (lookup.state === 'error') return <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{lookup.message}</p>;
  if (lookup.state === 'missing') {
    return (
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-800 ring-1 ring-slate-200">
        <p className="font-semibold text-slate-900">No dealer record for {lookup.code} on KashRoot — this is normal</p>
        <p className="mt-1">The Government of India publishes no list of batch numbers, so no website can confirm a batch number on its own. Most genuine products are not in KashRoot’s dealer list.</p>
        {onPhoto && (
          <>
            <p className="mt-2">For a real check, photograph the label: KashRoot reads it and checks it against the Government’s labelling rules and official fertiliser standards.</p>
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
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | string>('idle');
  if (state === 'sent') return <p className="mt-3 text-sm font-semibold text-emerald-800">Reported to the KashRoot admin. Thank you. Please also tell your district agriculture officer.</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-rose-800 hover:underline">
        <Flag className="h-4 w-4" aria-hidden /> Report as suspicious
      </button>
    );
  }
  const send = async () => {
    if (note.trim().length < 3) return setState('Say what looked wrong.');
    const digits = phone.replace(/\D/g, '');
    if (digits && digits.length < 10) return setState('Write a 10-digit mobile number, or leave it empty.');
    setState('sending');
    try {
      await reportBatch(code.slice(0, 40), note.trim().slice(0, 500), digits || undefined);
      setState('sent');
    } catch (err) {
      setState(err instanceof Error ? err.message : 'Could not send the report.');
    }
  };
  return (
    <div className="mt-3 space-y-2">
      <textarea rows={2} className={INPUT} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What looked wrong? e.g. torn seal, different MRP, no registration number" />
      {!account && (
        <input className={INPUT} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your mobile (optional) — so KashRoot can call you back" />
      )}
      <button type="button" disabled={state === 'sending'} onClick={() => void send()} className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60">
        <Flag className="h-4 w-4" aria-hidden /> Send report
      </button>
      <p className="text-xs text-slate-500">No account needed.</p>
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
              {([
                ['Product', `${reading.product_name}${reading.grade_or_composition ? ` (${reading.grade_or_composition})` : ''}`],
                ['Manufacturer', reading.manufacturer],
                ['Batch no.', reading.batch_code],
                ['Registration no.', reading.registration_no],
                ['Manufactured', reading.mfg_date],
                ['Expiry', reading.expiry_date],
                ['Net quantity', reading.net_quantity ?? ''],
                ['MRP', reading.mrp],
              ] as [string, string][])
                // A fertiliser bag need not print a registration number or expiry date (FCO 1985).
                .filter(([k, v]) => v || reading.product_type !== 'fertilizer' || (k !== 'Registration no.' && k !== 'Expiry'))
                .map(([k, v]) => (
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
          {reading.readable && <RuleChecks report={checkLabel(reading)} />}
          {reading.batch_code && lookup.state === 'found' && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Also on KashRoot: batch {reading.batch_code}</p>
              <BatchResult lookup={lookup} account={account} />
            </div>
          )}
          {reading.batch_code && lookup.state === 'missing' && (
            <p className="text-xs text-slate-500">Batch {reading.batch_code} is not in KashRoot’s own dealer list. That is normal — most genuine products are not listed there, and it does not affect the checks above.</p>
          )}
          {reading.batch_code && lookup.state !== 'found' && <ReportBatch code={reading.batch_code} account={account} />}
          <p className="text-xs text-slate-500">AI reading of a photo. A state quality-control lab test is the legal proof.</p>
        </div>
      )}
    </div>
  );
}

const RULE_ICON = { ok: CheckCircle2, missing: XCircle, problem: XCircle, caution: CircleAlert } as const;
const RULE_COLOUR = { ok: 'text-emerald-600', missing: 'text-amber-600', problem: 'text-rose-600', caution: 'text-amber-600' } as const;
const VERDICT = {
  good: { text: 'The label has everything the law requires', box: 'bg-emerald-50 ring-emerald-200 text-emerald-950' },
  incomplete: { text: 'Some details the law requires are missing or unclear', box: 'bg-amber-50 ring-amber-200 text-amber-950' },
  warning: { text: 'Warning: this label breaks the Government rules', box: 'bg-rose-50 ring-rose-200 text-rose-950' },
  unknown: { text: 'The label could not be checked', box: 'bg-slate-50 ring-slate-200 text-slate-900' },
} as const;

/** The label checked against the law and the official FCO standard — no KashRoot listing needed. */
function RuleChecks({ report }: { report: RuleReport }) {
  const v = VERDICT[report.verdict];
  return (
    <section aria-label="Checked against Government rules" className={`rounded-xl p-3 text-sm ring-1 ${v.box}`}>
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" aria-hidden /> {v.text}</p>
      <p className="mt-0.5 text-xs opacity-80">Checked against the {report.law}</p>
      <ul className="mt-2 space-y-1">
        {report.checks.map((c) => {
          const Icon = RULE_ICON[c.status];
          return (
            <li key={c.label} className="flex items-start gap-2">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${RULE_COLOUR[c.status]}`} aria-hidden />
              <span>
                <span className="font-medium">{c.label}</span>
                <span className="sr-only"> — {c.status === 'ok' ? 'present' : c.status}</span>
                {c.detail && <span className="text-slate-700">: {c.detail}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {report.fco && (
        <div className="mt-3 rounded-lg bg-white/80 p-2.5 text-slate-800 ring-1 ring-slate-200">
          <p className="font-semibold">Government standard for {report.fco.name} ({report.fco.grade})</p>
          <ul className="mt-1 list-disc ps-5">
            {report.fco.parameters.map((p) => (
              <li key={p.key}>{p.label}: {p.min !== undefined ? `at least ${p.min}%` : `at most ${p.max}%`}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">Fertiliser (Control) Order, 1985, Schedule I. A State fertiliser quality-control lab tests the bag against these figures.</p>
        </div>
      )}
      <p className="mt-2 text-xs opacity-80">A label can be copied — only a Government lab test proves what is inside. If something is wrong, keep the bag and bill and tell your district agriculture officer.</p>
    </section>
  );
}
