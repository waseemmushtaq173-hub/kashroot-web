'use client';

/**
 * PhenologyPanel — the Advisory portal's 2D orchard phenology & leaf
 * pathology panel (the fast replacement for the decorative 3D leaf stage
 * viewer):
 *  - The apple season as a timeline: Dormant → Silver Tip → Pink Bud →
 *    Petal Fall → Fruit Development → Harvest, with the current window
 *    worked out from today's date on a typical Kashmir calendar (exact
 *    dates shift by altitude and year — labelled as such).
 *  - What to watch at each stage: the disease pressure that belongs there
 *    (San Jose scale at dormant, scab infection windows from silver tip
 *    through petal fall, sooty blotch in fruit development…).
 *  - A leaf-pathology selector with a labelled 2D diagram per stage:
 *    healthy, apple scab early / advanced, San Jose scale.
 *  - Every recommendation carries its honest source badge: ✅ verified by
 *    agronomists, or 🤖 AI suggestion — verify doses with an agronomist.
 */
import { useState } from 'react';
import { CheckCircle2, CircleAlert, Leaf } from 'lucide-react';

import { Panel, PORTAL_THEMES } from '@/components/portal/kit';

const theme = PORTAL_THEMES.expert;

type StageId = 'dormant' | 'silver-tip' | 'pink-bud' | 'petal-fall' | 'fruit' | 'harvest';

interface StageInfo {
  id: StageId;
  label: string;
  /** Typical Kashmir calendar window (month boundaries, inclusive). */
  from: [number, number]; // [month 1-12, day]
  to: [number, number];
  watch: string;
  severity: 'low' | 'medium' | 'high';
}

/** Typical Kashmir apple calendar (altitude shifts it by 1–2 weeks either way). */
const STAGES: StageInfo[] = [
  { id: 'dormant', label: 'Dormant', from: [11, 15], to: [3, 10], severity: 'low', watch: 'San Jose scale and mite eggs on bark: dormant-oil spray before bud break; prune out cankers and scab twig lesions.' },
  { id: 'silver-tip', label: 'Silver tip', from: [3, 11], to: [4, 5], severity: 'high', watch: 'First scab ascospores mature with rain: a wet spell from silver tip on needs a protective cover spray.' },
  { id: 'pink-bud', label: 'Pink bud', from: [4, 6], to: [4, 25], severity: 'high', watch: 'Scab infection windows multiply; thinning decisions and beehive placement before bloom — do not spray insecticides when bees are working.' },
  { id: 'petal-fall', label: 'Petal fall', from: [4, 26], to: [5, 15], severity: 'high', watch: 'The most scab-sensitive window of the year, plus codling-moth first flight: cover sprays and traps together.' },
  { id: 'fruit', label: 'Fruit development', from: [5, 16], to: [9, 30], severity: 'medium', watch: 'Summer rots and sooty blotch in humid spells; keep irrigation even, summer-prune for airflow and light.' },
  { id: 'harvest', label: 'Harvest', from: [10, 1], to: [11, 14], severity: 'low', watch: 'Pick by ground colour and starch, grade well, and book cold storage early — bruised fruit loses grade A.' },
];

