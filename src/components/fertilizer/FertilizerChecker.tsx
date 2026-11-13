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
import { BadgeCheck, Camera, CheckCircle2, CircleAlert, Copy, FileQuestion, Flag, FlaskConical, Loader2, QrCode, ScanLine, ShieldCheck, XCircle } from 'lucide-react';

import { LangPicker, SpeakButton } from '@/components/voice/VoiceButtons';
import { checkLabel, type LabelFacts, type RuleReport } from '@/lib/fertilizer/labelRules';
import { readTyped, type Typed } from '@/lib/fertilizer/trueScan';
import { compressImageForFastScan } from '@/lib/fastImageCompress';
import { isRtl, type SpeechLang } from '@/lib/client/speech';
import { classifyFetchError } from '@/lib/onlineFirstClient';
import { dbMessage, loadAccount, supabase, supabaseConfigured, type Account } from '@/lib/db/client';
import { searchRegistry, type OfficialHit, type OfficialKind } from '@/lib/db/registry';
import type { FcoStandard, CibrcProduct, CibrcBanned } from '@/lib/db/govRegistry';
import {
  cibrcLookupRegistered,
  cibrcLookupBanned,
  fcoLookupEmbedded,
  fcoLookupMerged,
  agroRegistryStats,
  searchAllEmbedded,
  type AgroRegistryStats,
  type SearchHit,
} from '@/lib/gov-agro-registry';
import { reportBatch } from '@/lib/db/security';
import { skuastLookup, skuastLookupAll, type SkuastRecommendation } from '@/lib/skuast-kashmir-recommendations';

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

/** What TrueScan found for what was typed. `hits` and `stats` are null when the lists are not set up on this site. */
type Scan =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'done'; typed: Typed; hits: OfficialHit[] | null; stats: AgroRegistryStats | null; dealer?: Lookup };

/** A registration number read from the label photo, looked up in the official list. */
type RegCheck = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; no: string; hits: OfficialHit[] | null; stats: AgroRegistryStats | null };

const INPUT = 'block w-full rounded-xl border-0 bg-white px-4 py-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-700';
const ASK = 'Ask the dealer for the registration certificate, or ask your agriculture officer.';

/** "26 Oct 2026" */
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const count = (n: number) => n.toLocaleString('en-IN');
/** "1 product", "1,234 products" */
const products = (n: number) => `${count(n)} product${n === 1 ? '' : 's'}`;
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

/** Everything TrueScan can say about what was typed — all looked up at once. */
/** Convert an embedded SearchHit into an OfficialHit for the UI. */
function toOfficialHit(h: SearchHit): OfficialHit {
  return {
    kind: (h.kind === 'fco' ? 'fertiliser' : 'pesticide') as OfficialKind,
    name: h.brandName ?? h.productName ?? h.active_molecule ?? h.fertiliser_type ?? 'Unknown',
    registration_no: h.cir_no ?? null,
    registrant: h.legalManufacturer ?? h.manufacturerCompany ?? h.manufacturer ?? null,
    details: {},
    source: h.source,
    source_url: h.source_url,
    imported_at: new Date().toISOString(),
    matched: 'name',
  };
}

