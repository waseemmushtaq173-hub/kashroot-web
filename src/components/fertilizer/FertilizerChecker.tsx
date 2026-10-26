'use client';

/**
 * FertilizerChecker — KashRoot TrueScan: is this fertiliser or pesticide
 * genuine? Checks anyone can do before using a bag or bottle:
 *   1. Photo of the label → the AI reads product, batch, registration number
 *      (CIB&RC for pesticides, FCO for fertilisers), dates and MRP, points out
 *      what is missing or suspicious; the registration number is looked up in
 *      the Government list and the batch in KashRoot's dealer records. Can be
 *      read aloud.
 *   2. Registration / batch → what is printed on the label:
 *        • a CIB&RC registration number or a product name is looked up in the
 *          official lists the KashRoot admin imported (official_products via
 *          kr_registry_search) — every answer names its source and date, and
 *          "not in the list" or "list not loaded yet" is said plainly;
 *        • a fertiliser type (DAP 18-46-0, Urea…) is matched to its Fertiliser
 *          (Control) Order standard;
 *        • a batch number: the Government publishes no list of batch numbers,
 *          and the result says so; a KashRoot dealer record for the batch
 *          (fertilizer_batches via kr_check_batch) is shown as extra information.
 *   3. Lab report → Fertiliser (Control) Order, 1985 minimums.
 * Anyone — signed in or not — can report a suspicious product to the KashRoot admin.
 */
import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Camera, CheckCircle2, CircleAlert, FileQuestion, Flag, FlaskConical, Loader2, ScanLine, ShieldCheck, XCircle } from 'lucide-react';

import { LangPicker, SpeakButton } from '@/components/voice/VoiceButtons';
import { checkAgainstFco, FCO_PRODUCTS, type FcoProduct } from '@/lib/fertilizer/fco';
import { checkLabel, type LabelFacts, type RuleReport } from '@/lib/fertilizer/labelRules';
import { KIND_WORDS } from '@/lib/fertilizer/officialList';
import { fcoTypeOf, readTyped, type Typed } from '@/lib/fertilizer/trueScan';
import { compressImage } from '@/lib/client/image';
import { isRtl, type SpeechLang } from '@/lib/client/speech';
import { dbMessage, loadAccount, supabase, supabaseConfigured, type Account } from '@/lib/db/client';
import { registryStats, searchRegistry, type OfficialHit, type OfficialKind, type RegistryStats } from '@/lib/db/registry';
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

/** What TrueScan found for what was typed. `hits` and `stats` are null when the lists are not set up on this site. */
type Scan =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'done'; typed: Typed; hits: OfficialHit[] | null; stats: RegistryStats | null; fco?: FcoProduct; dealer?: Lookup };

/** A registration number read from the label photo, looked up in the official list. */
type RegCheck = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; no: string; hits: OfficialHit[] | null; stats: RegistryStats | null };

const INPUT = 'block w-full rounded-xl border-0 bg-white px-4 py-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600';
const ASK = 'Ask the dealer for the registration certificate, or ask your agriculture officer.';

/** "26 Oct 2026" */
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const count = (n: number) => n.toLocaleString('en-IN');
/** "1 product", "1,234 products" */
const products = (n: number) => `${count(n)} product${n === 1 ? '' : 's'}`;
const offline = (err: unknown) => (err instanceof Error && !/Failed to fetch|NetworkError|Load failed/i.test(err.message) ? err.message : 'No internet connection. Please try again.');

/** The heading of a product found in an official list. */
const REGISTERED: Record<OfficialKind, string> = {
  pesticide: 'Registered with the Government (CIB&RC)',
  fertiliser: 'In the Government list of fertilisers',
  seed: 'In the Government list of seeds',
  other: 'In an official list',
};

async function lookupBatch(raw: string): Promise<Lookup> {
  const batch = raw.trim().toUpperCase();
  if (batch.length < 3) return { state: 'error', message: 'Enter the batch number printed on the bag.' };
  if (!supabaseConfigured) return { state: 'error', message: 'The batch registry is not connected on this site yet.' };
  const { data, error } = await supabase.rpc('kr_check_batch', { p_code: batch.slice(0, 40) });
  if (error) return { state: 'error', message: dbMessage(error, 'Could not reach the registry. Try again.') };
  return data ? { state: 'found', row: data as BatchRow } : { state: 'missing', code: batch };
}

