'use client';

/**
 * The owner's cold store map. Draw each chamber as rows × columns of places
 * (how many boxes one place holds), tap pillars, doors and the walkway to
 * mark them "not a place", and see who has booked which place for any
 * months — tap a booked place for the farmer's name, phone and boxes.
 * Capacity and vacancy of the store are counted from the map.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Phone, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ChamberGrid, ChamberTabs, PlaceLegend } from '@/components/rental/ColdStoreMap';
import { niceDate } from '@/components/rental/ColdBooking';
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
  const [active, setActive] = useState<string>(chambers[0]?.id ?? 'new');
  const current = chambers.find((c) => c.id === active);
  const [draft, setDraft] = useState<Draft>(() => draftOf(current, chambers.length + 1));
  const [start, setStart] = useState(today());
  const [months, setMonths] = useState(1);
  const [taken, setTaken] = useState<Map<string, PlaceState>>(new Map());
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A new chamber, or another tab: start from what is saved.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setDraft(draftOf(chambers.find((c) => c.id === active), chambers.length + 1));
      setPicked(null);
    });
    return () => cancelAnimationFrame(id);
  }, [active, chambers]);

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

  const onPlace = (key: string, slot: string, state: PlaceState | 'selected') => {
    if (state === 'held' || state === 'booked' || state === 'mine') return setPicked(key);
    setPicked(null);
    setDraft((d) => {
      const blocked = new Set(d.blocked);
      if (blocked.has(slot)) blocked.delete(slot);
      else blocked.add(slot);
      return { ...d, blocked };
    });
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

  return (
    <Modal open wide onClose={onClose} title={`Cold store map · ${l.title}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          Draw each chamber as rows (front to back) and columns (left to right) of places. Tap pillars, doors and the walkway to mark them “not a place”. Farmers then choose their own places, like seats on a plane, and you see who is where.
        </p>
        <ChamberTabs
          chambers={chambers}
          active={active}
          onPick={setActive}
          extra={
            <button type="button" onClick={() => setActive('new')} aria-pressed={active === 'new'} className={`inline-flex cursor-pointer items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold ${active === 'new' ? 'bg-violet-700 text-white' : 'bg-violet-50 text-violet-800 hover:bg-violet-100'}`}>
              <Plus className="h-4 w-4" aria-hidden /> Add chamber
            </button>
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Chamber name">
            <input className={INPUT} value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Rows (1–60)">
            <input type="number" min={1} max={60} className={INPUT} value={draft.rows || ''} onChange={(e) => set('rows', e.target.value)} />
          </Field>
          <Field label="Columns (1–26)">
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

        <ChamberGrid
          chamber={preview}
          mode="owner"
          stateOf={(key, slot) => (draft.blocked.has(slot) ? 'blocked' : taken.get(key) === 'mine' ? 'booked' : taken.get(key) ?? 'free')}
          labelOf={(key) => {
            const b = holder.get(key);
            return b ? initials(b.renter_name) : undefined;
          }}
          onPlace={onPlace}
        />
        <PlaceLegend show={['free', 'held', 'booked', 'blocked']} />

        {who && (
          <div className="rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-900/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">{who.renter_name}</p>
              <Badge tone={BOOKING_STATUS[who.status].tone}>{BOOKING_STATUS[who.status].label}</Badge>
            </div>
            <p className="mt-1 text-slate-700">
              {who.units.toLocaleString('en-IN')} boxes · {niceDate(who.start_date)} to {niceDate(periodEnd(who.start_date, who.duration))} · {inr(Number(who.amount))}
            </p>
            <p className="mt-1 text-slate-700">Places: {places.filter((p) => p.booking_id === who.id).map((p) => p.slot).join(', ')}</p>
            <a href={`tel:${who.renter_phone}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-violet-700"><Phone className="h-4 w-4" aria-hidden /> {who.renter_phone}</a>
          </div>
        )}
        <p className="text-xs text-slate-500">Places marked “not a place” are saved when you press Save chamber. A booked place cannot be removed or marked until that booking is finished.</p>
      </div>
    </Modal>
  );
}
