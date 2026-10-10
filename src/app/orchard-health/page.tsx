'use client';

/**
 * Orchard Health — free tools for growers, no sign-in needed (signed-in
 * farmers keep their blocks and spray log on their account):
 *   Scab risk: each of the farmer's own blocks against live hourly weather
 *     (Open-Meteo) — past wet spells that may have caused infection (curative
 *     window) and forecast ones to protect against (src/lib/scab.ts).
 *   Photo diagnosis: AI reads a leaf / fruit / bark photo (/api/diagnose).
 *   Spray log: pre-harvest waiting period countdown per block.
 * Advice can be read aloud in Urdu, Hindi or English.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarCheck, Camera, CloudRain, Droplets, LocateFixed, Map as MapIcon, MapPin, PlusCircle, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { PhotoDiagnosis } from '@/components/orchard/PhotoDiagnosis';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { LangPicker, SpeakButton } from '@/components/voice/VoiceButtons';
import type { SpeechLang } from '@/lib/client/speech';
import { loadAccount, type Account } from '@/lib/db/client';
import { orchardStore, type Block, type Spray } from '@/lib/db/orchard';
import { LEVEL_RANK, scabLevel, type ScabLevel, type WetSpell } from '@/lib/scab';

const theme = PORTAL_THEMES.farmer;

const PRODUCTS: { name: string; phi: number }[] = [
  { name: 'Captan 50 WP', phi: 21 },
  { name: 'Mancozeb 75 WP', phi: 30 },
  { name: 'Dodine 65 WP', phi: 30 },
  { name: 'Difenoconazole 25 EC', phi: 20 },
  { name: 'Hexaconazole 5 EC', phi: 21 },
  { name: 'Copper oxychloride 50 WP', phi: 21 },
  { name: 'Horticultural mineral oil', phi: 0 },
  { name: 'Calcium chloride spray', phi: 0 },
];

const WETNESS = [
  { value: -2, label: 'Dries fast — sunny slope, open canopy' },
  { value: 0, label: 'Normal' },
  { value: 3, label: 'Stays wet — shade, low ground, near water' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => new Date(Date.parse(iso.slice(0, 10)) + days * 864e5).toISOString().slice(0, 10);
const daysFromToday = (iso: string) => Math.ceil((Date.parse(iso) - Date.parse(todayIso())) / 864e5);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const placeKey = (b: Block) => (b.lat == null || b.lng == null ? null : `${b.lat.toFixed(2)},${b.lng.toFixed(2)}`);

type Status = 'infection' | 'upcoming' | 'covered' | 'safe' | 'unknown';
interface BlockRisk {
  status: Status;
  past?: WetSpell & { level: ScabLevel };
  next?: WetSpell & { level: ScabLevel };
  cover?: Spray;
}

const STATUS_LOOK: Record<Status, { label: string; tone: 'red' | 'amber' | 'green' | 'slate' | 'blue'; cell: string }> = {
  infection: { label: 'Infection likely — spray now', tone: 'red', cell: 'bg-red-50 ring-red-300' },
  upcoming: { label: 'Wet weather coming — protect', tone: 'amber', cell: 'bg-amber-50 ring-amber-300' },
  covered: { label: 'Protected by your spray', tone: 'blue', cell: 'bg-sky-50 ring-sky-300' },
  safe: { label: 'No scab risk', tone: 'green', cell: 'bg-emerald-50 ring-emerald-300' },
  unknown: { label: 'Set the location', tone: 'slate', cell: 'bg-white ring-slate-200' },
};

/** What to say about a block, in the farmer's language. */
function advice(b: Block, r: BlockRisk, lang: SpeechLang): string {
  const l = lang === 'ks' ? 'ur' : lang;
  const name = b.name;
  if (r.status === 'infection' && r.past) {
    const when = day(r.past.start);
    const by = day(addDays(r.past.start, 3));
    return {
      en: `${name}: scab infection is likely after the wet spell on ${when} — ${r.past.hours} wet hours at ${r.past.meanTemp} degrees. Spray a curative fungicide before ${by}, following the label.`,
      hi: `${name}: ${when} के गीले मौसम के बाद स्कैब लगने की संभावना है। ${by} से पहले उपचार वाला फफूंदनाशक छिड़कें, लेबल के अनुसार।`,
      ur: `${name}: ${when} کے گیلے موسم کے بعد اسکیب لگنے کا امکان ہے۔ ${by} سے پہلے علاج والی پھپھوند کش دوا کا اسپرے کریں، لیبل کے مطابق۔`,
    }[l];
  }
  if (r.status === 'upcoming' && r.next) {
    const when = day(r.next.start);
    return {
      en: `${name}: wet weather is expected on ${when}, long enough for scab. Spray a protective fungicide before the rain.`,
      hi: `${name}: ${when} को गीला मौसम आने वाला है, जिससे स्कैब लग सकता है। बारिश से पहले बचाव वाला फफूंदनाशक छिड़कें।`,
      ur: `${name}: ${when} کو گیلا موسم متوقع ہے جس سے اسکیب لگ سکتا ہے۔ بارش سے پہلے بچاؤ والی دوا کا اسپرے کریں۔`,
    }[l];
  }
  if (r.status === 'covered' && r.cover) {
    return {
      en: `${name}: protected by ${r.cover.product} sprayed on ${day(r.cover.sprayed_on)}.`,
      hi: `${name}: ${day(r.cover.sprayed_on)} को छिड़के गए ${r.cover.product} से सुरक्षित है।`,
      ur: `${name}: ${day(r.cover.sprayed_on)} کو کیے گئے ${r.cover.product} کے اسپرے سے محفوظ ہے۔`,
    }[l];
  }
  if (r.status === 'safe') {
    return {
      en: `${name}: no scab risk in the last three days or the next four.`,
      hi: `${name}: पिछले तीन दिन और अगले चार दिन में स्कैब का खतरा नहीं है।`,
      ur: `${name}: پچھلے تین دن اور اگلے چار دن میں اسکیب کا خطرہ نہیں ہے۔`,
    }[l];
  }
  return { en: `${name}: set this block's location to see its risk.`, hi: `${name}: खतरा देखने के लिए इस ब्लॉक की जगह चुनें।`, ur: `${name}: خطرہ دیکھنے کے لیے اس بلاک کی جگہ منتخب کریں۔` }[l];
}