async function scan(raw: string): Promise<Scan> {
  const typed = readTyped(raw);
  if (!typed.text) return { state: 'error', message: 'Type what is printed on the label: the registration number (CIR-…), the product name, or the batch number.' };
  if (typed.text.length < 2) return { state: 'error', message: `“${typed.text}” is too short. Type the whole registration number, product name or batch number.` };
  try {
    // ── Primary: embedded search — always works, fuzzy/typo-tolerant ──
    const embeddedHits = searchAllEmbedded(typed.text).map(toOfficialHit);

    // ── Supplementary: Supabase registry (if configured) ──
    let supabaseHits: OfficialHit[] | null = null;
    if (supabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('kr_registry_search', { p_text: typed.text.slice(0, 200) });
        if (!error && data) {
          supabaseHits = ((data ?? []) as OfficialHit[]).map((h) => ({ ...h, details: h.details ?? {} }));
        }
      } catch {
        // ignore Supabase errors — embedded data is authoritative
      }
    }

    // ── Merge: embedded first, then Supabase (dedup by kind + name) ──
    const merged: OfficialHit[] = [];
    const seen = new Set<string>();
    const add = (h: OfficialHit) => {
      const key = `${h.kind}:${(h.name ?? '').toLowerCase()}`;
      if (!seen.has(key)) { seen.add(key); merged.push(h); }
    };
    for (const h of embeddedHits) add(h);
    for (const h of (supabaseHits ?? [])) add(h);

    const [statsResult, dealer] = await Promise.all([
      agroRegistryStats(),
      typed.kind === 'batch' && typed.text.length >= 3 ? lookupBatch(typed.text) : Promise.resolve(undefined),
    ]);
    return { state: 'done', typed, hits: merged, stats: statsResult, dealer };
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
  // undefined: not read yet; null: the official lists are not set up on this site.
  const [stats, setStats] = useState<AgroRegistryStats | null | undefined>(undefined);
  // Live FCO standard for the lab tab: null when not set up or not yet fetched.
  const [fcoStandard, setFcoStandard] = useState<FcoStandard | null | undefined>(undefined);
  // Dedicated input state for the Lab tab — never disabled during loading
  const [fcoQuery, setFcoQuery] = useState('');
  // Lab values entered for the loaded FCO standard, keyed by parameter key.
  const [values, setValues] = useState<Record<string, string>>({});
  // CIBRC check results for what was typed / photographed.
  const [cibrcResult, setCibrcResult] = useState<{ products: CibrcProduct[] | null; banned: CibrcBanned[] | null } | null>(null);
  // SKUAST-Kashmir official recommendations for matched molecules.
  const [skuastResult, setSkuastResult] = useState<SkuastRecommendation[] | null>(null);
  // Synchronous (0ms) guard: true while the async /api/truescan fetch is in flight.
  // Prevents the yellow "not in the official list" box from flashing before embedded
  // CIBRC/Banned/FCO/SKUAST-K results are rendered.
  const [isChecking, setIsChecking] = useState(false);
  // True once a check has fully completed (sync embedded + async API).
  const [hasCompletedSearch, setHasCompletedSearch] = useState(false);
  // Browse official register modal
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseQuery, setBrowseQuery] = useState('');
  const [browseResults, setBrowseResults] = useState<SearchHit[] | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
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
    if (id === 'registry' && stats === undefined) setStats(agroRegistryStats());
    if (id === 'lab') {
      // Load FCO standards synchronously (0ms) from embedded registry —
      // never block on a slow or failing network fetch.
      if (fcoStandard === undefined) {
        const embedded = fcoLookupEmbedded('Diammonium phosphate (DAP)', '18:46:0');
        setFcoStandard(embedded ?? null);
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
  const check = async () => {
    setIsChecking(true);
    setHasCompletedSearch(false);
    setResult({ state: 'loading' });
    setCibrcResult(null);
    setSkuastResult(null);

    const typed = readTyped(code);

    // ── Synchronous embedded lookup (0ms) ──
    // Run immediately against the embedded CIBRC + Banned + SKUAST-K registries
    // so results appear the instant "Check" is clicked — no loading flash.
    if (typed.text && typed.text.length >= 3) {
      const products = cibrcLookupRegistered(undefined, typed.text);
      const banned = cibrcLookupBanned(typed.text);
      setCibrcResult({ products, banned });

      const molecules = products.map((p) => p.active_molecule).filter(Boolean);
      const bannedMolecules = banned.map((b) => b.active_molecule).filter(Boolean);
      const allMolecules = [...new Set([...molecules, ...bannedMolecules])];
      if (allMolecules.length > 0) {
        const skuast = skuastLookupAll(allMolecules);
        setSkuastResult(skuast.length > 0 ? skuast : null);
      }
    }

    // ── Async API call (background, ~1s) ──
    const r = await scan(code);
    if (r.state === 'done') setStats(r.stats);
    setScans((n) => n + 1);
    setResult(r);

    setIsChecking(false);
    setHasCompletedSearch(true);
  };

  const runBrowseSearch = async (q: string) => {
    if (!q || q.trim().length < 2) {
      setBrowseResults(null);
      return;
    }
    setBrowseLoading(true);
    try {
      // Try the API route first (embedded + live data.gov.in fallback)
      const res = await fetch(`/api/truescan/directory?q=${encodeURIComponent(q.trim())}`, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setBrowseResults(data.results ?? []);
      } else {
        // Fallback to embedded search only
        setBrowseResults(searchAllEmbedded(q.trim()));
      }
    } catch {
      setBrowseResults(searchAllEmbedded(q.trim()));
    } finally {
      setBrowseLoading(false);
    }
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
          <RegistryForm code={code} setCode={setCode} busy={result.state === 'loading'} onCheck={() => void check()} onBrowse={() => setBrowseOpen(true)} />
          <ListsHeld stats={stats} fcoAvailable={fcoStandard !== null && fcoStandard !== undefined} />
          <div aria-live="polite" className="mt-4">
            <ScanResult
              key={scans}
              result={result}
              account={account}
              onPhoto={() => setMode('photo')}
              onLab={() => setMode('lab')}
              standard={fcoStandard}
              cibrcResult={cibrcResult}
              skuastResult={skuastResult}
              isChecking={isChecking}
              hasCompletedSearch={hasCompletedSearch}
            />
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
                // Synchronous (0ms) lookup from embedded registry — never blocked on network
                const embedded = fcoLookupEmbedded(v);
                setFcoStandard(embedded ?? null);
                if (!embedded && v.length > 0) {
                  // Live fallback in background without blocking UI
                  void fcoLookupMerged(v)
                    .then((s) => setFcoStandard(s ?? null))
                    .catch(() => setFcoStandard(null));
                }
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
                  const embedded = fcoLookupEmbedded(pill);
                  setFcoStandard(embedded ?? null);
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
              <p className="mt-3 text-xs text-slate-500">Standard: {standard.fco_schedule_clause} — Fertiliser (Control) Order, 1985, Schedule I. Source: {standard.source}, published {new Date(standard.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. A state fertiliser quality control lab report is the legal test.</p>

              {/* Authorised registered manufacturer */}
              {(standard.manufacturerCompany || standard.brandName) && (
                <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-slate-800 ring-1 ring-emerald-200">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-1">Authorised Registered Manufacturer</p>
                  <p className="font-medium">{standard.manufacturerCompany}</p>
                  {standard.brandName && standard.brandName !== standard.manufacturerCompany && (
                    <p className="text-xs text-slate-600">Brand: {standard.brandName}</p>
                  )}
                </div>
              )}

              {/* SKUAST-Kashmir official dosage */}
              {standard.skuast_kashmir_dosage && (
                <div className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm text-slate-800 ring-1 ring-indigo-200">
                  <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-indigo-800 mb-1">SKUAST-Kashmir Official Dosage</p>
                  <p className="font-medium">{standard.skuast_kashmir_dosage}</p>
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

      {!compact && <OfficialChecks />}

      {/* Browse official register panel */}
      {browseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setBrowseOpen(false)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl ring-1 ring-black/10 p-6 overflow-y-auto mx-4 sm:mx-6 lg:mx-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Official Govt-Approved CIBRC & FCO Register</h2>
              <button
                type="button"
                onClick={() => setBrowseOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <XCircle className="h-6 w-6" aria-hidden />
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Search the register</label>
              <input
                id="browse-search"
                value={browseQuery}
                onChange={(e) => {
                  setBrowseQuery(e.target.value);
                  void runBrowseSearch(e.target.value);
                }}
                placeholder="e.g. Dodine, Mancozeb, Urea, DAP, Apple Scab…"
                className={`${INPUT} w-full`}
              />
              {browseLoading && (
                <p className="mt-1 text-xs text-slate-500"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Searching…</p>
              )}
            </div>
            <div>
              {browseResults === null ? (
                <p className="text-sm text-slate-500">Type above to search the official CIBRC registered pesticides, banned chemicals, and FCO 1985 fertiliser standards.</p>
              ) : browseResults.length === 0 ? (
                <p className="text-sm text-slate-500">No official records match your search.</p>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    {browseResults.length} official record{browseResults.length === 1 ? '' : 's'}
                  </p>
                  <div className="space-y-2">
                    {browseResults.map((h, i) => (
                      <div key={`${h.kind}-${h.active_molecule || h.fertiliser_type}-${i}`} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                        {h.kind === 'registered' && (
                          <>
                            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                              CIB&RC Registered
                            </p>
                            <p className="text-sm font-semibold text-slate-900">{h.active_molecule}</p>
                            {h.cir_no && <p className="text-xs text-slate-600">{h.cir_no}</p>}
                            {h.formulation && <p className="text-xs text-slate-600">{h.formulation}</p>}
                            {(h.approved_crops ?? []).length > 0 && (
                              <p className="text-xs text-slate-600">Approved crops: {(h.approved_crops ?? []).join(', ')}</p>
                            )}
                            {(h.target_pests ?? []).length > 0 && (
                              <p className="text-xs text-slate-600">Targets: {(h.target_pests ?? []).join(', ')}</p>
                            )}
                            {h.waiting_period_days !== null && (
                              <p className="text-xs text-slate-600">Waiting period: {h.waiting_period_days} days</p>
                            )}
                            <p className="text-xs text-slate-500 mt-1">Source: {h.source}</p>
                          </>
                        )}
                        {h.kind === 'banned' && (
                          <>
                            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-rose-700">
                              CIB&RC Banned / Restricted
                            </p>
                            <p className="text-sm font-semibold text-slate-900">{h.active_molecule}</p>
                            <p className="text-xs text-rose-600">Status: {h.status}</p>
                            {h.reason_summary && <p className="text-xs text-slate-600">Reason: {h.reason_summary}</p>}
                            <p className="text-xs text-slate-500 mt-1">Source: {h.source}</p>
                          </>
                        )}
                        {h.kind === 'fco' && (
                          <>
                            <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-sky-700">
                              FCO 1985 Schedule I
                            </p>
                            <p className="text-sm font-semibold text-slate-900">{h.fertiliser_type}</p>
                            <p className="text-xs text-slate-600">Grade: {h.grade}</p>
                            {h.total_n_min !== null && <p className="text-xs text-slate-600">Total N (min): {h.total_n_min}%</p>}
                            {h.ws_p2o5_min !== null && <p className="text-xs text-slate-600">P₂O₅ (min): {h.ws_p2o5_min}%</p>}
                            {h.ws_k2o_min !== null && <p className="text-xs text-slate-600">K₂O (min): {h.ws_k2o_min}%</p>}
                            {h.micronutrient_min !== null && <p className="text-xs text-slate-600">Micronutrient (min): {h.micronutrient_min}%</p>}
                            {h.moisture_max !== null && <p className="text-xs text-slate-600">Moisture (max): {h.moisture_max}%</p>}
                            <p className="text-xs text-slate-500 mt-1">Source: {h.source}</p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One big box for whatever is printed on the label. Codes are mostly
 * numbers, so a tap switches the phone to its number keypad and back.
 */
function RegistryForm({ code, setCode, busy, onCheck, onBrowse }: { code: string; setCode: (v: string) => void; busy: boolean; onCheck: () => void; onBrowse: () => void }) {
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
      <button type="button" onClick={onBrowse} className="mt-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-slate-800 shadow-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50 sm:w-auto">
        <FileQuestion className="h-5 w-5" aria-hidden />
        Browse Official Govt-Approved CIBRC & FCO Register
      </button>
    </form>
  );
}

/** Under the box: which official lists KashRoot holds, and how fresh they are. */
function ListsHeld({ stats, fcoAvailable }: { stats: AgroRegistryStats | null | undefined; fcoAvailable: boolean }) {
  if (stats === undefined && !fcoAvailable) return <p id="truescan-lists" className="sr-only" />;
  const parts: string[] = [];
  if (stats) {
    parts.push(`Synced with official Govt. of India CIBRC (ppqs.gov.in) registered/banned pesticide lists & FCO 1985 Schedule-I statutory fertiliser standards.`);
    parts.push(`CIBRC: ${products(stats.registeredCount)} registered · ${products(stats.bannedCount)} banned/restricted · FCO: ${products(stats.fcoCount)} fertiliser standards.`);
  }
  if (fcoAvailable) {
    parts.push('Fertiliser types checked against the live Fertiliser (Control) Order, 1985 Schedule I standards.');
  }
  return <p id="truescan-lists" className="mt-2 text-xs text-slate-500">{parts.join(' — ')}.</p>;
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
function listsFor(stats: AgroRegistryStats | null, kind: Typed['kind']) {
  const held = stats ? stats.registeredCount > 0 || stats.bannedCount > 0 || stats.fcoCount > 0 : false;
  const last = stats?.lastUpdated ?? null;
  return { kinds: [], last, held };
}

function ScanResult({ result, account, onPhoto, onLab, standard, cibrcResult, skuastResult, isChecking, hasCompletedSearch }: { result: Scan; account: Account | null; onPhoto: () => void; onLab: () => void; standard: FcoStandard | null | undefined; cibrcResult: { products: CibrcProduct[] | null; banned: CibrcBanned[] | null } | null; skuastResult: SkuastRecommendation[] | null; isChecking: boolean; hasCompletedSearch: boolean }) {
  const [all, setAll] = useState(false);
  if (result.state === 'idle') return null;
  if (result.state === 'loading') return <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the official lists…</p>;
  if (result.state === 'error') return <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{result.message}</p>;

  const { typed, hits, stats, dealer } = result;
  const byNumber = (hits ?? []).filter((h) => h.matched === 'registration');
  const byName = (hits ?? []).filter((h) => h.matched === 'name');
  const lists = listsFor(stats, typed.kind);
  const found = byNumber.length + byName.length > 0;
  const shownNames = all ? byName : byName.slice(0, 5);
  // Match counts across ALL sources, used to decide whether to show the
  // "not in the official list" warning. The warning is mutually exclusive:
  // it only renders when NONE of the official sources have a match AND the
  // async check has fully completed (isChecking === false).
  const registeredMatches =
    byNumber.length + byName.length + (cibrcResult?.products?.length ?? 0);
  const bannedMatches = cibrcResult?.banned?.length ?? 0;
  const fcoMatches = standard ? 1 : 0;
  const matchingResults =
    registeredMatches + bannedMatches + fcoMatches + (skuastResult?.length ?? 0);

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

      {standard && (
        <section aria-label="Fertiliser (Control) Order" className="rounded-2xl bg-sky-50 p-4 text-slate-800 ring-1 ring-sky-200">
          <p className="flex items-center gap-2 text-base font-semibold text-sky-950"><ShieldCheck className="h-5 w-5 shrink-0" aria-hidden /> This fertiliser type is specified in the Fertiliser (Control) Order — check the label photo against its standard</p>
          <p className="mt-2 font-semibold">Government standard for {standard.fertiliser_type} ({standard.grade})</p>
          <ul className="mt-1 list-disc ps-5">
            <li key="n">{`Total nitrogen (N): at least ${standard.total_n_min ?? '—'}%`}</li>
            <li key="p">{`Total phosphate (P₂O₅): at least ${standard.ws_p2o5_min ?? '—'}%`}</li>
            <li key="k">{`Water-soluble potash (K₂O): at least ${standard.ws_k2o_min ?? '—'}%`}</li>
            {standard.moisture_max !== undefined && <li key="moisture">{`Moisture: at most ${standard.moisture_max}%`}</li>}
            {standard.biuret_max !== undefined && <li key="biuret">{`Biuret: at most ${standard.biuret_max}%`}</li>}
          </ul>
          <p className="mt-2 text-xs text-slate-600">Fertiliser (Control) Order, 1985, Schedule I — {standard.fco_schedule_clause}. Source: {standard.source}, published {new Date(standard.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. The type being in the Order does not prove a bag is genuine — the label must show it, and only a Government lab test proves what is inside.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onPhoto} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-sky-800 px-4 py-2 font-semibold text-white hover:bg-sky-900">
              <Camera className="h-4 w-4" aria-hidden /> Check the label photo
            </button>
            <button type="button" onClick={onLab} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-sky-900 ring-1 ring-sky-200 hover:bg-sky-100">
              <FlaskConical className="h-4 w-4" aria-hidden /> Compare a lab report
            </button>
          </div>
        </section>
      )}

      {cibrcResult && cibrcResult.products && cibrcResult.products.length > 0 && (
        <section aria-label="CIB&RC registered product" className="rounded-2xl bg-emerald-50 p-4 text-slate-800 ring-1 ring-emerald-200">
          <p className="flex items-center gap-2 text-base font-semibold text-emerald-900"><BadgeCheck className="h-5 w-5 shrink-0" aria-hidden /> Registered with the Government (CIB&RC, ppqs.gov.in)</p>
          {cibrcResult.products.map((p) => {
            const brand = (p.brandNames ?? [])[0] ?? p.active_molecule;
            const legal = p.legalManufacturer ?? p.manufacturer ?? '';
            return (
              <div key={p.id} className="mt-2 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                {/* Anti-scam manufacturer & CIR ID verification header */}
                <div className="mb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Brand / Trade name</span>
                    <span className="text-sm font-semibold text-slate-900">{brand}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Govt. CIBRC registration ID</span>
                    <span className="text-xs font-mono bg-emerald-100 text-emerald-900 px-2 py-1 rounded border border-emerald-200 break-all">{p.cir_no}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(p.cir_no);
                      }}
                      aria-label={`Copy ${p.cir_no}`}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded hover:text-emerald-800"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
                <div className="mb-2 flex items-start gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Sole authorised manufacturer / registrant</span>
                  <span className="text-sm font-semibold text-slate-900">{legal}</span>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800 mb-1">{p.active_molecule}{p.formulation ? ` — ${p.formulation}` : ''}</p>
                {p.approved_crops.length > 0 && <p className="text-xs text-slate-600">Approved crops: {p.approved_crops.join(', ')}</p>}
                {p.target_pests.length > 0 && <p className="text-xs text-slate-600">Targets: {p.target_pests.join(', ')}</p>}
                {p.waiting_period_days !== null && <p className="text-xs text-slate-600">Waiting period: {p.waiting_period_days} days</p>}
                {p.skuast_kashmir_dosage && (
                  <p className="text-xs text-slate-600">SKUAST-Kashmir dose: {p.skuast_kashmir_dosage}</p>
                )}
                {/* Anti-counterfeit warning banner */}
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-amber-900 text-xs font-medium ring-1 ring-amber-200">
                  ⚠️ <strong>SCAM ALERT CHECK:</strong> verify that the manufacturer printed on your bottle is strictly <strong>{legal}</strong> and the CIR number matches <strong>{p.cir_no}</strong>. If another company name or a different CIR number is printed on a bottle sold as <strong>{brand}</strong>, it is counterfeit / unauthorised —{' '}
                  <button type="button" onClick={onPhoto} className="underline underline-offset-2 hover:text-amber-800">re-check the label photo</button> immediately.
                </p>
                <p className="text-xs text-slate-600 mt-1">Source: <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-800 underline">{p.source}</a>, published {new Date(p.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>
              </div>
            );
          })}
        </section>
      )}

      {cibrcResult && cibrcResult.banned && cibrcResult.banned.length > 0 && (
        <section aria-label="CIB&RC banned/restricted" className="rounded-2xl bg-rose-50 p-4 text-slate-800 ring-1 ring-rose-200">
          <p className="flex items-center gap-2 text-base font-semibold text-rose-900"><CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> Banned or restricted pesticide</p>
          {cibrcResult.banned.map((b) => (
            <div key={b.id} className="mt-2 rounded-xl bg-white/80 p-3 ring-1 ring-rose-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-800">{b.active_molecule}</p>
              <p className="text-sm text-slate-900">Status: <span className="font-semibold text-rose-700 capitalize">{b.status}</span>{b.common_name ? ` — ${b.common_name}` : ''}</p>
              {b.ban_date && <p className="text-xs text-slate-600">Ban notification: {b.ban_notification ?? '—'} ({new Date(b.ban_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})</p>}
              {b.reason_summary && <p className="text-xs text-slate-600">Reason: {b.reason_summary}</p>}
              <p className="text-xs text-slate-600 mt-1">Source: <a href={b.source_url} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-800 underline">{b.source}</a>, published {new Date(b.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>
            </div>
          ))}
        </section>
      )}

      {skuastResult && skuastResult.length > 0 && (
        <section aria-label="SKUAST-Kashmir official recommendation" className="rounded-2xl bg-indigo-50 p-4 text-slate-800 ring-1 ring-indigo-200">
          <p className="flex items-center gap-2 text-base font-semibold text-indigo-900">
            <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
            SKUAST-Kashmir Official University Recommendation & Spray Schedule
          </p>
          <p className="mt-1 text-slate-600 text-sm">
            Local dosages per 100 L of water and application timing for Kashmir orchards —
            Directorate of Extension, SKUAST-Kashmir.
          </p>
          <div className="mt-3 space-y-3">
            {skuastResult.map((r) => (
              <div key={r.molecule} className="rounded-xl bg-white p-3 ring-1 ring-indigo-100">
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-indigo-700">
                  {r.molecule}
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {r.formulations.join(', ')}
                </p>
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">SKUAST-K dosage:</span> {r.dosagePer100L}
                </p>
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">Timing:</span> {r.timing.join(', ')}
                </p>
                {r.targets.length > 0 && (
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold">Targets:</span> {r.targets.join(', ')}
                  </p>
                )}
                <p className="text-xs text-slate-600">
                  <span className="font-semibold">Waiting period:</span> {r.waitingPeriodDays} days before harvest
                </p>
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-1">Mixing rules:</p>
                  <ul className="text-xs text-slate-600 list-disc ps-5 space-y-1">
                    {r.mixingRules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </div>
                {r.notes.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 mb-1">Notes:</p>
                    <ul className="text-xs text-slate-600 list-disc ps-5 space-y-1">
                      {r.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-indigo-600">
            Follow product label instructions and SKUAST-K guidelines. Rotate fungicides with
            different modes of action to prevent resistance.
          </p>
        </section>
      )}

      {hasCompletedSearch && !isChecking && registeredMatches === 0 && bannedMatches === 0 && fcoMatches === 0 && typed.kind !== 'batch' && lists.held ? (
        <section aria-label="Not in the official list" className="rounded-2xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-base font-semibold"><CircleAlert className="h-5 w-5 shrink-0" aria-hidden /> Not in the official list KashRoot holds (updated {day(lists.last)})</p>
          <p className="mt-1">It may be very new — or fake. {ASK}</p>
          <p className="mt-2 text-xs text-amber-900">Lists checked: CIBRC registered (${products(stats?.registeredCount ?? 0)}), CIBRC banned/restricted (${products(stats?.bannedCount ?? 0)}), FCO standards (${products(stats?.fcoCount ?? 0)}). Check that you typed it exactly as printed.</p>
        </section>
      ) : null}

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
      const [hits, statsResult] = await Promise.all([searchRegistry(no), agroRegistryStats()]);
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
      {busy && (
        <div role="status" aria-live="polite" className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <ol className="space-y-2 text-sm">
            {SCAN_STAGES.map((label, i) => {
              const n = i + 1;
              const done = stage > n;
              const active = stage === n;
              return (
                <li key={label} className={`flex items-center gap-2 ${done ? 'text-emerald-700' : active ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>
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
  return <p className="text-xs text-slate-500">Registration {check.no} is not in the CIBRC registered list — it may be very new, or fake. {ASK} If the photo was unclear, type the number in &quot;Registration / batch&quot;.</p>;
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
