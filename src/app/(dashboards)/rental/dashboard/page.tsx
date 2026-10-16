'use client';

/**
 * Cold Storage Booking portal (/rental — the old name stays in the address).
 *   Farmers: find a cold store with free space (live vacancy), see the whole
 *   store — every chamber on a floor plan and in 3D — choose their own
 *   places for some months, pay the owner directly by UPI / bank, and the
 *   owner confirms. Later they see exactly where their boxes are.
 *   Owners: list their cold store (capacity in boxes, vacancy, rate, UPI /
 *   bank details), draw its chambers as rows of stacks, and confirm bookings.
 *   (components/rental)
 * Payments go straight to the owner — KashRoot does not hold them.
 * Data: rental_listings, rental_bookings, payout_accounts (shared database).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, CalendarDays, CheckCircle2, Loader2, Map as MapIcon, MapPin, Minus, Pencil, Phone, Plus, PlusCircle, Search, Snowflake, Store, Trash2, Warehouse, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { PayDirect } from '@/components/payments/PayDirect';
import { PayoutForm } from '@/components/payments/PayoutForm';
import { ColdBooking, MyPlaces, placesText } from '@/components/rental/ColdBooking';
import { ColdMapEditor } from '@/components/rental/ColdMapEditor';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { inr, loadAccount, type Account } from '@/lib/db/client';
import { chambersOf, placesOfBookings, usablePlaces, type BookedPlace, type ColdChamber } from '@/lib/db/coldMap';
import {
  bookingAction,
  BOOKING_STATUS,
  deleteListing,
  incomingBookings,
  listListings,
  myBookings,
  myListings,
  myPayout,
  requestBooking,
  saveListing,
  setAvailability,
  UNIT_LABEL,
  type ListingInput,
  type PayoutAccount,
  type RentalBooking,
  type RentalListing,
} from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
const today = () => new Date().toISOString().slice(0, 10);

const blankListing = (account: Account | null): ListingInput => ({
  kind: 'cold_store',
  title: '',
  owner_name: account?.name ?? '',
  phone: account?.phone ?? '',
  district: account?.district ?? '',
  address: '',
  unit: 'box_month',
  capacity: 1000,
  available: 1000,
  rate: 15,
  min_units: 10,
  temperature: '0–2 °C, CA',
  details: '',
});

/** Only cold stores are booked here (older machinery listings are not shown). */
const isCold = (l: { kind: string }) => l.kind === 'cold_store';

