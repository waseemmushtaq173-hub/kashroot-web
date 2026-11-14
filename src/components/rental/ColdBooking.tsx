'use client';

/**
 * Booking your own place in a cold store:
 *   1. choose the months (from when, for how long);
 *   2. look around the whole store — every chamber and floor on the
 *      drawing or in 3D — and tap the places you want, or write how many
 *      bins / crates you have and let KashRoot choose the places nearest
 *      the door (one chamber and floor when it has room). Any number: a
 *      small lot shares a place with others, and you pay only for your own
 *      bins; each chamber has its own rent, and the price adds up as you go;
 *   3. confirm: the places are held for 24 hours;
 *   4. pay the owner directly (bank account or UPI, shown right there) and
 *      write the payment reference; the owner confirms when the money
 *      arrives, and the receipt is ready (components/rental/receipt).
 * Also MyPlaces: where a farmer's bins are, in the whole store.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCircle2, Map as MapIcon, Navigation, ReceiptText, RefreshCw, Snowflake, Sparkles, Trash2, X } from 'lucide-react';
import { z } from 'zod';
import { toast } from '@/lib/client/toast';

import { ColdStoreExplorer, type Look } from '@/components/rental/ColdStoreMap';
import { Guard3D } from '@/components/rental/three/SceneGuard';
import { PayOwner } from '@/components/rental/receipt/PayOwner';
import { Btn, Field, INPUT, Modal, PORTAL_THEMES, Skeleton } from '@/components/portal/kit';
import { inr, type Account } from '@/lib/db/client';
import { layersText, placeDirections, planOf, showLength } from '@/lib/coldLayout';
import { cleanMobile, countText, mobileProblem, UNIT_WORDS, unitsText, type Storage } from '@/lib/coldStore';
import {
  bookPlaces,
  countsText,
  lastDay,
  parsePlace,
  periodEnd,
  pickNearest,
  placeKey,
  placeLabel,
  placeLines,
  placeName,
  priceLines,
  roomOn,
  takenPlaces,
  type BookedPlace,
  type ChosenPlace,
  type ColdChamber,
  type PlaceInfo,
} from '@/lib/db/coldMap';
import { twinPlanOf } from '@/components/rental/twinMap';
import type { IndustrialColdStoreTwinProps, StorageSlotRecord } from '@/components/rental/IndustrialColdStoreTwin3D';
import { bookingById, bookingCode, type RentalListing } from '@/lib/db/rentals';
import QRCode from 'qrcode';

/**
 * Gate Pass QR Code component for cold store entry
 */
/** What the gate pass QR carries — checked here so a bad payload can never reach the gate scanner. */
const GATE_PASS = z.object({
  bookingId: z.string().min(8),
  bookingCode: z.string().min(1),
  places: z.array(z.object({ chamber: z.string().min(1), slot: z.string().min(1), boxes: z.number().int().positive() })).min(1),
  ownerName: z.string().min(1),
  ownerPhone: z.string().min(10),
  amount: z.number().nonnegative(),
  timestamp: z.number().int().positive(),
});

function GatePassQR({
  bookingId,
  bookingCode: code,
  places,
  chambers,
  ownerName,
  ownerPhone,
  amount,
}: {
  bookingId: string;
  bookingCode: string;
  places: Placed[];
  chambers: ColdChamber[];
  ownerName: string;
  ownerPhone: string;
  amount: number;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateQR = async () => {
      try {
        // Chamber names so the gate scanner shows where to go, not raw ids.
        const payload = {
          bookingId,
          bookingCode: code,
          places: places.map(p => ({ chamber: chambers.find(c => c.id === p.chamber_id)?.name ?? p.chamber_id, slot: p.slot, boxes: p.boxes })),
          ownerName,
          ownerPhone,
          amount,
          timestamp: Date.now(),
        };
        const checked = GATE_PASS.safeParse(payload);
        if (!checked.success) throw new Error(checked.error.issues[0]?.message ?? 'Gate pass details are incomplete.');
        const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 256,
        });
        setQrDataUrl(dataUrl);
      } catch (err) {
        console.error('QR generation failed:', err);
      } finally {
        setLoading(false);
      }
    };
    generateQR();
  }, [bookingId, code, places, chambers, ownerName, ownerPhone, amount]);

  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200 text-center">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-800 border-t-transparent" />
          <span className="ml-2 text-sm text-slate-600">Generating Gate Pass...</span>
        </div>
      ) : qrDataUrl ? (
        <>
          <img
            src={qrDataUrl}
            alt="Gate Pass QR Code"
            className="mx-auto w-48 h-48 rounded-lg bg-white p-2 ring-1 ring-slate-200"
            onClick={() => navigator.clipboard.writeText(JSON.stringify({ bookingId, bookingCode: code, places }))}
            title="Click to copy booking data"
          />
          <p className="mt-2 text-xs text-slate-500">Click to copy booking data</p>
          <div className="mt-3 p-3 rounded-lg bg-emerald-50 ring-1 ring-emerald-200 text-left text-xs text-emerald-900">
            <p className="font-semibold text-emerald-900 mb-1">Gate Pass: {code}</p>
            <p className="text-xs text-emerald-800">Booking: {bookingId.slice(0, 8)}...</p>
            <p className="text-xs text-emerald-800">Amount: ₹{amount.toLocaleString('en-IN')}</p>
            <p className="text-xs text-emerald-800">Scan at gate for entry</p>
          </div>
        </>
      ) : (
        <p className="text-sm text-rose-600">Failed to generate QR code</p>
      )}
    </div>
  );
}