const SEVERITY: Record<StageInfo['severity'], { label: string; chip: string }> = {
  low: { label: 'Low pressure', chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  medium: { label: 'Moderate pressure', chip: 'bg-amber-50 text-amber-800 ring-amber-200' },
  high: { label: 'High pressure', chip: 'bg-rose-50 text-rose-800 ring-rose-200' },
};

type LeafStage = 'healthy' | 'scab' | 'advanced' | 'scale';

const LEAF_STAGES: { id: LeafStage; label: string; note: string; source: 'verified' | 'ai' }[] = [
  { id: 'healthy', label: 'Healthy leaf', source: 'verified', note: 'Even green, no spots. Keep the spray calendar and scab windows in view.' },
  { id: 'scab', label: 'Apple scab — early', source: 'verified', note: 'Olive-green velvety spots on the upper surface after wet weather. Prune for airflow; cover sprays inside infection windows.' },
  { id: 'advanced', label: 'Apple scab — advanced', source: 'ai', note: 'Lesions darken, crack and curl the leaf; fruit gets corky blotches. Remove fallen leaves; verify doses with an agronomist.' },
  { id: 'scale', label: 'San Jose scale', source: 'verified', note: 'Dark crusty caps on bark and fruit, red halo under each. Dormant-oil spray timing matters.' },
];

/** Today's phenological window on the typical calendar, or null between windows. */
function currentStage(now: Date): StageInfo | null {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  for (const s of STAGES) {
    const [fm, fd] = s.from;
    const [tm, td] = s.to;
    const start = fm * 100 + fd;
    const end = tm * 100 + td;
    const day = m * 100 + d;
    if (start <= end ? day >= start && day <= end : day >= start || day <= end) return s;
  }
  return null;
}

export function PhenologyPanel({ className = '' }: { className?: string }) {
  const [leaf, setLeaf] = useState<LeafStage>('scab');
  const info = LEAF_STAGES.find((s) => s.id === leaf) ?? LEAF_STAGES[0];
  const current = currentStage(new Date());

  return (
    <section className={`space-y-4 ${className}`} aria-label="Orchard phenology and leaf pathology">
      <Panel theme={theme} title="Apple season timeline" icon={Leaf}>
        {/* The phenology timeline: every stage, current one highlighted. */}
        <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {STAGES.map((s, i) => {
            const now = current?.id === s.id;
            const past = current ? STAGES.indexOf(current) > i : false;
            const sev = SEVERITY[s.severity];
            return (
              <li key={s.id} className={`flex flex-col gap-1.5 rounded-2xl p-3 ring-1 ${now ? 'bg-emerald-50 ring-emerald-300 shadow-sm' : past ? 'bg-slate-50 ring-slate-200' : 'bg-white ring-slate-200'}`}>
                <p className={`text-sm font-bold ${now ? 'text-emerald-900' : 'text-slate-900'}`}>
                  {i + 1}. {s.label}
                  {now && <span className="ml-1 inline-block rounded-full bg-emerald-700 px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-white">Now</span>}
                </p>
                <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${sev.chip}`}>{sev.label}</span>
                <p className="text-[11px] leading-relaxed text-slate-600">{s.watch}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[11px] text-slate-500">
          Typical Kashmir calendar — exact dates shift a week or two with altitude and each year's weather. {current ? null : 'Between windows today: follow the nearest stage\u2019s guidance.'}
        </p>
      </Panel>

      <Panel theme={theme} title="Leaf pathology — see the disease before it spreads" icon={Leaf}>
        <div role="group" aria-label="Choose a leaf stage" className="mb-3 flex flex-wrap gap-1.5">
          {LEAF_STAGES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={leaf === s.id}
              onClick={() => setLeaf(s.id)}
              className={`min-h-10 cursor-pointer rounded-xl px-3 text-xs font-bold ring-1 transition ${leaf === s.id ? 'bg-green-800 text-white ring-green-800 shadow-md' : 'bg-white text-slate-700 ring-slate-200 hover:bg-green-50'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[280px_1fr] sm:items-center">
          <LeafDiagram stage={leaf} />
          <div className="rounded-2xl bg-white/85 p-4 text-sm ring-1 ring-slate-900/5">
            <p className="font-semibold text-slate-900">{info.label}</p>
            <p className="mt-1 text-slate-700">{info.note}</p>
            <p className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ring-1 ${info.source === 'verified' ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-amber-50 text-amber-900 ring-amber-200'}`}>
              {info.source === 'verified' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <CircleAlert className="h-3.5 w-3.5" aria-hidden />}
              {info.source === 'verified' ? 'Verified by agronomists' : 'AI agronomic suggestion — verify doses with an agronomist'}
            </p>
          </div>
        </div>
      </Panel>
    </section>
  );
}

/** Labelled 2D leaf diagram per pathology stage (pure SVG, instant render). */
function LeafDiagram({ stage }: { stage: LeafStage }) {
  return (
    <svg viewBox="0 0 300 160" className="w-full rounded-2xl bg-gradient-to-b from-green-50 to-white ring-1 ring-slate-200" role="img" aria-label={`Diagram of a leaf: ${LEAF_STAGES.find((s) => s.id === stage)?.label}`}>
      <ellipse cx="150" cy="80" rx="110" ry="52" fill={stage === 'advanced' ? '#c9a227' : '#3d8a4d'} />
      <line x1="45" y1="80" x2="255" y2="80" stroke="#e9f5ec" strokeWidth="3" />
      {[70, 100, 130, 160, 190, 220].map((x, i) => (
        <g key={i}>
          <line x1={x} y1="80" x2={x - 12} y2="52" stroke="#e9f5ec" strokeWidth="1.5" />
          <line x1={x} y1="80" x2={x - 12} y2="108" stroke="#e9f5ec" strokeWidth="1.5" />
        </g>
      ))}
      {stage === 'scab' && [[170, 60], [130, 95], [200, 95]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" fill="#5d6b23" />
      ))}
      {stage === 'advanced' && [[170, 60], [130, 95], [200, 95], [110, 65], [215, 70], [165, 110]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="10" fill="#2f2413" />
      ))}
      {stage === 'scale' && [[140, 70], [180, 90], [150, 105]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="8" fill="#3a2a1a" />
          <circle cx={x} cy={y} r="4" fill="#6b4a30" />
        </g>
      ))}
      <text x="8" y="150" fontSize="9" fill="#64748b">{stage === 'healthy' ? 'Even green blade, intact margins' : stage === 'scab' ? 'Olive velvety lesions, upper surface' : stage === 'advanced' ? 'Cracked dark lesions, yellowing margins' : 'Dark caps with red halos (underside shown)'}</text>
    </svg>
  );
}