export default function RentalPage() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [tab, setTab] = useState('cold');
  const [listings, setListings] = useState<RentalListing[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState<RentalBooking[]>([]);
  const [incoming, setIncoming] = useState<RentalBooking[]>([]);
  const [owned, setOwned] = useState<RentalListing[]>([]);
  const [booking, setBooking] = useState<RentalListing | null>(null);
  const [loading, setLoading] = useState(false);
  // The cold store map: chambers of the stores on screen, and the places bookings hold.
  const [chambers, setChambers] = useState<ColdChamber[]>([]);
  const [places, setPlaces] = useState<BookedPlace[]>([]);

  useEffect(() => {
    void loadAccount().then(setAccount);
  }, []);

  const refresh = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const shown = tab === 'cold' ? await listListings('cold_store') : null;
      if (shown) setListings(shown);
      const [b0, i0, o0] = await Promise.all([myBookings(account.id), incomingBookings(account.id), myListings(account.id)]);
      const coldOnly = (x: RentalBooking) => !x.rental_listings?.kind || x.rental_listings.kind === 'cold_store';
      const [b, i, o] = [b0.filter(coldOnly), i0.filter(coldOnly), o0.filter(isCold)];
      setMine(b);
      setIncoming(i);
      setOwned(o);
      const storeIds = [...new Set([...(shown ?? []), ...o].map((l) => l.id).concat([...b, ...i].map((x) => x.listing_id)))];
      const [c, p] = await Promise.all([chambersOf(storeIds), placesOfBookings([...b, ...i].map((x) => x.id))]);
      setChambers(c);
      setPlaces(p);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load.');
    } finally {
      setLoading(false);
    }
  }, [account, tab]);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await refresh();
    };
    void run();
    const id = window.setInterval(() => void run(), 30000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => !q || `${l.title} ${l.district} ${l.address ?? ''} ${l.owner_name}`.toLowerCase().includes(q));
  }, [listings, search]);

  const waiting = incoming.filter((b) => b.status === 'requested' || b.status === 'paid').length;

  if (account === undefined) return <p className="flex items-center gap-2 p-10 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;

  return (
    <PortalShell
      title="Cold storage booking"
      description="See the whole cold store — every chamber, on a plan and in 3D — choose your own place for your boxes and pay the owner directly. Or list your own cold store."
      eyebrow="Cold storage"
      theme="rental"
      kpis={[
        { label: 'Free cold-store space', value: tab === 'cold' ? `${listings.reduce((s, l) => s + l.available, 0).toLocaleString('en-IN')} boxes` : '—', trend: `${tab === 'cold' ? listings.length : 0} cold stores` },
        { label: 'Your bookings', value: String(mine.length), trend: `${mine.filter((b) => b.status === 'confirmed').length} confirmed` },
        { label: 'Waiting for you', value: String(waiting), trend: owned.length ? 'Bookings to confirm' : 'List your cold store' },
      ]}
      tabs={[
        { id: 'cold', label: 'Find a cold store', icon: Snowflake },
        { id: 'bookings', label: 'My bookings', icon: CalendarDays, count: mine.filter((b) => b.status === 'requested').length || undefined },
        { id: 'owner', label: 'My cold store', icon: Warehouse, count: waiting || undefined },
      ]}
      activeTab={tab}
      onTabChange={setTab}
    >
      {account === null ? (
        <Panel theme={theme}>
          <EmptyState theme={theme} icon={Store} title="Please sign in again" text="Your session has ended." />
        </Panel>
      ) : listError ? (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{listError}</p>
      ) : tab === 'cold' ? (
        <div className="space-y-5">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className={`${INPUT} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by district, village or cold store" />
          </label>
          {loading && listings.length === 0 ? (
            <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
          ) : visible.length === 0 ? (
            <EmptyState theme={theme} icon={Snowflake} title="No cold stores listed yet" text="Cold-store owners can list their space under “My cold store”." action={<Btn theme={theme} variant="soft" onClick={() => setTab('owner')}>List yours</Btn>} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((l) => (
                <ListingCard key={l.id} listing={l} chambers={chambers.filter((c) => c.listing_id === l.id)} own={l.owner_id === account.id} onBook={() => setBooking(l)} />
              ))}
            </div>
          )}
        </div>
      ) : tab === 'bookings' ? (
        <Panel theme={theme} title="My bookings" icon={CalendarDays}>
          {mine.length === 0 ? (
            <EmptyState theme={theme} icon={CalendarDays} title="No bookings yet" text="Book your place in a cold store and it appears here, with how to pay the owner and where your boxes are." action={<Btn theme={theme} onClick={() => setTab('cold')}>Find cold storage</Btn>} />
          ) : (
            <ul className="space-y-4">
              {mine.map((b) => (
                <RenterBooking key={b.id} booking={b} places={places.filter((p) => p.booking_id === b.id)} chambers={chambers.filter((c) => c.listing_id === b.listing_id)} onChange={() => void refresh()} />
              ))}
            </ul>
          )}
        </Panel>
      ) : (
        <OwnerPanel account={account} owned={owned} incoming={incoming} chambers={chambers} places={places} onChange={() => refresh()} />
      )}

      {booking && account && chambers.some((c) => c.listing_id === booking.id) && (
        <ColdBooking
          listing={booking}
          chambers={chambers.filter((c) => c.listing_id === booking.id)}
          account={account}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            setTab('bookings');
            void refresh();
          }}
        />
      )}
      {booking && account && !chambers.some((c) => c.listing_id === booking.id) && (
        <BookingModal
          listing={booking}
          account={account}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null);
            setTab('bookings');
            void refresh();
          }}
        />
      )}
    </PortalShell>
  );
}

function ListingCard({ listing: l, chambers, own, onBook }: { listing: RentalListing; chambers: ColdChamber[]; own: boolean; onBook: () => void }) {
  const unit = UNIT_LABEL[l.unit];
  const map = chambers.length > 0;
  const pct = l.capacity ? Math.round((l.available / l.capacity) * 100) : 0;
  return (
    <div className="flex flex-col rounded-2xl bg-white/85 p-5 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-sans text-lg font-semibold text-slate-900">{l.title}</h3>
        {l.available > 0 ? <Badge tone="green">Space free</Badge> : <Badge tone="red">Full</Badge>}
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" aria-hidden /> {l.district}{l.address ? ` · ${l.address}` : ''}</p>
      {l.temperature && <p className="flex items-center gap-1.5 text-sm text-slate-600"><Snowflake className="h-4 w-4" aria-hidden /> {l.temperature}</p>}
      <div className="mt-3">
        <p className="flex justify-between text-sm"><span className="font-semibold text-slate-900">{l.available.toLocaleString('en-IN')} boxes free</span><span className="text-slate-500">of {l.capacity.toLocaleString('en-IN')}</span></p>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Free space">
          <div className="h-full rounded-full bg-violet-600" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {map && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-sky-800"><MapIcon className="h-4 w-4" aria-hidden /> See it in 3D, choose your place · {chambers.length} chamber{chambers.length === 1 ? '' : 's'}, {chambers.reduce((s, c) => s + usablePlaces(c), 0)} places</p>}
      {l.details && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{l.details}</p>}
      <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-900/5 pt-4">
        <div>
          <p className="text-lg font-bold text-slate-900">{inr(l.rate)} <span className="text-xs font-normal text-slate-500">{unit.per}</span></p>
          <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700"><Phone className="h-3.5 w-3.5" aria-hidden /> {l.owner_name}</a>
        </div>
        {own ? <Badge tone="violet">Your listing</Badge> : map ? <Btn theme={theme} size="sm" icon={MapIcon} onClick={onBook}>Choose your place</Btn> : <Btn theme={theme} size="sm" icon={CalendarDays} disabled={l.available < l.min_units} onClick={onBook}>Book</Btn>}
      </div>
    </div>
  );
}

function BookingModal({ listing: l, account, onClose, onBooked }: { listing: RentalListing; account: Account; onClose: () => void; onBooked: () => void }) {
  const unit = UNIT_LABEL[l.unit];
  const [form, setForm] = useState({ units: String(l.min_units), duration: l.unit === 'box_month' ? '3' : '1', start: today(), name: account.name, phone: account.phone });
  const [busy, setBusy] = useState(false);
  const units = Number(form.units) || 0;
  const duration = Number(form.duration) || 0;
  const total = units * duration * l.rate;

  const send = async () => {
    if (units < l.min_units) return toast.error(`Minimum ${l.min_units} ${unit.unit}.`);
    if (units > l.available) return toast.error(`Only ${l.available} ${unit.unit} free.`);
    if (duration < 1) return toast.error(`Choose how many ${unit.duration}.`);
    if (!/^(\+?91)?[6-9]\d{9}$/.test(form.phone.replace(/\s/g, ''))) return toast.error('Add your 10-digit mobile number.');
    setBusy(true);
    try {
      await requestBooking({ listing_id: l.id, renter_name: form.name, renter_phone: form.phone.replace(/\s/g, ''), units, duration, start_date: form.start });
      toast.success('Booking sent — now pay the owner to confirm it');
      onBooked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not book.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Book ${l.title}`}
      footer={
        <>
          <Btn theme={theme} variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn theme={theme} icon={CalendarDays} disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : `Book for ${inr(total)}`}</Btn>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">{inr(l.rate)} {unit.per} · {l.available} {unit.unit} free · minimum {l.min_units}</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label={l.unit === 'box_month' ? 'How many boxes?' : 'How many?'}>
            <input type="number" min={l.min_units} max={l.available} className={INPUT} value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
          </Field>
          <Field label={`For how many ${unit.duration}?`}>
            <input type="number" min={1} max={365} className={INPUT} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} />
          </Field>
          <Field label="Starting from">
            <input type="date" min={today()} className={INPUT} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </Field>
          <Field label="Your mobile">
            <input type="tel" className={INPUT} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-950">
          Total <strong className="text-lg">{inr(total)}</strong>. After booking you pay the owner directly by UPI or bank transfer; the space is yours once the owner confirms your payment.
        </p>
      </div>
    </Modal>
  );
}

