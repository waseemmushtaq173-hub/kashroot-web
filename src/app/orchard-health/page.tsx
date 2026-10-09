'use client';

/**
 * Orchard Health — block-by-block scab risk, a symptom-based photo checker,
 * and a spray log that counts down each product's pre-harvest interval.
 *
 * Risk uses a simplified Mills table (leaf-wetness hours needed for apple
 * scab infection at a given mean temperature). Spray log and block weather
 * live in the browser (kr_orchard_*).
 */
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Camera, CloudRain, Droplets, Map as MapIcon, MessageCircle, PlusCircle, Stethoscope, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, Field, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { localId, usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.farmer;

interface Block {
  id: string;
  name: string;
  variety: string;
  /** Extra wetness hours this block holds vs. the station (shade, low ground). */
  wetBias: number;
}

const BLOCKS: Block[] = [
  { id: 'A', name: 'Block A · upper terrace', variety: 'Delicious', wetBias: -2 },
  { id: 'B', name: 'Block B · stream side', variety: 'Golden', wetBias: 4 },
  { id: 'C', name: 'Block C · high-density', variety: 'Gala on M9', wetBias: 1 },
  { id: 'D', name: 'Block D · old trees', variety: 'Ambri', wetBias: 3 },
  { id: 'E', name: 'Block E · walnut edge', variety: 'Walnut', wetBias: 0 },
  { id: 'F', name: 'Block F · nursery', variety: 'Mixed saplings', wetBias: 2 },
];

/** Leaf-wetness hours for a light scab infection at mean temperature (°C). */
function millsHours(tempC: number): number {
  if (tempC < 6) return 30;
  if (tempC < 8) return 20;
  if (tempC < 10) return 15;
  if (tempC < 12) return 12;
  if (tempC < 17) return 9;
  if (tempC < 24) return 9 + (tempC - 17) * 0.4;
  return 14;
}

type Level = 'low' | 'moderate' | 'high';
const LEVEL: Record<Level, { tone: 'green' | 'amber' | 'red'; cell: string; advice: string }> = {
  low: { tone: 'green', cell: 'bg-emerald-100 ring-emerald-300 text-emerald-900', advice: 'No infection period. Keep monitoring.' },
  moderate: { tone: 'amber', cell: 'bg-amber-100 ring-amber-300 text-amber-900', advice: 'Borderline. If more rain is due, apply a protectant (Captan or Mancozeb) before it.' },
  high: { tone: 'red', cell: 'bg-red-100 ring-red-300 text-red-900', advice: 'Infection likely. Apply a curative fungicide (e.g. Dodine or Difenoconazole) within 48–72 hours.' },
};

interface Weather {
  wetHours: number;
  tempC: number;
}
const SEED_WEATHER: Weather = { wetHours: 10, tempC: 14 };

interface Product {
  name: string;
  phiDays: number;
}
const PRODUCTS: Product[] = [
  { name: 'Captan 50 WP', phiDays: 21 },
  { name: 'Mancozeb 75 WP', phiDays: 30 },
  { name: 'Dodine 65 WP', phiDays: 30 },
  { name: 'Difenoconazole 25 EC', phiDays: 20 },
  { name: 'Horticultural mineral oil', phiDays: 0 },
  { name: 'Copper oxychloride 50 WP', phiDays: 21 },
  { name: 'Calcium chloride (0.5%)', phiDays: 0 },
];

interface Spray {
  id: string;
  block: string;
  product: string;
  date: string;
  phiDays: number;
}
const NO_SPRAYS: Spray[] = [];

const SYMPTOMS = [
  { id: 'olive-spots', label: 'Olive-green / black velvety spots on leaves or fruit' },
  { id: 'white-powder', label: 'White powdery coating on young shoots' },
  { id: 'scale', label: 'Tiny grey crusts on bark, red halo spots on fruit' },
  { id: 'nut-black', label: 'Black sunken lesions on young nuts' },
  { id: 'brown-rot', label: 'Soft brown rot spreading on fruit' },
  { id: 'yellow-leaves', label: 'Yellowing between leaf veins' },
] as const;
type SymptomId = (typeof SYMPTOMS)[number]['id'];

const DIAGNOSES: Record<SymptomId, { name: string; action: string }> = {
  'olive-spots': { name: 'Apple scab', action: 'Curative spray within 72 h of rain (Dodine 60 g/100 L); collect fallen leaves.' },
  'white-powder': { name: 'Powdery mildew', action: 'Prune out infected shoots; spray wettable sulphur (200 g/100 L) or Hexaconazole.' },
  scale: { name: 'San José scale', action: 'Horticultural mineral oil 2% at delayed dormancy; spot-treat heavy infestations.' },
  'nut-black': { name: 'Walnut blight', action: 'Copper oxychloride 300 g/100 L at leaf emergence and after heavy rain.' },
  'brown-rot': { name: 'Fruit rot (brown rot / bitter rot)', action: 'Remove rotting fruit; Captan pre-harvest; cool fruit quickly after picking.' },
  'yellow-leaves': { name: 'Nutrient deficiency (Mg / Fe likely)', action: 'Order a soil test; foliar magnesium sulphate 1% as a stop-gap.' },
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 864e5).toISOString().slice(0, 10);
const daysFromToday = (iso: string) => Math.ceil((Date.parse(iso) - Date.parse(todayIso())) / 864e5);

const TABS = ['risk', 'diagnose', 'sprays'];

export default function OrchardHealthPage() {
  return (
    <Suspense>
      <OrchardHealth />
    </Suspense>
  );
}

function OrchardHealth() {
  const requested = useSearchParams().get('tab');
  const [tab, setTab] = useState(requested && TABS.includes(requested) ? requested : 'risk');
  const [weather, setWeather] = usePersistentState<Weather>('kr_orchard_weather', SEED_WEATHER);
  const [sprays, setSprays] = usePersistentState<Spray[]>('kr_orchard_sprays', NO_SPRAYS);
  const [selected, setSelected] = useState<string>('B');
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const [symptoms, setSymptoms] = useState<SymptomId[]>([]);
  const [draft, setDraft] = useState({ block: 'A', product: PRODUCTS[0].name, date: '' });

  const need = millsHours(weather.tempC);
  const risk = useMemo(
    () =>
      Object.fromEntries(
        BLOCKS.map((b) => {
          const hours = Math.max(0, weather.wetHours + b.wetBias);
          const level: Level = hours >= need ? 'high' : hours >= need * 0.75 ? 'moderate' : 'low';
          return [b.id, { hours, level }];
        }),
      ) as Record<string, { hours: number; level: Level }>,
    [weather.wetHours, need],
  );
  const block = BLOCKS.find((b) => b.id === selected)!;
  const highCount = BLOCKS.filter((b) => risk[b.id].level === 'high').length;

  const withheld = sprays
    .map((s) => ({ ...s, safeOn: addDays(s.date, s.phiDays) }))
    .map((s) => ({ ...s, left: daysFromToday(s.safeOn) }))
    .sort((a, b) => b.left - a.left);
  const blockedBlocks = new Set(withheld.filter((s) => s.left > 0).map((s) => s.block));

  const logSpray = () => {
    const product = PRODUCTS.find((p) => p.name === draft.product)!;
    const date = draft.date || todayIso();
    setSprays((all) => [{ id: localId('SP'), block: draft.block, product: product.name, date, phiDays: product.phiDays }, ...all]);
    toast.success(`${product.name} logged for block ${draft.block}${product.phiDays ? ` — harvest safe from ${addDays(date, product.phiDays)}` : ''}`);
    setDraft({ ...draft, date: '' });
  };

  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto({ url: URL.createObjectURL(file), name: file.name });
  };

  return (
    <PortalShell
      standalone
      title="Orchard health"
      description="See which blocks are at risk after rain, check symptoms, and never harvest inside a spray's waiting period."
      eyebrow="Orchard tools"
      theme="farmer"
      kpis={[
        { label: 'Blocks at high risk', value: `${highCount} / ${BLOCKS.length}`, trend: `${weather.wetHours} h wet at ${weather.tempC} °C` },
        { label: 'Sprays logged', value: String(sprays.length), trend: 'This season' },
        { label: 'Blocks in waiting period', value: String(blockedBlocks.size), trend: blockedBlocks.size ? `Hold harvest: ${[...blockedBlocks].join(', ')}` : 'All clear to harvest' },
      ]}
      tabs={[
        { id: 'risk', label: 'Risk map', icon: MapIcon },
        { id: 'diagnose', label: 'Photo diagnosis', icon: Camera },
        { id: 'sprays', label: 'Spray log', icon: Droplets, count: withheld.filter((s) => s.left > 0).length },
      ]}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === 'risk' && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel theme={theme} title="Scab risk by block" icon={MapIcon}>
            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <Field label={`Leaf wetness, last rain: ${weather.wetHours} h`}>
                <input type="range" min={0} max={36} value={weather.wetHours} onChange={(e) => setWeather({ ...weather, wetHours: Number(e.target.value) })} className="w-full accent-emerald-700" />
              </Field>
              <Field label={`Mean temperature: ${weather.tempC} °C`}>
                <input type="range" min={2} max={28} value={weather.tempC} onChange={(e) => setWeather({ ...weather, tempC: Number(e.target.value) })} className="w-full accent-emerald-700" />
              </Field>
            </div>
            <p className="mb-4 flex items-center gap-2 text-sm text-slate-600">
              <CloudRain className="h-4 w-4 text-emerald-700" aria-hidden /> At {weather.tempC} °C, scab needs about {need.toFixed(0)} h of wet leaves to infect.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BLOCKS.map((b) => {
                const r = risk[b.id];
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={selected === b.id}
                    onClick={() => setSelected(b.id)}
                    className={`rounded-2xl p-4 text-left ring-1 transition hover:-translate-y-0.5 ${LEVEL[r.level].cell} ${selected === b.id ? 'outline outline-2 outline-offset-2 outline-emerald-700' : ''}`}
                  >
                    <span className="block text-2xl font-bold">{b.id}</span>
                    <span className="block text-xs font-semibold uppercase tracking-wider">{r.level} risk</span>
                    <span className="block text-xs opacity-80">{r.hours} h wet</span>
                  </button>
                );
              })}
            </div>
          </Panel>
          <Panel theme={theme} title={block.name} icon={Stethoscope}>
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">Variety: <strong className="text-slate-900">{block.variety}</strong></p>
              <Badge tone={LEVEL[risk[block.id].level].tone}>{risk[block.id].level} risk · {risk[block.id].hours} h wet</Badge>
              <p className="text-slate-800">{LEVEL[risk[block.id].level].advice}</p>
              {blockedBlocks.has(block.id) && <p className="rounded-xl bg-amber-50 p-3 text-amber-900">This block is inside a spray waiting period — check the spray log before harvesting.</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                <Btn theme={theme} icon={Droplets} onClick={() => { setDraft({ ...draft, block: block.id }); setTab('sprays'); }}>Log a spray here</Btn>
                <Btn theme={theme} variant="soft" icon={Camera} onClick={() => setTab('diagnose')}>Check symptoms</Btn>
              </div>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'diagnose' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel theme={theme} title="Photo & symptoms" icon={Camera}>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-6 text-center text-sm text-emerald-900 hover:bg-emerald-50">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img src={photo.url} alt={`Uploaded: ${photo.name}`} className="max-h-56 rounded-xl object-contain" />
              ) : (
                <Camera className="h-8 w-8" aria-hidden />
              )}
              <span className="font-semibold">{photo ? 'Change photo' : 'Add a leaf or fruit photo'}</span>
              <span className="text-xs text-emerald-800">Stays on your device</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => choosePhoto(e.target.files?.[0])} />
            </label>
            <fieldset className="mt-5 space-y-2">
              <legend className="mb-2 text-sm font-semibold text-slate-800">What do you see?</legend>
              {SYMPTOMS.map((s) => (
                <label key={s.id} className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-500"
                    checked={symptoms.includes(s.id)}
                    onChange={(e) => setSymptoms((all) => (e.target.checked ? [...all, s.id] : all.filter((x) => x !== s.id)))}
                  />
                  {s.label}
                </label>
              ))}
            </fieldset>
          </Panel>
          <Panel theme={theme} title="Likely causes" icon={Stethoscope}>
            {symptoms.length === 0 ? (
              <EmptyState theme={theme} icon={Stethoscope} title="Tick what you see" text="Matching problems and treatments appear here instantly." />
            ) : (
              <ul className="space-y-3">
                {symptoms.map((id) => (
                  <li key={id} className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5">
                    <p className="font-semibold text-slate-900">{DIAGNOSES[id].name}</p>
                    <p className="mt-1 text-sm text-slate-700">{DIAGNOSES[id].action}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-slate-500">This is a symptom guide, not a lab result. For a confirmed diagnosis, send the photo to an agronomist.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn theme={theme} icon={MessageCircle} href="/expert">Ask an agronomist</Btn>
              {(symptoms.length > 0 || photo) && (
                <Btn theme={theme} variant="ghost" onClick={() => { setSymptoms([]); if (photo) URL.revokeObjectURL(photo.url); setPhoto(null); }}>Start over</Btn>
              )}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'sprays' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Panel theme={theme} title="Log a spray" icon={PlusCircle}>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); logSpray(); }}>
              <Field label="Block">
                <select className={INPUT} value={draft.block} onChange={(e) => setDraft({ ...draft, block: e.target.value })}>
                  {BLOCKS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Product" hint={`Pre-harvest interval: ${PRODUCTS.find((p) => p.name === draft.product)?.phiDays ?? 0} days`}>
                <select className={INPUT} value={draft.product} onChange={(e) => setDraft({ ...draft, product: e.target.value })}>
                  {PRODUCTS.map((p) => <option key={p.name}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Sprayed on" hint="Leave empty for today.">
                <input type="date" className={INPUT} value={draft.date} max={todayIso()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </Field>
              <Btn theme={theme} type="submit" icon={Droplets}>Add to spray log</Btn>
            </form>
          </Panel>
          <Panel theme={theme} title="Harvest countdown" icon={Droplets}>
            {withheld.length === 0 ? (
              <EmptyState theme={theme} icon={Droplets} title="No sprays logged" text="Log each spray to know exactly when every block is safe to pick." />
            ) : (
              <ul className="space-y-3">
                {withheld.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5">
                    <div>
                      <p className="font-semibold text-slate-900">Block {s.block} · {s.product}</p>
                      <p className="text-sm text-slate-600">Sprayed {s.date} · safe from {s.safeOn}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.left > 0 ? <Badge tone="red">{s.left} day{s.left === 1 ? '' : 's'} to wait</Badge> : <Badge tone="green">Safe to harvest</Badge>}
                      <button type="button" aria-label={`Delete ${s.product} on block ${s.block}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" onClick={() => setSprays((all) => all.filter((x) => x.id !== s.id))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </PortalShell>
  );
}
