'use client';

/**
 * FertilizerChecker — KashRoot TrueScan: is this fertiliser or pesticide
 * genuine? Checks anyone can do before using a bag or bottle:
 *   1. Photo of the label → the AI reads product, batch, registration number
 *      (CIB&RC for pesticides, FCO for fertilisers), dates and MRP, points out
 *      what is missing or suspicious; the registration number is looked up in
 *      the Government list and the batch in KashRoot's dealer records. Can be
 *      read aloud.
 *   2. QR code scan → scans the QR on the label, follows manufacturer's
 *      verification page (domain allowlist, SSRF protection), outcome:
 *      VERIFIED_BY_MANUFACTURER, REGISTERED_BATCH_UNVERIFIED, EXPIRED, BANNED,
 *      NOT_FOUND, PENDING_MANUFACTURER. Offline: "checked against saved list",
 *      never "genuine".
 *   3. Registration / batch → what is printed on the label:
 *        • a CIB&RC registration number or a product name is looked up in the
 *          official lists the KashRoot admin imported (official_products via
 *          kr_registry_search) — every answer names its source and date, and
 *          "not in the list" or "list not loaded yet" is said plainly;
 *        • a fertiliser type (DAP 18-46-0, Urea…) is matched to its Fertiliser
 *          (Control) Order standard;
 *        • a batch number: the Government publishes no list of batch numbers,
 *          and the result says so; a KashRoot dealer record for the batch
 *          (fertilizer_batches via kr_check_batch) is shown as extra information.
 *   4. Lab report → Fertiliser (Control) Order, 1985 minimums.
 *   5. Bag-marking checklist → when no manufacturer record, check FCO Schedule I
 *      mandatory label fields; fail → "Book lab test".
 * Anyone — signed in or not — can report a suspicious product to the KashRoot admin.
 */
import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Camera, CheckCircle2, CircleAlert, FileQuestion, Flag, FlaskConical, Loader2, QrCode, ScanLine, ShieldCheck, XCircle } from 'lucide-react';

import { LangPicker, SpeakButton } from '@/components/voice/VoiceButtons';
import { checkLabel, type LabelFacts, type RuleReport } from '@/lib/fertilizer/labelRules';
import { fcoTypeOf, readTyped, type Typed } from '@/lib/fertilizer/trueScan';
import { compressImageForFastScan } from '@/lib/fastImageCompress';
import { isRtl, type SpeechLang } from '@/lib/client/speech';
import { classifyFetchError } from '@/lib/onlineFirstClient';
import { dbMessage, loadAccount, supabase, supabaseConfigured, type Account } from '@/lib/db/client';
import { registryStats, searchRegistry, type OfficialHit, type RegistryStats } from '@/lib/db/registry';
import type { FcoStandard } from '@/lib/db/govRegistry';
// The lab tab's fertiliser standards come from a typed list of about 3 MB of script: fetched only when that tab is used.
import { REFERENCE_SOURCE } from '@/lib/fertilizer/referenceSource';
import { loadRegistry } from '@/lib/fertilizer/registryLazy';
import { CIBRC_META, loadCibrc, lookupCibrc, type CibrcAnswer } from '@/lib/cibrcOfficial';
import { reportBatch } from '@/lib/db/security';
import { DataGovPanel } from './DataGovPanel';
import { OfficialCibrcAnswerPanel } from './OfficialCibrcPanel';

import { QRCodeScanner, QRCodeResult, type QRCodeVerificationResult } from './QRCodeScanner';
import { BagMarkingChecklist } from './BagMarkingChecklist';

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

/** What TrueScan found for what was typed. `hits` and `stats` are null when the imported official lists are not set up on this site. */
type Scan =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'done'; typed: Typed; hits: OfficialHit[] | null; stats: RegistryStats | null; dealer?: Lookup };

/** A registration number read from the label photo, looked up in the official list. */
type RegCheck = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; no: string; hits: OfficialHit[] | null; stats: RegistryStats | null };

const INPUT = 'block w-full rounded-xl border-0 bg-white px-4 py-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-forest';
const ASK = 'Ask the dealer for the registration certificate, or ask your agriculture officer.';

/** "26 Oct 2026" */
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const count = (n: number) => n.toLocaleString('en-IN');
/** One honest message for a failed request: names the device only when the
 * device itself reports being offline, names KashRoot when it could not be
 * reached, and otherwise passes the real error on — never a blanket
 * "No internet connection" claim. */
const offline = (err: unknown) => {
  const classified = classifyFetchError(err);
  if (classified.kind === 'DEVICE_NETWORK_UNAVAILABLE') return classified.userMessage;
  const m = err instanceof Error ? err.message : '';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Could not reach KashRoot. Check your internet and try again.';
  return m || 'The request could not be completed. Please try again.';
};

