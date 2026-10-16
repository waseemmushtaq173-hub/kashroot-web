'use client';

/**
 * Booking your own place in a cold store:
 *   1. choose the months (from when, for how long);
 *   2. look around the whole store — every chamber on the floor plan or in
 *      3D — and tap the free places you want (or let KashRoot choose the
 *      ones nearest the door for your number of boxes); boxes and price add
 *      up as you go;
 *   3. confirm: the places are held for 24 hours while you pay the owner by
 *      UPI; the owner confirms when the money arrives.
 * Also MyPlaces: where a farmer's boxes are, in the whole store.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Map as MapIcon, RefreshCw, Snowflake, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

import { ColdStoreExplorer, type Look } from '@/components/rental/ColdStoreMap';
import { placesOf } from '@/components/rental/placeLook';
import { Btn, Field, INPUT, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { inr, type Account } from '@/lib/db/client';
import { bookPlaces, parsePlace, periodEnd, placeKey, placeLabel, takenPlaces, type BookedPlace, type ColdChamber, type PlaceState } from '@/lib/db/coldMap';
import type { RentalListing } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24];
export const niceDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Chamber 1 — Row 1: stacks 1, 2; Row 3: stack 4 · Chamber 2 — Row 2: stack 1" */
export function placesText(places: { chamber_id: string; slot: string }[], chambers: ColdChamber[]): string {
  const by = new Map<string, string[]>();
  for (const p of places) by.set(p.chamber_id, [...(by.get(p.chamber_id) ?? []), p.slot]);
  return chambers
    .filter((c) => by.has(c.id))
    .map((c) => {
      const rows = new Map<number, number[]>();
      for (const slot of by.get(c.id) ?? []) {
        const { row, stack } = parsePlace(slot);
        rows.set(row, [...(rows.get(row) ?? []), stack]);
      }
      const parts = [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([row, stacks]) => `Row ${row}: stack${stacks.length > 1 ? 's' : ''} ${stacks.sort((a, b) => a - b).join(', ')}`);
      return `${c.name} — ${parts.join('; ')}`;
    })
    .join(' · ');
}

