'use client';

/**
 * Traceability — look up a lot code to see where produce came from, its
 * cold-chain temperature log and its grade history.
 *
 * Sample lots are built in; lots a farmer lists in the farmer portal
 * (kr_farmer_lots) can be looked up too, with a generated journey.
 */
import { useMemo, useState } from 'react';
import { Award, CheckCircle2, MapPin, Printer, QrCode, Search, Thermometer, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { FARMER_LOTS_KEY, SEED_LOTS as FARMER_SEED, type Lot as FarmerLot } from '@/lib/farmer-lots';
import { usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.tracking;

interface Stop {
  at: string;
  place: string;
  event: string;
}
interface Grade {
  at: string;
  by: string;
  grade: string;
  note: string;
}
interface Lot {
  code: string;
  crop: string;
  variety: string;
  grower: string;
  origin: string;
  harvested: string;
  quantity: string;
  journey: Stop[];
  temps: number[];
  grades: Grade[];
}

const SAMPLE_LOTS: Lot[] = [
  {
    code: 'KR-LOT-2410',
    crop: 'Apples',
    variety: 'Red Delicious',
    grower: 'Green Valley Orchards (KYC verified)',
    origin: 'Upper terrace orchard, 1,750 m',
    harvested: '2026-09-28',
    quantity: '400 boxes × 17 kg',
    journey: [
      { at: '2026-09-28 07:30', place: 'Orchard', event: 'Picked at dawn, field-graded' },
      { at: '2026-09-28 15:10', place: 'Village packhouse', event: 'Washed, sized, packed' },
      { at: '2026-09-29 06:00', place: 'CA cold store', event: 'Stored at 1–2 °C, 95% RH' },
      { at: '2026-10-06 21:00', place: 'Reefer truck', event: 'Loaded, seal #448812' },
      { at: '2026-10-08 05:40', place: 'Wholesale fruit market', event: 'Delivered, escrow released' },
    ],
    temps: [1.6, 1.4, 1.5, 1.8, 1.7, 1.5, 1.6, 2.1, 2.4, 2.2, 1.9, 1.7],
    grades: [
      { at: '2026-09-28', by: 'Grower', grade: 'A', note: 'Colour 80%+, no hail marks' },
      { at: '2026-09-29', by: 'Packhouse QC', grade: 'A', note: '70–75 mm, firmness 8.1 kg' },
      { at: '2026-10-08', by: 'Buyer on arrival', grade: 'A', note: 'Accepted, 0.4% bruising' },
    ],
  },
  {
    code: 'KR-LOT-2377',
    crop: 'Walnuts',
    variety: 'Light kernel',
    grower: 'Hillside Walnut Co-op (KYC verified)',
    origin: 'Hillside grove, 1,900 m',
    harvested: '2026-09-15',
    quantity: '300 kg kernels',
    journey: [
      { at: '2026-09-15 09:00', place: 'Grove', event: 'Hand-harvested after hull split' },
      { at: '2026-09-17 12:00', place: 'Co-op shed', event: 'Hulled, shade-dried 48 h' },
      { at: '2026-09-25 10:00', place: 'Co-op shed', event: 'Cracked and colour-graded' },
      { at: '2026-10-02 08:00', place: 'Courier hub', event: 'Vacuum-packed, dispatched' },
    ],
    temps: [9.5, 9.1, 8.8, 9.3, 10.2, 9.7, 9.0, 8.6],
    grades: [
      { at: '2026-09-25', by: 'Co-op QC', grade: 'Light', note: 'Moisture 6.8%' },
      { at: '2026-10-05', by: 'Buyer on arrival', grade: 'Light (−12 kg)', note: 'Short weight — dispute opened' },
    ],
  },
  {
    code: 'KR-LOT-2302',
    crop: 'Saffron',
    variety: 'Mongra (all-red)',
    grower: 'Upland Saffron Growers (KYC verified)',
    origin: 'Upland plateau fields',
    harvested: '2025-11-02',
    quantity: '250 g',
    journey: [
      { at: '2025-11-02 06:00', place: 'Field', event: 'Flowers picked at dawn' },
      { at: '2025-11-02 14:00', place: 'Grower home', event: 'Stigmas separated same day' },
      { at: '2025-11-05 10:00', place: 'Testing lab', event: 'ISO 3632 test passed' },
      { at: '2025-11-08 11:00', place: 'Spice park', event: 'Sealed in tamper-proof tins' },
    ],
    temps: [18, 19, 18, 17, 18, 19],
    grades: [{ at: '2025-11-05', by: 'Testing lab', grade: 'ISO 3632 Category I', note: 'Crocin 248, safranal 32' }],
  },
];

/** A plausible journey for a lot listed in the farmer portal. */
function fromFarmerLot(l: FarmerLot): Lot {
  const today = new Date().toISOString().slice(0, 10);
  return {
    code: l.id,
    crop: l.crop,
    variety: '—',
    grower: 'Your orchard (listed in the farmer portal)',
    origin: 'Your registered plot',
    harvested: today,
    quantity: l.quantity,
    journey: [
      { at: `${today} 07:00`, place: 'Orchard', event: 'Listed for sale on the marketplace' },
      { at: `${today} 08:00`, place: 'Orchard', event: 'Awaiting buyer — journey continues on sale' },
    ],
    temps: [],
    grades: [{ at: today, by: 'Grower', grade: l.grade, note: 'Self-declared at listing' }],
  };
}

function TempChart({ temps, max }: { temps: number[]; max: number }) {
  const w = 560;
  const h = 160;
  const lo = Math.min(...temps, 0);
  const hi = Math.max(...temps, max + 1);
  const x = (i: number) => (i / Math.max(1, temps.length - 1)) * (w - 40) + 30;
  const y = (t: number) => h - 20 - ((t - lo) / (hi - lo || 1)) * (h - 40);
  const pts = temps.map((t, i) => `${x(i)},${y(t)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full" role="img" aria-label={`Temperature readings from ${Math.min(...temps)} to ${Math.max(...temps)} °C`}>
      <line x1={30} x2={w - 10} y1={y(max)} y2={y(max)} stroke="#dc2626" strokeDasharray="4 4" strokeWidth={1} />
      <text x={w - 12} y={y(max) - 4} textAnchor="end" fontSize="11" fill="#dc2626">limit {max} °C</text>
      <polyline points={pts} fill="none" stroke="#0e7490" strokeWidth={2.5} strokeLinejoin="round" />
      {temps.map((t, i) => (
        <circle key={i} cx={x(i)} cy={y(t)} r={3.5} fill={t > max ? '#dc2626' : '#0e7490'} />
      ))}
      <text x={4} y={y(hi) + 4} fontSize="10" fill="#64748b">{hi.toFixed(0)}°</text>
      <text x={4} y={y(lo)} fontSize="10" fill="#64748b">{lo.toFixed(0)}°</text>
    </svg>
  );
}

const LIMIT: Record<string, number> = { Apples: 3, Walnuts: 12, Saffron: 25 };

export default function TraceabilityPage() {
  const [farmerLots] = usePersistentState<FarmerLot[]>(FARMER_LOTS_KEY, FARMER_SEED);
  const [code, setCode] = useState('');
  const [found, setFound] = useState<Lot | null>(SAMPLE_LOTS[0]);
  const [missed, setMissed] = useState<string | null>(null);

  const all = useMemo(() => [...SAMPLE_LOTS, ...farmerLots.map(fromFarmerLot)], [farmerLots]);

  const lookup = (value: string) => {
    const q = value.trim().toUpperCase();
    if (!q) return toast.error('Enter or scan a lot code.');
    const hit = all.find((l) => l.code.toUpperCase() === q);
    setFound(hit ?? null);
    setMissed(hit ? null : q);
    if (hit) toast.success(`${hit.code}: ${hit.crop} from ${hit.grower.split(' (')[0]}`);
  };

  const limit = found ? LIMIT[found.crop] ?? 8 : 8;
  const excursions = found ? found.temps.filter((t) => t > limit).length : 0;

  return (
    <PortalShell
      standalone
      title="Produce traceability"
      description="Every lot tells its story — who grew it, how it travelled, and how it was graded on the way."
      eyebrow="Orchard tools"
      theme="tracking"
      kpis={[
        { label: 'Lots on record', value: String(all.length), trend: `${farmerLots.length} from the farmer portal` },
        { label: 'Cold-chain checks', value: found ? (found.temps.length ? (excursions ? `${excursions} breach` : 'Within limit') : 'No log yet') : '—', trend: found ? `Limit ${limit} °C` : 'Look up a lot' },
        { label: 'Latest grade', value: found ? found.grades[found.grades.length - 1].grade : '—', trend: found ? found.grades[found.grades.length - 1].by : '' },
      ]}
    >
      <Panel theme={theme} title="Look up a lot" icon={QrCode}>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); lookup(code); }}>
          <label className="relative block flex-1">
            <span className="sr-only">Lot code</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className={`${INPUT} pl-9 uppercase tracking-wider`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. KR-LOT-2410 (printed on the box label)" />
          </label>
          <Btn theme={theme} type="submit" icon={Search}>Trace lot</Btn>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          Try:
          {all.slice(0, 6).map((l) => (
            <button key={l.code} type="button" className="rounded-full bg-cyan-50 px-2.5 py-1 font-mono text-cyan-800 ring-1 ring-cyan-200 hover:bg-cyan-100" onClick={() => { setCode(l.code); lookup(l.code); }}>
              {l.code}
            </button>
          ))}
        </div>
      </Panel>

      {missed && (
        <div className="mt-6">
          <EmptyState theme={theme} icon={TriangleAlert} title={`No lot ${missed}`} text="Check the code on the label. Lots appear here once a verified grower lists them." />
        </div>
      )}

      {found && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Panel
            theme={theme}
            title={`${found.code} · ${found.crop}`}
            icon={MapPin}
            action={<Btn theme={theme} size="sm" variant="ghost" icon={Printer} onClick={() => window.print()}>Print certificate</Btn>}
          >
            <dl className="mb-5 grid gap-2 text-sm sm:grid-cols-2">
              {[
                ['Variety', found.variety],
                ['Grower', found.grower],
                ['Origin', found.origin],
                ['Harvested', found.harvested],
                ['Quantity', found.quantity],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-xs uppercase tracking-wider text-slate-500">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>
              ))}
            </dl>
            <ol className="relative space-y-4 border-l-2 border-cyan-200 pl-5">
              {found.journey.map((s) => (
                <li key={s.at + s.event} className="relative">
                  <span className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-600 ring-4 ring-white" aria-hidden />
                  <p className="text-xs text-slate-500">{s.at} · {s.place}</p>
                  <p className="text-sm font-medium text-slate-900">{s.event}</p>
                </li>
              ))}
            </ol>
          </Panel>

          <div className="space-y-6">
            <Panel theme={theme} title="Cold-chain temperature" icon={Thermometer}>
              {found.temps.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No temperature log yet — readings start when the lot enters storage or a reefer.</p>
              ) : (
                <>
                  <TempChart temps={found.temps} max={limit} />
                  <p className="mt-2 flex items-center gap-2 text-sm">
                    {excursions === 0 ? (
                      <><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> All {found.temps.length} readings within {limit} °C.</>
                    ) : (
                      <><TriangleAlert className="h-4 w-4 text-red-600" aria-hidden /> {excursions} reading(s) above {limit} °C.</>
                    )}
                  </p>
                </>
              )}
            </Panel>
            <Panel theme={theme} title="Grade history" icon={Award}>
              <ul className="space-y-3">
                {found.grades.map((g) => (
                  <li key={g.at + g.by} className="flex items-start justify-between gap-3 rounded-2xl bg-white/70 p-3 ring-1 ring-slate-900/5">
                    <div>
                      <p className="text-xs text-slate-500">{g.at} · {g.by}</p>
                      <p className="text-sm text-slate-800">{g.note}</p>
                    </div>
                    <Badge tone="blue">{g.grade}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
