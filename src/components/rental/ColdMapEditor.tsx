'use client';

/**
 * The owner's cold store map, in two parts:
 *   Whole store       every chamber on the floor plan or in 3D, with who has
 *                     booked which place for any months — tap a booked stack
 *                     for the farmers on it (a place can be shared), their
 *                     phones and boxes.
 *   Chamber sizes     the owner measures each chamber — length (door to back
 *                     wall), breadth and height, in feet or metres — and
 *                     KashRoot lays it out (lib/coldLayout): rows, stacks,
 *                     walkway, boxes per layer and layers, drawn to scale and
 *                     in 3D. The store's standards (box size, stack base,
 *                     walkway, air gaps) start from common values and can be
 *                     changed, and the owner can write their own count of
 *                     boxes on each place. Tap a place to mark a pillar
 *                     "no place here".
 * Capacity and vacancy of the store are counted from the map.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Layers, Phone, Plus, Ruler, Save, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { ChamberGrid, ColdStoreExplorer, PlaceLegend, type Look } from '@/components/rental/ColdStoreMap';
import { niceDate, placesText } from '@/components/rental/ColdBooking';
import { Badge, Btn, Field, INPUT, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { FOOT, INCH, layersText, planOf, showLength, STANDARDS, type ChamberSize, type SizeUnit } from '@/lib/coldLayout';
import { inr } from '@/lib/db/client';
import { deleteChamber, parsePlace, periodEnd, placeKey, roomOn, saveChamber, takenPlaces, type BookedPlace, type ColdChamber, type PlaceInfo } from '@/lib/db/coldMap';
import { BOOKING_STATUS, type RentalBooking, type RentalListing } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
const today = () => new Date().toISOString().slice(0, 10);

/** What the owner types, in their unit: room, base, walkway and gaps in feet / metres; the box in inches / cm. */
interface Draft {
  name: string;
  unit: SizeUnit;
  length: string;
  width: string;
  height: string;
  boxL: string;
  boxW: string;
  boxH: string;
  placeL: string;
  placeW: string;
  base: string;
  aisle: string;
  wallGap: string;
  stackGap: string;
  topGap: string;
  doorGap: string;
  /** The owner's own count of boxes on each place; empty = as many as fit. */
  boxes: string;
  blocked: Set<string>;
}
type SizeField = Exclude<keyof Draft, 'name' | 'unit' | 'blocked' | 'boxes'>;
const BOX_FIELDS: SizeField[] = ['boxL', 'boxW', 'boxH'];

/** Metres per unit typed: the room in feet / metres, the box in inches / cm. */
const per = (unit: SizeUnit, field: SizeField) => (BOX_FIELDS.includes(field) ? (unit === 'ft' ? INCH : 0.01) : unit === 'ft' ? FOOT : 1);
/** Box sizes to a tenth of an inch / cm, everything else to a hundredth of a foot / metre. */
const show = (m: number, unit: SizeUnit, field: SizeField) => {
  const r = BOX_FIELDS.includes(field) ? 10 : 100;
  return String(Math.round((m / per(unit, field)) * r) / r);
};
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

function draftFrom(size: ChamberSize | null, name: string, blocked: string[], unit: SizeUnit = 'ft'): Draft {
  const u = size?.unit ?? unit;
  const st = size ?? { ...STANDARDS, unit: u, length: NaN, width: NaN, height: NaN };
  const v = (m: number, f: SizeField) => (Number.isFinite(m) ? show(m, u, f) : '');
  return {
    name,
    unit: u,
    length: v(st.length, 'length'),
    width: v(st.width, 'width'),
    height: v(st.height, 'height'),
    boxL: v(st.box.l, 'boxL'),
    boxW: v(st.box.w, 'boxW'),
    boxH: v(st.box.h, 'boxH'),
    placeL: v(st.place.l, 'placeL'),
    placeW: v(st.place.w, 'placeW'),
    base: v(st.base, 'base'),
    aisle: v(st.aisle, 'aisle'),
    wallGap: v(st.wallGap, 'wallGap'),
    stackGap: v(st.stackGap, 'stackGap'),
    topGap: v(st.topGap, 'topGap'),
    doorGap: v(st.doorGap, 'doorGap'),
    boxes: size?.boxes ? String(size.boxes) : '',
    blocked: new Set(blocked),
  };
}