/** Everything TrueScan can say about what was typed — all looked up at once. */
async function scan(raw: string): Promise<Scan> {
  const typed = readTyped(raw);
  if (!typed.text) return { state: 'error', message: 'Type what is printed on the label: the registration number (CIR-…), the product name, or the batch number.' };
  if (typed.text.length < 2) return { state: 'error', message: `“${typed.text}” is too short. Type the whole registration number, product name or batch number.` };
  try {
    const [stats, hits, dealer] = await Promise.all([
      registryStats(),
      searchRegistry(typed.text),
      typed.kind === 'batch' && typed.text.length >= 3 ? lookupBatch(typed.text) : Promise.resolve(undefined),
    ]);
    return { state: 'done', typed, hits, stats, dealer, fco: typed.kind === 'name' ? fcoTypeOf(typed.text) : undefined };
  } catch (err) {
    return { state: 'error', message: offline(err) };
  }
}

export function FertilizerChecker({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<'photo' | 'registry' | 'lab'>('photo');
  const [account, setAccount] = useState<Account | null>(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Scan>({ state: 'idle' });
  // A new check starts its answer afresh (e.g. "Show all" closed again).
  const [scans, setScans] = useState(0);
  // undefined: not read yet; null: the official lists are not set up on this site.
  const [stats, setStats] = useState<RegistryStats | null | undefined>(undefined);
  const [productId, setProductId] = useState(FCO_PRODUCTS[0].id);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  const product = FCO_PRODUCTS.find((p) => p.id === productId)!;
  const measured = Object.fromEntries(product.parameters.map((p) => [p.key, values[p.key] === undefined || values[p.key] === '' ? undefined : Number(values[p.key])]));
  const report = checkAgainstFco(product, measured);

  const open = (id: typeof mode) => {
    setMode(id);
    // What the lists hold, said under the box before anything is typed.
    if (id === 'registry' && stats === undefined) void registryStats().then(setStats).catch(() => undefined);
  };
  const check = async () => {
    setResult({ state: 'loading' });
    const r = await scan(code);
    if (r.state === 'done') setStats(r.stats);
    setScans((n) => n + 1);
    setResult(r);
  };

  return (
    <div className={compact ? '' : 'rounded-[2rem] bg-white/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] ring-1 ring-white/70 backdrop-blur-xl sm:p-8'}>
      <div role="group" aria-label="Check type" className="inline-flex flex-wrap rounded-xl bg-slate-900/5 p-1">
        {([
          ['photo', 'Photo of the label', Camera],
          ['registry', 'Registration / batch', ScanLine],
          ['lab', 'Lab report vs FCO', FlaskConical],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => open(id)}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${mode === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {mode === 'photo' && <LabelPhoto account={account} />}

      {mode === 'registry' && (
        <div className="mt-5">
          <RegistryForm code={code} setCode={setCode} busy={result.state === 'loading'} onCheck={() => void check()} />
          <ListsHeld stats={stats} />
          <div aria-live="polite" className="mt-4">
            <ScanResult
              key={scans}
              result={result}
              account={account}
              onPhoto={() => setMode('photo')}
              onLab={(id) => {
                setProductId(id);
                setValues({});
                setMode('lab');
              }}
            />
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
 * One big box for whatever is printed on the label. Codes are mostly
 * numbers, so a tap switches the phone to its number keypad and back.
 */
function RegistryForm({ code, setCode, busy, onCheck }: { code: string; setCode: (v: string) => void; busy: boolean; onCheck: () => void }) {
  const [numbers, setNumbers] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onCheck(); }}>
      <label htmlFor="truescan-text" className="block text-base font-semibold text-slate-900">What is printed on the label?</label>
      <p id="truescan-hint" className="mt-0.5 text-sm text-slate-600">The registration number (CIR-…), the product name, or the batch number.</p>
      <div className="mt-2 flex gap-2">
        <input
          ref={input}
          id="truescan-text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode={numbers ? 'numeric' : 'text'}
          enterKeyHint="search"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={120}
          aria-describedby="truescan-hint truescan-lists"
          placeholder="CIR-…, product name or batch no."
          className={`${INPUT} min-h-14 min-w-0 flex-1 text-lg font-semibold tracking-wide placeholder:text-base placeholder:font-normal placeholder:tracking-normal`}
        />
        <button
          type="button"
          aria-pressed={numbers}
          aria-label={numbers ? 'Letters keyboard' : 'Number keypad'}
          title={numbers ? 'Letters keyboard' : 'Number keypad'}
          onClick={() => {
            setNumbers(!numbers);
            input.current?.focus();
          }}
          className="grid min-h-14 min-w-14 shrink-0 cursor-pointer place-items-center rounded-xl bg-white px-2 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
        >
          {numbers ? 'ABC' : '123'}
        </button>
      </div>
      <button type="submit" disabled={busy} className="mt-3 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60 sm:w-auto">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ShieldCheck className="h-5 w-5" aria-hidden />} {busy ? 'Checking…' : 'Check'}
      </button>
    </form>
  );
}

/** Under the box: which official lists KashRoot holds, and how fresh they are. */
function ListsHeld({ stats }: { stats: RegistryStats | null | undefined }) {
  if (stats === undefined) return <p id="truescan-lists" className="sr-only" />;
  const kinds = (Object.entries(stats?.kinds ?? {}) as [OfficialKind, { count: number; last_import: string }][]).filter(([, k]) => k.count > 0);
  return (
    <p id="truescan-lists" className="mt-2 text-xs text-slate-500">
      {kinds.length
        ? `Checked against: ${kinds.map(([kind, k]) => `${KIND_WORDS[kind]}, ${products(k.count)}, updated ${day(k.last_import)}`).join('; ')} — and the FCO standards of ${FCO_PRODUCTS.length} common fertilisers.`
        : `The Government lists of registered products are not loaded on KashRoot yet. Fertiliser types are checked against the FCO standards of ${FCO_PRODUCTS.length} common fertilisers.`}
    </p>
  );
}

/** The official-list answer for one product, in one sentence, with its source and date. */
function HitLine({ hit, strong = false }: { hit: OfficialHit; strong?: boolean }) {
  const extra = (['brand', 'formulation', 'valid_until'] as const)
    .map((k) => [k, hit.details?.[k]] as const)
    .filter(([, v]) => typeof v === 'string' && v.trim());
  const label = { brand: 'Brand', formulation: 'Formulation', valid_until: 'Valid until' } as const;
  return (
    <div>
      <p className={strong ? 'text-base text-slate-900' : 'text-slate-900'}>
        <strong>{hit.name}</strong>
        {hit.registrant ? <> by <strong>{hit.registrant}</strong></> : null}
        {hit.registration_no ? <>, registration <span className="break-all font-semibold">{hit.registration_no}</span></> : null}.
      </p>
      {extra.length > 0 && <p className="text-xs text-slate-600">{extra.map(([k, v]) => `${label[k]}: ${v}`).join(' · ')}</p>}
      <p className="text-xs text-slate-600">
        Source:{' '}
        <a href={hit.source_url} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-800 underline">{hit.source}</a>, updated {day(hit.imported_at)}.
      </p>
    </div>
  );
}

/** Which lists were checked (kinds that apply), and the newest import among them. */
function listsFor(stats: RegistryStats | null, kind: Typed['kind']) {
  const kinds = (Object.entries(stats?.kinds ?? {}) as [OfficialKind, { count: number; last_import: string }][]).filter(([k, v]) => v.count > 0 && (kind !== 'registration' || k === 'pesticide'));
  const last = kinds.map(([, v]) => v.last_import).sort().at(-1) ?? null;
  return { kinds, last, held: kinds.length > 0 };
}

function ScanResult({ result, account, onPhoto, onLab }: { result: Scan; account: Account | null; onPhoto: () => void; onLab: (fcoId: string) => void }) {
  const [all, setAll] = useState(false);
  if (result.state === 'idle') return null;
  if (result.state === 'loading') return <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the official lists…</p>;
  if (result.state === 'error') return <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{result.message}</p>;

  const { typed, hits, stats, fco, dealer } = result;
  const byNumber = (hits ?? []).filter((h) => h.matched === 'registration');
  const byName = (hits ?? []).filter((h) => h.matched === 'name');
  const lists = listsFor(stats, typed.kind);
  const found = byNumber.length + byName.length > 0;
  const shownNames = all ? byName : byName.slice(0, 5);

  return (
    <div className="space-y-3 text-sm">
      {typed.kind === 'batch' && (
        <div className="rounded-2xl bg-slate-50 p-4 text-slate-800 ring-1 ring-slate-200">
          <p className="flex items-center gap-2 font-semibold text-slate-900"><ScanLine className="h-5 w-5 shrink-0" aria-hidden /> {typed.text.toUpperCase()} looks like a batch number</p>
          <p className="mt-1">The Government of India publishes no list of batch numbers, so no website — KashRoot included — can confirm a batch number.</p>
          <p className="mt-1">To check the product itself, type its <strong>registration number (CIR-…)</strong> or its <strong>name</strong> from the label, or photograph the label.</p>
          <button type="button" onClick={onPhoto} className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800">
            <Camera className="h-4 w-4" aria-hidden /> Check the label photo
          </button>
          {dealer?.state === 'found' && (
            <div className="mt-4">
              <p className="mb-2 font-semibold text-slate-800">Extra information: a KashRoot dealer listed batch {dealer.row.batch_code}</p>
              <DealerRecord row={dealer.row} account={account} />
            </div>
          )}
          {dealer?.state === 'missing' && <p className="mt-3 text-xs text-slate-600">No KashRoot dealer has listed batch {dealer.code}. That is normal — most genuine products are not listed by dealers on KashRoot.</p>}
          {dealer?.state === 'error' && <p className="mt-3 text-xs text-rose-800">KashRoot’s dealer records could not be checked: {dealer.message}</p>}
        </div>
      )}

      {byNumber.map((h, i) => (
        <section key={`${h.source}|${h.registration_no}|${h.name}|${i}`} aria-label="Found in the official list" className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <p className="flex items-center gap-2 text-base font-semibold text-emerald-900"><BadgeCheck className="h-5 w-5 shrink-0" aria-hidden /> {REGISTERED[h.kind]}</p>
          <div className="mt-1"><HitLine hit={h} strong /></div>
          <p className="mt-2 text-xs text-emerald-950">A fake can copy a real number. Check that the company on the label is exactly the same, and buy only with a bill.</p>
        </section>
      ))}

      {byName.length > 0 && (
        <section aria-label="Found by name in the official list" className="rounded-2xl bg-emerald-50/70 p-4 ring-1 ring-emerald-200">
          <p className="flex items-center gap-2 text-base font-semibold text-emerald-900"><BadgeCheck className="h-5 w-5 shrink-0" aria-hidden /> Found by name in the Government list</p>
          <p className="mt-1 text-slate-800">
            {byName.length === 1 ? 'One registered product has this name.' : `${byName.length === 20 ? '20 or more' : byName.length} registered products have this name.`} The company and the registration number on your label must match {byName.length === 1 ? 'it' : 'one of these'}.
          </p>
          <ul className="mt-3 space-y-3">
            {shownNames.map((h, i) => (
              <li key={`${h.source}|${h.registration_no}|${h.name}|${i}`} className="rounded-xl bg-white/80 p-3 ring-1 ring-emerald-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">{REGISTERED[h.kind]}</p>
                <HitLine hit={h} />
              </li>
            ))}
          </ul>
          {byName.length > shownNames.length && (
            <button type="button" onClick={() => setAll(true)} className="mt-3 min-h-11 cursor-pointer rounded-xl bg-white px-4 py-2 font-semibold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50">
              Show all {byName.length}
            </button>
          )}
          {byName.length === 20 && all && <p className="mt-2 text-xs text-slate-600">Only the first 20 are shown: type more of the name, or the company, to narrow it down.</p>}
        </section>
      )}

      {fco && (
        <section aria-label="Fertiliser (Control) Order" className="rounded-2xl bg-sky-50 p-4 text-slate-800 ring-1 ring-sky-200">
          <p className="flex items-center gap-2 text-base font-semibold text-sky-950"><ShieldCheck className="h-5 w-5 shrink-0" aria-hidden /> This fertiliser type is specified in the Fertiliser (Control) Order — check the label photo against its standard</p>
          <p className="mt-2 font-semibold">Government standard for {fco.name} ({fco.grade})</p>
          <ul className="mt-1 list-disc ps-5">
            {fco.parameters.map((p) => <li key={p.key}>{p.label}: {p.min !== undefined ? `at least ${p.min}%` : `at most ${p.max}%`}</li>)}
          </ul>
          <p className="mt-2 text-xs text-slate-600">Fertiliser (Control) Order, 1985, Schedule I. The type being in the Order does not prove a bag is genuine — the label must show it, and only a Government lab test proves what is inside.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onPhoto} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-sky-800 px-4 py-2 font-semibold text-white hover:bg-sky-900">
              <Camera className="h-4 w-4" aria-hidden /> Check the label photo
            </button>
            <button type="button" onClick={() => onLab(fco.id)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-sky-900 ring-1 ring-sky-200 hover:bg-sky-100">
              <FlaskConical className="h-4 w-4" aria-hidden /> Compare a lab report
            </button>
          </div>
        </section>
      )}

      {!found && !fco && typed.kind !== 'batch' && (lists.held && hits !== null ? (
        <section aria-label="Not in the official list" className="rounded-2xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-base font-semibold"><CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> Not in the official list KashRoot holds (updated {day(lists.last)})</p>
          <p className="mt-1">It may be very new — or fake. {ASK}</p>
          <p className="mt-2 text-xs text-amber-900">Lists checked: {lists.kinds.map(([kind, k]) => `${KIND_WORDS[kind]} (${products(k.count)})`).join('; ')}. Check that you typed it exactly as printed.</p>
        </section>
      ) : (
        <section aria-label="Official list not loaded" className="rounded-2xl bg-slate-50 p-4 text-slate-800 ring-1 ring-slate-200">
          <p className="flex items-center gap-2 text-base font-semibold text-slate-900"><FileQuestion className="h-5 w-5 shrink-0" aria-hidden /> {typed.kind === 'registration' ? 'The Government list of registered pesticides (CIB&RC) is not on KashRoot yet' : 'The Government lists of registered products are not on KashRoot yet'}</p>
          <p className="mt-1">So KashRoot cannot say whether this is registered. {ASK}</p>
        </section>
      ))}

      {/* A dealer's record has its own "Report as suspicious". */}
      {dealer?.state !== 'found' && <ReportBatch code={typed.text} account={account} />}
    </div>
  );
}

/**
 * What the law requires and where the Government checks a doubtful product.
 * India publishes no batch-number database, and the pesticide registry
 * (CIB&RC, ppqs.gov.in) refuses automatic access — so KashRoot checks
 * registrations against the official lists its admin imports, and these are
 * the official routes for everything else.
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
      <p className="mt-2 text-xs text-slate-500">Registrations are checked against the Government lists the KashRoot team loads — each answer names its source and date. Batch records come from dealers on KashRoot; they are not a Government list.</p>
    </section>
  );
}

/** A batch a dealer listed on KashRoot (fertilizer_batches) — extra information, not a Government list. */
function DealerRecord({ row, account }: { row: BatchRow; account: Account | null }) {
  const expired = row.expiry_date && row.expiry_date < new Date().toISOString().slice(0, 10);
  const good = row.dealer_verified && !expired && row.reports === 0;
  return (
    <div className={`rounded-2xl p-4 ring-1 ${good ? 'bg-emerald-50 ring-emerald-200' : 'bg-amber-50 ring-amber-200'}`}>
      <p className={`flex items-center gap-2 font-semibold ${good ? 'text-emerald-900' : 'text-amber-900'}`}>
        {good ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <CircleAlert className="h-5 w-5" aria-hidden />}
        {expired ? 'Listed by a dealer — but past its expiry date' : row.dealer_verified ? 'Listed by a KashRoot-verified dealer' : 'Listed by a dealer KashRoot has not verified yet'}
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
      <p className="mt-3 text-xs text-slate-600">A dealer’s record, not a Government list. Also match the batch number, MRP and manufacturer printed on the bag with your bill.</p>
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
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-semibold text-rose-800 hover:underline">
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
      <button type="button" disabled={state === 'sending'} onClick={() => void send()} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60">
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
  const [regCheck, setRegCheck] = useState<RegCheck>({ state: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const [langFrom, setLangFrom] = useState<Account | null>(null);
  if (account !== langFrom) {
    setLangFrom(account);
    if (account?.lang) setLang(account.lang);
  }

  /** The registration number on a pesticide label, looked up in the official list. */
  const checkRegistration = async (no: string) => {
    setRegCheck({ state: 'loading' });
    try {
      const [hits, stats] = await Promise.all([searchRegistry(no), registryStats()]);
      setRegCheck({ state: 'done', no, hits, stats });
    } catch (err) {
      setRegCheck({ state: 'error', message: offline(err) });
    }
  };

  const read = async (file?: File) => {
    if (!file) return;
    setError(null);
    setReading(null);
    setLookup({ state: 'idle' });
    setRegCheck({ state: 'idle' });
    try {
      const image = await compressImage(file, 1600, 0.85);
      setPhoto(image);
      setBusy(true);
      const res = await fetch('/api/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: image, lang }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The label could not be read.');
      const r = data as LabelReading;
      setReading(r);
      const reg = r.registration_no?.trim();
      const checks: Promise<void>[] = [];
      if (reg && reg.length >= 3 && (r.product_type === 'pesticide' || /cir/i.test(reg))) checks.push(checkRegistration(reg));
      if (r.batch_code) {
        setLookup({ state: 'loading' });
        checks.push(lookupBatch(r.batch_code).then(setLookup));
      }
      await Promise.all(checks);
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
          <LabelRegistration check={regCheck} />
          {reading.batch_code && lookup.state === 'found' && (
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Also on KashRoot: batch {reading.batch_code}</p>
              <DealerRecord row={lookup.row} account={account} />
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

/** The label's registration number against the Government list: found, not found, or the list not loaded yet. */
function LabelRegistration({ check }: { check: RegCheck }) {
  if (check.state === 'idle') return null;
  if (check.state === 'loading') return <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the registration number in the Government list…</p>;
  if (check.state === 'error') return <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">The registration number could not be checked: {check.message}</p>;
  const hit = (check.hits ?? []).find((h) => h.matched === 'registration');
  if (hit) {
    return (
      <section aria-label="Registration number in the official list" className="rounded-xl bg-emerald-50 p-3 text-sm ring-1 ring-emerald-200">
        <p className="flex items-center gap-2 font-semibold text-emerald-900"><BadgeCheck className="h-5 w-5 shrink-0" aria-hidden /> {REGISTERED[hit.kind]}</p>
        <div className="mt-1"><HitLine hit={hit} /></div>
        <p className="mt-1 text-xs text-emerald-950">Check that the company on the label is exactly the same — a fake can copy a real number.</p>
      </section>
    );
  }
  const lists = listsFor(check.stats, 'registration');
  if (check.hits !== null && lists.held) {
    return (
      <section aria-label="Registration number not in the official list" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
        <p className="flex items-center gap-2 font-semibold"><CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> Registration {check.no}: not in the official list KashRoot holds (updated {day(lists.last)})</p>
        <p className="mt-1">It may be very new — or fake. {ASK} If the photo was unclear, type the number in “Registration / batch”.</p>
      </section>
    );
  }
  return <p className="text-xs text-slate-500">The Government list of registered pesticides (CIB&amp;RC) is not on KashRoot yet, so registration {check.no} could not be checked against it.</p>;
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