function RenterBooking({ booking: b, places, chambers, onChange }: { booking: RentalBooking; places: BookedPlace[]; chambers: ColdChamber[]; onChange: () => void }) {
  // When this card was shown (the list refreshes every 30 seconds).
  const [now] = useState(() => Date.now());
  const s = BOOKING_STATUS[b.status];
  const l = b.rental_listings;
  const unit = UNIT_LABEL[(l?.unit ?? 'box_month') as keyof typeof UNIT_LABEL];
  const cancel = async () => {
    try {
      await bookingAction(b.id, 'cancel');
      toast.success('Booking cancelled');
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel.');
    }
  };
  return (
    <li className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{l?.title ?? 'Listing'}</p>
          <p className="text-sm text-slate-600">{b.units} {unit.unit} · {b.duration} {unit.duration} from {b.start_date} · <strong>{inr(b.amount)}</strong></p>
          {l?.phone && <a href={`tel:${l.phone}`} className="text-xs font-semibold text-violet-700">Call {l.owner_name}</a>}
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      <MyPlaces places={places} chambers={chambers} listingId={b.listing_id} start={b.start_date} months={b.duration} />
      {places.length > 0 && b.status === 'requested' && (
        <p className="mt-2 text-sm text-amber-800">
          {Date.parse(b.created_at) + 86_400_000 > now
            ? `Your places are held until ${new Date(Date.parse(b.created_at) + 86_400_000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}. Pay the owner before then.`
            : 'The 24-hour hold has ended: pay now and enter the payment number — if someone else has taken a place meanwhile, you will be told to choose again.'}
        </p>
      )}
      {b.owner_note && <p className="mt-2 text-sm text-slate-700">Owner: {b.owner_note}</p>}
      {b.payment_ref && <p className="mt-2 text-xs text-slate-500">Your payment reference: <span className="font-mono">{b.payment_ref}</span></p>}
      {b.status === 'requested' && (
        <div className="mt-3">
          <PayDirect kind="booking" id={b.id} amount={b.amount} note={`KashRoot booking ${b.id.slice(0, 8)}`} theme={theme} onPaid={async (ref) => { await bookingAction(b.id, 'pay', ref); onChange(); }} />
        </div>
      )}
      {(b.status === 'requested' || b.status === 'paid') && (
        <Btn theme={theme} size="sm" variant="ghost" className="mt-3" icon={XCircle} onClick={() => void cancel()}>Cancel booking</Btn>
      )}
    </li>
  );
}