const theme = PORTAL_THEMES.rental;

/** The industrial 3D twin (R3F + drei), loaded only when it is opened. */
const IndustrialColdStoreTwin3D = dynamic(
  () => import('@/components/rental/IndustrialColdStoreTwin3D').then((m) => m.IndustrialColdStoreTwin3D),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[420px] place-items-center rounded-3xl bg-slate-100" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-sky-200 border-t-sky-600" aria-hidden />
          <p className="text-sm font-semibold text-slate-600">Initializing Industrial 3D Digital Twin...</p>
        </div>
      </div>
    ),
  },
);

/** A booking as it goes to the database — shape and minimums, checked before anything is written. */
const BOOKING = z.object({
  listingId: z.string().min(8),
  places: z.array(z.object({ key: z.string().min(1), boxes: z.number().int().positive(), whole: z.boolean() })).min(1),
  start: z.string().min(8),
  months: z.number().int().min(1).max(36),
  name: z.string().min(1).max(80),
  phone: z.string().regex(/^\d{10}$/),
});
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24];
export const niceDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** One booked 3D unit, as the unit registry (api/cold-storage/book-units) returns it — a real row of cold_storage_unit_allocations. */
interface UnitAllocation {
  id: string;
  chamber_id: string;
  level_index: number;
  unit_code: string;
  unit_type: string;
  stored_quantity_kg: number | string;
  farmer_id: string;
  farmer_name: string;
  payment_status: string;
  created_at: string;
}
/** One real temperature reading of a chamber (cold_chamber_temperature_logs). */
interface TempLog {
  chamber_id: string;
  temperature_c: number | string;
  source_type: string;
  recorded_at: string;
}

/** A place and, when it is shared, how many of the farmer's bins are on it. */
type Placed = { chamber_id: string; slot: string; boxes?: number | null };

/** "Chamber 1 · Floor 2 · Row 1, stacks 1–3; Row 2, stack 4 (20 bins). Chamber 2 · Row 1, stack 1" */
export function placesText(places: Placed[], chambers: ColdChamber[]): string {
  return placeLines(places, chambers)
    .map((l) => l.text)
    .join('. ');
}