/** The size in metres, or null until length, breadth and height are filled in. */
function sizeOf(d: Draft): ChamberSize | null {
  const m = (f: SizeField) => num(d[f]) * per(d.unit, f);
  if (![d.length, d.width, d.height].every((s) => s.trim())) return null;
  return {
    unit: d.unit,
    length: m('length'),
    width: m('width'),
    height: m('height'),
    box: { l: m('boxL'), w: m('boxW'), h: m('boxH') },
    place: { l: m('placeL'), w: m('placeW') },
    base: m('base'),
    aisle: m('aisle'),
    wallGap: m('wallGap'),
    stackGap: m('stackGap'),
    topGap: m('topGap'),
    doorGap: m('doorGap'),
    ...(d.boxes.trim() ? { boxes: num(d.boxes) } : {}),
  };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export function ColdMapEditor({
  listing: l,
  chambers,
  bookings,
  places,
  onClose,
  onChanged,
}: {
  listing: RentalListing;
  chambers: ColdChamber[];
  /** This store's bookings (the owner sees them). */
  bookings: RentalBooking[];
  /** Which places those bookings hold. */
  places: BookedPlace[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [part, setPart] = useState<'store' | 'draw'>(chambers.length ? 'store' : 'draw');
  // The chamber being measured, and (separately) the one open in Whole store,
  // so looking around the store never touches unsaved sizes.
  const [active, setActive] = useState<string>(chambers[0]?.id ?? 'new');
  const [viewing, setViewing] = useState<string | null>(chambers[0]?.id ?? null);
  const current = chambers.find((c) => c.id === active);
  const lastUnit = chambers.find((c) => c.size)?.size?.unit ?? 'ft';
  const [draft, setDraft] = useState<Draft>(() => draftFrom(current?.size ?? null, current?.name ?? `Chamber ${chambers.length + 1}`, current?.blocked ?? [], lastUnit));
  const [start, setStart] = useState(today());
  const [months, setMonths] = useState(1);
  const [taken, setTaken] = useState<Map<string, PlaceInfo>>(new Map());
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Another chamber, or the saved one changed: start from what is saved. (Not
  // on every refresh of the page — that would wipe what the owner is typing.)
  const savedSig = current ? `${current.id}|${current.name}|${current.rows}|${current.cols}|${current.boxes_per_slot}|${current.blocked.join(',')}|${JSON.stringify(current.size)}` : `new|${chambers.length}`;
  const [shownSig, setShownSig] = useState(savedSig);
  if (shownSig !== savedSig) {
    setShownSig(savedSig);
    setDraft(draftFrom(current?.size ?? null, current?.name ?? `Chamber ${chambers.length + 1}`, current?.blocked ?? [], lastUnit));
  }

  const load = useCallback(async () => {
    try {
      setTaken(await takenPlaces(l.id, start, months));
    } catch {
      setTaken(new Map());
    }
  }, [l.id, start, months]);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (live) await load();
    })();
    return () => {
      live = false;
    };
  }, [load]);

  // Place → the bookings on it, with their boxes there (only bookings live for the months shown).
  const holder = useMemo(() => {
    const byId = new Map(bookings.map((b) => [b.id, b]));
    const live = new Set(['requested', 'paid', 'confirmed']);
    const m = new Map<string, { booking: RentalBooking; boxes: number | null }[]>();
    for (const p of places) {
      const key = placeKey(p.chamber_id, p.slot);
      const b = byId.get(p.booking_id);
      if (!b || !taken.has(key) || !live.has(b.status)) continue;
      const end = periodEnd(b.start_date, b.duration);
      if (end <= start || b.start_date >= periodEnd(start, months)) continue;
      m.set(key, [...(m.get(key) ?? []), { booking: b, boxes: p.boxes }]);
    }
    return m;
  }, [bookings, places, taken, start, months]);

  const size = sizeOf(draft);
  const plan = size ? planOf(size) : null;
  const laidOut = Boolean(plan && !plan.problems.length);
  const blockedIn = (rows: number, cols: number) => [...draft.blocked].filter((s) => parsePlace(s).row <= rows && parsePlace(s).stack <= cols);
  // What the chamber will be when saved: from its size, or (not measured yet) as it is.
  const preview: ColdChamber | null =
    laidOut && plan && size
      ? { id: current?.id ?? 'new', listing_id: l.id, name: draft.name || 'New chamber', position: current?.position ?? chambers.length + 1, rows: plan.rows, cols: plan.cols, boxes_per_slot: plan.boxesPerPlace, blocked: blockedIn(plan.rows, plan.cols), note: null, size }
      : current && !current.size
        ? { ...current, blocked: [...draft.blocked] }
        : null;
  const places_ = preview ? preview.rows * preview.cols - preview.blocked.length : 0;

  // Drawing: tap a free place to mark "no place here" (or back); a booked one shows who.
  const onDraw = useCallback((c: ColdChamber, slot: string, look: Look) => {
    if (look === 'held' || look === 'booked' || look === 'mine' || look === 'part') return setPicked(placeKey(c.id, slot));
    setPicked(null);
    setDraft((d) => {
      const blocked = new Set(d.blocked);
      if (blocked.has(slot)) blocked.delete(slot);
      else blocked.add(slot);
      return { ...d, blocked };
    });
  }, []);
  const drawState = useCallback(
    (c: ColdChamber, slot: string): Look => {
      const t = taken.get(placeKey(c.id, slot))?.state;
      return draft.blocked.has(slot) ? 'blocked' : t === 'mine' ? 'booked' : t ?? 'free';
    },
    [taken, draft.blocked],
  );
  const drawRoom = useCallback((c: ColdChamber, slot: string) => (draft.blocked.has(slot) ? 0 : roomOn(c, taken.get(placeKey(c.id, slot)))), [taken, draft.blocked]);

  // The whole store as saved.
  const storeState = useCallback(
    (c: ColdChamber, slot: string): Look => {
      const t = taken.get(placeKey(c.id, slot))?.state;
      return c.blocked.includes(slot) ? 'blocked' : t === 'mine' ? 'booked' : t ?? 'free';
    },
    [taken],
  );
  const storeRoom = useCallback((c: ColdChamber, slot: string) => (c.blocked.includes(slot) ? 0 : roomOn(c, taken.get(placeKey(c.id, slot)))), [taken]);
  const onStore = useCallback((c: ColdChamber, slot: string, look: Look) => {
    setPicked(look === 'held' || look === 'booked' || look === 'mine' || look === 'part' ? placeKey(c.id, slot) : null);
  }, []);
  // A stack's label: the farmer's initials, "+1" for each farmer sharing it.
  const initialsOf = (key: string) => {
    const on = holder.get(key);
    if (!on?.length) return undefined;
    return `${initials(on[0].booking.renter_name)}${on.length > 1 ? `+${on.length - 1}` : ''}`;
  };

  const save = async () => {
    if (!draft.name.trim()) return toast.error('Give the chamber a name, e.g. Chamber 1.');
    if (!size || !plan) return toast.error('Enter the length, breadth and height of the chamber.');
    if (plan.problems.length) return toast.error(plan.problems[0]);
    const moved = current && (current.rows !== plan.rows || current.cols !== plan.cols);
    const hasBookings = [...holder.keys()].some((k) => current && k.startsWith(`${current.id}:`));
    if (moved && hasBookings && !window.confirm('Farmers have booked places in this chamber. The new size changes the rows and stacks, so their places may move. Save anyway?')) return;
    setBusy(true);
    try {
      const saved = await saveChamber(
        { listing_id: l.id, name: draft.name.trim(), position: current?.position ?? chambers.length + 1, rows: plan.rows, cols: plan.cols, boxes_per_slot: plan.boxesPerPlace, blocked: blockedIn(plan.rows, plan.cols), size },
        current?.id,
      );
      toast.success('Chamber saved — farmers see it to scale and in 3D');
      await onChanged();
      setActive(saved.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!current || !window.confirm(`Remove ${current.name} from the map?`)) return;
    setBusy(true);
    try {
      await deleteChamber(current.id);
      toast.success('Chamber removed');
      await onChanged();
      setActive(chambers.find((c) => c.id !== current.id)?.id ?? 'new');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove.');
    } finally {
      setBusy(false);
    }
  };

  // Feet ⇄ metres: the same measurements, shown in the other unit.
  const setUnit = (unit: SizeUnit) =>
    setDraft((d) => {
      if (d.unit === unit) return d;
      const next = { ...d, unit };
      for (const f of Object.keys(d) as (keyof Draft)[]) {
        if (f === 'name' || f === 'unit' || f === 'blocked' || f === 'boxes') continue;
        const v = num(d[f]);
        next[f] = Number.isFinite(v) ? show(v * per(d.unit, f), unit, f) : d[f];
      }
      return next;
    });
  const set = (k: Exclude<keyof Draft, 'unit' | 'blocked'>, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const big = draft.unit === 'ft' ? 'ft' : 'm';
  const small = draft.unit === 'ft' ? 'in' : 'cm';
  const sizeInput = (k: SizeField, label: string, hint?: string) => (
    <Field label={`${label} (${BOX_FIELDS.includes(k) ? small : big})`} hint={hint}>
      <input type="number" inputMode="decimal" min={0} step="any" className={INPUT} value={draft[k]} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );

  const who = picked ? holder.get(picked) ?? [] : [];
  const pill = (on: boolean) => `cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold transition ${on ? 'bg-sky-700 text-white shadow-md' : 'bg-sky-100 text-sky-900 hover:bg-sky-200'}`;
  const months_ = (
    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-900/5">
      <Field label="Show bookings from">
        <input type="date" className={INPUT} value={start} onChange={(e) => setStart(e.target.value || today())} />
      </Field>
      <Field label="For">
        <select className={INPUT} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {[1, 2, 3, 6, 9, 12].map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
        </select>
      </Field>
    </div>
  );
  const whoPanel = who.length > 0 && (
    <section aria-label="Who is on this place" className="space-y-2">
      {who.length > 1 && <p className="text-sm font-semibold text-slate-800">{who.length} farmers share this place</p>}
      {who.map(({ booking: b, boxes }) => (
        <div key={b.id} className="rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-900/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900">{b.renter_name}</p>
            <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
          </div>
          <p className="mt-1 text-slate-700">
            {boxes ? <><strong>{boxes.toLocaleString('en-IN')} boxes on this place</strong> · </> : null}
            {b.units.toLocaleString('en-IN')} boxes in all · {niceDate(b.start_date)} to {niceDate(periodEnd(b.start_date, b.duration))} · {inr(Number(b.amount))}
          </p>
          <p className="mt-1 text-slate-700">Places: {placesText(places.filter((p) => p.booking_id === b.id), chambers)}</p>
          <a href={`tel:${b.renter_phone}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-violet-700"><Phone className="h-4 w-4" aria-hidden /> {b.renter_phone}</a>
        </div>
      ))}
    </section>
  );
  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-900/5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </div>
  );

  return (
    <Modal open wide onClose={onClose} title={`Cold store map · ${l.title}`}>
      <div className="space-y-4">
        <div role="tablist" aria-label="Cold store map" className="flex gap-1 rounded-2xl bg-violet-50 p-1 ring-1 ring-violet-200">
          {([['store', 'Whole store', Layers], ['draw', 'Chamber sizes', Ruler]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={part === id} onClick={() => { setPart(id); setPicked(null); }} className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${part === id ? 'bg-violet-700 text-white shadow' : 'text-violet-900 hover:bg-violet-100'}`}>
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </button>
          ))}
        </div>

        {part === 'store' ? (
          chambers.length === 0 ? (
            <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">No chambers yet. Open “Chamber sizes”, enter the length, breadth and height of your first chamber — KashRoot draws it to scale and in 3D, and farmers choose their own places.</p>
          ) : (
            <>
              <p className="text-sm text-slate-700">Your whole store as farmers see it. Tap a booked stack to see whose boxes they are.</p>
              {months_}
              <ColdStoreExplorer
                chambers={chambers}
                stateOf={storeState}
                roomOf={storeRoom}
                mode="owner"
                onPlace={onStore}
                labelOf={initialsOf}
                active={viewing}
                onActive={setViewing}
                legend={['free', 'part', 'held', 'booked', 'blocked']}
              />
              {whoPanel}
            </>
          )
        ) : (
          <>
            <p className="text-sm text-slate-700">
              Measure each chamber and enter its <strong>length</strong> (from the door to the back wall), <strong>breadth</strong> (wall to wall) and <strong>height</strong> (floor to ceiling). KashRoot lays out the stacks, the walkway and how many boxes go on each place — drawn to scale and in 3D, so farmers see exactly where their boxes will stand.
            </p>
            <div role="tablist" aria-label="Chambers" className="flex flex-wrap gap-2">
              {chambers.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={active === c.id} onClick={() => setActive(c.id)} className={pill(active === c.id)}>{c.name}</button>
              ))}
              <button type="button" onClick={() => setActive('new')} aria-pressed={active === 'new'} className={`inline-flex cursor-pointer items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold ${active === 'new' ? 'bg-violet-700 text-white' : 'bg-violet-50 text-violet-800 hover:bg-violet-100'}`}>
                <Plus className="h-4 w-4" aria-hidden /> Add chamber
              </button>
            </div>

            {current && !current.size && (
              <p className="flex items-start gap-2 rounded-2xl bg-sky-50 p-3 text-sm text-sky-950 ring-1 ring-sky-200">
                <Ruler className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {current.name} was set up as {current.rows} rows × {current.cols} stacks before sizes were added. Enter its length, breadth and height to draw it to scale.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Chamber name">
                <input className={INPUT} value={draft.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <div role="radiogroup" aria-label="Measured in" className="flex gap-1 rounded-xl bg-slate-100 p-1">
                {(['ft', 'm'] as const).map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={draft.unit === u} onClick={() => setUnit(u)} className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition ${draft.unit === u ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}>
                    {u === 'ft' ? 'Feet' : 'Metres'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {sizeInput('length', 'Length, door to back wall')}
              {sizeInput('width', 'Breadth, wall to wall')}
              {sizeInput('height', 'Height, floor to ceiling')}
            </div>
            <Field
              label="Boxes on each place (your count)"
              hint={plan && plan.fits > 0 ? `By your sizes up to ${plan.fits.toLocaleString('en-IN')} fit (${plan.perLayer} a layer × ${Math.round(plan.fits / plan.perLayer)} layers). Leave empty to use that, or write how many you really put on one place.` : 'Leave empty: KashRoot works it out from the sizes. Or write how many boxes you put on one place.'}
            >
              <input type="number" inputMode="numeric" min={1} step={1} className={`${INPUT} sm:max-w-xs`} placeholder={plan && plan.fits > 0 ? String(plan.fits) : 'e.g. 120'} value={draft.boxes} onChange={(e) => set('boxes', e.target.value)} />
            </Field>

            <details className="group rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-900/5">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800">
                <span className="inline-flex items-center gap-2"><Boxes className="h-4 w-4 text-violet-700" aria-hidden /> Your store’s standards — box size, stack base, walkway, air gaps</span>
                <span className="ml-1 text-xs font-normal text-slate-500 group-open:hidden">(common values are filled in — tap to check)</span>
              </summary>
              <p className="mt-2 text-xs text-slate-600">Common values are filled in. Measure one of your boxes and your stack base (pallet), and change anything that differs in your store.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {sizeInput('boxL', 'Box length')}
                {sizeInput('boxW', 'Box width')}
                {sizeInput('boxH', 'Box height')}
                {sizeInput('placeL', 'Stack base length', 'The pallet a stack stands on')}
                {sizeInput('placeW', 'Stack base width')}
                {sizeInput('base', 'Base height')}
                {sizeInput('aisle', 'Walkway width', '0 = no walkway')}
                {sizeInput('wallGap', 'Air gap at the walls')}
                {sizeInput('stackGap', 'Gap between stacks')}
                {sizeInput('topGap', 'Air gap under the ceiling')}
                {sizeInput('doorGap', 'Clear space inside the door')}
              </div>
            </details>

            {plan && plan.problems.length > 0 && (
              <ul role="alert" className="space-y-1 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">
                {plan.problems.map((p) => <li key={p} className="flex items-start gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {p}</li>)}
              </ul>
            )}
            {laidOut && plan && size && (
              <section aria-label="What fits in this chamber" className="space-y-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {stat('Places', String(places_), `${plan.rows} rows × ${plan.cols} stacks${plan.aisleAfter !== null ? ' + walkway' : ''}`)}
                  {stat('Boxes per place', String(plan.boxesPerPlace), `${layersText(plan)}${size.boxes ? ' · your count' : ''}`)}
                  {stat('Stack height', showLength(plan.stackHeight, size.unit), `ceiling ${showLength(size.height, size.unit)}`)}
                  {stat('Chamber holds', `${(places_ * plan.boxesPerPlace).toLocaleString('en-IN')} boxes`, `${inr(Number(l.rate) * plan.boxesPerPlace)} per place a month`)}
                </div>
                {plan.notes.map((n) => <p key={n} className="text-xs text-amber-800">{n}</p>)}
              </section>
            )}

            <div className="flex flex-wrap gap-2">
              <Btn theme={theme} icon={Save} disabled={busy || !laidOut} onClick={() => void save()}>{current ? 'Save chamber' : 'Add this chamber'}</Btn>
              {current && <Btn theme={theme} variant="danger" icon={Trash2} disabled={busy} onClick={() => void remove()}>Remove chamber</Btn>}
            </div>

            {preview && (
              <>
                {months_}
                <p className="text-xs text-slate-600">Preview — tap a place to mark a pillar or anything else as “no place here” (tap again to undo); tap a booked place to see whose it is.</p>
                {preview.size ? (
                  <ColdStoreExplorer
                    chambers={[preview]}
                    single
                    stateOf={drawState}
                    roomOf={drawRoom}
                    mode="owner"
                    onPlace={onDraw}
                    labelOf={initialsOf}
                    active={preview.id}
                    onActive={() => undefined}
                    legend={['free', 'part', 'held', 'booked', 'blocked']}
                  />
                ) : (
                  <>
                    <ChamberGrid chamber={preview} mode="owner" stateOf={drawState} roomOf={drawRoom} labelOf={initialsOf} onPlace={onDraw} />
                    <PlaceLegend show={['free', 'part', 'held', 'booked', 'blocked']} />
                  </>
                )}
                {whoPanel}
                <p className="text-xs text-slate-500">Places marked “no place here” are saved when you press Save chamber. A booked place cannot be removed or marked until that booking is finished.</p>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