function riskFor(b: Block, spells: WetSpell[] | undefined, sprays: Spray[]): BlockRisk {
  if (!spells) return { status: 'unknown' };
  const withLevel = spells.map((s) => ({ ...s, hours: Math.max(0, s.hours + (s.hours >= 2 ? b.wet_bias : 0)) })).map((s) => ({ ...s, level: scabLevel(s.hours, s.meanTemp) }));
  const worst = (list: typeof withLevel) => list.filter((s) => LEVEL_RANK[s.level] >= LEVEL_RANK.light).sort((a, c) => LEVEL_RANK[c.level] - LEVEL_RANK[a.level])[0];
  const past = worst(withLevel.filter((s) => s.past));
  const next = worst(withLevel.filter((s) => !s.past));
  const mine = sprays.filter((s) => s.block_id === b.id || s.block_name === b.name || s.block_name === 'Whole orchard');
  if (past) {
    const cover = mine.find((s) => s.sprayed_on >= addDays(past.start, -7));
    if (!cover) return { status: 'infection', past, next };
    if (!next) return { status: 'covered', past, cover };
  }
  if (next) {
    const cover = mine.find((s) => daysFromToday(s.sprayed_on) >= -7);
    return cover ? { status: 'covered', next, cover } : { status: 'upcoming', next, past };
  }
  return { status: 'safe' };
}

export default function OrchardHealthPage() {
  return (
    <Suspense>
      <OrchardHealth />
    </Suspense>
  );
}

