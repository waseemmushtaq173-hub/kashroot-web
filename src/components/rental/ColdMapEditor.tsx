'use client';

/**
 * The owner's cold store map, in two parts:
 *   Whole store     every chamber on the floor plan or in 3D, with who has
 *                   booked which place for any months — tap a booked stack
 *                   for the farmer's name, phone and boxes.
 *   Draw chambers   each chamber as rows (from the door to the back wall) of
 *                   stacks, how many boxes one place holds, and pillars /
 *                   walkways marked "no place here".
 * Capacity and vacancy of the store are counted from the map.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Pencil, Phone, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ChamberGrid, ColdStoreExplorer, PlaceLegend, type Look } from '@/components/rental/ColdStoreMap';
import { niceDate, placesText } from '@/components/rental/ColdBooking';
import { Badge, Btn, Field, INPUT, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { inr } from '@/lib/db/client';
import { deleteChamber, periodEnd, placeKey, saveChamber, takenPlaces, type BookedPlace, type ColdChamber, type PlaceState } from '@/lib/db/coldMap';
import { BOOKING_STATUS, type RentalBooking, type RentalListing } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
const today = () => new Date().toISOString().slice(0, 10);

interface Draft {
  name: string;
  rows: number;
  cols: number;
  boxes_per_slot: number;
  blocked: Set<string>;
}

const draftOf = (c?: ColdChamber, n = 1): Draft =>
  c ? { name: c.name, rows: c.rows, cols: c.cols, boxes_per_slot: c.boxes_per_slot, blocked: new Set(c.blocked) } : { name: `Chamber ${n}`, rows: 10, cols: 6, boxes_per_slot: 50, blocked: new Set() };

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
  const [active, setActive] = useState<string>(chambers[0]?.id ?? 'new');
  const current = chambers.find((c) => c.id === active);
  const [draft, setDraft] = useState<Draft>(() => draftOf(current, chambers.length + 1));
  const [start, setStart] = useState(today());
  const [months, setMonths] = useState(1);
  const [taken, setTaken] = useState<Map<string, PlaceState>>(new Map());
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Another chamber, or the saved one changed: start from what is saved. (Not
  // on every refresh of the page — that would wipe what the owner is typing.)
  const savedSig = current ? `${current.id}|${current.name}|${current.rows}|${current.cols}|${current.boxes_per_slot}|${current.blocked.join(',')}` : `new|${chambers.length}`;
  const [shownSig, setShownSig] = useState(savedSig);
  if (shownSig !== savedSig) {
    setShownSig(savedSig);
    setDraft(draftOf(current, chambers.length + 1));
    setPicked(null);
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

  // Place → the booking holding it (only bookings live for the months shown).
  const holder = useMemo(() => {
    const byId = new Map(bookings.map((b) => [b.id, b]));
    const m = new Map<string, RentalBooking>();
    for (const p of places) {
      const key = placeKey(p.chamber_id, p.slot);
      const b = byId.get(p.booking_id);
      if (b && taken.has(key)) m.set(key, b);
    }
    return m;
  }, [bookings, places, taken]);

  const preview: ColdChamber = {
    id: current?.id ?? 'new',
    listing_id: l.id,
    name: draft.name || 'New chamber',
    position: current?.position ?? chambers.length + 1,
    rows: Math.min(60, Math.max(1, draft.rows || 1)),
    cols: Math.min(26, Math.max(1, draft.cols || 1)),
    boxes_per_slot: Math.max(1, draft.boxes_per_slot || 1),
    blocked: [...draft.blocked],
    note: null,
  };
  const usable = preview.rows * preview.cols - [...draft.blocked].filter((s) => parseInt(s) <= preview.rows && s.charCodeAt(s.length - 1) - 64 <= preview.cols).length;

  // Drawing: tap a free place to mark "no place here" (or back); a booked one shows who.
  const onDraw = (c: ColdChamber, slot: string, look: Look) => {
    if (look === 'held' || look === 'booked' || look === 'mine') return setPicked(placeKey(c.id, slot));
    setPicked(null);
    setDraft((d) => {
      const blocked = new Set(d.blocked);
      if (blocked.has(slot)) blocked.delete(slot);
      else blocked.add(slot);
      return { ...d, blocked };
    });
  };
  const drawState = (c: ColdChamber, slot: string): Look => {
    const t = taken.get(placeKey(c.id, slot));
    return draft.blocked.has(slot) ? 'blocked' : t === 'mine' ? 'booked' : t ?? 'free';
  };

  // The whole store as saved.
  const storeState = useCallback(
    (c: ColdChamber, slot: string): Look => {
      const t = taken.get(placeKey(c.id, slot));
      return c.blocked.includes(slot) ? 'blocked' : t === 'mine' ? 'booked' : t ?? 'free';
    },
    [taken],
  );
  const onStore = useCallback((c: ColdChamber, slot: string, look: Look) => {
    setPicked(look === 'held' || look === 'booked' || look === 'mine' ? placeKey(c.id, slot) : null);
  }, []);
  const initialsOf = (key: string) => {
    const b = holder.get(key);
    return b ? initials(b.renter_name) : undefined;
  };

  const save = async () => {
    if (!draft.name.trim()) return toast.error('Give the chamber a name, e.g. Chamber 1.');
    if (!(draft.rows >= 1 && draft.rows <= 60 && draft.cols >= 1 && draft.cols <= 26)) return toast.error('Rows: 1 to 60. Columns: 1 to 26.');
    if (!(draft.boxes_per_slot >= 1)) return toast.error('How many boxes fit in one place?');
    setBusy(true);
    try {
      const saved = await saveChamber({ listing_id: l.id, name: draft.name.trim(), position: preview.position, rows: preview.rows, cols: preview.cols, boxes_per_slot: preview.boxes_per_slot, blocked: preview.blocked }, current?.id);
      toast.success('Chamber saved — farmers see it on the map');
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

  const who = picked ? holder.get(picked) : undefined;
  const set = (k: keyof Omit<Draft, 'blocked'>, v: string) => setDraft((d) => ({ ...d, [k]: k === 'name' ? v : Number(v) }));

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
  const whoPanel = who && (
    <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-900/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">{who.renter_name}</p>
        <Badge tone={BOOKING_STATUS[who.status].tone}>{BOOKING_STATUS[who.status].label}</Badge>
      </div>
      <p className="mt-1 text-slate-700">
        {who.units.toLocaleString('en-IN')} boxes · {niceDate(who.start_date)} to {niceDate(periodEnd(who.start_date, who.duration))} · {inr(Number(who.amount))}
      </p>
      <p className="mt-1 text-slate-700">Places: {placesText(places.filter((p) => p.booking_id === who.id), chambers)}</p>
      <a href={`tel:${who.renter_phone}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-violet-700"><Phone className="h-4 w-4" aria-hidden /> {who.renter_phone}</a>
    </div>
  );

  return (
    <Modal open wide onClose={onClose} title={`Cold store map · ${l.title}`}>
      <div className="space-y-4">
        <div role="tablist" aria-label="Cold store map" className="flex gap-1 rounded-2xl bg-violet-50 p-1 ring-1 ring-violet-200">
          {([['store', 'Whole store', Layers], ['draw', 'Draw chambers', Pencil]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={part === id} onClick={() => { setPart(id); setPicked(null); }} className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${part === id ? 'bg-violet-700 text-white shadow' : 'text-violet-900 hover:bg-violet-100'}`}>
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </button>
          ))}
        </div>

        {part === 'store' ? (
          chambers.length === 0 ? (
            <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">No chambers yet. Open “Draw chambers” and add your first chamber — farmers then see the whole store and choose their own places.</p>
          ) : (
            <>
              <p className="text-sm text-slate-700">Your whole store as farmers see it. Tap a booked stack to see whose boxes they are.</p>
              {months_}
              <ColdStoreExplorer
                chambers={chambers}
                stateOf={storeState}
                mode="owner"
                onPlace={onStore}
                labelOf={initialsOf}
                active={active === 'new' ? chambers[0]?.id ?? null : active}
                onActive={setActive}
                legend={['free', 'held', 'booked', 'blocked']}
              />
              {whoPanel}
            </>
          )
        ) : (
          <>
            <p className="text-sm text-slate-700">
              Draw each chamber as <strong>rows</strong> (Row 1 is by the door, the last row by the back wall) with the same number of <strong>stacks</strong> in each row. Tap a pillar or walkway to mark it “no place here”. Farmers then choose their own places and you see who is where.
            </p>
            <div role="tablist" aria-label="Chambers" className="flex flex-wrap gap-2">
              {chambers.map((c) => (
                <button key={c.id} type="button" role="tab" aria-selected={active === c.id} onClick={() => setActive(c.id)} className={pill(active === c.id)}>{c.name}</button>
              ))}
              <button type="button" onClick={() => setActive('new')} aria-pressed={active === 'new'} className={`inline-flex cursor-pointer items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold ${active === 'new' ? 'bg-violet-700 text-white' : 'bg-violet-50 text-violet-800 hover:bg-violet-100'}`}>
                <Plus className="h-4 w-4" aria-hidden /> Add chamber
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Chamber name">
                <input className={INPUT} value={draft.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Rows, door to back (1–60)">
                <input type="number" min={1} max={60} className={INPUT} value={draft.rows || ''} onChange={(e) => set('rows', e.target.value)} />
              </Field>
              <Field label="Stacks in each row (1–26)">
                <input type="number" min={1} max={26} className={INPUT} value={draft.cols || ''} onChange={(e) => set('cols', e.target.value)} />
              </Field>
              <Field label="Boxes per place">
                <input type="number" min={1} className={INPUT} value={draft.boxes_per_slot || ''} onChange={(e) => set('boxes_per_slot', e.target.value)} />
              </Field>
            </div>
            <p className="text-sm text-slate-700">
              <strong>{usable}</strong> places × {preview.boxes_per_slot} boxes = <strong>{(usable * preview.boxes_per_slot).toLocaleString('en-IN')} boxes</strong> in this chamber · {inr(Number(l.rate) * preview.boxes_per_slot)} per place per month
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn theme={theme} icon={Save} disabled={busy} onClick={() => void save()}>{current ? 'Save chamber' : 'Add this chamber'}</Btn>
              {current && <Btn theme={theme} variant="danger" icon={Trash2} disabled={busy} onClick={() => void remove()}>Remove chamber</Btn>}
            </div>
            {months_}
            <ChamberGrid chamber={preview} mode="owner" stateOf={drawState} labelOf={initialsOf} onPlace={onDraw} />
            <PlaceLegend show={['free', 'held', 'booked', 'blocked']} />
            {whoPanel}
            <p className="text-xs text-slate-500">Places marked “no place here” are saved when you press Save chamber. A booked place cannot be removed or marked until that booking is finished.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
