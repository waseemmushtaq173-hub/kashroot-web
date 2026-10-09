'use client';

/**
 * Season Planner — a month-by-month orchard calendar with tickable tasks, and
 * an ROI calculator for the season. Ticks and calculator inputs live in the
 * browser (kr_season_*).
 */
import { useState } from 'react';
import { Calculator, CalendarDays, CheckCircle2, RotateCcw, Scissors, Sprout } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, Field, INPUT, PORTAL_THEMES, Panel, inr } from '@/components/portal/kit';
import { usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.kissan;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Crop = 'Apple' | 'Walnut' | 'Cherry' | 'Saffron';
const CALENDAR: Record<Crop, Record<number, string[]>> = {
  Apple: {
    0: ['Dormant pruning: remove crossing and water-sprout branches', 'Paint large pruning cuts'],
    1: ['Finish pruning before bud swell', 'Horticultural mineral oil 2% for scale (delayed dormancy)'],
    2: ['Apply first split of nitrogen', 'Silver-tip to green-tip scab protectant'],
    3: ['Pink-bud scab spray', 'Place bee hives at 10% bloom — no insecticides during bloom'],
    4: ['Petal-fall spray', 'Fruit thinning: one fruit per cluster'],
    5: ['Second nitrogen split', 'Mite monitoring — 5 leaves per tree'],
    6: ['Summer pruning of vigorous shoots', 'Prop heavily loaded branches'],
    7: ['Calcium sprays for storage quality', 'Book crates, cartons and transport'],
    8: ['Harvest early varieties at proper maturity', 'Check spray waiting periods before picking'],
    9: ['Main harvest and grading', 'Move fruit to cold store within 24 h'],
    10: ['Post-harvest urea spray (5%) on leaves', 'Collect and destroy fallen leaves (scab source)'],
    11: ['Farmyard manure in tree basins', 'Plan replanting and order rootstocks'],
  },
  Walnut: {
    1: ['Prune dead and diseased wood'],
    2: ['Copper spray at leaf emergence (blight)'],
    3: ['Second copper spray if rains are heavy'],
    5: ['Irrigate during nut filling'],
    8: ['Harvest when hulls split', 'Hull and dry nuts in shade within 48 h'],
    9: ['Grade light vs. dark kernels', 'Store below 10 °C, low humidity'],
    11: ['Manure and basin preparation'],
  },
  Cherry: {
    1: ['Light pruning after cold spells pass'],
    2: ['Bacterial canker copper spray'],
    3: ['Bloom — keep bees active'],
    4: ['Rain covers / anti-crack calcium sprays', 'Bird netting'],
    5: ['Harvest at full colour, pick in cool hours', 'Pre-cool to 2 °C within hours'],
    6: ['Post-harvest pruning'],
  },
  Saffron: {
    6: ['Lift and grade corms (>8 g)', 'Treat corms with fungicide before planting'],
    7: ['Plant corms 15 cm deep, 10 cm apart'],
    8: ['Light irrigation if September is dry'],
    9: ['Flower picking at dawn, daily', 'Separate stigmas the same day'],
    10: ['Dry stigmas gently; store airtight and dark'],
    11: ['Weed and hoe between rows'],
  },
};

const NO_TICKS: string[] = [];

interface RoiInputs {
  crop: Crop;
  area: number;
  treesPerAcre: number;
  yieldPerTree: number;
  pricePerBox: number;
  inputs: number;
  labour: number;
  packaging: number;
  transport: number;
}
const SEED_ROI: RoiInputs = { crop: 'Apple', area: 2, treesPerAcre: 400, yieldPerTree: 3, pricePerBox: 1100, inputs: 180000, labour: 260000, packaging: 160, transport: 220 };

export default function SeasonPlannerPage() {
  const [tab, setTab] = useState('calendar');
  const [crop, setCrop] = useState<Crop>('Apple');
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [ticks, setTicks] = usePersistentState<string[]>('kr_season_ticks', NO_TICKS);
  const [roi, setRoi] = usePersistentState<RoiInputs>('kr_season_roi', SEED_ROI);

  const tasks = CALENDAR[crop][month] ?? [];
  const key = (task: string) => `${crop}|${month}|${task}`;
  const yearTasks = Object.entries(CALENDAR[crop]).flatMap(([m, list]) => list.map((t) => `${crop}|${m}|${t}`));
  const doneThisYear = yearTasks.filter((k) => ticks.includes(k)).length;

  const toggle = (task: string) => setTicks((all) => (all.includes(key(task)) ? all.filter((k) => k !== key(task)) : [...all, key(task)]));

  // ROI
  const trees = roi.area * roi.treesPerAcre;
  const boxes = trees * roi.yieldPerTree;
  const revenue = boxes * roi.pricePerBox;
  const perBoxCosts = boxes * (roi.packaging + roi.transport);
  const cost = roi.inputs + roi.labour + perBoxCosts;
  const profit = revenue - cost;
  const roiPct = cost > 0 ? (profit / cost) * 100 : 0;
  const breakEven = boxes > 0 ? cost / boxes : 0;
  const num = (field: keyof RoiInputs) => (e: React.ChangeEvent<HTMLInputElement>) => setRoi({ ...roi, [field]: Math.max(0, Number(e.target.value) || 0) });

  return (
    <PortalShell
      standalone
      title="Season planner"
      description="Know what each block needs this month, and whether the season will pay before you spend."
      eyebrow="Orchard tools"
      theme="kissan"
      kpis={[
        { label: 'This month', value: `${MONTHS[new Date().getMonth()]}`, trend: `${(CALENDAR[crop][new Date().getMonth()] ?? []).length} ${crop.toLowerCase()} tasks` },
        { label: 'Year progress', value: `${doneThisYear}/${yearTasks.length}`, trend: `${crop} tasks ticked` },
        { label: 'Projected profit', value: inr.format(profit), trend: `${roiPct.toFixed(0)}% return on cost` },
      ]}
      tabs={[
        { id: 'calendar', label: 'Calendar', icon: CalendarDays },
        { id: 'roi', label: 'ROI calculator', icon: Calculator },
      ]}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === 'calendar' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Crop">
            {(Object.keys(CALENDAR) as Crop[]).map((c) => (
              <Btn key={c} theme={theme} size="sm" variant={crop === c ? 'solid' : 'soft'} aria-pressed={crop === c} onClick={() => setCrop(c)}>
                {c}
              </Btn>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12" role="group" aria-label="Month">
            {MONTHS.map((m, i) => {
              const count = (CALENDAR[crop][i] ?? []).length;
              const done = (CALENDAR[crop][i] ?? []).filter((t) => ticks.includes(`${crop}|${i}|${t}`)).length;
              const isNow = i === new Date().getMonth();
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={month === i}
                  onClick={() => setMonth(i)}
                  className={`rounded-xl px-2 py-3 text-center text-sm ring-1 transition ${month === i ? 'bg-orange-700 text-white ring-orange-700' : 'bg-white/80 text-slate-800 ring-slate-900/10 hover:bg-orange-50'}`}
                >
                  <span className="block font-semibold">{m}</span>
                  <span className={`block text-[11px] ${month === i ? 'text-orange-100' : 'text-slate-500'}`}>{count ? `${done}/${count}` : '—'}</span>
                  {isNow && <span className={`mx-auto mt-1 block h-1 w-1 rounded-full ${month === i ? 'bg-white' : 'bg-orange-600'}`} aria-label="current month" />}
                </button>
              );
            })}
          </div>
          <Panel
            theme={theme}
            title={`${crop} — ${MONTHS[month]}`}
            icon={month <= 1 || month === 6 ? Scissors : Sprout}
            action={
              tasks.length > 0 && (
                <Btn theme={theme} size="sm" variant="ghost" icon={RotateCcw} onClick={() => setTicks((all) => all.filter((k) => !k.startsWith(`${crop}|${month}|`)))}>
                  Reset month
                </Btn>
              )
            }
          >
            {tasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Nothing scheduled for {crop.toLowerCase()} in {MONTHS[month]}. A good month to service equipment.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((t) => {
                  const done = ticks.includes(key(t));
                  return (
                    <li key={t}>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-2xl p-4 ring-1 transition ${done ? 'bg-emerald-50 ring-emerald-200' : 'bg-white/70 ring-slate-900/5 hover:bg-orange-50'}`}>
                        <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" checked={done} onChange={() => { toggle(t); if (!done) toast.success('Task done'); }} />
                        <span className={`text-sm ${done ? 'text-emerald-900 line-through decoration-emerald-400' : 'text-slate-800'}`}>{t}</span>
                        {done && <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-emerald-600" aria-hidden />}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === 'roi' && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <Panel theme={theme} title="Your season" icon={Calculator} action={<Btn theme={theme} size="sm" variant="ghost" icon={RotateCcw} onClick={() => setRoi(SEED_ROI)}>Reset</Btn>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Crop">
                <select className={INPUT} value={roi.crop} onChange={(e) => setRoi({ ...roi, crop: e.target.value as Crop })}>
                  {(Object.keys(CALENDAR) as Crop[]).map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Area (acres)"><input type="number" min={0} step="0.1" className={INPUT} value={roi.area} onChange={num('area')} /></Field>
              <Field label="Trees per acre"><input type="number" min={0} className={INPUT} value={roi.treesPerAcre} onChange={num('treesPerAcre')} /></Field>
              <Field label="Boxes per tree"><input type="number" min={0} step="0.1" className={INPUT} value={roi.yieldPerTree} onChange={num('yieldPerTree')} /></Field>
              <Field label="Expected price per box (₹)" hint="Check today's rate on Live Mandi Rates."><input type="number" min={0} className={INPUT} value={roi.pricePerBox} onChange={num('pricePerBox')} /></Field>
              <Field label="Sprays, fertiliser & inputs (₹)"><input type="number" min={0} className={INPUT} value={roi.inputs} onChange={num('inputs')} /></Field>
              <Field label="Labour for the season (₹)"><input type="number" min={0} className={INPUT} value={roi.labour} onChange={num('labour')} /></Field>
              <Field label="Packaging per box (₹)"><input type="number" min={0} className={INPUT} value={roi.packaging} onChange={num('packaging')} /></Field>
              <Field label="Transport & commission per box (₹)"><input type="number" min={0} className={INPUT} value={roi.transport} onChange={num('transport')} /></Field>
            </div>
          </Panel>
          <Panel theme={theme} title="Projection" icon={CheckCircle2}>
            <dl className="grid gap-3 text-sm">
              {[
                ['Trees', trees.toLocaleString('en-IN')],
                ['Boxes', Math.round(boxes).toLocaleString('en-IN')],
                ['Revenue', inr.format(revenue)],
                ['Total cost', inr.format(cost)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-900/5 pb-2"><dt className="text-slate-500">{k}</dt><dd className="font-semibold tabular-nums text-slate-900">{v}</dd></div>
              ))}
            </dl>
            <div className={`mt-4 rounded-2xl p-5 ${profit >= 0 ? 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200' : 'bg-red-50 text-red-950 ring-1 ring-red-200'}`}>
              <p className="text-xs font-semibold uppercase tracking-wider">{profit >= 0 ? 'Profit' : 'Loss'}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{inr.format(Math.abs(profit))}</p>
              <p className="mt-1 text-sm">{roiPct.toFixed(1)}% return on cost</p>
            </div>
            <p className="mt-4 text-sm text-slate-700">
              Break-even price: <strong>{inr.format(breakEven)}</strong> per box.{' '}
              {roi.pricePerBox > 0 && <Badge tone={roi.pricePerBox >= breakEven ? 'green' : 'red'}>{roi.pricePerBox >= breakEven ? `${inr.format(roi.pricePerBox - breakEven)} margin per box` : 'Price below break-even'}</Badge>}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn theme={theme} variant="soft" href="/mandi-weather">Check mandi rates</Btn>
              <Btn theme={theme} variant="soft" href="/compare-prices">Compare input prices</Btn>
            </div>
          </Panel>
        </div>
      )}
    </PortalShell>
  );
}
