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
import { CheckCircle2, ClipboardCheck, Eye, Pencil, Phone } from 'lucide-react';

import { ColdStoreExplorer, type Look } from '@/components/rental/ColdStoreMap';
import type { PlaceHolder } from '@/components/rental/ColdStore3D';
import { niceDate, placesText } from '@/components/rental/ColdBooking';
import { Badge, Btn, Field, INPUT, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { ownerMeasured } from '@/lib/coldLayout';
import { unitWord, unitsText } from '@/lib/coldStore';
import { inr } from '@/lib/db/client';
import { periodEnd, placeKey, placeName, roomOn, takenPlaces, type BookedPlace, type ColdChamber, type PlaceInfo } from '@/lib/db/coldMap';
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
  onPreview,
  onRequests,
  onReceived,
  busy = false,
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
  /** Open the booking window as a farmer sees it (nothing can be booked), to see how a farmer chooses a place and pays. */
  onPreview?: () => void;
  /** Go to "Bookings to confirm". */
  onRequests?: () => void;
  /** The money for this booking has reached the owner: confirm it. */
  onReceived?: (b: RentalBooking) => void;
  busy?: boolean;
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
  // Who holds one place for the crate drawer: names and their boxes there, from the
  // bookings alone (nothing invented when the records do not say).
  const stackOf = useCallback(
    (c: ColdChamber, slot: string) => {
      const on = holder.get(placeKey(c.id, slot));
      if (!on?.length) return null;
      const [first] = on;
      const boxes = first.boxes != null && first.boxes > 0 ? `${first.boxes.toLocaleString('en-IN')} ${unitWord(c.storage, first.boxes)}` : null;
      return `${first.booking.renter_name}${boxes ? ` — ${boxes}` : ''}${on.length > 1 ? ` (+${on.length - 1} more)` : ''}`;
    },
    [holder],
  );
  // Every farmer sharing one place, for the 3D place card (units from the bookings; the booking's
  // reference is its payment reference or short id; no variety is invented — bookings do not hold one).
  const holdersOf = useCallback(
    (c: ColdChamber, slot: string): PlaceHolder[] =>
      (holder.get(placeKey(c.id, slot)) ?? []).map(({ booking, boxes }) => ({
        name: booking.renter_name,
        units: boxes != null && boxes > 0 ? boxes : null,
        ref: booking.payment_ref || booking.id.slice(0, 8).toUpperCase(),
      })),
    [holder],
  );

  // Chambers from before the wizard (boxes only) or without the owner's own measurements.
  const oldSetup = chambers.filter((c) => c.storage === 'boxes' || !ownerMeasured(c.size));
  const who = picked ? holder.get(picked) ?? [] : [];
  const waiting = bookings.filter((b) => b.status === 'requested' || b.status === 'paid');
  // What the store holds, and how much of it is free for the months shown: counted place by place from the map, the same numbers as the drawing's.
  const totals = useMemo(() => {
    let holds = 0;
    let free = 0;
    for (const c of chambers) {
      for (let r = 1; r <= c.rows; r++) {
        for (let i = 0; i < c.cols; i++) {
          const slot = placeName(r, i);
          if (c.blocked.includes(slot)) continue;
          holds += c.boxes_per_slot;
          free += roomOn(c, taken.get(placeKey(c.id, slot)));
        }
      }
    }
    return { holds, free };
  }, [chambers, taken]);
  const unit = chambers.find((c) => picked?.startsWith(`${c.id}:`))?.storage ?? 'boxes';
  return (
    <Modal open wide onClose={onClose} title={`Cold store map · ${l.title}`}>
      <div className="space-y-4">
        <div role="group" aria-label="What you can do here" className="grid gap-2 sm:grid-cols-3">
          {onPreview && chambers.length > 0 && (
            <Btn theme={theme} className="min-h-[48px] text-base" icon={Eye} data-testid="owner-preview" onClick={onPreview}>See how a farmer books & pays</Btn>
          )}
          {onRequests && (
            <Btn theme={theme} variant={waiting.length ? 'solid' : 'soft'} className="min-h-[48px] text-base" icon={ClipboardCheck} data-testid="owner-requests" onClick={onRequests}>
              Bookings to confirm{waiting.length ? ` · ${waiting.length}` : ''}
            </Btn>
          )}
          <Btn theme={theme} variant="soft" className="min-h-[48px] text-base" icon={Pencil} onClick={onEdit}>Change chambers</Btn>
        </div>
        {chambers.length > 0 && (
          <div>
            <dl data-testid="owner-counts" className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Free', totals.free, 'bg-forest-soft text-forest-deep ring-[#CFE0D6]'],
                ['Booked', Math.max(0, totals.holds - totals.free), 'bg-sky-50 text-sky-950 ring-sky-200'],
                ['Waiting for you', waiting.length, waiting.length ? 'bg-amber-50 text-amber-950 ring-amber-300' : 'bg-slate-50 text-slate-800 ring-slate-200'],
              ].map(([label, n, tone]) => (
                <div key={label as string} className={`rounded-2xl p-2.5 ring-1 ${tone}`}>
                  <dt className="text-xs font-semibold">{label}</dt>
                  <dd className="text-xl font-bold tabular-nums">{(n as number).toLocaleString('en-IN')}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-1.5 text-xs text-slate-600">Out of {totals.holds.toLocaleString('en-IN')} {unitsText(chambers.map((c) => c.storage))} for the months chosen below, counted from your chambers. Tap a booked place to see whose it is.</p>
          </div>
        )}
        {oldSetup.length > 0 && (
          <div role="note" className="rounded-2xl bg-amber-50 p-4 text-amber-950 ring-2 ring-amber-300">
            <p className="font-semibold">This store is still the old setup</p>
            <p className="mt-1 text-sm">
              {oldSetup.length === 1 ? `${oldSetup[0].name} is` : `${oldSetup.length} chambers are`} only “rows × stacks × boxes”: no bins or crates, no floors, no measured sizes. So farmers cannot book {oldSetup.length === 1 ? 'it' : 'them'}, and the 3D below is a rough picture, not your real store.
              Set it up the new way — your building, each chamber’s bins or crates, floors and door — and the 3D, the walk inside and booking all come from your own numbers. About 5 minutes.
            </p>
            <Btn theme={theme} className="mt-3 min-h-[48px] w-full text-base sm:w-auto" icon={Pencil} onClick={onEdit}>Set up the new way</Btn>
          </div>
        )}
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
              stackOf={stackOf}
              holdersOf={holdersOf}
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
                    {(b.status === 'requested' || b.status === 'paid') && (
                      <p className={`mt-1 ${b.payment_ref ? 'text-forest-deep' : 'text-amber-800'}`}>
                        {b.payment_ref ? <>Farmer says paid · reference <span className="font-mono font-semibold">{b.payment_ref}</span> — check it in your bank or UPI app.</> : 'Not paid yet.'}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(b.status === 'requested' || b.status === 'paid') && onReceived && (
                        <Btn theme={theme} className="min-h-[44px]" icon={CheckCircle2} disabled={busy} data-testid="owner-money-received" onClick={() => onReceived(b)}>Money received</Btn>
                      )}
                      <Btn theme={theme} variant="soft" className="min-h-[44px]" icon={Phone} href={`tel:${b.renter_phone}`}>Call {b.renter_phone}</Btn>
                    </div>
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
