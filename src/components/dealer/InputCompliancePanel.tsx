'use client';

/**
 * InputCompliancePanel — the Agro-Dealer portal's 2D stock & compliance
 * panel (the fast replacement for the decorative 3D packaging viewer):
 *  - Live stock gauges per product type, from the dealer's real batch list
 *    (no invented numbers; zero stock is shown honestly).
 *  - What a genuine label must carry, by pack: FCO 1985 for fertilizer bags,
 *    CIB&RC / Insecticides Act for pesticide canisters (with the toxicity
 *    colour-band legend), Legal Metrology for machinery crates.
 *  - Batch expiry watch: expired and soon-expiring (<= 60 days) batches,
 *    matching the table below it.
 */
import { AlertTriangle, FlaskConical, PackageCheck, ShieldCheck, TriangleAlert } from 'lucide-react';

import { EmptyState, Panel, PORTAL_THEMES } from '@/components/portal/kit';

const theme = PORTAL_THEMES.dealer ?? PORTAL_THEMES.expert;

export interface PanelBatch {
  id: string;
  name: string;
  batch: string;
  expiry: string;
  stock: number;
  type?: string;
  registered: boolean;
}

/** What a genuine pack's label must carry, by pack type (real Indian rules). */
const LABEL_RULES: { pack: string; badge: string; badgeClass: string; rule: string; reg: string }[] = [
  {
    pack: 'Fertilizer bag',
    badge: 'FCO 1985',
    badgeClass: 'bg-teal-50 text-teal-900 ring-teal-200',
    rule: 'N-P-K percentage, moisture, batch code and expiry must be printed on every bag.',
    reg: 'Fertiliser Control Order 1985 — reg. no. on bag',
  },
  {
    pack: 'Pesticide canister',
    badge: 'CIB&RC',
    badgeClass: 'bg-sky-50 text-sky-900 ring-sky-200',
    rule: 'Toxicity colour band: blue = moderately toxic, yellow = slightly, red = highly, green = low.',
    reg: 'Insecticides Act 1968 — CIB&RC reg. no.',
  },
  {
    pack: 'Machinery crate',
    badge: 'Legal Metrology',
    badgeClass: 'bg-slate-100 text-slate-800 ring-slate-200',
    rule: 'Serial number, warranty card and dealer stamp travel with the crate.',
    reg: 'Legal Metrology — net weight on pack',
  },
];

/** Toxicity colour band legend, as it appears on real canisters. */
const TOXICITY_BANDS: { colour: string; chip: string; label: string }[] = [
  { colour: '#1d4ed8', chip: 'bg-blue-100 text-blue-900', label: 'Blue · moderately toxic' },
  { colour: '#eab308', chip: 'bg-yellow-100 text-yellow-900', label: 'Yellow · slightly toxic' },
  { colour: '#dc2626', chip: 'bg-red-100 text-red-900', label: 'Red · highly toxic' },
  { colour: '#16a34a', chip: 'bg-green-100 text-green-900', label: 'Green · low toxicity' },
];

const TYPE_ROWS: { key: string; label: string }[] = [
  { key: 'fertilizer', label: 'Fertilisers' },
  { key: 'pesticide', label: 'Pesticides & fungicides' },
  { key: 'seed', label: 'Seeds & saplings' },
  { key: 'other', label: 'Other inputs' },
];

const day = (iso: string) => (Number.isNaN(Date.parse(iso)) ? null : Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

export function InputCompliancePanel({ batches }: { batches: PanelBatch[] }) {
  const stockByType = TYPE_ROWS.map(({ key, label }) => {
    const rows = batches.filter((b) => (b.type ?? 'other') === key);
    const units = rows.reduce((s, b) => s + b.stock, 0);
    return { key, label, units, skus: rows.length };
  });
  const totalStock = stockByType.reduce((s, t) => s + t.units, 0);
  const registered = batches.filter((b) => b.registered).length;
  const unregistered = batches.length - registered;
  const expired = batches.filter((b) => (day(b.expiry) ?? 0) < 0);
  const soon = batches.filter((b) => { const d = day(b.expiry); return d !== null && d >= 0 && d <= 60; });
  const maxUnits = Math.max(1, ...stockByType.map((t) => t.units));

  return (
    <Panel theme={theme} title="Stock & label compliance" icon={PackageCheck}>
      {batches.length === 0 ? (
        <EmptyState theme={theme} icon={FlaskConical} title="No batches yet" text="Add a batch or upload a manifest CSV and your stock gauges appear here." />
      ) : (
        <>
          {/* Live stock gauges, straight from the batch list. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {stockByType.map((t) => (
              <div key={t.key} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                <p className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold text-slate-800">{t.label}</span>
                  <span className="tabular-nums text-slate-900"><strong className="text-base">{t.units.toLocaleString('en-IN')}</strong> <span className="text-xs text-slate-500">units · {t.skus} batch{t.skus === 1 ? '' : 'es'}</span></span>
                </p>
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${t.label}: ${t.units} units in stock`}>
                  <span className={`block h-full rounded-full ${t.units === 0 ? 'bg-rose-300' : 'bg-teal-500'}`} style={{ width: `${Math.max(t.units === 0 ? 100 : 6, Math.round((t.units / maxUnits) * 100))}%` }} />
                </span>
                {t.units === 0 && <p className="mt-1 text-xs font-semibold text-rose-700">Out of stock — buyers see nothing to order.</p>}
              </div>
            ))}
          </div>

          {/* Registry + expiry watch. */}
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden /> {registered} batch{registered === 1 ? '' : 'es'} in the authenticity registry
            </p>
            {unregistered > 0 && (
              <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {unregistered} still unregistered — farmers see “unverified”
              </p>
            )}
            {(expired.length > 0 || soon.length > 0) && (
              <p className="flex items-center gap-2 rounded-2xl bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-900 ring-1 ring-rose-200">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                {expired.length > 0 && `${expired.length} expired`}
                {expired.length > 0 && soon.length > 0 && ' · '}
                {soon.length > 0 && `${soon.length} expiring within 60 days`}
              </p>
            )}
          </div>
          {expired.length > 0 && (
            <p className="mt-2 text-xs text-rose-800">
              Expired: {expired.slice(0, 4).map((b) => `${b.name} (${b.batch})`).join(', ')}{expired.length > 4 ? ` +${expired.length - 4} more` : ''} — pull them from sale; selling expired inputs is an offence.
            </p>
          )}
        </>
      )}

      {/* What a genuine label must carry — FCO / CIB&RC / Legal Metrology. */}
      <div className="mt-5 rounded-2xl bg-teal-50/60 p-4 ring-1 ring-teal-100">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-900">What a genuine label must carry</p>
        <ul className="mt-2 space-y-2">
          {LABEL_RULES.map((r) => (
            <li key={r.pack} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                {r.pack}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${r.badgeClass}`}>{r.badge}</span>
              </p>
              <p className="mt-1 text-xs text-slate-700">{r.rule}</p>
              <p className="mt-0.5 text-[11px] font-medium text-teal-800">{r.reg}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs font-semibold text-slate-700">Pesticide toxicity colour band (CIB&RC):</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {TOXICITY_BANDS.map((b) => (
            <li key={b.label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${b.chip}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.colour }} aria-hidden /> {b.label}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-slate-500">
          Total stock on this gauge board: {totalStock.toLocaleString('en-IN')} units across {batches.length} batch{batches.length === 1 ? '' : 'es'}. Check every consignment against these rules before it reaches the counter.
        </p>
      </div>
    </Panel>
  );
}