type FcoRow = { key: string; label: string; min: number | null; max: number | null; value: number | null; verdict: 'pass' | 'fail' | 'missing' };

function checkAgainstFcoStandard(standard: FcoStandard, measured: Record<string, number | undefined>) {
  const base: Array<{ key: string; label: string; min: number | null; max: number | null }> = [
    { key: 'n', label: 'Total nitrogen (N)', min: standard.total_n_min ?? null, max: null },
    { key: 'p', label: 'Total phosphate (P₂O₅)', min: standard.ws_p2o5_min ?? null, max: null },
    { key: 'k', label: 'Water-soluble potash (K₂O)', min: standard.ws_k2o_min ?? null, max: null },
    { key: 's', label: 'Sulphur (S)', min: standard.micronutrient_min ?? null, max: null },
    { key: 'zn', label: 'Zinc (Zn)', min: standard.micronutrient_min ?? null, max: null },
    { key: 'b', label: 'Boron (B)', min: standard.micronutrient_min ?? null, max: null },
    { key: 'moisture', label: 'Moisture', min: null, max: standard.moisture_max ?? null },
    { key: 'biuret', label: 'Biuret', min: null, max: standard.biuret_max ?? null },
    { key: 'chlorides', label: 'Chlorides', min: null, max: standard.chlorides_max ?? null },
    { key: 'free_acidity', label: 'Free acidity', min: null, max: standard.free_acidity_max ?? null },
  ];
  const rows: FcoRow[] = base.map((p): FcoRow => {
    const value = measured[p.key];
    const row: FcoRow = { ...p, value: null, verdict: 'missing' };
    if (typeof value === 'number' && Number.isFinite(value)) {
      row.value = value;
      row.verdict = ((p.min == null || value >= p.min) && (p.max == null || value <= p.max)) ? 'pass' : 'fail';
    }
    return row;
  });
  const tested = rows.filter((r) => r.verdict !== 'missing');
  return { rows, complete: tested.length === rows.length, pass: tested.length > 0 && tested.every((r) => r.verdict === 'pass') };
}

/** An entry from KashRoot's own typed reference list (never called "registered with the Government"). */
const isReference = (h: { source: string }) => h.source === REFERENCE_SOURCE || /typed by KashRoot/i.test(h.source);
const REFERENCE_HEADING = 'In KashRoot’s reference list — not yet checked against the official register';

