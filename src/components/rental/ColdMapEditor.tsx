'use client';

/**
 * The owner's whole cold store as farmers see it — every chamber (each floor
 * of a chamber is its own room) on the floor plan or in 3D, with who has
 * booked which place for any months. Tap a booked stack for the farmers on
 * it (a place can be shared), their phones and their boxes.
 * Chambers are added and changed in the owner wizard
 * (components/rental/owner/OwnerWizard): "Change chambers" opens it.
 * Capacity and vacancy of the store are counted from the map.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Phone } from 'lucide-react';

import { ColdStoreExplorer, type Look } from '@/components/rental/ColdStoreMap';
import { niceDate, placesText } from '@/components/rental/ColdBooking';
import { Badge, Btn, Field, INPUT, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { unitWord } from '@/lib/coldStore';
import { inr } from '@/lib/db/client';
import { periodEnd, placeKey, roomOn, takenPlaces, type BookedPlace, type ColdChamber, type PlaceInfo } from '@/lib/db/coldMap';
import { BOOKING_STATUS, type RentalBooking, type RentalListing } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
const today = () => new Date().toISOString().slice(0, 10);

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
  onEdit,
}: {
  listing: RentalListing;
  chambers: ColdChamber[];
  /** This store's bookings (the owner sees them). */
  bookings: RentalBooking[];
  /** Which places those bookings hold. */
  places: BookedPlace[];
  onClose: () => void;
  /** Open the owner wizard at the chambers. */
  onEdit: () => void;
}) {
  const [viewing, setViewing] = useState<string | null>(chambers[0]?.id ?? null);
  const [start, setStart] = useState(today());
  const [months, setMonths] = useState(1);
  const [taken, setTaken] = useState<Map<string, PlaceInfo>>(new Map());
  const [picked, setPicked] = useState<string | null>(null);

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

  const who = picked ? holder.get(picked) ?? [] : [];
  const unit = chambers.find((c) => picked?.startsWith(`${c.id}:`))?.storage ?? 'boxes';
  return (
    <Modal open wide onClose={onClose} title={`Cold store map · ${l.title}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">Your whole store as farmers see it. Tap a booked stack to see whose boxes they are.</p>
          <Btn theme={theme} variant="soft" className="min-h-[44px]" icon={Pencil} onClick={onEdit}>Change chambers</Btn>
        </div>
        {chambers.length === 0 ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">No chambers yet. Tap “Change chambers” and add your first chamber: how many bins or crates it holds, its floors, size and door. KashRoot draws it to scale and in 3D, and farmers choose their own places.</p>
        ) : (
          <>
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
            {who.length > 0 && (
              <section aria-label="Who is on this place" className="space-y-2">
                {who.length > 1 && <p className="text-sm font-semibold text-slate-800">{who.length} farmers share this place</p>}
                {who.map(({ booking: b, boxes }) => (
                  <div key={b.id} className="rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-900/10">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{b.renter_name}</p>
                      <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                    </div>
                    <p className="mt-1 text-slate-700">
                      {boxes ? <><strong>{boxes.toLocaleString('en-IN')} {unitWord(unit, boxes)} on this place</strong> · </> : null}
                      {b.units.toLocaleString('en-IN')} in all · {niceDate(b.start_date)} to {niceDate(periodEnd(b.start_date, b.duration))} · {inr(Number(b.amount))}
                    </p>
                    <p className="mt-1 text-slate-700">Places: {placesText(places.filter((p) => p.booking_id === b.id), chambers)}</p>
                    <a href={`tel:${b.renter_phone}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-violet-700"><Phone className="h-4 w-4" aria-hidden /> {b.renter_phone}</a>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
