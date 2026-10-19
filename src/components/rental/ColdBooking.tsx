'use client';

/**
 * Booking your own place in a cold store:
 *   1. choose the months (from when, for how long);
 *   2. look around the whole store — every chamber on the floor plan or in
 *      3D — and tap the places you want (or let KashRoot choose the ones
 *      nearest the door for your number of boxes). Any number of boxes: a
 *      small lot shares a place with others, and you pay only for your own
 *      boxes; boxes and price add up as you go;
 *   3. confirm: the places are held for 24 hours while you pay the owner by
 *      UPI; the owner confirms when the money arrives.
 * Also MyPlaces: where a farmer's boxes are, in the whole store.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Map as MapIcon, Navigation, RefreshCw, Snowflake, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { ColdStoreExplorer, type Look } from '@/components/rental/ColdStoreMap';
import { placesOf } from '@/components/rental/placeLook';
import { Btn, Field, INPUT, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { inr, type Account } from '@/lib/db/client';
import { layersText, placeDirections, planOf, showLength } from '@/lib/coldLayout';
import { bookPlaces, parsePlace, periodEnd, placeKey, placeLabel, roomOn, takenPlaces, type BookedPlace, type ColdChamber, type PlaceInfo } from '@/lib/db/coldMap';
import type { RentalListing } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24];
export const niceDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** A place and, when it is shared, how many of the farmer's boxes are on it. */
type Placed = { chamber_id: string; slot: string; boxes?: number | null };

/** "Chamber 1 — Row 1: stacks 1, 2 (50 boxes); Row 3: stack 4 · Chamber 2 — Row 2: stack 1" */
export function placesText(places: Placed[], chambers: ColdChamber[]): string {
  const by = new Map<string, Placed[]>();
  for (const p of places) by.set(p.chamber_id, [...(by.get(p.chamber_id) ?? []), p]);
  return chambers
    .filter((c) => by.has(c.id))
    .map((c) => {
      const rows = new Map<number, { stack: number; boxes?: number | null }[]>();
      for (const p of by.get(c.id) ?? []) {
        const { row, stack } = parsePlace(p.slot);
        rows.set(row, [...(rows.get(row) ?? []), { stack, boxes: p.boxes }]);
      }
      const parts = [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([row, stacks]) => {
          const list = stacks
            .sort((a, b) => a.stack - b.stack)
            .map((x) => `${x.stack}${x.boxes && x.boxes < c.boxes_per_slot ? ` (${x.boxes.toLocaleString('en-IN')} boxes)` : ''}`);
          return `Row ${row}: stack${stacks.length > 1 ? 's' : ''} ${list.join(', ')}`;
        });
      return `${c.name} — ${parts.join('; ')}`;
    })
    .join(' · ');
}

/**
 * Walking directions to each place in a measured chamber: how far in from
 * the door, which side of the walkway, which stack — and how high to stack.
 */