function OrchardHealth() {
  const requested = useSearchParams().get('tab');
  const [tab, setTab] = useState(requested && ['risk', 'diagnose', 'sprays'].includes(requested) ? requested : 'risk');
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [lang, setLang] = useState<SpeechLang>('en');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [sprays, setSprays] = useState<Spray[]>([]);
  const [weather, setWeather] = useState<Record<string, WetSpell[] | 'error'>>({});
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [editing, setEditing] = useState<(Omit<Block, 'id'> & { id?: string }) | null>(null);
  const [draft, setDraft] = useState({ block: '', product: PRODUCTS[0].name, custom: '', phi: '21', date: '' });

  useEffect(() => {
    void loadAccount().then((a) => {
      setAccount(a);
      if (a?.lang) setLang(a.lang);
    });
  }, []);
  const store = useMemo(() => (account === undefined ? null : orchardStore(Boolean(account))), [account]);

  const reload = useCallback(async () => {
    if (!store) return;
    try {
      const [b, s] = await Promise.all([store.blocks(), store.sprays()]);
      setBlocks(b);
      setSprays(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load your orchard.');
    }
  }, [store]);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await reload();
    };
    void run();
    return () => {
      live = false;
    };
  }, [reload]);

  const fetchWeather = useCallback(async (list: Block[]) => {
    const keys = [...new Set(list.map(placeKey).filter((k): k is string => Boolean(k)))];
    if (!keys.length) return;
    setLoadingWeather(true);
    const entries = await Promise.all(
      keys.map(async (k) => {
        const [lat, lng] = k.split(',');
        try {
          const res = await fetch(`/api/orchard/scab?lat=${lat}&lng=${lng}`);
          const data = await res.json();
          return [k, res.ok ? (data.spells as WetSpell[]) : 'error'] as const;
        } catch {
          return [k, 'error'] as const;
        }
      }),
    );
    setWeather(Object.fromEntries(entries));
    setLoadingWeather(false);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void fetchWeather(blocks), 0);
    return () => window.clearTimeout(id);
  }, [blocks, fetchWeather]);

  const risks = useMemo(
    () => Object.fromEntries(blocks.map((b) => {
      const k = placeKey(b);
      const w = k ? weather[k] : undefined;
      return [b.id, riskFor(b, w === 'error' ? undefined : w, sprays)];
    })) as Record<string, BlockRisk>,
    [blocks, weather, sprays],
  );
  const weatherFailed = Object.values(weather).some((w) => w === 'error');

  const withheld = sprays
    .map((s) => ({ ...s, safeOn: addDays(s.sprayed_on, s.phi_days) }))
    .map((s) => ({ ...s, left: daysFromToday(s.safeOn) }))
    .sort((a, b) => b.left - a.left);
  const blockedBlocks = new Set(withheld.filter((s) => s.left > 0).map((s) => s.block_name));
  const atRisk = blocks.filter((b) => risks[b.id]?.status === 'infection' || risks[b.id]?.status === 'upcoming').length;

  const saveBlock = async () => {
    if (!store || !editing) return;
    if (!editing.name.trim()) return toast.error('Give the block a name, e.g. “Upper terrace”.');
    if (editing.lat == null) return toast.error('Set the location — use your phone’s location or search your village.');
    try {
      await store.saveBlock({ ...editing, name: editing.name.trim() });
      setEditing(null);
      toast.success('Block saved');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    }
  };

  const logSpray = async () => {
    if (!store) return;
    const custom = draft.product === 'Other';
    const product = custom ? draft.custom.trim() : draft.product;
    const phi = custom ? Number(draft.phi) : PRODUCTS.find((p) => p.name === draft.product)!.phi;
    if (!product) return toast.error('Write the product name.');
    if (!(phi >= 0 && phi <= 180)) return toast.error('Enter the waiting period from the label (days before harvest).');
    const block = blocks.find((b) => b.id === draft.block);
    const date = draft.date || todayIso();
    try {
      await store.addSpray({ block_id: block?.id ?? null, block_name: block?.name ?? 'Whole orchard', product, phi_days: phi, sprayed_on: date, note: null });
      toast.success(`${product} logged${phi ? ` — safe to harvest from ${day(addDays(date, phi))}` : ''}`);
      setDraft({ ...draft, date: '', custom: '' });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    }
  };

  const spokenRisk = blocks.map((b) => advice(b, risks[b.id] ?? { status: 'unknown' }, lang)).join(' ');
  const spokenSprays = withheld.length
    ? [...new Set(withheld.map((s) => s.block_name))]
        .map((name) => {
          const left = Math.max(...withheld.filter((s) => s.block_name === name).map((s) => s.left));
          const l = lang === 'ks' ? 'ur' : lang;
          return left > 0
            ? { en: `${name}: wait ${left} more days before picking.`, hi: `${name}: तोड़ने से पहले ${left} दिन और रुकें।`, ur: `${name}: توڑنے سے پہلے ${left} دن اور انتظار کریں۔` }[l]
            : { en: `${name}: safe to harvest.`, hi: `${name}: तोड़ना सुरक्षित है।`, ur: `${name}: توڑنا محفوظ ہے۔` }[l];
        })
        .join(' ')
    : '';

  return (
    <PortalShell
      standalone
      title="Orchard health"
      description="Scab risk for your own blocks from live weather, photo diagnosis, and a spray log that tells you when it’s safe to harvest."
      eyebrow="Orchard tools"
      theme="farmer"
      kpis={[
        { label: 'Blocks needing action', value: `${atRisk} / ${blocks.length}`, trend: blocks.length ? 'From live weather' : 'Add your blocks' },
        { label: 'Sprays logged', value: String(sprays.length), trend: account ? 'Saved to your account' : 'Saved on this phone' },
        { label: 'Blocks in waiting period', value: String(blockedBlocks.size), trend: blockedBlocks.size ? `Hold harvest: ${[...blockedBlocks].join(', ')}` : 'All clear to harvest' },
      ]}
      tabs={[
        { id: 'risk', label: 'Scab risk', icon: MapIcon, count: atRisk || undefined },
        { id: 'diagnose', label: 'Photo diagnosis', icon: Camera },
        { id: 'sprays', label: 'Spray log', icon: Droplets, count: withheld.filter((s) => s.left > 0).length || undefined },
      ]}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === 'risk' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LangPicker value={lang} onChange={setLang} />
            <div className="flex flex-wrap gap-2">
              {blocks.length > 0 && <SpeakButton text={spokenRisk} lang={lang === 'ks' ? 'ur' : lang} label="Listen to today’s advice" />}
              <Btn theme={theme} variant="soft" size="sm" icon={RefreshCw} disabled={loadingWeather} onClick={() => void fetchWeather(blocks)}>{loadingWeather ? 'Checking weather…' : 'Refresh weather'}</Btn>
              <Btn theme={theme} size="sm" icon={PlusCircle} onClick={() => setEditing({ name: blocks.length ? '' : 'My orchard', variety: '', place: blocks[0]?.place ?? null, lat: blocks[0]?.lat ?? null, lng: blocks[0]?.lng ?? null, wet_bias: 0 })}>Add block</Btn>
            </div>
          </div>
          {weatherFailed && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">The weather service did not answer for some blocks. Press Refresh weather in a minute.</p>}
          {blocks.length === 0 ? (
            <Panel theme={theme}>
              <EmptyState theme={theme} icon={MapIcon} title="Add your orchard" text="Add a block with its location — your phone’s GPS or your village name — and KashRoot checks the weather for scab every day." action={<Btn theme={theme} icon={PlusCircle} onClick={() => setEditing({ name: 'My orchard', variety: '', place: null, lat: null, lng: null, wet_bias: 0 })}>Add my orchard</Btn>} />
            </Panel>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {blocks.map((b) => {
                const r = risks[b.id] ?? { status: 'unknown' as const };
                const look = STATUS_LOOK[loadingWeather && r.status === 'unknown' ? 'unknown' : r.status];
                return (
                  <div key={b.id} className={`rounded-2xl p-4 ring-1 ${look.cell}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">{b.name}</p>
                        <p className="flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3 w-3" aria-hidden /> {b.place ?? 'Location set'}{b.variety ? ` · ${b.variety}` : ''}</p>
                      </div>
                      <Badge tone={look.tone}>{look.label}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-slate-800">{advice(b, r, 'en')}</p>
                    {r.past && r.status !== 'safe' && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600"><CloudRain className="h-3.5 w-3.5" aria-hidden /> Last wet spell: {day(r.past.start)} · {r.past.hours} h wet · {r.past.meanTemp} °C · {r.past.rainMm} mm</p>}
                    {r.next && <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600"><CloudRain className="h-3.5 w-3.5" aria-hidden /> Forecast: {day(r.next.start)} · about {r.next.hours} h wet at {r.next.meanTemp} °C</p>}
                    {blockedBlocks.has(b.name) && <p className="mt-2 rounded-lg bg-amber-100 p-2 text-xs text-amber-900">In a spray waiting period — check the spray log before picking.</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn theme={theme} size="sm" icon={Droplets} onClick={() => { setDraft({ ...draft, block: b.id }); setTab('sprays'); }}>Log a spray</Btn>
                      <Btn theme={theme} size="sm" variant="ghost" onClick={() => setEditing({ ...b })}>Edit</Btn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-500">Leaf wetness is estimated from rain and humidity (Open-Meteo); infection periods follow the Mills table. Spray timing and products: follow the label and your horticulture department.</p>
        </div>
      )}

      {tab === 'diagnose' && account !== undefined && <PhotoDiagnosis account={account} />}

      {tab === 'sprays' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Panel theme={theme} title="Log a spray" icon={PlusCircle}>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void logSpray(); }}>
              <Field label="Block">
                <select className={INPUT} value={draft.block} onChange={(e) => setDraft({ ...draft, block: e.target.value })}>
                  <option value="">Whole orchard</option>
                  {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
              <Field label="Product">
                <select className={INPUT} value={draft.product} onChange={(e) => setDraft({ ...draft, product: e.target.value })}>
                  {PRODUCTS.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.phi} days before harvest)</option>)}
                  <option value="Other">Other product…</option>
                </select>
              </Field>
              {draft.product === 'Other' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Product name">
                    <input className={INPUT} value={draft.custom} onChange={(e) => setDraft({ ...draft, custom: e.target.value })} />
                  </Field>
                  <Field label="Waiting period (days)" hint="From the label">
                    <input type="number" min={0} max={180} className={INPUT} value={draft.phi} onChange={(e) => setDraft({ ...draft, phi: e.target.value })} />
                  </Field>
                </div>
              )}
              <Field label="Sprayed on" hint="Leave empty for today. The waiting periods listed are typical — always use the number on your product’s label.">
                <input type="date" className={INPUT} value={draft.date} max={todayIso()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </Field>
              <Btn theme={theme} type="submit" icon={Droplets}>Add to spray log</Btn>
            </form>
          </Panel>
          <Panel theme={theme} title="When can I harvest?" icon={CalendarCheck} action={spokenSprays ? <SpeakButton text={spokenSprays} lang={lang === 'ks' ? 'ur' : lang} /> : undefined}>
            {withheld.length === 0 ? (
              <EmptyState theme={theme} icon={Droplets} title="No sprays logged" text="Log each spray to know exactly when every block is safe to pick." />
            ) : (
              <ul className="space-y-3">
                {withheld.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5">
                    <div>
                      <p className="font-semibold text-slate-900">{s.block_name} · {s.product}</p>
                      <p className="text-sm text-slate-600">Sprayed {day(s.sprayed_on)} · safe from {day(s.safeOn)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.left > 0 ? <Badge tone="red">{s.left} day{s.left === 1 ? '' : 's'} to wait</Badge> : <Badge tone="green">Safe to harvest</Badge>}
                      <button type="button" aria-label={`Delete ${s.product} on ${s.block_name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" onClick={() => void store?.deleteSpray(s.id).then(reload)}>
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

      {editing && <BlockModal value={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void saveBlock()} onDelete={editing.id ? () => void store?.deleteBlock(editing.id!).then(() => { setEditing(null); void reload(); }) : undefined} />}
    </PortalShell>
  );
}

function BlockModal({ value: v, onChange, onClose, onSave, onDelete }: { value: Omit<Block, 'id'> & { id?: string }; onChange: (v: Omit<Block, 'id'> & { id?: string }) => void; onClose: () => void; onSave: () => void; onDelete?: () => void }) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<{ name: string; admin: string; lat: number; lng: number }[]>([]);
  const [busy, setBusy] = useState(false);

  const useGps = () => {
    if (!navigator.geolocation) return toast.error('This phone cannot share its location — search your village instead.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onChange({ ...v, lat: Math.round(pos.coords.latitude * 1e4) / 1e4, lng: Math.round(pos.coords.longitude * 1e4) / 1e4, place: 'My location (GPS)' });
        toast.success('Location set');
      },
      () => {
        setBusy(false);
        toast.error('Location was blocked — allow it for this site, or search your village.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const search = async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/weather?search=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      setPlaces(data.places ?? []);
      if (!data.places?.length) toast.error('No place found — try the nearest town.');
    } catch {
      toast.error('Search failed — check your internet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={v.id ? 'Edit block' : 'Add a block'}
      footer={
        <>
          {onDelete && <Btn theme={theme} variant="danger" icon={Trash2} onClick={onDelete}>Remove</Btn>}
          <Btn theme={theme} variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn theme={theme} icon={ShieldCheck} onClick={onSave}>Save</Btn>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Block name">
            <input className={INPUT} value={v.name} onChange={(e) => onChange({ ...v, name: e.target.value })} placeholder="e.g. Upper terrace" />
          </Field>
          <Field label="Variety (optional)">
            <input className={INPUT} value={v.variety ?? ''} onChange={(e) => onChange({ ...v, variety: e.target.value })} placeholder="e.g. Delicious" />
          </Field>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-800">Location {v.lat != null && <span className="text-emerald-700">· {v.place ?? `${v.lat}, ${v.lng}`} ✓</span>}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn theme={theme} variant="soft" icon={LocateFixed} disabled={busy} onClick={useGps}>Use my location (stand in the orchard)</Btn>
          </div>
          <div className="mt-2 flex gap-2">
            <input className={INPUT} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} placeholder="…or type your village / town" />
            <Btn theme={theme} variant="soft" icon={Search} disabled={busy} onClick={() => void search()}>Find</Btn>
          </div>
          {places.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl ring-1 ring-slate-200">
              {places.map((p) => (
                <li key={`${p.lat},${p.lng}`}>
                  <button type="button" className="w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-emerald-50" onClick={() => { onChange({ ...v, lat: p.lat, lng: p.lng, place: `${p.name}${p.admin ? `, ${p.admin}` : ''}` }); setPlaces([]); }}>
                    {p.name} <span className="text-slate-500">{p.admin}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">How fast do the leaves dry here?</legend>
          <div className="mt-2 grid gap-2">
            {WETNESS.map((w) => (
              <label key={w.value} className={`flex cursor-pointer items-center gap-2 rounded-xl p-2.5 text-sm ring-1 ${v.wet_bias === w.value ? 'bg-emerald-50 ring-emerald-400' : 'ring-slate-200'}`}>
                <input type="radio" name="wet" className="text-emerald-700" checked={v.wet_bias === w.value} onChange={() => onChange({ ...v, wet_bias: w.value })} />
                {w.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