export function ColdBooking({ listing: l, chambers, account, onClose, onBooked }: { listing: RentalListing; chambers: ColdChamber[]; account: Account; onClose: () => void; onBooked: () => void }) {
  const [start, setStart] = useState(today());
  const [months, setMonths] = useState(6);
  const [taken, setTaken] = useState<Map<string, PlaceState> | null>(null);
  const [active, setActive] = useState<string | null>(chambers[0]?.id ?? null);
  const [picked, setPicked] = useState<Map<string, { chamber: ColdChamber; slot: string }>>(new Map());
  const [want, setWant] = useState('');
  const [step, setStep] = useState<'choose' | 'confirm'>('choose');
  const [form, setForm] = useState({ name: account.name, phone: account.phone });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const t = await takenPlaces(l.id, start, months);
      setTaken(t);
      // Places someone else holds for these months cannot stay chosen.
      setPicked((prev) => {
        const next = new Map([...prev].filter(([k]) => !t.has(k)));
        return next.size === prev.size ? prev : next;
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
  const boxes = useMemo(() => [...picked.values()].reduce((s, p) => s + p.chamber.boxes_per_slot, 0), [picked]);
  const total = boxes * months * Number(l.rate);

  const stateOf = useCallback(
    (c: ColdChamber, slot: string): Look => {
      const key = placeKey(c.id, slot);
      return c.blocked.includes(slot) ? 'blocked' : picked.has(key) ? 'selected' : taken?.get(key) ?? 'free';
    },
    [picked, taken],
  );

  const toggle = useCallback((c: ColdChamber, slot: string, look: Look) => {
    if (look !== 'free' && look !== 'selected') return;
    const key = placeKey(c.id, slot);
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { chamber: c, slot });
      return next;
    });
  }, []);

  // Free places nearest the door, in the open chamber first, until the boxes fit.
  const chooseForMe = () => {
    const wanted = Math.floor(Number(want));
    if (!(wanted > 0)) return toast.error('Write how many boxes you have.');
    if (!taken) return;
    const next = new Map(picked);
    let have = boxes;
    for (const c of [chamber, ...chambers.filter((x) => x.id !== chamber?.id)]) {
      if (!c) continue;
      for (const [, , slot] of placesOf(c)) {
        if (have >= wanted) break;
        const key = placeKey(c.id, slot);
        if (next.has(key) || c.blocked.includes(slot) || taken.has(key)) continue;
        next.set(key, { chamber: c, slot });
        have += c.boxes_per_slot;
      }
    }
    setPicked(next);
    if (have < wanted) toast.error(`There is room for only ${have.toLocaleString('en-IN')} boxes in these months.`);
    else toast.success(`${next.size} place${next.size === 1 ? '' : 's'} chosen for ${have.toLocaleString('en-IN')} boxes — change any by tapping it.`);
  };

  const book = async () => {
    if (!form.name.trim()) return toast.error('Write your name.');
    if (!/^(\+?91)?[6-9]\d{9}$/.test(form.phone.replace(/\s/g, ''))) return toast.error('Add your 10-digit mobile number.');
    setBusy(true);
    try {
      await bookPlaces({ listingId: l.id, places: [...picked.keys()], start, months, name: form.name.trim(), phone: form.phone.replace(/\s/g, '') });
      toast.success('Places held for you for 24 hours — now pay the owner');
      onBooked();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not book.';
      toast.error(message);
      if (/taken/i.test(message)) {
        setStep('choose');
        setError(message);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const summary = (
    <p className="text-sm text-slate-700">
      {picked.size ? (
        <>
          <strong className="text-slate-900">{picked.size} place{picked.size === 1 ? '' : 's'}</strong> · {boxes.toLocaleString('en-IN')} boxes · {months} month{months === 1 ? '' : 's'} ·{' '}
          <strong className="text-lg text-slate-900">{inr(total)}</strong>
        </>
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
            <Btn theme={theme} disabled={!picked.size} onClick={() => setStep('confirm')}>Continue</Btn>
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
              <input type="number" min={1} inputMode="numeric" className={`${INPUT} w-40`} value={want} onChange={(e) => setWant(e.target.value)} placeholder="e.g. 400" />
            </Field>
            <Btn theme={theme} icon={Sparkles} disabled={!taken} onClick={chooseForMe}>Choose places for me</Btn>
            {picked.size > 0 && <Btn theme={theme} variant="ghost" icon={X} onClick={() => setPicked(new Map())}>Clear my choice</Btn>}
          </div>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
          {!taken && !error && <p className="text-sm text-slate-500">Loading the cold store…</p>}
          {taken && (
            <ColdStoreExplorer
              chambers={chambers}
              stateOf={stateOf}
              mode="book"
              onPlace={toggle}
              active={chamber?.id ?? null}
              onActive={setActive}
              legend={['free', 'selected', 'held', 'booked', 'mine', 'blocked']}
            />
          )}
          {picked.size > 0 && (
            <p className="rounded-xl bg-white p-3 text-sm text-slate-800 ring-1 ring-slate-900/10">
              <strong>Your choice:</strong> {placesText([...picked.values()].map((p) => ({ chamber_id: p.chamber.id, slot: p.slot })), chambers)}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-950 ring-1 ring-sky-200">
            <p className="font-semibold">{l.title}</p>
            <p className="mt-1">Places: <strong>{placesText([...picked.values()].map((p) => ({ chamber_id: p.chamber.id, slot: p.slot })), chambers)}</strong></p>
            <p className="mt-1">{boxes.toLocaleString('en-IN')} boxes · {niceDate(start)} to {niceDate(periodEnd(start, months))} ({months} month{months === 1 ? '' : 's'})</p>
            <p className="mt-2 text-lg font-bold">{inr(total)}</p>
          </div>
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
  const [taken, setTaken] = useState<Map<string, PlaceState>>(new Map());
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
      return mine.has(key) ? 'mine' : c.blocked.includes(slot) ? 'blocked' : taken.get(key) ?? 'free';
    },
    [mine, taken],
  );

  if (!places.length) return null;
  return (
    <div className="mt-2">
      <p className="text-sm text-slate-800">Your places: <strong>{placesText(places, chambers) || places.map((p) => placeLabel(p.slot)).join(' · ')}</strong></p>
      {chambers.length > 0 && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-violet-700 hover:underline">
          <MapIcon className="h-4 w-4" aria-hidden /> {open ? 'Hide the cold store' : 'See where your boxes are (plan & 3D)'}
        </button>
      )}
      {open && chambers.length > 0 && (
        <div className="mt-3">
          <ColdStoreExplorer chambers={chambers} stateOf={stateOf} mode="view" active={active} onActive={setActive} legend={['mine', 'free', 'held', 'booked', 'blocked']} />
        </div>
      )}
    </div>
  );
}