export function PlaceDirections({ places, chambers }: { places: Placed[]; chambers: ColdChamber[] }) {
  const items = chambers
    .filter((c) => c.size && places.some((p) => p.chamber_id === c.id))
    .flatMap((c) => {
      const size = c.size!;
      const plan = planOf(size);
      return places
        .filter((p) => p.chamber_id === c.id)
        .map((p) => ({ c, p, size, plan, ...parsePlace(p.slot) }))
        .sort((a, b) => a.row - b.row || a.stack - b.stack);
    });
  if (!items.length) return null;
  const first = items[0];
  return (
    <div className="mt-2 rounded-xl bg-violet-50 p-3 text-sm text-violet-950 ring-1 ring-violet-200">
      <p className="flex items-center gap-1.5 font-semibold"><Navigation className="h-4 w-4" aria-hidden /> Where to put your boxes</p>
      <ul className="mt-1 space-y-0.5">
        {items.map(({ c, p, size, plan, row, stack }) => (
          <li key={`${c.id}:${p.slot}`}>
            <strong>{c.name} · {placeLabel(p.slot)}</strong> — {placeDirections(size, plan, row, stack)}
            {p.boxes && p.boxes < c.boxes_per_slot ? <> · <strong>your {p.boxes.toLocaleString('en-IN')} boxes</strong> (shared place)</> : null}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-violet-900/80">
        A full place takes {first.c.boxes_per_slot.toLocaleString('en-IN')} boxes: {layersText(first.plan)} ({showLength(first.plan.stackHeight, first.size.unit)} high).
      </p>
    </div>
  );
}

export function ColdBooking({ listing: l, chambers, account, onClose, onBooked }: { listing: RentalListing; chambers: ColdChamber[]; account: Account; onClose: () => void; onBooked: () => void }) {
  const [start, setStart] = useState(today());
  const [months, setMonths] = useState(6);
  const [taken, setTaken] = useState<Map<string, PlaceInfo> | null>(null);
  const [active, setActive] = useState<string | null>(chambers[0]?.id ?? null);
  // Chosen places, each with how many of the farmer's boxes go on it.
  const [picked, setPicked] = useState<Map<string, { chamber: ColdChamber; slot: string; boxes: number }>>(new Map());
  const [want, setWant] = useState('');
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');
  const [form, setForm] = useState({ name: account.name, phone: account.phone });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await takenPlaces(l.id, start, months);
      setTaken(t);
      // Boxes others booked meanwhile: a chosen place keeps only what still fits.
      setPicked((prev) => {
        let changed = false;
        const next = new Map<string, { chamber: ColdChamber; slot: string; boxes: number }>();
        for (const [k, p] of prev) {
          const room = roomOn(p.chamber, t.get(k));
          if (room <= 0) changed = true;
          else if (p.boxes > room) {
            next.set(k, { ...p, boxes: room });
            changed = true;
          } else next.set(k, p);
        }
        return changed ? next : prev;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the map.');
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

  const chamber = chambers.find((c) => c.id === active) ?? chambers[0];
  const boxes = useMemo(() => [...picked.values()].reduce((s, p) => s + p.boxes, 0), [picked]);
  const total = boxes * months * Number(l.rate);
  // The farmer's own box count, if written.
  const wanted = Math.floor(Number(want)) || 0;
  /** Boxes that fit on a place for these months, before this farmer's choice. */
  const roomFor = useCallback((c: ColdChamber, slot: string) => (c.blocked.includes(slot) ? 0 : roomOn(c, taken?.get(placeKey(c.id, slot)))), [taken]);

  const stateOf = useCallback(
    (c: ColdChamber, slot: string): Look => {
      const key = placeKey(c.id, slot);
      return c.blocked.includes(slot) ? 'blocked' : picked.has(key) ? 'selected' : taken?.get(key)?.state ?? 'free';
    },
    [picked, taken],
  );
  // Room left on each place once this farmer's chosen boxes are on it.
  const roomOf = useCallback((c: ColdChamber, slot: string) => Math.max(0, roomFor(c, slot) - (picked.get(placeKey(c.id, slot))?.boxes ?? 0)), [roomFor, picked]);

  // Tap a place: it takes as many of the farmer's boxes as still need a place
  // (all that fit when no number is written); tap again to take it off.
  const toggle = useCallback(
    (c: ColdChamber, slot: string, look: Look) => {
      if (look !== 'free' && look !== 'part' && look !== 'selected') return;
      const key = placeKey(c.id, slot);
      if (picked.has(key)) {
        setPicked((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        return;
      }
      const room = roomFor(c, slot);
      if (room <= 0) return;
      const left = wanted > 0 ? wanted - boxes : room;
      if (left <= 0) {
        toast.info(`All your ${wanted.toLocaleString('en-IN')} boxes have a place. Tap a green place to take it off, or change your number of boxes.`);
        return;
      }
      setPicked((prev) => new Map(prev).set(key, { chamber: c, slot, boxes: Math.min(room, left) }));
    },
    [picked, roomFor, wanted, boxes],
  );
  const setBoxesOn = (key: string, value: string) =>
    setPicked((prev) => {
      const p = prev.get(key);
      if (!p) return prev;
      const n = Math.floor(Number(value));
      return new Map(prev).set(key, { ...p, boxes: Number.isFinite(n) ? Math.min(Math.max(0, n), roomFor(p.chamber, p.slot)) : 0 });
    });

  // Places nearest the door with room, in the open chamber first, until all the boxes have a place.
  const chooseForMe = () => {
    if (!(wanted > 0)) return toast.error('Write how many boxes you have.');
    if (!taken) return;
    const next = new Map(picked);
    let have = boxes;
    for (const c of [chamber, ...chambers.filter((x) => x.id !== chamber?.id)]) {
      if (!c) continue;
      for (const [, , slot] of placesOf(c)) {
        if (have >= wanted) break;
        const key = placeKey(c.id, slot);
        const room = roomFor(c, slot);
        if (next.has(key) || room <= 0) continue;
        const n = Math.min(room, wanted - have);
        next.set(key, { chamber: c, slot, boxes: n });
        have += n;
      }
    }
    setPicked(next);
    if (have < wanted) toast.error(`There is room for only ${have.toLocaleString('en-IN')} boxes in these months.`);
    else toast.success(`${next.size} place${next.size === 1 ? '' : 's'} chosen for your ${have.toLocaleString('en-IN')} boxes — change any by tapping it.`);
  };

  const toConfirm = () => {
    if ([...picked.values()].some((p) => p.boxes < 1)) return toast.error('Write how many boxes go on each chosen place.');
    if (boxes < l.min_units) return toast.error(`This cold store takes at least ${l.min_units.toLocaleString('en-IN')} boxes in one booking.`);
    setStep('confirm');
  };

  const book = async () => {
    if (!form.name.trim()) return toast.error('Write your name.');
    if (!/^(\+?91)?[6-9]\d{9}$/.test(form.phone.replace(/\s/g, ''))) return toast.error('Add your 10-digit mobile number.');
    setBusy(true);
    try {
      const places = [...picked].map(([key, p]) => ({ key, boxes: p.boxes, whole: !taken?.has(key) && p.boxes === p.chamber.boxes_per_slot }));
      await bookPlaces({ listingId: l.id, places, start, months, name: form.name.trim(), phone: form.phone.replace(/\s/g, '') });
      toast.success('Places held for you for 24 hours — now pay the owner');
      onBooked();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not book.';
      toast.error(message);
      if (/taken/i.test(message)) {
        setStep('choose');
        // Refresh the map first: a successful refresh clears the message.
        await load();
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  // The farmer's own box count, against the room in the places chosen.
  const fitNote =
    wanted > 0 && picked.size ? (
      boxes >= wanted ? (
        <span className="font-semibold text-emerald-700"> · room for all your {wanted.toLocaleString('en-IN')} boxes</span>
      ) : (
        <span className="font-semibold text-amber-700"> · {(wanted - boxes).toLocaleString('en-IN')} of your boxes still need a place</span>
      )
    ) : null;
  const summary = (
    <p className="text-sm text-slate-700">
      {picked.size ? (
        <>
          <strong className="text-slate-900">{picked.size} place{picked.size === 1 ? '' : 's'}</strong> · {boxes.toLocaleString('en-IN')} boxes{fitNote} · {months} month{months === 1 ? '' : 's'} ·{' '}
          <strong className="text-lg text-slate-900">{inr(total)}</strong>
        </>
      ) : wanted > 0 ? (
        `Tap free (blue) places for your ${wanted.toLocaleString('en-IN')} boxes, or let KashRoot choose.`
      ) : (
        'Tap the free (blue) places you want, or let KashRoot choose.'
      )}
    </p>
  );

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={step === 'choose' ? `Choose your place · ${l.title}` : 'Confirm your places'}
      footer={
        step === 'choose' ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            {summary}
            <Btn theme={theme} disabled={!picked.size} onClick={toConfirm}>Continue</Btn>
          </div>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <Btn theme={theme} variant="ghost" icon={ArrowLeft} onClick={() => setStep('choose')}>Back to the map</Btn>
            <Btn theme={theme} icon={CheckCircle2} disabled={busy} onClick={() => void book()}>{busy ? 'Booking…' : `Book for ${inr(total)}`}</Btn>
          </div>
        )
      }
    >
      {step === 'choose' ? (
        <div className="space-y-4">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span><strong className="text-slate-900">{inr(Number(l.rate))}</strong> per box per month</span>
            {l.temperature && <span className="inline-flex items-center gap-1"><Snowflake className="h-4 w-4" aria-hidden /> {l.temperature}</span>}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input type="date" min={today()} className={INPUT} value={start} onChange={(e) => setStart(e.target.value || today())} />
            </Field>
            <Field label="For how long?">
              <select className={INPUT} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {MONTHS.map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
              </select>
            </Field>
          </div>
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Showing which places are free from {niceDate(start)} to {niceDate(periodEnd(start, months))}.</span>
            <button type="button" onClick={() => void load()} className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-sky-800 hover:bg-sky-50"><RefreshCw className="h-4 w-4" aria-hidden /> Refresh</button>
          </p>
          <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
            <Field label="How many boxes do you have?">
              <input type="number" min={1} inputMode="numeric" className={`${INPUT} w-40`} value={want} onChange={(e) => setWant(e.target.value)} placeholder="e.g. 50" />
            </Field>
            <Btn theme={theme} icon={Sparkles} disabled={!taken} onClick={chooseForMe}>Choose places for me</Btn>
            {picked.size > 0 && <Btn theme={theme} variant="ghost" icon={X} onClick={() => setPicked(new Map())}>Clear my choice</Btn>}
            <p className="basis-full text-xs text-emerald-900">
              Any number of boxes{l.min_units > 1 ? ` from ${l.min_units.toLocaleString('en-IN')}` : ''} — 50 or 5,000. A small lot shares a place with others, and you pay only for your own boxes.
            </p>
          </div>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
          {!taken && !error && <p className="text-sm text-slate-500">Loading the cold store…</p>}
          {taken && (
            <ColdStoreExplorer
              chambers={chambers}
              stateOf={stateOf}
              roomOf={roomOf}
              mode="book"
              onPlace={toggle}
              active={chamber?.id ?? null}
              onActive={setActive}
              legend={['free', 'part', 'selected', 'held', 'booked', 'mine', 'blocked']}
            />
          )}
          {picked.size > 0 && (
            <section aria-label="Your choice" className="rounded-xl bg-white p-3 text-sm text-slate-800 ring-1 ring-slate-900/10">
              <p className="font-semibold">Your choice — boxes on each place</p>
              <ul className="mt-2 divide-y divide-slate-100">
                {[...picked].map(([key, p]) => {
                  const room = roomFor(p.chamber, p.slot);
                  const name = `${p.chamber.name} · ${placeLabel(p.slot)}`;
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                      <span className="w-full font-medium sm:w-auto sm:min-w-0 sm:flex-1">{name}</span>
                      <label className="flex flex-1 items-center gap-2 text-slate-600 sm:flex-none">
                        <input type="number" min={1} max={room} inputMode="numeric" aria-label={`Boxes on ${name}`} className={`${INPUT} w-24 py-1.5`} value={p.boxes || ''} onChange={(e) => setBoxesOn(key, e.target.value)} />
                        <span className="whitespace-nowrap">boxes, up to {room.toLocaleString('en-IN')}</span>
                      </label>
                      <button type="button" aria-label={`Take ${name} off`} onClick={() => toggle(p.chamber, p.slot, 'selected')} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700">
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-950 ring-1 ring-sky-200">
            <p className="font-semibold">{l.title}</p>
            <p className="mt-1">Places: <strong>{placesText([...picked.values()].map((p) => ({ chamber_id: p.chamber.id, slot: p.slot, boxes: p.boxes })), chambers)}</strong></p>
            <p className="mt-1">{boxes.toLocaleString('en-IN')} boxes · {niceDate(start)} to {niceDate(periodEnd(start, months))} ({months} month{months === 1 ? '' : 's'})</p>
            <p className="mt-2 text-lg font-bold">{inr(total)}</p>
          </div>
          <PlaceDirections places={[...picked.values()].map((p) => ({ chamber_id: p.chamber.id, slot: p.slot, boxes: p.boxes }))} chambers={chambers} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name">
              <input className={INPUT} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Your mobile">
              <input type="tel" className={INPUT} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> These places are held for you for 24 hours. Pay the owner directly by UPI or bank transfer (shown in My bookings) and enter the payment number; the places are yours once the owner confirms.
          </p>
        </div>
      )}
    </Modal>
  );
}

/**
 * Where a farmer's boxes are: the places in words, and the whole store
 * (plan or 3D) with their stacks in violet and the rest of the store as it
 * is for the months of the booking.
 */
export function MyPlaces({ places, chambers, listingId, start, months }: { places: BookedPlace[]; chambers: ColdChamber[]; listingId: string; start: string; months: number }) {
  const [open, setOpen] = useState(false);
  const [taken, setTaken] = useState<Map<string, PlaceInfo>>(new Map());
  const mine = useMemo(() => new Set(places.map((p) => placeKey(p.chamber_id, p.slot))), [places]);
  const [active, setActive] = useState<string | null>(places[0]?.chamber_id ?? null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    takenPlaces(listingId, start, months)
      .then((t) => live && setTaken(t))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, listingId, start, months]);

  const stateOf = useCallback(
    (c: ColdChamber, slot: string): Look => {
      const key = placeKey(c.id, slot);
      return mine.has(key) ? 'mine' : c.blocked.includes(slot) ? 'blocked' : taken.get(key)?.state ?? 'free';
    },
    [mine, taken],
  );
  const roomOf = useCallback((c: ColdChamber, slot: string) => (c.blocked.includes(slot) ? 0 : roomOn(c, taken.get(placeKey(c.id, slot)))), [taken]);

  if (!places.length) return null;
  return (
    <div className="mt-2">
      <p className="text-sm text-slate-800">Your places: <strong>{placesText(places, chambers) || places.map((p) => placeLabel(p.slot)).join(' · ')}</strong></p>
      <PlaceDirections places={places} chambers={chambers} />
      {chambers.length > 0 && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-violet-700 hover:underline">
          <MapIcon className="h-4 w-4" aria-hidden /> {open ? 'Hide the cold store' : 'See where your boxes are (plan & 3D)'}
        </button>
      )}
      {open && chambers.length > 0 && (
        <div className="mt-3">
          <ColdStoreExplorer chambers={chambers} stateOf={stateOf} roomOf={roomOf} mode="view" active={active} onActive={setActive} legend={['mine', 'free', 'part', 'held', 'booked', 'blocked']} />
        </div>
      )}
    </div>
  );
}
