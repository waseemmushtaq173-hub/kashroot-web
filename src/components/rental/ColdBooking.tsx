'use client';

/**
 * Booking a cold store by place, like choosing seats for a flight:
 *   1. choose the months (from when, for how long);
 *   2. tap free places on the map of each chamber — the boxes and the price
 *      add up as you go;
 *   3. confirm: the places are held for 24 hours while you pay the owner by
 *      UPI; the owner confirms when the money arrives.
 * Also MyPlaces: where a farmer's boxes are, on the map.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Map as MapIcon, RefreshCw, Snowflake } from 'lucide-react';
import { toast } from 'sonner';

import { ChamberGrid, ChamberTabs, PlaceLegend } from '@/components/rental/ColdStoreMap';
import { Btn, Field, INPUT, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { inr, type Account } from '@/lib/db/client';
import { bookPlaces, periodEnd, placeKey, takenPlaces, type BookedPlace, type ColdChamber, type PlaceState } from '@/lib/db/coldMap';
import type { RentalListing } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24];
export const niceDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Chamber 1: 1A, 1B · Chamber 2: 3C" */
export function placesText(places: { chamber_id: string; slot: string }[], chambers: ColdChamber[]): string {
  const by = new Map<string, string[]>();
  for (const p of places) by.set(p.chamber_id, [...(by.get(p.chamber_id) ?? []), p.slot]);
  const order = (a: string, b: string) => parseInt(a) - parseInt(b) || a.localeCompare(b);
  return chambers
    .filter((c) => by.has(c.id))
    .map((c) => `${c.name}: ${(by.get(c.id) ?? []).sort(order).join(', ')}`)
    .join(' · ');
}

export function ColdBooking({ listing: l, chambers, account, onClose, onBooked }: { listing: RentalListing; chambers: ColdChamber[]; account: Account; onClose: () => void; onBooked: () => void }) {
  const [start, setStart] = useState(today());
  const [months, setMonths] = useState(6);
  const [taken, setTaken] = useState<Map<string, PlaceState> | null>(null);
  const [active, setActive] = useState<string | null>(chambers[0]?.id ?? null);
  const [picked, setPicked] = useState<Map<string, { chamber: ColdChamber; slot: string }>>(new Map());
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
  const freeCount = (c: ColdChamber) => c.rows * c.cols - c.blocked.length - [...(taken?.keys() ?? [])].filter((k) => k.startsWith(`${c.id}:`)).length;

  const toggle = (key: string, slot: string, state: PlaceState | 'selected') => {
    if (!chamber || (state !== 'free' && state !== 'selected')) return;
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { chamber, slot });
      return next;
    });
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
        'Tap the free (blue) places you want.'
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
          <p className="text-xs text-slate-500">The map shows which places are free from {niceDate(start)} to {niceDate(periodEnd(start, months))}.</p>
          <ChamberTabs
            chambers={chambers}
            active={chamber?.id ?? null}
            onPick={setActive}
            extra={<button type="button" onClick={() => void load()} className="inline-flex cursor-pointer items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50"><RefreshCw className="h-4 w-4" aria-hidden /> Refresh</button>}
          />
          {chamber && taken && <p className="text-sm text-slate-600"><strong>{Math.max(0, freeCount(chamber))}</strong> free places in {chamber.name} · {chamber.boxes_per_slot} boxes each</p>}
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
          {!taken && !error && <p className="text-sm text-slate-500">Loading the map…</p>}
          {chamber && taken && (
            <ChamberGrid
              chamber={chamber}
              mode="book"
              stateOf={(key, slot) => (chamber.blocked.includes(slot) ? 'blocked' : picked.has(key) ? 'selected' : taken.get(key) ?? 'free')}
              onPlace={toggle}
            />
          )}
          <PlaceLegend show={['free', 'selected', 'held', 'booked', 'mine', 'blocked']} />
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

/** Where a farmer's boxes are: the places as text, and on the map. */
export function MyPlaces({ places, chambers }: { places: BookedPlace[]; chambers: ColdChamber[] }) {
  const [open, setOpen] = useState(false);
  const mine = new Set(places.map((p) => placeKey(p.chamber_id, p.slot)));
  const theirs = chambers.filter((c) => places.some((p) => p.chamber_id === c.id));
  const [active, setActive] = useState<string | null>(theirs[0]?.id ?? null);
  if (!places.length) return null;
  const chamber = theirs.find((c) => c.id === active) ?? theirs[0];
  return (
    <div className="mt-2">
      <p className="text-sm text-slate-800">Your places: <strong>{placesText(places, chambers) || places.map((p) => p.slot).join(', ')}</strong></p>
      {theirs.length > 0 && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-violet-700 hover:underline">
          <MapIcon className="h-4 w-4" aria-hidden /> {open ? 'Hide the map' : 'See where your boxes are'}
        </button>
      )}
      {open && chamber && (
        <div className="mt-3 space-y-3">
          {theirs.length > 1 && <ChamberTabs chambers={theirs} active={chamber.id} onPick={setActive} />}
          <ChamberGrid chamber={chamber} mode="view" stateOf={(key, slot) => (mine.has(key) ? 'mine' : chamber.blocked.includes(slot) ? 'blocked' : 'free')} />
        </div>
      )}
    </div>
  );
}
