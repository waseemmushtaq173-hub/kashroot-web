'use client';

/**
 * EquipmentSpecTables — the Kissan Tools portal's structured specification
 * tables for orchard equipment: Tractors, Harvesters, Sprayers, Irrigation
 * and Horticultural Tools. One tab per category (synchronous React state —
 * no network, no camera, instant), a real spec sheet per machine (engine
 * HP, PTO power / tank capacity, flow or output, indicative dealer price
 * and the applicable subsidy scheme). The fast 2D replacement for the old
 * decorative 3D showroom; the live shop with real seller listings sits
 * right below it.
 *
 * Figures are typical indicative ranges for Kashmir orchards (dealer
 * price ≈, subsidy % per SMAM / PMKSY / horticulture-department schemes
 * as applicable) — labelled as such, never quoted as one dealer's price.
 */
import { useState } from 'react';
import { Tractor } from 'lucide-react';

import { PORTAL_THEMES } from '@/components/portal/kit';

const theme = PORTAL_THEMES.kissan;

interface MachineSpec {
  name: string;
  rows: Array<{ label: string; value: string }>;
  note: string;
}

const CATEGORY_LABELS = ['Tractors', 'Harvesters', 'Sprayers', 'Irrigation', 'Horticultural tools'] as const;
type Category = (typeof CATEGORY_LABELS)[number];

const SPEC_SHEETS: Record<Category, MachineSpec[]> = {
  Tractors: [
    {
      name: 'Orchard tractor, 4WD compact',
      rows: [
        { label: 'Engine power', value: '35–45 HP diesel' },
        { label: 'PTO power', value: '≈ 30–38 HP at 540 rpm' },
        { label: 'Wheelbase profile', value: 'Narrow — fits 12 ft apple rows' },
        { label: 'Indicative price', value: '≈ ₹5.5–7.5 lakh (dealer)' },
        { label: 'Subsidy', value: 'SMAM: 40–50% eligible' },
      ],
      note: 'Narrow orchard profile for Karewa soil; 4WD for soft ground.',
    },
    {
      name: 'Power tiller (inter-row)',
      rows: [
        { label: 'Engine power', value: '6–9 HP petrol/diesel' },
        { label: 'Tilling width', value: '60–90 cm, depth adjustable' },
        { label: 'Indicative price', value: '≈ ₹0.9–1.6 lakh (dealer)' },
        { label: 'Subsidy', value: 'SMAM: ≈40% eligible' },
      ],
      note: 'Inter-row tillage in mature orchards where a tractor cannot turn.',
    },
  ],
  Harvesters: [
    {
      name: 'Automated apple grading & harvesting platform',
      rows: [
        { label: 'Drive', value: '2–3 kW electric / tractor PTO' },
        { label: 'Grading output', value: '≈ 1.5–2.5 tonnes/hour' },
        { label: 'Grading', value: 'Size + colour, picker platform included' },
        { label: 'Indicative price', value: '≈ ₹8–18 lakh (line)' },
        { label: 'Subsidy', value: 'Horticulture-department scheme support' },
      ],
      note: 'Shared CA / FPO lines: graded lots fetch a better price.',
    },
  ],
  Sprayers: [
    {
      name: 'Air-blast orchard sprayer',
      rows: [
        { label: 'Drive', value: 'Tractor PTO-driven' },
        { label: 'Tank capacity', value: '400–600 L' },
        { label: 'Nozzle flow', value: '8–12 L/min' },
        { label: 'Droplet range', value: 'Air-shear fine → medium (canopy cover)' },
        { label: 'Indicative price', value: '≈ ₹1.2–2.2 lakh (dealer)' },
        { label: 'Subsidy', value: 'SMAM: ≈40% eligible' },
      ],
      note: 'Air-blast coverage for scab and San Jose scale sprays.',
    },
  ],
  Irrigation: [
    {
      name: 'Drip & micro-sprinkler rig',
      rows: [
        { label: 'Pump', value: '1–2 HP' },
        { label: 'Fertigation tank', value: '200 L' },
        { label: 'Emitter flow', value: '4–8 L/hour per emitter' },
        { label: 'Indicative price', value: '≈ ₹0.8–1.5 lakh per kanal set' },
        { label: 'Subsidy', value: 'PMKSY: 45–55% eligible' },
      ],
      note: 'Anti-clog emitters for Karewa orchards; fertigation-ready.',
    },
  ],
  'Horticultural tools': [
    {
      name: 'Pruning & picking kit',
      rows: [
        { label: 'Typical set', value: 'Pruning saw, secateurs, picking bag, ladder' },
        { label: 'Power tools', value: 'Battery secateurs ≈ 1.5–2 kWh pack' },
        { label: 'Indicative price', value: '≈ ₹8,000–35,000 by set' },
        { label: 'Subsidy', value: 'SMAM horticulture tools: varies by district' },
      ],
      note: 'Dormant-season pruning and careful picking keep grade A share high.',
    },
  ],
};

export function EquipmentSpecTables({ className = '' }: { className?: string }) {
  const [category, setCategory] = useState<Category>('Tractors');
  const sheets = SPEC_SHEETS[category];
  return (
    <section className={`rounded-3xl bg-white/85 p-5 shadow-sm ring-1 ring-slate-900/5 ${className}`} aria-label="Equipment specifications">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`grid h-10 w-10 place-items-center rounded-xl ${theme.tile}`}>
            <Tractor className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-900">Equipment guide</h3>
            <p className="text-xs text-slate-500">Typical specification sheets · indicative prices · subsidy schemes</p>
          </div>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Type of equipment">
          {CATEGORY_LABELS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`min-h-9 shrink-0 cursor-pointer whitespace-nowrap rounded-xl px-3.5 text-xs font-semibold ${category === c ? theme.solid : theme.soft}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {sheets.map((m) => (
            <article key={m.name} className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
              <h4 className="bg-orange-50/80 px-4 py-2.5 text-sm font-bold text-orange-950">{m.name}</h4>
              <table className="w-full text-left text-sm">
                <tbody>
                  {m.rows.map((r) => (
                    <tr key={r.label} className="border-b border-slate-100 last:border-0">
                      <th scope="row" className="w-36 bg-ivory px-4 py-2 align-top text-xs font-semibold uppercase tracking-wide text-slate-500">{r.label}</th>
                      <td className="px-4 py-2 text-slate-800">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="bg-white px-4 py-2 text-xs text-slate-500">{m.note}</p>
            </article>
          ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Prices are indicative dealer ranges and change by model, year and district. Subsidy percentages per SMAM / PMKSY / horticulture-department norms as applicable — confirm with your agriculture office.
      </p>
    </section>
  );
}