function OwnerPanel({ account, owned, incoming, chambers, places, onChange }: { account: Account; owned: RentalListing[]; incoming: RentalBooking[]; chambers: ColdChamber[]; places: BookedPlace[]; onChange: () => Promise<void> | void }) {
  const [editing, setEditing] = useState<{ id?: string; data: ListingInput } | null>(null);
  const [mapOf, setMapOf] = useState<RentalListing | null>(null);
  const [payout, setPayout] = useState<PayoutAccount | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void myPayout(account.id).then(setPayout).catch(() => setPayout(null));
  }, [account.id]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const d = editing.data;
    if (d.title.trim().length < 2 || d.district.trim().length < 2) return toast.error('Add a name and district.');
    if (!/^(\+?91)?[6-9]\d{9}$/.test(d.phone.replace(/\s/g, ''))) return toast.error('Add a 10-digit mobile number farmers can call.');
    if (!(d.capacity > 0) || d.available < 0 || !(d.rate >= 0)) return toast.error('Check capacity, free space and rate.');
    await run(async () => {
      await saveListing({ ...d, title: d.title.trim(), phone: d.phone.replace(/\s/g, ''), available: Math.min(d.available, d.capacity) }, editing.id);
      setEditing(null);
    }, editing.id ? 'Listing updated' : 'Listed — farmers can now book it');
  };

  const pending = incoming.filter((b) => b.status === 'requested' || b.status === 'paid');
  const others = incoming.filter((b) => !(b.status === 'requested' || b.status === 'paid'));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel theme={theme} title="Bookings to confirm" icon={CheckCircle2} className="lg:col-span-2">
        {pending.length === 0 ? (
          <p className="text-sm text-slate-600">No bookings waiting. When a farmer books and pays, confirm it here after checking the money arrived in your bank or UPI app.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((b) => (
              <li key={b.id} className="flex flex-col gap-3 rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{b.renter_name} · {b.units} {UNIT_LABEL[(b.rental_listings?.unit ?? 'box_month') as keyof typeof UNIT_LABEL].unit} · {b.duration} {UNIT_LABEL[(b.rental_listings?.unit ?? 'box_month') as keyof typeof UNIT_LABEL].duration}</p>
                  <p className="text-sm text-slate-600">{b.rental_listings?.title} · from {b.start_date} · <strong>{inr(b.amount)}</strong> · <a href={`tel:${b.renter_phone}`} className="font-semibold text-violet-700">{b.renter_phone}</a></p>
                  {places.some((p) => p.booking_id === b.id) && <p className="text-sm text-slate-700">Places: <strong>{placesText(places.filter((p) => p.booking_id === b.id), chambers)}</strong></p>}
                  {b.payment_ref ? (
                    <p className="mt-1 text-sm text-emerald-800">Farmer says paid · reference <span className="font-mono font-semibold">{b.payment_ref}</span> — check it in your bank app before confirming.</p>
                  ) : (
                    <p className="mt-1 text-sm text-amber-800">Not paid yet.</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Btn theme={theme} size="sm" icon={CheckCircle2} disabled={busy} onClick={() => void run(() => bookingAction(b.id, 'confirm'), 'Booking confirmed — space reserved')}>{b.payment_ref ? 'Payment received, confirm' : 'Confirm without payment'}</Btn>
                  <Btn theme={theme} size="sm" variant="danger" icon={XCircle} disabled={busy} onClick={() => { const note = window.prompt('Reason (the farmer will see this). If they already paid, tell them how you will return the money.') ?? ''; void run(() => bookingAction(b.id, 'reject', undefined, note), 'Booking declined'); }}>Decline</Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel theme={theme} title="My cold stores" icon={Warehouse} action={<Btn theme={theme} size="sm" icon={PlusCircle} onClick={() => setEditing({ data: blankListing(account) })}>Add cold store</Btn>}>
        {owned.length === 0 ? (
          <EmptyState theme={theme} icon={Warehouse} title="Nothing listed" text="Add your cold store with how many boxes it holds and how many are free. Farmers see it straight away." />
        ) : (
          <ul className="space-y-3">
            {owned.map((l) => {
              const unit = UNIT_LABEL[l.unit];
              const step = 100;
              const mapped = chambers.some((c) => c.listing_id === l.id);
              return (
                <li key={l.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">{l.title} {!l.active && <Badge tone="slate">Hidden</Badge>}</p>
                    <span className="text-sm text-slate-600">{inr(l.rate)} {unit.per}</span>
                  </div>
                  {mapped ? (
                    <p className="mt-3 text-sm text-slate-700">
                      Free now: <strong className="text-lg tabular-nums text-slate-900"><Boxes className="mr-1 inline h-4 w-4 text-violet-600" aria-hidden />{l.available.toLocaleString('en-IN')}</strong> of {l.capacity.toLocaleString('en-IN')} boxes — counted from your map
                    </p>
                  ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm text-slate-700">Free now:</span>
                    <button type="button" aria-label={`${step} fewer free`} disabled={busy} onClick={() => void run(() => setAvailability(l.id, Math.max(0, l.available - step)), 'Vacancy updated')} className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-slate-100 hover:bg-slate-200"><Minus className="h-4 w-4" aria-hidden /></button>
                    <span className="min-w-[6rem] text-center text-lg font-bold tabular-nums text-slate-900"><Boxes className="mr-1 inline h-4 w-4 text-violet-600" aria-hidden />{l.available.toLocaleString('en-IN')}</span>
                    <button type="button" aria-label={`${step} more free`} disabled={busy} onClick={() => void run(() => setAvailability(l.id, Math.min(l.capacity, l.available + step)), 'Vacancy updated')} className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-slate-100 hover:bg-slate-200"><Plus className="h-4 w-4" aria-hidden /></button>
                    <span className="text-sm text-slate-500">of {l.capacity.toLocaleString('en-IN')} {unit.unit}</span>
                  </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Btn theme={theme} size="sm" icon={MapIcon} onClick={() => setMapOf(l)}>{mapped ? 'Cold store map & 3D' : 'Draw your cold store map'}</Btn>
                    <Btn theme={theme} size="sm" variant="soft" icon={Pencil} onClick={() => setEditing({ id: l.id, data: { kind: l.kind, title: l.title, owner_name: l.owner_name, phone: l.phone, district: l.district, address: l.address ?? '', unit: l.unit, capacity: l.capacity, available: l.available, rate: Number(l.rate), min_units: l.min_units, temperature: l.temperature ?? '', details: l.details ?? '' } })}>Edit</Btn>
                    <Btn theme={theme} size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => setAvailability(l.id, l.available, !l.active), l.active ? 'Hidden from farmers' : 'Visible to farmers again')}>{l.active ? 'Hide' : 'Show again'}</Btn>
                    <Btn theme={theme} size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={() => { if (window.confirm(`Remove ${l.title}? Its bookings are removed too.`)) void run(() => deleteListing(l.id), 'Listing removed'); }}>Remove</Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <PayoutForm theme={theme} payout={payout} onSaved={setPayout} />

      {others.length > 0 && (
        <Panel theme={theme} title="Booking history" icon={CalendarDays} className="lg:col-span-2">
          <ul className="divide-y divide-slate-900/5">
            {others.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="text-slate-800">{b.renter_name} · {b.rental_listings?.title} · {b.units} × {b.duration} · {inr(b.amount)}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
                  {b.status === 'confirmed' && <Btn theme={theme} size="sm" variant="soft" disabled={busy} onClick={() => void run(() => bookingAction(b.id, 'complete'), 'Completed — space is free again')}>Goods taken out</Btn>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {mapOf && (
        <ColdMapEditor
          listing={owned.find((l) => l.id === mapOf.id) ?? mapOf}
          chambers={chambers.filter((c) => c.listing_id === mapOf.id)}
          bookings={incoming.filter((b) => b.listing_id === mapOf.id)}
          places={places}
          onClose={() => setMapOf(null)}
          onChanged={onChange}
        />
      )}

      {editing && (
        <Modal
          open
          wide
          onClose={() => setEditing(null)}
          title={editing.id ? 'Edit your cold store' : 'Add your cold store'}
          footer={
            <>
              <Btn theme={theme} variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn theme={theme} icon={CheckCircle2} disabled={busy} onClick={() => void save()}>Save</Btn>
            </>
          }
        >
          <ListingForm value={editing.data} mapped={Boolean(editing.id && chambers.some((c) => c.listing_id === editing.id))} onChange={(data) => setEditing({ ...editing, data })} />
        </Modal>
      )}
    </div>
  );
}

function ListingForm({ value: v, mapped = false, onChange }: { value: ListingInput; mapped?: boolean; onChange: (v: ListingInput) => void }) {
  const set = <K extends keyof ListingInput>(k: K, val: ListingInput[K]) => onChange({ ...v, [k]: val });
  const num = (s: string) => (s === '' ? 0 : Number(s));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Cold store name">
        <input className={INPUT} value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Valley Fresh CA Store" />
      </Field>
      <Field label="Your name">
        <input className={INPUT} value={v.owner_name} onChange={(e) => set('owner_name', e.target.value)} />
      </Field>
      <Field label="Mobile (farmers call this)">
        <input type="tel" className={INPUT} value={v.phone} onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <Field label="District">
        <input className={INPUT} value={v.district} onChange={(e) => set('district', e.target.value)} placeholder="e.g. Shopian" />
      </Field>
      <Field label="Village / address">
        <input className={INPUT} value={v.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="e.g. Industrial Estate, Lassipora" />
      </Field>
      <Field label="Temperature / type">
        <input className={INPUT} value={v.temperature ?? ''} onChange={(e) => set('temperature', e.target.value)} placeholder="e.g. 0–2 °C, controlled atmosphere" />
      </Field>
      <Field label="Total capacity (boxes)" hint={mapped ? 'Counted from your cold store map' : undefined}>
        <input type="number" min={1} disabled={mapped} className={INPUT} value={v.capacity || ''} onChange={(e) => set('capacity', num(e.target.value))} />
      </Field>
      <Field label="Free right now (boxes)" hint={mapped ? 'Counted from your cold store map' : undefined}>
        <input type="number" min={0} disabled={mapped} className={INPUT} value={v.available} onChange={(e) => set('available', num(e.target.value))} />
      </Field>
      <Field label="Rate (₹ per box per month)">
        <input type="number" min={0} step="0.5" className={INPUT} value={v.rate} onChange={(e) => set('rate', num(e.target.value))} />
      </Field>
      <Field label="Minimum boxes per booking">
        <input type="number" min={1} className={INPUT} value={v.min_units} onChange={(e) => set('min_units', Math.max(1, num(e.target.value)))} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="More details (optional)">
          <textarea rows={2} className={INPUT} value={v.details ?? ''} onChange={(e) => set('details', e.target.value)} placeholder="e.g. Grading line, loading bay, 24-hour power backup" />
        </Field>
      </div>
    </div>
  );
}