/** The words for what a set of chambers holds: "bins", "crates", "bins or crates". */
const wordFor = (kinds: Storage[]) => unitsText(kinds).replace(/ and (?=\S+$)/, ' or ');

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
  const kinds = [...new Set(items.map((x) => x.c.storage))];
  return (
    <div className="mt-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-950 ring-1 ring-sky-200">
      <p className="flex items-center gap-1.5 font-semibold"><Navigation className="h-4 w-4" aria-hidden /> Where to put your {wordFor(kinds)}</p>
      <ul className="mt-1 space-y-0.5">
        {items.map(({ c, p, size, plan, row, stack }) => (
          <li key={`${c.id}:${p.slot}`}>
            <strong>{c.name} · {placeLabel(p.slot)}</strong> — {placeDirections(size, plan, row, stack)}
            {p.boxes && p.boxes < c.boxes_per_slot ? <> · <strong>your {countText(p.boxes, c.storage)}</strong> (shared place)</> : null}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-sky-900/80">
        A full place takes {countText(first.c.boxes_per_slot, first.c.storage)}: {layersText(first.plan)} ({showLength(first.plan.stackHeight, first.size.unit)} high).
      </p>
    </div>
  );
}

type Step = 'choose' | 'confirm' | 'pay' | 'paid';

export function ColdBooking({
  listing: l,
  chambers,
  account,
  quick,
  onClose,
  onBooked,
}: {
  listing: RentalListing;
  chambers: ColdChamber[];
  account: Account;
  /** "Just give me 40 bins": choose the places nearest the door straight away (only chambers holding `storage`, when given). */
  quick?: { want: number; storage: Storage | null } | null;
  onClose: () => void;
  /** After a booking is made (the window then closes). */
  onBooked: () => void;
}) {
  const [start, setStart] = useState(today());
  const [months, setMonths] = useState(6);
  const [taken, setTaken] = useState<Map<string, PlaceInfo> | null>(null);
  const [active, setActive] = useState<string | null>(chambers[0]?.id ?? null);
  // Chosen places, each with how many of the farmer's bins go on it.
  const [picked, setPicked] = useState<Map<string, ChosenPlace>>(new Map());
  const [want, setWant] = useState(quick ? String(quick.want) : '');
  const kinds = useMemo(() => [...new Set(chambers.map((c) => c.storage))], [chambers]);
  // What the farmer brings, when the store holds both bins and crates.
  const [kind, setKind] = useState<Storage | null>(quick?.storage ?? (kinds.length === 1 ? kinds[0] : null));
  const [step, setStep] = useState<Step>('choose');
  const [form, setForm] = useState({ name: account.name, phone: account.phone });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The booking once made: its id and the price the database set.
  const [booked, setBooked] = useState<{ id: string; amount: number; at: number } | null>(null);
  // "Just give me 40 bins" from the store card: done once, when the map first loads.
  const quickAsk = useRef(quick ?? null);
  const chambersNow = useRef(chambers);
  useEffect(() => {
    chambersNow.current = chambers;
  }, [chambers]);

  const load = useCallback(async () => {
    try {
      const t = await takenPlaces(l.id, start, months);
      setTaken(t);
      let note: string | null = null;
      const ask = quickAsk.current;
      if (ask) {
        // Choose at once, then straight to confirming.
        quickAsk.current = null;
        const pool = ask.storage ? chambersNow.current.filter((c) => c.storage === ask.storage) : chambersNow.current;
        const room = (c: ColdChamber, slot: string) => (c.blocked.includes(slot) ? 0 : roomOn(c, t.get(placeKey(c.id, slot))));
        const { picked: next, placed } = pickNearest({ chambers: pool, want: ask.want, roomFor: room });
        const unit = ask.storage ?? pool[0]?.storage ?? 'boxes';
        const when = `from ${niceDate(start)} for ${months} month${months === 1 ? '' : 's'}`;
        setPicked(next);
        const first = [...next.values()][0];
        if (first) setActive(first.chamber.id);
        if (placed >= ask.want) setStep('confirm');
        else if (placed === 0) note = `There is no free place for ${UNIT_WORDS[unit].many} ${when}. Try other months, or another cold store.`;
        else note = `There is room for only ${countText(placed, unit)} ${when}, not ${countText(ask.want, unit)}. They are chosen below: book them, or change the months.`;
        setError(note);
        return;
      }
      // Bins others booked meanwhile: a chosen place keeps only what still fits.
      setPicked((prev) => {
        let changed = false;
        const next = new Map<string, ChosenPlace>();
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
      setError(err instanceof Error ? err.message : 'Could not load the cold store.');
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
  const chosen = useMemo(() => [...picked.values()], [picked]);
  const boxes = useMemo(() => chosen.reduce((s, p) => s + p.boxes, 0), [chosen]);
  const asPlaced = useMemo(() => chosen.map((p) => ({ chamber_id: p.chamber.id, slot: p.slot, boxes: p.boxes })), [chosen]);
  const price = useMemo(() => priceLines(chosen.map((p) => ({ chamber: p.chamber, boxes: p.boxes })), Number(l.rate), months), [chosen, l.rate, months]);
  // The farmer's own count, if written, and the words for it.
  const wanted = Math.floor(Number(want)) || 0;
  const word = kind ? UNIT_WORDS[kind].many : wordFor(kinds);
  const chosenWords = countsText(asPlaced, chambers) || `0 ${word}`;
  /** Bins that fit on a place for these months, before this farmer's choice. */
  const roomFor = useCallback((c: ColdChamber, slot: string) => (c.blocked.includes(slot) ? 0 : roomOn(c, taken?.get(placeKey(c.id, slot)))), [taken]);

  const stateOf = useCallback(
    (c: ColdChamber, slot: string): Look => {
      const key = placeKey(c.id, slot);
      return c.blocked.includes(slot) ? 'blocked' : picked.has(key) ? 'selected' : taken?.get(key)?.state ?? 'free';
    },
    [picked, taken],
  );
  // Room left on each place once this farmer's chosen bins are on it.
  const roomOf = useCallback((c: ColdChamber, slot: string) => Math.max(0, roomFor(c, slot) - (picked.get(placeKey(c.id, slot))?.boxes ?? 0)), [roomFor, picked]);

  // Tap a place: it takes as many of the farmer's bins as still need a place
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
        toast.info(`All your ${countText(wanted, kind ?? c.storage)} have a place. Tap a green place to take it off, or change your number.`);
        return;
      }
      setPicked((prev) => new Map(prev).set(key, { chamber: c, slot, boxes: Math.min(room, left) }));
    },
    [picked, roomFor, wanted, boxes, kind],
  );

  // The industrial 3D twin: the very places of the drawing, drawn as bins or
  // crates. Occupancy comes only from what the database says for these
  // months (taken); a place with room left stays blue and a click shares it.
  const [twinOpen, setTwinOpen] = useState(false);
  const twin = useMemo(() => (twinOpen ? twinPlanOf(chambers) : null), [chambers, twinOpen]);
  // The unit-level bookings and the recorded temperatures, read from the real
  // database through api/cold-storage/book-units when the twin is open.
  const [unitBookings, setUnitBookings] = useState<UnitAllocation[]>([]);
  const [chamberTemps, setChamberTemps] = useState<Map<string, { temperatureC: number; source: 'MANUAL_ENTRY' | 'IOT_SENSOR' }>>(new Map());
  useEffect(() => {
    if (!twinOpen || !chambers.length) return;
    let live = true;
    void (async () => {
      try {
        const parts = await Promise.all(
          chambers.map(async (c) => {
            const res = await fetch(`/api/cold-storage/book-units?facilityId=${l.id}&chamberId=${c.id}`);
            if (!res.ok) return { chamberId: c.id, allocations: [] as UnitAllocation[], temperatureLogs: [] as TempLog[] };
            const json = (await res.json()) as { allocations?: UnitAllocation[]; temperatureLogs?: TempLog[] };
            return { chamberId: c.id, allocations: json.allocations ?? [], temperatureLogs: json.temperatureLogs ?? [] };
          }),
        );
        if (!live) return;
        const seen = new Set<string>();
        const allocs: UnitAllocation[] = [];
        for (const { allocations } of parts) {
          for (const a of allocations) {
            if (a.payment_status === 'RELEASED' || a.payment_status === 'FAILED' || a.payment_status === 'REFUNDED') continue;
            if (seen.has(a.id)) continue;
            seen.add(a.id);
            allocs.push(a);
          }
        }
        setUnitBookings(allocs);
        const temps = new Map<string, { temperatureC: number; source: 'MANUAL_ENTRY' | 'IOT_SENSOR' }>();
        for (const { chamberId, temperatureLogs } of parts) {
          const latest = temperatureLogs[0];
          const value = Number(latest?.temperature_c);
          if (!latest || !Number.isFinite(value)) continue;
          temps.set(chamberId, { temperatureC: value, source: latest.source_type === 'IOT_SENSOR' ? 'IOT_SENSOR' : 'MANUAL_ENTRY' });
        }
        setChamberTemps(temps);
      } catch {
        // The twin still shows the months' bookings (takenPlaces); the unit registry only adds to it when it answers.
      }
    })();
    return () => {
      live = false;
    };
  }, [twinOpen, chambers, l.id]);
  // The twin's chambers with each chamber's real latest temperature, when one has been recorded.
  const twinConfigs = useMemo(
    () =>
      (twin?.configs ?? []).map((cfg) => {
        const t = chamberTemps.get(cfg.id);
        return t ? { ...cfg, temperatureC: t.temperatureC, temperatureSource: t.source } : cfg;
      }),
    [twin, chamberTemps],
  );
  const twinAllocations = useMemo(() => {
    if (!twin || !taken) return {};
    const out: Record<string, NonNullable<IndustrialColdStoreTwinProps['occupiedAllocations']>[string]> = {};
    for (const c of chambers) {
      for (let r = 1; r <= c.rows; r++) {
        for (let i = 0; i < c.cols; i++) {
          const slot = placeName(r, i);
          const key = twin.keyOf(c, slot);
          if (c.blocked.includes(slot)) {
            out[key] = { storedKg: 0, farmerName: 'Blocked by the owner' };
            continue;
          }
          const info = taken.get(placeKey(c.id, slot));
          if (!info) continue;
          const kg = c.unit_kg ?? 0;
          if (info.mine > 0) {
            out[key] = { storedKg: kg * info.mine, farmerName: form.name || account.name, isCurrentFarmer: true };
          } else if (info.state === 'held') {
            out[key] = { storedKg: kg * (info.used ?? c.boxes_per_slot), farmerName: 'Held for payment' };
          } else if (info.state === 'booked') {
            out[key] = { storedKg: kg * (info.used ?? c.boxes_per_slot), farmerName: 'Booked by another farmer' };
          }
          // 'part': room left on a shared place — it stays blue here and a
          // tap books only what still fits, exactly as on the drawing.
        }
      }
    }
    // The exact booked units (cold_storage_unit_allocations) over that: the
    // real farmer name and stored kg for each 3D unit, straight from the
    // database. A unit's own code pins its slot inside its row-chamber.
    const codeOfId = new Map<string, string>();
    for (const [code, row] of twin.byCode) codeOfId.set(row.id, code);
    for (const a of unitBookings) {
      const code = codeOfId.get(a.chamber_id);
      if (!code) continue;
      out[`${code}:LEVEL-01:${a.unit_code}`] = {
        storedKg: Number(a.stored_quantity_kg) || 0,
        // Role isolation (supplementary directive): a farmer sees only their
        // own name on a twin click card — anyone else's stays anonymous.
        farmerName: a.farmer_id === account.id ? form.name || account.name : 'Booked by another farmer',
        isCurrentFarmer: a.farmer_id === account.id,
        bookingDate: a.created_at,
      };
    }
    return out;
  }, [twin, taken, chambers, form.name, account.name, unitBookings]);
  const selectedTwinKeys = useMemo(() => (twin ? chosen.map((p) => twin.keyOf(p.chamber, p.slot)) : []), [twin, chosen]);
  const onTwinSlot = useCallback(
    (rec: StorageSlotRecord) => {
      const hit = twin?.placeOf(rec);
      if (hit) toggle(hit.chamber, hit.slot, stateOf(hit.chamber, hit.slot));
    },
    [twin, toggle, stateOf],
  );
  const setBoxesOn = (key: string, value: string) =>
    setPicked((prev) => {
      const p = prev.get(key);
      if (!p) return prev;
      const n = Math.floor(Number(value));
      return new Map(prev).set(key, { ...p, boxes: Number.isFinite(n) ? Math.min(Math.max(0, n), roomFor(p.chamber, p.slot)) : 0 });
    });

  /**
   * Places nearest the door for the farmer's count: one chamber floor when
   * one has room, else one chamber, else over the chambers in order.
   * Returns how many have a place.
   */
  const choose = useCallback(
    (count: number, only: Storage | null, keep: Map<string, ChosenPlace>) => {
      const pool = only ? chambers.filter((c) => c.storage === only) : chambers;
      const { picked: next, placed } = pickNearest({ chambers: pool, want: count, roomFor, already: keep });
      setPicked(next);
      const first = [...next.values()][0];
      if (first) setActive(first.chamber.id);
      return { placed, places: next.size };
    },
    [chambers, roomFor],
  );

  const chooseForMe = () => {
    if (kinds.length > 1 && !kind) return toast.error('First tap Bins or Crates: what will you bring?');
    if (!(wanted > 0)) return toast.error(`Write how many ${word} you have, like 40.`);
    if (!taken) return;
    const { placed, places } = choose(wanted, kinds.length > 1 ? kind : null, picked);
    if (placed < wanted) toast.error(`There is room for only ${countText(placed, kind ?? kinds[0] ?? 'boxes')} from ${niceDate(start)} for ${months} month${months === 1 ? '' : 's'}. Write fewer, or choose other months.`);
    else toast.success(`${places} place${places === 1 ? '' : 's'} chosen for your ${countText(placed, kind ?? kinds[0] ?? 'boxes')}, nearest the door. Change any by tapping it.`);
  };

  const toConfirm = () => {
    if (chosen.some((p) => p.boxes < 1)) return toast.error(`Write how many ${word} go on each chosen place, or take the place off.`);
    if (boxes < l.min_units) return toast.error(`This cold store takes at least ${countText(l.min_units, kind ?? kinds[0] ?? 'boxes')} in one booking. You chose ${chosenWords}.`);
    setStep('confirm');
  };

  /**
   * The exact 3D units behind the booking, to the unit registry
   * (api/cold-storage/book-units) — one row per chosen place per chamber,
   * built only from what the database and the farmer gave: the chamber's own
   * floor, row and stack, its unit kind and kg from the owner's save, and
   * the real booking as the transaction reference.
   */
  const bookUnits = useCallback(
    async (bookingId: string, chosenNow: ChosenPlace[]): Promise<void> => {
      const byChamber = new Map<string, { levelIndex: number; levelCode: string; row: number; col: number; unitCode: string; unitType: 'WOODEN_BIN' | 'PLASTIC_CRATE'; unitCapacityKg: number; storedQuantityKg: number }[]>();
      for (const p of chosenNow) {
        const c = p.chamber;
        const kg = c.unit_kg ?? 0;
        const capacity = Math.round(kg * c.boxes_per_slot * 100) / 100;
        if (!(kg > 0) || !(capacity > 0)) continue; // no real unit capacity saved for this chamber — nothing to record
        const place = parsePlace(p.slot);
        const unitCode = `${c.storage === 'bins' ? 'BIN' : 'CRATE'}-${String((place.row - 1) * c.cols + place.stack).padStart(3, '0')}`;
        const list = byChamber.get(c.id) ?? [];
        list.push({
          levelIndex: c.floor,
          levelCode: `LEVEL-${String(c.floor).padStart(2, '0')}`,
          row: place.row,
          col: place.stack,
          unitCode,
          unitType: c.storage === 'bins' ? 'WOODEN_BIN' : 'PLASTIC_CRATE',
          unitCapacityKg: capacity,
          storedQuantityKg: Math.round(p.boxes * kg * 100) / 100,
        });
        byChamber.set(c.id, list);
      }
      if (!byChamber.size) return;
      await Promise.all(
        [...byChamber].map(([chamberId, units]) =>
          fetch('/api/cold-storage/book-units', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingId,
              facilityId: l.id,
              chamberId,
              farmerId: account.id,
              farmerName: form.name.trim(),
              transactionId: bookingCode(bookingId),
              idempotencyKeyPrefix: `kr-booking-${bookingId}`,
              paymentStatus: 'PENDING',
              storageEndDate: `${periodEnd(start, months)}T00:00:00.000Z`,
              units,
            }),
          }).then(async (res) => {
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Unit registry answered ${res.status}`);
          }),
        ),
      );
    },
    [l.id, account.id, form.name, start, months],
  );

  const nameProblem = !form.name.trim() ? 'Write your name, as the owner will know you.' : form.name.trim().length > 80 ? 'Your name is too long. Keep it under 80 letters.' : null;
  const phoneProblem = mobileProblem(form.phone, 'your');
  const book = async () => {
    setTried(true);
    if (nameProblem || phoneProblem) return toast.error(nameProblem ?? phoneProblem!);
    setBusy(true);
    try {
      const places = [...picked].map(([key, p]) => ({ key, boxes: p.boxes, whole: !taken?.has(key) && p.boxes === p.chamber.boxes_per_slot }));
      const payload = { listingId: l.id, places, start, months, name: form.name.trim(), phone: cleanMobile(form.phone) };
      const checked = BOOKING.safeParse(payload);
      if (!checked.success) {
        const issue = checked.error.issues[0];
        return toast.error(issue ? `Check the booking: ${issue.path.join('.')} ${issue.message}.` : 'Check the booking form — a detail is missing or wrong.');
      }
      const id = await bookPlaces(checked.data);
      // The price the database set (each chamber's own rent) is the one to pay.
      const saved = await bookingById(id).catch(() => null);
      setBooked({ id, amount: Number(saved?.amount ?? price.total), at: Date.now() });
      // The exact 3D units are recorded against the real booking. Never held against the hold itself.
      const chosenNow = [...picked.values()];
      try {
        await bookUnits(id, chosenNow);
      } catch (unitErr) {
        console.error('Unit registry save failed', unitErr);
        toast.error('Your places are booked and held. Saving their 3D unit details failed — the owner still sees your booking.');
      }
      setStep('pay');
      toast.success('Places held for you for 24 hours — now pay the owner');
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
  // Once booked, closing the window shows the booking in My bookings.
  const close = booked ? onBooked : onClose;

  // The farmer's own count, against the room in the places chosen.
  const fitNote =
    wanted > 0 && picked.size ? (
      boxes >= wanted ? (
        <span className="font-semibold text-emerald-700"> · room for all your {countText(wanted, kind ?? kinds[0] ?? 'boxes')}</span>
      ) : (
        <span className="font-semibold text-amber-700"> · {(wanted - boxes).toLocaleString('en-IN')} of your {word} still need a place</span>
      )
    ) : null;
  const summary = (
    <p className="text-sm text-slate-700">
      {picked.size ? (
        <>
          <strong className="text-slate-900">{picked.size} place{picked.size === 1 ? '' : 's'}</strong> · {chosenWords}{fitNote} · {months} month{months === 1 ? '' : 's'} ·{' '}
          <strong className="text-lg text-slate-900">{inr(price.total)}</strong>
        </>
      ) : wanted > 0 ? (
        `Tap free (blue) places for your ${wanted.toLocaleString('en-IN')} ${word}, or let KashRoot choose.`
      ) : (
        'Tap the free (blue) places you want, or let KashRoot choose.'
      )}
    </p>
  );
  const heldUntil = booked ? new Date(booked.at + 86_400_000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const problem = (m: string | null) => (tried && m ? <span role="alert" className="mt-1.5 block rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{m}</span> : null);

  return (
    <Modal
      open
      wide
      onClose={close}
      title={step === 'choose' ? `Choose your place · ${l.title}` : step === 'confirm' ? 'Confirm your places' : step === 'pay' ? 'Pay the owner' : 'Payment saved'}
      footer={
        step === 'choose' ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            {summary}
            <Btn theme={theme} className="min-h-[44px]" disabled={!picked.size} onClick={toConfirm}>Continue</Btn>
          </div>
        ) : step === 'confirm' ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <Btn theme={theme} variant="ghost" className="min-h-[44px]" icon={ArrowLeft} onClick={() => setStep('choose')}>Back to the map</Btn>
            <Btn theme={theme} className="min-h-[44px]" icon={CheckCircle2} disabled={busy} onClick={() => void book()}>{busy ? 'Booking…' : `Book for ${inr(price.total)}`}</Btn>
          </div>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-end gap-3">
            <Btn theme={theme} variant={step === 'pay' ? 'ghost' : 'soft'} className="min-h-[44px]" onClick={onBooked}>{step === 'pay' ? 'Pay later (in My bookings)' : 'Go to My bookings'}</Btn>
          </div>
        )
      }
    >
      {step === 'choose' ? (
        <div className="space-y-4">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            {chambers.some((c) => c.rate !== null) ? (
              <span>Each chamber has its own rent: tap a chamber to see it.</span>
            ) : (
              <span><strong className="text-slate-900">{inr(Number(l.rate))}</strong> a {UNIT_WORDS[kinds[0] ?? 'boxes'].one} a month</span>
            )}
            {l.temperature && <span className="inline-flex items-center gap-1"><Snowflake className="h-4 w-4" aria-hidden /> {l.temperature}</span>}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input type="date" min={today()} className={`${INPUT} min-h-[44px]`} value={start} onChange={(e) => setStart(e.target.value || today())} />
            </Field>
            <Field label="For how long?">
              <select className={`${INPUT} min-h-[44px]`} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {MONTHS.map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
              </select>
            </Field>
          </div>
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>Showing which places are free from {niceDate(start)} to {niceDate(lastDay(start, months))}.</span>
            <button type="button" onClick={() => void load()} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-lg px-2 text-sm font-semibold text-sky-800 hover:bg-ivory"><RefreshCw className="h-4 w-4" aria-hidden /> Refresh</button>
          </p>
          <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-sky-50 p-3 ring-1 ring-sky-200">
            {kinds.length > 1 && (
              <div role="radiogroup" aria-label="What will you bring?" className="flex basis-full gap-2">
                {kinds.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`min-h-[48px] flex-1 cursor-pointer rounded-xl px-4 text-base font-semibold ring-2 ${kind === k ? 'bg-sky-800 text-white ring-sky-800' : 'bg-white text-sky-900 ring-sky-200 hover:ring-sky-400'}`}>
                    {UNIT_WORDS[k].title}
                  </button>
                ))}
              </div>
            )}
            <div className="w-full sm:w-56">
              <Field label={`How many ${word} do you have?`}>
                <input type="number" min={1} inputMode="numeric" className={`${INPUT} min-h-[44px] text-base`} value={want} onChange={(e) => setWant(e.target.value)} placeholder="e.g. 40" />
              </Field>
            </div>
            <Btn theme={theme} className="min-h-[44px]" icon={Sparkles} disabled={!taken} onClick={chooseForMe}>Choose places for me</Btn>
            {picked.size > 0 && <Btn theme={theme} variant="ghost" className="min-h-[44px]" icon={X} onClick={() => setPicked(new Map())}>Clear my choice</Btn>}
            <p className="basis-full text-xs text-sky-900">
              Any number of {word}{l.min_units > 1 ? ` from ${l.min_units.toLocaleString('en-IN')}` : ''} — 50 or 5,000. A small lot shares a place with others, and you pay only for your own {word}.
            </p>
          </div>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
          {!taken && !error && <Skeleton label="Loading the cold store…" rows={1} height="h-24" />}
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
              mineName={form.name || account.name}
              facilityName={l.title}
              facilityId={l.id}
            />
          )}
          {taken && (
            <section aria-label="3D digital twin" className="rounded-xl bg-white p-3 text-sm text-slate-800 ring-1 ring-slate-900/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">3D Digital Twin — the whole facility</p>
                <button type="button" onClick={() => setTwinOpen((v) => !v)} aria-expanded={twinOpen} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-sky-800 hover:bg-ivory">
                  {twinOpen ? 'Hide the 3D twin' : 'Open the 3D twin'}
                </button>
              </div>
              {twinOpen && twin && (
                <div className="mt-3">
                  <p className="mb-2 text-xs text-slate-600">
                    The same places as the drawing, drawn as {wordFor(kinds)}. Tap a bin or crate to choose that place; tap it again to take it off. Red places are booked, green ones are yours or chosen.
                  </p>
                  <Guard3D>
                    <IndustrialColdStoreTwin3D
                      facilityCode={l.facility_code || l.title}
                      facilityName={l.title}
                      buildingLengthM={0}
                      buildingWidthM={0}
                      buildingHeightM={0}
                      corridorLayout="BOTH_SIDES"
                      chambers={twinConfigs}
                      occupiedAllocations={twinAllocations}
                      selectedSlotKeys={selectedTwinKeys}
                      onToggleSelectSlot={onTwinSlot}
                    />
                  </Guard3D>
                </div>
              )}
            </section>
          )}
          {picked.size > 0 && (
            <section aria-label="Your choice" className="rounded-xl bg-white p-3 text-sm text-slate-800 ring-1 ring-slate-900/10">
              <p className="font-semibold">Your choice — {word} on each place</p>
              <ul className="mt-2 divide-y divide-slate-100">
                {[...picked].map(([key, p]) => {
                  const room = roomFor(p.chamber, p.slot);
                  const name = `${p.chamber.name} · ${placeLabel(p.slot)}`;
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                      <span className="w-full font-medium sm:w-auto sm:min-w-0 sm:flex-1">{name}</span>
                      <label className="flex flex-1 items-center gap-2 text-slate-600 sm:flex-none">
                        <span className="w-24 shrink-0">
                          <input type="number" min={1} max={room} inputMode="numeric" aria-label={`${UNIT_WORDS[p.chamber.storage].title} on ${name}`} className={`${INPUT} min-h-[44px] py-1.5 text-base`} value={p.boxes || ''} onChange={(e) => setBoxesOn(key, e.target.value)} />
                        </span>
                        <span className="whitespace-nowrap">{UNIT_WORDS[p.chamber.storage].many}, up to {room.toLocaleString('en-IN')}</span>
                      </label>
                      <button type="button" aria-label={`Take ${name} off`} onClick={() => toggle(p.chamber, p.slot, 'selected')} className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700">
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      ) : step === 'confirm' ? (
        <div className="space-y-4">
          {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{error}</p>}
          <div className="rounded-2xl bg-ivory p-4 text-sm text-slate-800 ring-1 ring-[#E8A317]/30">
            <p className="font-semibold">{l.title}</p>
            <p className="mt-1 text-base font-bold text-slate-900">{chosenWords}</p>
            <p>From {niceDate(start)} to {niceDate(lastDay(start, months))} ({months} month{months === 1 ? '' : 's'})</p>
            <ul aria-label="Your places" className="mt-2 space-y-0.5">
              {placeLines(asPlaced, chambers).map((line) => (
                <li key={line.chamberId}><strong>{line.text}</strong> — {countText(line.count, line.storage)}</li>
              ))}
            </ul>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-sky-200">
                {price.lines.map((p) => (
                  <tr key={p.key}>
                    <td className="py-1 pr-2">{p.name}: {countText(p.count, p.storage)} × {inr(p.rate)} a month × {months}</td>
                    <td className="py-1 text-right font-semibold tabular-nums">{inr(p.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-1.5 pr-2 text-base font-bold">Total</td>
                  <td className="py-1.5 text-right text-lg font-bold tabular-nums" data-testid="confirm-total">{inr(price.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <PlaceDirections places={asPlaced} chambers={chambers} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Field label="Your name">
                <input className={`${INPUT} min-h-[44px]`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              {problem(nameProblem)}
            </div>
            <div>
              <Field label="Your mobile">
                <input type="tel" inputMode="numeric" className={`${INPUT} min-h-[44px]`} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              {problem(phoneProblem)}
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> These places are held for you for 24 hours. Next you see the owner’s bank account and UPI ID: pay the owner directly, then write the payment reference. The places are yours once the owner confirms.
          </p>
        </div>
      ) : step === 'pay' && booked ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
            Booked: <strong>{chosenWords}</strong> in {l.title}. Your places are held until <strong>{heldUntil}</strong>. Pay the owner before then.
          </p>
          <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <p className="font-semibold text-slate-900 mb-2">Gate Pass QR Code</p>
            <p className="text-sm text-slate-600 mb-3">Scan this QR code at the cold store gate for entry</p>
            <GatePassQR bookingId={booked.id} bookingCode={bookingCode(booked.id)} places={asPlaced} chambers={chambers} ownerName={l.owner_name} ownerPhone={l.phone} amount={booked.amount} />
            <PayOwner bookingId={booked.id} amount={booked.amount} owner={{ name: l.owner_name, phone: l.phone }} onPaid={() => setStep('paid')} />
          </div>
        </div>
      ) : booked ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-700" aria-hidden />
          <p className="text-lg font-semibold text-slate-900">Thank you. We told the owner you paid.</p>
          <p className="text-sm text-slate-700">The owner checks the money in their bank or UPI app and confirms. Your receipt {bookingCode(booked.id)} is ready: show it at the cold store when you bring your apples.</p>
          <Btn theme={theme} href={`/rental/receipt/${booked.id}`} icon={ReceiptText} className="min-h-[48px] text-base">See your receipt</Btn>
        </div>
      ) : null}
    </Modal>
  );
}

/**
 * Where a farmer's bins are: the places in words, and the whole store
 * (drawing or 3D) with their stacks in violet and the rest of the store as
 * it is for the months of the booking.
 */
export function MyPlaces({ places, chambers, listingId, start, months, name }: { places: BookedPlace[]; chambers: ColdChamber[]; listingId: string; start: string; months: number; name?: string }) {
  const [open, setOpen] = useState(false);
  const [taken, setTaken] = useState<Map<string, PlaceInfo>>(new Map());
  const mine = useMemo(() => new Set(places.map((p) => placeKey(p.chamber_id, p.slot))), [places]);
  const [active, setActive] = useState<string | null>(places[0]?.chamber_id ?? null);
  const kinds = [...new Set(chambers.filter((c) => places.some((p) => p.chamber_id === c.id)).map((c) => c.storage))];

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
  const lines = placeLines(places, chambers);
  return (
    <div className="mt-2">
      {lines.length ? (
        <div className="text-sm text-slate-800">
          <p>Your places:</p>
          <ul className="mt-0.5 space-y-0.5">
            {lines.map((line) => (
              <li key={line.chamberId}><strong>{line.text}</strong> — {countText(line.count, line.storage)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-800">Your places: <strong>{places.map((p) => placeLabel(p.slot)).join(' · ')}</strong></p>
      )}
      <PlaceDirections places={places} chambers={chambers} />
      {chambers.length > 0 && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-1 inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 text-sm font-semibold text-sky-800 hover:underline">
          <MapIcon className="h-4 w-4" aria-hidden /> {open ? 'Hide the cold store' : `See where your ${wordFor(kinds.length ? kinds : ['boxes'])} are (drawing & 3D)`}
        </button>
      )}
      {open && chambers.length > 0 && (
        <div className="mt-3">
          <ColdStoreExplorer chambers={chambers} stateOf={stateOf} roomOf={roomOf} mode="view" active={active} onActive={setActive} legend={['mine', 'free', 'part', 'held', 'booked', 'blocked']} mineName={name} facilityId={listingId} />
        </div>
      )}
    </div>
  );
}