/** The heading of a product found in an official list. */
const REGISTERED: Record<string, string> = {
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

/**
 * What the Government's imported lists say about what was typed (official rows only: an entry KashRoot typed itself is
 * never shown), and, for a batch number, a KashRoot dealer's record as extra information. The CIB&RC lists
 * (src/lib/cibrcOfficial.ts) are looked up beside this, from the same typed text.
 */
async function scan(raw: string): Promise<Scan> {
  const typed = readTyped(raw);
  if (!typed.text) return { state: 'error', message: 'Type what is printed on the label: the registration number (CIR-…), the product name, or the batch number.' };
  if (typed.text.length < 2) return { state: 'error', message: `“${typed.text}” is too short. Type the whole registration number, product name or batch number.` };
  try {
    const [found, stats, dealer] = await Promise.all([
      searchRegistry(typed.text).catch(() => null),
      registryStats().catch(() => null),
      typed.kind === 'batch' && typed.text.length >= 3 ? lookupBatch(typed.text) : Promise.resolve(undefined),
    ]);
    // Rows of the older typed catalogue that may have been copied into the database are left out too.
    const hits = found === null ? null : found.filter((h) => !isReference(h));
    return { state: 'done', typed, hits, stats, dealer };
  } catch (err) {
    return { state: 'error', message: offline(err) };
  }
}

export function FertilizerChecker({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<'photo' | 'qr' | 'registry' | 'lab' | 'bagChecklist'>('registry');
  const [account, setAccount] = useState<Account | null>(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Scan>({ state: 'idle' });
  // A new check starts its answer afresh (e.g. "Show all" closed again).
  const [scans, setScans] = useState(0);
  // undefined: not read yet; null: the imported official lists are not set up on this site.
  const [stats, setStats] = useState<RegistryStats | null | undefined>(undefined);
  // Live FCO standard for the lab tab: null when not set up or not yet fetched.
  const [fcoStandard, setFcoStandard] = useState<FcoStandard | null | undefined>(undefined);
  // Dedicated input state for the Lab tab — never disabled during loading
  const [fcoQuery, setFcoQuery] = useState('');
  // Lab values entered for the loaded FCO standard, keyed by parameter key.
  const [values, setValues] = useState<Record<string, string>>({});
  // What the official CIB&RC lists say about what is being typed: looked up on this phone as the letters are typed, so the
  // answer is on screen before "Check" is pressed.
  const [official, setOfficial] = useState<CibrcAnswer | null>(null);
  // The word data.gov.in is asked about once typing pauses (it is read from the server, so not on every letter).
  const [liveQuery, setLiveQuery] = useState('');
  const typing = useRef<{ fast?: number; slow?: number; seq: number }>({ seq: 0 });
  useEffect(() => () => {
    window.clearTimeout(typing.current.fast);
    window.clearTimeout(typing.current.slow);
  }, []);
  // True while a check is in flight, so "not in the official lists" never flashes before the answers are in.
  const [isChecking, setIsChecking] = useState(false);
  // True once a check has fully completed.
  const [hasCompletedSearch, setHasCompletedSearch] = useState(false);
  // QR code scanner state
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrResult, setQrResult] = useState<QRCodeVerificationResult | null>(null);
  const [qrScanning, setQrScanning] = useState(false);
  // Bag marking checklist state
  const [bagChecklistProduct, setBagChecklistProduct] = useState<string>('');

  useEffect(() => {
    void loadAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  const standard = fcoStandard;
  const measured = Object.fromEntries(Object.keys(values).map((k) => [k, values[k] === undefined || values[k] === '' ? undefined : Number(values[k])]));
  const report = standard ? checkAgainstFcoStandard(standard, measured) : null;

  const open = (id: typeof mode) => {
    setMode(id);
    // What the lists hold, said under the box before anything is typed.
    if (id === 'registry' && stats === undefined) void registryStats().then((s) => setStats((old) => old ?? s)).catch(() => setStats(null));
    if (id === 'lab') {
      // The FCO standards come from the embedded lists (no network), fetched with them the first time they are needed.
      if (fcoStandard === undefined) {
        void loadRegistry()
          .then((r) => setFcoStandard((s) => (s === undefined ? r.fcoLookupEmbedded('Diammonium phosphate (DAP)', '18:46:0') ?? null : s)))
          .catch(() => setFcoStandard(null));
      }
    }
    if (id === 'qr') {
      setQrResult(null);
      setQrScannerOpen(true);
    }
    if (id === 'bagChecklist') {
      setBagChecklistProduct(code || fcoQuery || '');
    }
  };
  const typedNow = readTyped(code);

  /** Typing in the box: the official lists answer at once, data.gov.in once the typing pauses. */
  const onType = (value: string) => {
    setCode(value);
    const t = typing.current;
    window.clearTimeout(t.fast);
    window.clearTimeout(t.slow);
    const typed = readTyped(value);
    const asked = ++t.seq;
    if (typed.kind !== 'name' || typed.text.length < 3) {
      setOfficial(null);
      setLiveQuery('');
      return;
    }
    t.fast = window.setTimeout(() => {
      void loadCibrc()
        .then((d) => {
          if (t.seq === asked) setOfficial(lookupCibrc(d, typed.text));
        })
        .catch(() => undefined);
    }, 150);
    t.slow = window.setTimeout(() => {
      if (t.seq === asked && typed.text.length >= 4) setLiveQuery(typed.text);
    }, 700);
  };

  const check = async () => {
    setIsChecking(true);
    setHasCompletedSearch(false);
    setResult({ state: 'loading' });

    const typed = readTyped(code);
    window.clearTimeout(typing.current.slow);
    // Pressing Check asks data.gov.in at once.
    setLiveQuery(typed.kind !== 'batch' && typed.text.length >= 3 ? typed.text : '');
    // The official CIB&RC lists, looked up from what was typed (a name; a registration or batch number is not in them).
    const lists = typed.kind === 'name' && typed.text.length >= 3 ? loadCibrc().then((d) => lookupCibrc(d, typed.text)).catch(() => null) : Promise.resolve(null);
    const [r, answer] = await Promise.all([scan(code), lists]);
    if (r.state === 'done') setStats(r.stats);
    setOfficial(answer);
    setScans((n) => n + 1);
    setResult(r);

    setIsChecking(false);
    setHasCompletedSearch(true);
  };

  return (
    <div className={compact ? '' : 'rounded-[2rem] bg-white/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] ring-1 ring-white/70 backdrop-blur-xl sm:p-8'}>
      <div role="group" aria-label="Check type" className="inline-flex flex-wrap rounded-xl bg-slate-900/5 p-1">
        {([
          ['photo', 'Photo of the label', Camera],
          ['qr', 'Scan QR code', QrCode],
          ['registry', 'Registration / batch', ScanLine],
          ['lab', 'Lab report vs FCO', FlaskConical],
          ['bagChecklist', 'Bag-marking checklist', FileQuestion],
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

      {mode === 'qr' && (
        <div className="mt-5">
          <QRCodeScanner
            onResult={async (qrText) => {
              setQrScanning(true);
              try {
                const res = await fetch('/api/truescan/verify-qr', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    qrText,
                    productName: code || fcoQuery,
                    isOffline: !navigator.onLine,
                  }),
                });
                const data = await res.json();
                setQrResult(data);
                setQrScannerOpen(false);
              } catch (err) {
                console.error('QR verification failed:', err);
              } finally {
                setQrScanning(false);
              }
            }}
            onClose={() => {
              setQrScannerOpen(false);
              setMode('registry');
            }}
            isOffline={!navigator.onLine}
          />
          {qrResult && (
            <QRCodeResult
              key={qrResult.checkedAt}
              result={qrResult}
              onReportFake={() => {
                void fetch('/api/truescan/report-fake', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    productType: qrResult.outcome === 'BANNED' ? 'pesticide' : 'fertilizer',
                    productName: qrResult.productName,
                    manufacturer: qrResult.manufacturer,
                    batchNumber: qrResult.batchNumber,
                    registrationNumber: qrResult.registrationNumber,
                    expiryDate: qrResult.expiryDate,
                    reason: qrResult.outcome === 'EXPIRED' ? 'expired' :
                      qrResult.outcome === 'BANNED' ? 'not_in_list' : 'qr_fail',
                    details: qrResult.details,
                    anonymous: true,
                  }),
                });
                alert('Report submitted. Thank you.');
              }}
              onLabTest={() => {
                setBagChecklistProduct(qrResult.productName);
                setMode('bagChecklist');
              }}
              onClose={() => setQrResult(null)}
            />
          )}
        </div>
      )}

      {mode === 'registry' && (
        <div className="mt-5">
          <RegistryForm code={code} setCode={onType} busy={result.state === 'loading'} onCheck={() => void check()} />
          <ListsHeld stats={stats} />
          <div aria-live="polite" className="mt-4 space-y-3">
            {/* The official answer, as it is typed: banned, restricted, registered (CIB&RC lists, row for row from the Government's PDFs). */}
            {official && official.total + official.didYouMean.length > 0 && <OfficialCibrcAnswerPanel answer={official} onPick={onType} />}
            <ScanResult
              key={scans}
              result={result}
              account={account}
              onPhoto={() => setMode('photo')}
              officialTotal={official?.total ?? 0}
              isChecking={isChecking}
              hasCompletedSearch={hasCompletedSearch}
            />
            {/* A fertiliser: the Government's standard is in its Order; KashRoot shows none it has not read from the Government's own file. */}
            {typedNow.kind === 'name' && typedNow.text.length >= 3 && official?.total === 0 && fcoTypeOf(typedNow.text) && (
              <p className="rounded-2xl bg-sky-50 p-4 text-sm text-slate-800 ring-1 ring-sky-200">
                <strong className="text-sky-950">Fertiliser.</strong> The Government’s standard for a fertiliser is in Schedule I of the Fertiliser (Inorganic, Organic or Mixed) (Control) Order, 1985, as amended, published in the Gazette of India (<a href="https://egazette.gov.in" target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-800 underline">egazette.gov.in</a>). KashRoot shows only what it has read from the Government’s own files: below is what data.gov.in publishes about “{typedNow.text}”.
              </p>
            )}
            {/* What the Government's open-data portal publishes about the word typed (read live with the site's key). */}
            {liveQuery && <DataGovPanel key={liveQuery} query={liveQuery} />}
          </div>
        </div>
      )}

      {mode === 'lab' && (
        <div className="mt-5">
          {/* Input row — never disabled, never blocked by loading */}
          <div className="flex gap-2">
            <label className="block text-sm font-medium text-slate-800" htmlFor="fco-type">Fertiliser type</label>
            <input
              id="fco-type"
              value={fcoQuery}
              placeholder="e.g. DAP, Urea, MOP, SSP"
              onChange={(e) => {
                const v = e.target.value.trim();
                setFcoQuery(v);
                setValues({});
                // Looked up in the embedded lists (no network); the first keystroke fetches them, the rest answer at once.
                void loadRegistry()
                  .then((r) => {
                    const embedded = r.fcoLookupEmbedded(v);
                    setFcoStandard(embedded ?? null);
                    if (!embedded && v.length > 0) {
                      // Live fallback in background without blocking UI
                      void r.fcoLookupMerged(v)
                        .then((s) => setFcoStandard(s ?? null))
                        .catch(() => setFcoStandard(null));
                    }
                  })
                  .catch(() => setFcoStandard(null));
              }}
              className={`${INPUT} mt-1.5 flex-1`}
            />
          </div>

          {/* Quick-select pills */}
          <div className="flex flex-wrap gap-2 mt-3">
            <p className="text-xs text-slate-500 mb-1">Quick select:</p>
            {[
              'IFFCO Urea',
              'IFFCO DAP',
              'Nano Urea',
              'MOP',
              'SOP',
              'SSP',
              'NPK 19:19:19',
              'NPK 12:32:16',
              'Calcium Nitrate',
              'Boron 20%',
              'Zinc Sulphate 21%',
              'YaraLiva Nitrabor',
            ].map((pill) => (
              <button
                key={pill}
                type="button"
                onClick={() => {
                  setFcoQuery(pill);
                  setValues({});
                  void loadRegistry()
                    .then((r) => setFcoStandard(r.fcoLookupEmbedded(pill) ?? null))
                    .catch(() => setFcoStandard(null));
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition"
              >
                {pill}
              </button>
            ))}
          </div>

          {/* Results — render immediately once fcoStandard is set */}
          {standard && report ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {report.rows.map((r) => (
                  <label key={r.key} className="block text-sm">
                    <span className="font-medium text-slate-800">{r.label}</span>
                    <span className="ms-1 text-xs text-slate-500">({r.min !== null ? `min ${r.min}%` : `max ${r.max}%`})</span>
                    <span className="relative mt-1.5 block">
                      <input type="number" inputMode="decimal" step="0.01" min={0} max={100} value={values[r.key] ?? ''} onChange={(e) => setValues({ ...values, [r.key]: e.target.value })} placeholder="Lab value %" className={`${INPUT} pr-10`} />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                        {r.verdict === 'pass' && <CheckCircle2 className="h-5 w-5 text-forest" aria-label="Meets FCO" />}
                        {r.verdict === 'fail' && <XCircle className="h-5 w-5 text-rose-600" aria-label="Fails FCO" />}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {report.rows.some((r) => r.verdict !== 'missing') && (
                <p aria-live="polite" className={`mt-4 rounded-2xl p-4 text-sm font-medium ring-1 ${report.pass ? 'bg-forest-soft text-forest-deep ring-forest-line' : 'bg-rose-50 text-rose-900 ring-rose-200'}`}>
                  {report.pass
                    ? report.complete
                      ? 'Every tested value meets the Fertiliser (Control) Order minimums.'
                      : 'Values entered so far meet the FCO — enter the rest for a full check.'
                    : 'Below FCO standard. Keep the bag and bill, and take the lab report to your district agriculture office.'}
                </p>
              )}
              <p className="mt-3 text-xs text-slate-500">Standard: {standard.fco_schedule_clause ? `${standard.fco_schedule_clause} — ` : ''}Fertiliser (Control) Order, 1985, Schedule I{standard.reference ? ' (typed by KashRoot — check the gazette)' : ''}. Source: {standard.source}, published {new Date(standard.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. A state fertiliser quality control lab report is the legal test.</p>

              {/* Authorised registered manufacturer */}
              {(standard.manufacturerCompany || standard.brandName) && (
                <div className="mt-4 rounded-xl bg-forest-soft p-3 text-sm text-slate-800 ring-1 ring-forest-line">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-forest-deep mb-1">Authorised Registered Manufacturer</p>
                  <p className="font-medium">{standard.manufacturerCompany}</p>
                  {standard.brandName && standard.brandName !== standard.manufacturerCompany && (
                    <p className="text-xs text-slate-600">Brand: {standard.brandName}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Type a fertiliser type (e.g. DAP, Urea, MOP) to load its FCO Schedule I standard.</p>
          )}
        </div>
      )}
      {mode === 'bagChecklist' && (
        <div className="mt-5">
          <BagMarkingChecklist
            productName={bagChecklistProduct}
            onLabTest={() => {
              void fetch('/api/lab-test/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  productType: 'fertilizer',
                  productName: bagChecklistProduct,
                  reason: 'bag_marking_fail',
                  district: '',
                  farmerName: '',
                  farmerPhone: '',
                }),
              });
            }}
            onClose={() => setMode('photo')}
          />
        </div>
      )}


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
      <button type="submit" disabled={busy} className="mt-3 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-chinar px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-chinar-hover disabled:opacity-60 sm:w-auto">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ShieldCheck className="h-5 w-5" aria-hidden />} {busy ? 'Checking…' : 'Check'}
      </button>
    </form>
  );
}

/** Under the box: which official lists TrueScan reads, with the date printed on each. */
function ListsHeld({ stats }: { stats: RegistryStats | null | undefined }) {
  const l = CIBRC_META.lists;
  const parts = [
    `Official CIB&RC lists (ppqs.gov.in): ${count(l.pesticides.count)} registered pesticides and ${count(l.formulations.count)} formulations (as on ${l.pesticides.as_on}); ${count(l.banned.banned + l.banned.banned_for_export_only + l.banned.withdrawn + l.banned.refused)} banned, withdrawn or refused and ${count(l.banned.restricted)} restricted (as on ${l.banned.as_on}).`,
  ];
  if (stats && stats.total > 0) parts.push(`${count(stats.total)} more rows imported from the Government's own files.`);
  return <p id="truescan-lists" className="mt-2 text-xs text-slate-600">{parts.join(' ')}</p>;
}

/** The official-list answer for one product, in one sentence, with its source and date. */
const DETAIL_LABEL: Record<string, string> = { brand: 'Brand', formulation: 'Formulation', valid_until: 'Valid until', registered_on: 'Registered on', grade: 'Grade', category: 'Category' };
/** The Government's own column heading as a label ("crop" → "Crop"). */
const detailLabel = (key: string) => DETAIL_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);

function HitLine({ hit, strong = false }: { hit: OfficialHit; strong?: boolean }) {
  // Every column the Government's file has for this product (crop, pest, dose, validity…), under the file's own heading.
  const extra = Object.entries(hit.details ?? {}).filter(([, v]) => typeof v === 'string' && v.trim());
  return (
    <div>
      <p className={strong ? 'text-base text-slate-900' : 'text-slate-900'}>
        <strong>{hit.name}</strong>
        {hit.registration_no ? <>, registration <span className="break-all font-semibold">{hit.registration_no}</span></> : null}.
      </p>
      {(hit.registrant || extra.length > 0) && (
        <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-xs text-slate-700 sm:grid-cols-[9rem_1fr]">
          {hit.registrant && (
            <>
              <dt className="font-semibold text-slate-800">Registered by (company)</dt>
              <dd>{hit.registrant}</dd>
            </>
          )}
          {extra.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-slate-800">{detailLabel(k)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-xs text-slate-600">
        Source:{' '}
        <a href={hit.source_url} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-800 underline">{hit.source}</a>, updated {day(hit.imported_at)}.
      </p>
    </div>
  );
}

/** Whether imported official rows exist on this site, and when the newest was imported. */
function listsFor(stats: RegistryStats | null) {
  return { last: stats?.last_import ?? null, held: (stats?.total ?? 0) > 0 };
}

function ScanResult({ result, account, onPhoto, officialTotal, isChecking, hasCompletedSearch }: { result: Scan; account: Account | null; onPhoto: () => void; officialTotal: number; isChecking: boolean; hasCompletedSearch: boolean }) {
  const [all, setAll] = useState(false);
  if (result.state === 'idle') return null;
  if (result.state === 'loading') return <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the official lists…</p>;
  if (result.state === 'error') return <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{result.message}</p>;

  const { typed, hits, stats, dealer } = result;
  const byNumber = (hits ?? []).filter((h) => h.matched === 'registration');
  const byName = (hits ?? []).filter((h) => h.matched === 'name');
  const lists = listsFor(stats);
  const shownNames = all ? byName : byName.slice(0, 5);
  // "Not in the official lists" is said only when none of the official sources had a match and every check has finished.
  const matches = byNumber.length + byName.length + officialTotal;

  return (
    <div className="space-y-3 text-sm">
      {typed.kind === 'batch' && (
        <div className="rounded-2xl bg-slate-50 p-4 text-slate-800 ring-1 ring-slate-200">
          <p className="flex items-center gap-2 font-semibold text-slate-900"><ScanLine className="h-5 w-5 shrink-0" aria-hidden /> {typed.text.toUpperCase()} looks like a batch number</p>
          <p className="mt-1">The Government of India publishes no list of batch numbers, so no website — KashRoot included — can confirm a batch number.</p>
          <p className="mt-1">To check the product itself, type its <strong>registration number (CIR-…)</strong> or its <strong>name</strong> from the label, or photograph the label.</p>
          <button type="button" onClick={onPhoto} className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-chinar px-4 py-2 font-semibold text-white hover:bg-chinar-hover">
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
        <section key={`${h.source}|${h.registration_no}|${h.name}|${i}`} aria-label={isReference(h) ? 'Found in KashRoot’s reference list' : 'Found in the official list'} className={isReference(h) ? 'rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200' : 'rounded-2xl bg-forest-soft p-4 ring-1 ring-forest-line'}>
          {isReference(h)
            ? <p className="flex items-center gap-2 text-base font-semibold text-amber-950"><FileQuestion className="h-5 w-5 shrink-0 text-amber-700" aria-hidden /> {REFERENCE_HEADING}</p>
            : <p className="flex items-center gap-2 text-base font-semibold text-forest-deep"><BadgeCheck className="h-5 w-5 shrink-0" aria-hidden /> {REGISTERED[h.kind]}</p>}
          <div className="mt-1"><HitLine hit={h} strong /></div>
          <p className="mt-2 text-xs text-forest-pine">A fake can copy a real number. Check that the company on the label is exactly the same, and buy only with a bill.</p>
        </section>
      ))}

      {byName.length > 0 && (
        <section aria-label={byName.every(isReference) ? 'Found by name in KashRoot’s reference list' : 'Found by name in the official list'} className={byName.every(isReference) ? 'rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200' : 'rounded-2xl bg-forest-soft/70 p-4 ring-1 ring-forest-line'}>
          {byName.every(isReference)
            ? <p className="flex items-center gap-2 text-base font-semibold text-amber-950"><FileQuestion className="h-5 w-5 shrink-0 text-amber-700" aria-hidden /> Found by name in KashRoot’s reference list</p>
            : <p className="flex items-center gap-2 text-base font-semibold text-forest-deep"><BadgeCheck className="h-5 w-5 shrink-0" aria-hidden /> Found by name in the Government list</p>}
          <p className="mt-1 text-slate-800">
            {byName.length === 1 ? `One ${byName.every(isReference) ? 'listed' : 'registered'} product has this name.` : `${byName.length === 20 ? '20 or more' : byName.length} ${byName.every(isReference) ? 'listed' : 'registered'} products have this name.`} The company and the registration number on your label must match {byName.length === 1 ? 'it' : 'one of these'}.
            {byName.every(isReference) && ' This list was typed in by KashRoot and has not been checked against the official register: confirm the number on ppqs.gov.in.'}
          </p>
          <ul className="mt-3 space-y-3">
            {shownNames.map((h, i) => (
              <li key={`${h.source}|${h.registration_no}|${h.name}|${i}`} className="rounded-xl bg-white/80 p-3 ring-1 ring-forest-soft">
                <p className={`text-xs font-semibold uppercase tracking-wider ${isReference(h) ? 'text-amber-900' : 'text-forest-deep'}`}>{isReference(h) ? REFERENCE_HEADING : REGISTERED[h.kind]}</p>
                <HitLine hit={h} />
              </li>
            ))}
          </ul>
          {byName.length > shownNames.length && (
            <button type="button" onClick={() => setAll(true)} className="mt-3 min-h-11 cursor-pointer rounded-xl bg-white px-4 py-2 font-semibold text-forest-deep ring-1 ring-forest-line hover:bg-forest-soft">
              Show all {byName.length}
            </button>
          )}
          {byName.length === 20 && all && <p className="mt-2 text-xs text-slate-600">Only the first 20 are shown: type more of the name, or the company, to narrow it down.</p>}
        </section>
      )}

      {hasCompletedSearch && !isChecking && matches === 0 && typed.kind !== 'batch' ? (
        <section aria-label="Not in the official lists" className="rounded-2xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-base font-semibold"><CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> Not found in the official lists TrueScan reads</p>
          <p className="mt-1">{typed.kind === 'registration' ? 'The CIB&RC lists name chemicals and formulations; they do not carry registration numbers. Check this number on ppqs.gov.in. ' : 'A brand name is not in these lists: type the active ingredient printed on the label, for example “Mancozeb 75% WP”. '}{ASK}{' '}<a href={CIBRC_META.page} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-2">Brand and company: the Government’s registered-products page ↗</a></p>
          <p className="mt-2 text-xs text-amber-900">Looked in the CIB&amp;RC registered, banned, restricted, household and locust lists{lists.held ? ` and ${stats?.total.toLocaleString('en-IN')} rows imported from the Government's own files (newest ${day(lists.last)})` : ''}. Check that you typed it exactly as printed.</p>
        </section>
      ) : null}

      {/* A dealer's record has its own "Report as suspicious". */}
      {dealer?.state !== 'found' && <ReportBatch code={typed.text} account={account} />}
    </div>
  );
}

/** A batch a dealer listed on KashRoot (fertilizer_batches) — extra information, not a Government list. */
function DealerRecord({ row, account }: { row: BatchRow; account: Account | null }) {
  const expired = row.expiry_date && row.expiry_date < new Date().toISOString().slice(0, 10);
  const good = row.dealer_verified && !expired && row.reports === 0;
  return (
    <div className={`rounded-2xl p-4 ring-1 ${good ? 'bg-forest-soft ring-forest-line' : 'bg-amber-50 ring-amber-200'}`}>
      <p className={`flex items-center gap-2 font-semibold ${good ? 'text-forest-deep' : 'text-amber-900'}`}>
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
  if (state === 'sent') return <p className="mt-3 text-sm font-semibold text-forest-deep">Reported to the KashRoot admin. Thank you. Please also tell your district agriculture officer.</p>;
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

/** The real steps of a label scan, shown as live progress while the backend works. */
const SCAN_STAGES = [
  'Optimizing label image…',
  'Matching CIB&RC & FCO 1985 registry…',
  'Completing authenticity report…',
] as const;

function LabelPhoto({ account }: { account: Account | null }) {
  const [lang, setLang] = useState<SpeechLang>('en');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<LabelReading | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [regCheck, setRegCheck] = useState<RegCheck>({ state: 'idle' });
  const [error, setError] = useState<string | null>(null);
  // Real step-by-step scan progress: 1..3 (SCAN_STAGES); 0 = idle.
  const [stage, setStage] = useState(0);
  // Aborts a stuck /api/label request so the UI can never freeze.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const [langFrom, setLangFrom] = useState<Account | null>(null);
  if (account !== langFrom) {
    setLangFrom(account);
    if (account?.lang) setLang(account.lang);
  }

  /** The registration number on a pesticide label, looked up in the official list. */
  const checkRegistration = async (no: string) => {
    setRegCheck({ state: 'loading' });
    try {
      const [hits, statsResult] = await Promise.all([searchRegistry(no), registryStats().catch(() => null)]);
      setRegCheck({ state: 'done', no, hits, stats: statsResult });
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
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    // The UI never freezes: if the backend has not answered within 30 s the
    // request is abandoned with an honest message (slow-network safe).
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      setStage(1);
      // Client-side downscale first: a 10 MB phone photo becomes ~110 KB here,
      // before any upload — the single biggest latency win.
      const fast = await compressImageForFastScan(file, 1024, 0.82);
      const image = fast.base64DataUrl;
      setPhoto(image);
      setStage(2);
      const res = await fetch('/api/label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo: image, lang }), signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The label could not be read.');
      const r = data as LabelReading;
      setReading(r);
      setStage(3);
      const reg = r.registration_no?.trim();
      const checks: Promise<void>[] = [];
      if (reg && reg.length >= 3 && (r.product_type === 'pesticide' || /cir/i.test(reg))) checks.push(checkRegistration(reg));
      if (r.batch_code) {
        setLookup({ state: 'loading' });
        checks.push(lookupBatch(r.batch_code).then(setLookup));
      }
      await Promise.all(checks);
    } catch (err) {
      if (controller.signal.aborted) setError('The label check took too long and was stopped. Please try again.');
      else setError(offline(err));
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
      setBusy(false);
      setStage(0);
    }
  };

  const rtl = isRtl(lang) ? 'rtl' : undefined;

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <LangPicker value={lang} onChange={setLang} />
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-forest-line bg-forest-soft/60 p-6 text-center text-forest-deep hover:bg-forest-soft">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview
          <img src={photo} alt="Label photo" className="max-h-48 rounded-xl object-contain" />
        ) : (
          <Camera className="h-9 w-9" aria-hidden />
        )}
        <span className="font-semibold">{busy ? 'Reading the label…' : photo ? 'Take another photo' : 'Photograph the label on the bag or bottle'}</span>
        <span className="text-xs text-forest-deep">The side with the batch number, dates and registration number</span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => void read(e.target.files?.[0])} />
      </label>
      {busy && (
        <div role="status" aria-live="polite" className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <ol className="space-y-2 text-sm">
            {SCAN_STAGES.map((label, i) => {
              const n = i + 1;
              const done = stage > n;
              const active = stage === n;
              return (
                <li key={label} className={`flex items-center gap-2 ${done ? 'text-forest' : active ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <CircleAlert className="h-4 w-4 shrink-0 opacity-40" aria-hidden />
                  )}
                  {n}. {label}
                </li>
              );
            })}
          </ol>
        </div>
      )}
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
      <section aria-label="Registration number in the official list" className="rounded-xl bg-forest-soft p-3 text-sm ring-1 ring-forest-line">
        <p className="flex items-center gap-2 font-semibold text-forest-deep"><BadgeCheck className="h-5 w-5 shrink-0" aria-hidden /> {REGISTERED[hit.kind]}</p>
        <div className="mt-1"><HitLine hit={hit} /></div>
        <p className="mt-1 text-xs text-forest-pine">Check that the company on the label is exactly the same — a fake can copy a real number.</p>
      </section>
    );
  }
  const lists = listsFor(check.stats);
  if (check.hits !== null && lists.held) {
    return (
      <section aria-label="Registration number not in the official list" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
        <p className="flex items-center gap-2 font-semibold"><CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> Registration {check.no}: not in the official list KashRoot holds (updated {day(lists.last)})</p>
        <p className="mt-1">It may be very new — or fake. {ASK} If the photo was unclear, type the number in “Registration / batch”.</p>
      </section>
    );
  }
  return <p className="text-xs text-slate-500">Registration {check.no} could not be checked here: no official list of registration numbers has been loaded on this site. Check it on ppqs.gov.in. {ASK}</p>;
}

const RULE_ICON = { ok: CheckCircle2, missing: XCircle, problem: XCircle, caution: CircleAlert } as const;
const RULE_COLOUR = { ok: 'text-forest', missing: 'text-amber-600', problem: 'text-rose-600', caution: 'text-amber-600' } as const;
const VERDICT = {
  good: { text: 'The label has everything the law requires', box: 'bg-forest-soft ring-forest-line text-forest-pine' },
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
