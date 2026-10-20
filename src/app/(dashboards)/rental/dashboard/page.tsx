'use client';

/**
 * Cold Storage Booking portal (/rental — the old name stays in the address).
 *   Farmers: find a cold store with free space (live vacancy), see the whole
 *   store — every chamber on a floor plan and in 3D, with what each holds —
 *   choose their own places for any number of boxes (a small lot shares a
 *   place) for some months, pay the owner directly by UPI / bank for their
 *   own boxes, and the owner confirms. Later they see exactly where their
 *   boxes are.
 *   Owners: set up their cold store step by step in the owner wizard —
 *   the store and its people, the building and main door, each chamber
 *   (bins or crates, floors, size, its own door, rent), where farmers pay
 *   them — drawn and in 3D as they type; then confirm bookings.
 *   (components/rental, components/rental/owner)
 * Payments go straight to the owner — KashRoot does not hold them.
 * Data: rental_listings, rental_bookings, payout_accounts (shared database).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Apple, ArrowRight, Boxes, CalendarDays, CheckCircle2, ClipboardCheck, IndianRupee, Landmark, Loader2, Map as MapIcon, MapPin, Minus, Pencil, Phone, Plus, PlusCircle, Search, Snowflake, Store, Trash2, Warehouse, XCircle } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { IdentityStatus } from '@/components/auth/IdentityStatus';
import { PortalShell } from '@/components/layout/PortalShell';
import { PayDirect } from '@/components/payments/PayDirect';
import { ColdBooking, MyPlaces, placesText } from '@/components/rental/ColdBooking';
import { ColdMapEditor } from '@/components/rental/ColdMapEditor';
import { OwnerWizard, type Step } from '@/components/rental/owner/OwnerWizard';
import { PaymentDetails } from '@/components/rental/owner/PaymentStep';
import { ColdStoreDirectory, useColdDirectory } from '@/components/rental/ColdStoreDirectory';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { inr, loadAccount, type Account } from '@/lib/db/client';
import { showLength } from '@/lib/coldLayout';
import { countText, groupChambers, unitsText } from '@/lib/coldStore';
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
  setAvailability,
  setRent,
  UNIT_LABEL,
  type PayoutAccount,
  type RentalBooking,
  type RentalListing,
} from '@/lib/db/rentals';

const theme = PORTAL_THEMES.rental;
const today = () => new Date().toISOString().slice(0, 10);

type Side = 'farmer' | 'owner';
/** The side last chosen on this device. */
const SIDE_KEY = 'kr_cold_side';

/** Only cold stores are booked here (older machinery listings are not shown). */
const isCold = (l: { kind: string }) => l.kind === 'cold_store';

export default function RentalPage() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  // Two sides of the portal: farmers who store apples, and owners who run a cold store.
  const [side, setSideState] = useState<Side>(() => {
    try {
      const asked = new URLSearchParams(window.location.search).get('as');
      if (asked === 'owner' || asked === 'farmer') return asked;
      return localStorage.getItem(SIDE_KEY) === 'owner' ? 'owner' : 'farmer';
    } catch {
      return 'farmer';
    }
  });
  const [tab, setTab] = useState(() => (side === 'owner' ? 'stores' : 'cold'));
  const [listings, setListings] = useState<RentalListing[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Find a cold store: every cold store in J&K, or only those on KashRoot (bookable).
  const [findView, setFindView] = useState<'all' | 'kashroot'>('all');
  // "Your store? List it": a directory entry opened in My cold store, ready to list.
  const [claim, setClaim] = useState<{ title: string; district: string; address: string } | null>(null);
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
  const setSide = (next: Side, to?: string) => {
    setSideState(next);
    setTab(to ?? (next === 'owner' ? (waiting ? 'requests' : 'stores') : 'cold'));
    setClaim(null);
    try {
      localStorage.setItem(SIDE_KEY, next);
    } catch {
      /* private mode */
    }
  };
  const activeBookings = mine.filter((b) => b.status === 'requested' || b.status === 'paid' || b.status === 'confirmed');
  const directory = useColdDirectory(listings);
  // What the owner's stores hold: "bins and crates", or "boxes" for older stores.
  const ownedUnits = unitsText(chambers.filter((c) => owned.some((l) => l.id === c.listing_id)).map((c) => c.storage));

  if (account === undefined) return <p className="flex items-center gap-2 p-10 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;

  return (
    <PortalShell
      title="Cold storage booking"
      description={
        side === 'farmer'
          ? 'Find a cold store, see every chamber on a plan and in 3D, choose your own place for any number of boxes, and pay the owner directly.'
          : 'Set up your cold store step by step — the building, each chamber with its bins or crates — and see it drawn and in 3D as you type. Then confirm bookings and get paid directly.'
      }
      eyebrow="Cold storage"
      theme="rental"
      switcher={<SideSwitch side={side} waiting={waiting} onChange={(s) => setSide(s)} />}
      kpis={
        side === 'farmer'
          ? [
              { label: 'Cold stores in J&K', value: directory.entries.length.toLocaleString('en-IN') + (directory.reading ? '…' : ''), trend: `${listings.length} on KashRoot · ${listings.reduce((s, l) => s + l.available, 0).toLocaleString('en-IN')} boxes free` },
              { label: 'Your bookings', value: String(mine.length), trend: `${mine.filter((b) => b.status === 'confirmed').length} confirmed`, onClick: () => setTab('bookings') },
              { label: 'Your boxes booked', value: activeBookings.reduce((s, b) => s + b.units, 0).toLocaleString('en-IN'), trend: activeBookings.length ? `in ${activeBookings.length} booking${activeBookings.length === 1 ? '' : 's'}` : 'Book any number of boxes' },
            ]
          : [
              { label: 'My cold stores', value: String(owned.length), trend: owned.length ? `${owned.reduce((s, l) => s + l.capacity, 0).toLocaleString('en-IN')} ${ownedUnits} in all` : 'List your cold store', onClick: () => setTab('stores') },
              { label: 'Waiting for you', value: String(waiting), trend: 'Bookings to confirm', onClick: () => setTab('requests') },
              { label: 'Free in my stores', value: owned.reduce((s, l) => s + l.available, 0).toLocaleString('en-IN'), trend: `${ownedUnits} free, of ${owned.reduce((s, l) => s + l.capacity, 0).toLocaleString('en-IN')}` },
            ]
      }
      tabs={
        side === 'farmer'
          ? [
              { id: 'cold', label: 'Find a cold store', icon: Snowflake },
              { id: 'bookings', label: 'My bookings', icon: CalendarDays, count: mine.filter((b) => b.status === 'requested').length || undefined },
            ]
          : [
              { id: 'stores', label: 'My cold stores', icon: Warehouse },
              { id: 'requests', label: 'Bookings to confirm', icon: ClipboardCheck, count: waiting || undefined },
              { id: 'payments', label: 'Payment details', icon: Landmark },
            ]
      }
      activeTab={tab}
      onTabChange={(id) => {
        setTab(id);
        setClaim(null);
      }}
    >
      {account === null ? (
        <Panel theme={theme}>
          <EmptyState theme={theme} icon={Store} title="Please sign in again" text="Your session has ended." />
        </Panel>
      ) : listError ? (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{listError}</p>
      ) : tab === 'cold' ? (
        <div className="space-y-5">
          <div role="tablist" aria-label="Which cold stores" className="flex w-full gap-1 rounded-2xl bg-violet-50 p-1 ring-1 ring-violet-200 sm:w-auto sm:max-w-xl">
            {([
              ['all', `All cold stores (${directory.entries.length.toLocaleString('en-IN')}${directory.reading ? '…' : ''})`],
              ['kashroot', `Book on KashRoot (${listings.length})`],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={findView === id} onClick={() => setFindView(id)} className={`flex-1 cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold transition ${findView === id ? 'bg-violet-700 text-white shadow' : 'text-violet-900 hover:bg-violet-100'}`}>
                {label}
              </button>
            ))}
          </div>
          {findView === 'all' ? (
            <ColdStoreDirectory
              entries={directory.entries}
              sources={directory.sources}
              loading={directory.loading}
              reading={directory.reading}
              adminCount={directory.adminCount}
              waiting={directory.waiting}
              reload={directory.reload}
              listings={listings}
              onBook={setBooking}
              onClaim={(e) => {
                setSide('owner', 'stores');
                setClaim({ title: e.name, district: e.district ?? '', address: e.place ?? '' });
              }}
            />
          ) : (
          <>
          <p className="text-sm text-slate-700">Cold stores whose owners listed them on KashRoot: see every chamber on a plan and in 3D, choose your own place and pay the owner directly.</p>
          <label className="relative block">
            <span className="sr-only">Search cold stores on KashRoot</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className={`${INPUT} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cold stores on KashRoot: name, village or district" />
          </label>
          {loading && listings.length === 0 ? (
            <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
          ) : visible.length === 0 ? (
            <EmptyState
              theme={theme}
              icon={Snowflake}
              title={listings.length ? `No cold store on KashRoot matches “${search.trim()}”` : 'No cold store on KashRoot yet'}
              text={listings.length ? 'Try another name or district — or look in All cold stores.' : 'When an owner lists their cold store (My cold store) and enters each chamber’s length, breadth and height, it appears here: every chamber on a floor plan and in 3D, and farmers choose their own place. Meanwhile, All cold stores shows every cold store in Jammu & Kashmir.'}
              action={<Btn theme={theme} variant="soft" onClick={() => (listings.length ? setFindView('all') : setSide('owner', 'stores'))}>{listings.length ? 'All cold stores' : 'List your cold store'}</Btn>}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((l) => (
                <ListingCard key={l.id} listing={l} chambers={chambers.filter((c) => c.listing_id === l.id)} own={l.owner_id === account.id} onBook={() => setBooking(l)} />
              ))}
            </div>
          )}
          </>
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
      ) : side === 'owner' ? (
        <OwnerPanel
          section={tab === 'requests' || tab === 'payments' ? tab : 'stores'}
          account={account}
          owned={owned}
          incoming={incoming}
          chambers={chambers}
          places={places}
          prefill={claim}
          onChange={() => refresh()}
        />
      ) : null}

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
      {map && (
        <div className="mt-3 rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-900"><MapIcon className="h-4 w-4" aria-hidden /> {chambers.length} chamber{chambers.length === 1 ? '' : 's'} · see them in 3D, choose your own place</p>
          <ul aria-label="What each chamber holds" className="mt-1.5 space-y-0.5 text-xs text-slate-700">
            {chambers.slice(0, 4).map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="truncate">{c.name}{c.size ? ` · ${showLength(c.size.length, c.size.unit)} × ${showLength(c.size.width, c.size.unit)} × ${showLength(c.size.height, c.size.unit)}` : ''}</span>
                <span className="shrink-0">holds <strong className="text-slate-900">{(usablePlaces(c) * c.boxes_per_slot).toLocaleString('en-IN')}</strong> boxes</span>
              </li>
            ))}
            {chambers.length > 4 && <li className="text-slate-500">and {chambers.length - 4} more</li>}
          </ul>
          <p className="mt-1.5 text-xs font-medium text-emerald-800">
            Any number of boxes{l.min_units > 1 ? ` from ${l.min_units.toLocaleString('en-IN')}` : ''}: share a place, pay only for your own boxes
          </p>
        </div>
      )}
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

function OwnerPanel({
  section,
  account,
  owned,
  incoming,
  chambers,
  places,
  prefill,
  onChange,
}: {
  /** The owner's tab: their stores (plan & 3D), bookings to confirm, or where farmers pay them. */
  section: 'stores' | 'requests' | 'payments';
  account: Account;
  owned: RentalListing[];
  incoming: RentalBooking[];
  chambers: ColdChamber[];
  places: BookedPlace[];
  /** A store from the directory its owner is listing ("Your store? List it"). */
  prefill: { title: string; district: string; address: string } | null;
  onChange: () => Promise<void> | void;
}) {
  // The owner wizard: a new store (listing null) or one being changed, from a step.
  const [wizard, setWizard] = useState<{ key: string; listing: RentalListing | null; start?: Step; prefill?: typeof prefill } | null>(() => (prefill ? { key: 'claim', listing: null, prefill } : null));
  const [mapOf, setMapOf] = useState<RentalListing | null>(null);
  // A store set up before the wizard: its rent per box (and boxes, without chambers).
  const [rentOf, setRentOf] = useState<RentalListing | null>(null);
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
  const openWizard = (listing: RentalListing | null, start?: Step) => {
    setMapOf(null);
    setWizard({ key: `${listing?.id ?? 'new'}-${Date.now()}`, listing, start });
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  const pending = incoming.filter((b) => b.status === 'requested' || b.status === 'paid');
  const others = incoming.filter((b) => !(b.status === 'requested' || b.status === 'paid'));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <IdentityStatus account={account} theme={theme} purpose="list your cold store and take bookings" />
      </div>
      {section === 'requests' && (
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
      )}

      {section === 'stores' && wizard && (
        <OwnerWizard
          key={wizard.key}
          account={account}
          listing={wizard.listing}
          rows={wizard.listing ? chambers.filter((c) => c.listing_id === wizard.listing!.id) : []}
          payout={payout}
          prefill={wizard.prefill}
          start={wizard.start}
          onClose={() => setWizard(null)}
          onChanged={onChange}
          onPayout={setPayout}
        />
      )}

      {section === 'stores' && !wizard && (
      <Panel
        theme={theme}
        title="My cold stores"
        icon={Warehouse}
        className="lg:col-span-2"
        // With no store yet, the button is in the message below instead.
        action={owned.length ? <Btn theme={theme} className="min-h-[44px]" icon={PlusCircle} onClick={() => openWizard(null)}>Add cold store</Btn> : undefined}
      >
        {owned.length === 0 ? (
          <EmptyState
            theme={theme}
            icon={Warehouse}
            title="List your cold store"
            text="Five short steps: your store, the building, the chambers (bins or crates, floors, size, door, rent), where farmers pay you, then publish. Your store is drawn and shown in 3D as you type — farmers see exactly that and book their own places."
            action={<Btn theme={theme} className="min-h-[48px]" icon={PlusCircle} onClick={() => openWizard(null)}>Add cold store</Btn>}
          />
        ) : (
          <ul className="space-y-3">
            {owned.map((l) => {
              const unit = UNIT_LABEL[l.unit];
              const step = 100;
              const mine = chambers.filter((c) => c.listing_id === l.id);
              const mapped = mine.length > 0;
              const groups = groupChambers(mine);
              const words = unitsText(mine.map((c) => c.storage));
              // A store set up in the wizard is ready once it has chambers and payment details.
              const ready = mapped && payout !== null && payout !== undefined;
              const wizardStore = Boolean(l.building) || mine.some((c) => c.chamber_no !== null);
              return (
                <li key={l.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      {l.title}{' '}
                      {!l.active && (wizardStore && !ready ? <Badge tone="amber">Not finished — farmers cannot see it yet</Badge> : <Badge tone="slate">Hidden from farmers</Badge>)}
                    </p>
                    <span className="text-sm text-slate-600">{mine.some((c) => c.rate !== null) ? `from ${inr(l.rate)} a ${words === 'bins' ? 'bin' : words === 'crates' ? 'crate' : 'bin or crate'} a month` : `${inr(l.rate)} ${unit.per}`}</span>
                  </div>
                  {(l.area || l.district) && <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" aria-hidden /> {[l.area, l.district, l.state].filter(Boolean).join(', ')}</p>}
                  {groups.length > 0 && (
                    <p className="mt-2 text-sm text-slate-700">
                      {groups.length} chamber{groups.length === 1 ? '' : 's'}: {groups.slice(0, 4).map((g) => `${g.name} (${countText(g.count, g.storage)}${g.floors.length > 1 ? `, ${g.floors.length} floors` : ''})`).join(' · ')}
                      {groups.length > 4 ? ` and ${groups.length - 4} more` : ''}
                    </p>
                  )}
                  {mapped ? (
                    <p className="mt-3 text-sm text-slate-700">
                      Free now: <strong className="text-lg tabular-nums text-slate-900"><Boxes className="mr-1 inline h-4 w-4 text-violet-600" aria-hidden />{l.available.toLocaleString('en-IN')}</strong> of {l.capacity.toLocaleString('en-IN')} {words} — counted from your chambers
                    </p>
                  ) : wizardStore ? (
                    <p className="mt-3 text-sm text-amber-800">No chambers yet — add them so farmers can book.</p>
                  ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm text-slate-700">Free now:</span>
                    <button type="button" aria-label={`${step} fewer free`} disabled={busy} onClick={() => void run(() => setAvailability(l.id, Math.max(0, l.available - step)), 'Vacancy updated')} className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg bg-slate-100 hover:bg-slate-200"><Minus className="h-4 w-4" aria-hidden /></button>
                    <span className="min-w-[6rem] text-center text-lg font-bold tabular-nums text-slate-900"><Boxes className="mr-1 inline h-4 w-4 text-violet-600" aria-hidden />{l.available.toLocaleString('en-IN')}</span>
                    <button type="button" aria-label={`${step} more free`} disabled={busy} onClick={() => void run(() => setAvailability(l.id, Math.min(l.capacity, l.available + step)), 'Vacancy updated')} className="grid h-11 w-11 cursor-pointer place-items-center rounded-lg bg-slate-100 hover:bg-slate-200"><Plus className="h-4 w-4" aria-hidden /></button>
                    <span className="text-sm text-slate-500">of {l.capacity.toLocaleString('en-IN')} {unit.unit}</span>
                  </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {wizardStore && !ready && !l.active && <Btn theme={theme} className="min-h-[44px]" icon={ArrowRight} onClick={() => openWizard(l)}>Finish setting up</Btn>}
                    {mapped && <Btn theme={theme} variant={wizardStore && !ready && !l.active ? 'soft' : 'solid'} className="min-h-[44px]" icon={MapIcon} onClick={() => setMapOf(l)}>Cold store map & 3D</Btn>}
                    <Btn theme={theme} variant="soft" className="min-h-[44px]" icon={Pencil} onClick={() => openWizard(l, 1)}>Change details</Btn>
                    {!wizardStore && <Btn theme={theme} variant="soft" className="min-h-[44px]" icon={IndianRupee} onClick={() => setRentOf(l)}>Change rent</Btn>}
                    <Btn theme={theme} variant="soft" className="min-h-[44px]" icon={Warehouse} onClick={() => openWizard(l, wizardStore || !mapped ? (l.building ? 3 : 2) : 3)}>{mapped ? 'Change chambers' : 'Add chambers'}</Btn>
                    {(!wizardStore || ready || l.active) && (
                      <Btn theme={theme} variant="ghost" className="min-h-[44px]" disabled={busy} onClick={() => void run(() => setAvailability(l.id, l.available, !l.active), l.active ? 'Hidden from farmers' : 'Farmers can see it again')}>{l.active ? 'Hide' : 'Show to farmers'}</Btn>
                    )}
                    <Btn theme={theme} variant="danger" className="min-h-[44px]" icon={Trash2} disabled={busy} onClick={() => { if (window.confirm(`Remove ${l.title}? Its bookings are removed too.`)) void run(() => deleteListing(l.id), 'Listing removed'); }}>Remove</Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      )}

      {section === 'payments' && (
        <>
          <PaymentDetails payout={payout} onSaved={setPayout} name={owned[0]?.owner_name ?? account.name} />
          <Panel theme={theme} title="How farmers pay you" icon={Landmark}>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>A farmer books places in your store; they are held for 24 hours.</li>
              <li>The farmer pays you directly — to your bank account or UPI ID on the left — and enters the payment number.</li>
              <li>Check the money in your bank or UPI app, then confirm the booking in “Bookings to confirm”.</li>
            </ol>
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-900/5">KashRoot never holds the money: it goes straight from the farmer to you.</p>
          </Panel>
        </>
      )}

      {section === 'requests' && others.length > 0 && (
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
          onEdit={() => openWizard(owned.find((l) => l.id === mapOf.id) ?? mapOf, 3)}
        />
      )}

      {rentOf && (
        <OlderRent
          listing={rentOf}
          mapped={chambers.some((c) => c.listing_id === rentOf.id)}
          onClose={() => setRentOf(null)}
          onSaved={async () => {
            setRentOf(null);
            await onChange();
          }}
        />
      )}
    </div>
  );
}

/**
 * The rent of a store set up before the owner wizard (one rate for every
 * box), and — when it has no chambers — how many boxes it holds. Stores set
 * up in the wizard have a rent for each chamber instead.
 */
function OlderRent({ listing: l, mapped, onClose, onSaved }: { listing: RentalListing; mapped: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [rent, setRentText] = useState(String(Number(l.rate)));
  const [boxes, setBoxes] = useState(String(l.capacity));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const booked = Math.max(0, l.capacity - l.available);
  const r = Number(rent.replace(/[,\s]/g, ''));
  const n = Number(boxes.replace(/[,\s]/g, ''));
  const rentProblem = !rent.trim() || !Number.isFinite(r) || r <= 0 ? 'Write the rent for one box for one month, in rupees, like 15.' : r > 100000 ? `₹${r.toLocaleString('en-IN')} for one box for one month is too much. Please check.` : null;
  const boxProblem = mapped
    ? null
    : !boxes.trim() || !Number.isInteger(n) || n < 1
      ? 'Write how many boxes your store holds, as a whole number, like 1000.'
      : n > 10_000_000
        ? 'That is more than 1 crore boxes. Please check the number.'
        : n < booked
          ? `${booked.toLocaleString('en-IN')} boxes are booked now, so your store holds at least ${booked.toLocaleString('en-IN')}.`
          : null;
  const save = async () => {
    setTried(true);
    if (rentProblem || boxProblem) return toast.error(rentProblem ?? boxProblem!);
    setBusy(true);
    try {
      await setRent(l.id, r, mapped ? undefined : { capacity: n, available: n - booked });
      toast.success('Rent saved');
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the rent.');
    } finally {
      setBusy(false);
    }
  };
  const problem = (m: string | null) => (tried && m ? <span role="alert" className="mt-1.5 block rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-900 ring-1 ring-rose-200">{m}</span> : null);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Rent · ${l.title}`}
      footer={
        <>
          <Btn theme={theme} variant="ghost" className="min-h-[44px]" onClick={onClose}>Cancel</Btn>
          <Btn theme={theme} className="min-h-[44px]" icon={CheckCircle2} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</Btn>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div>
          <Field label="Rent for one box for one month (₹)">
            <input className={`${INPUT} min-h-[48px] text-base`} inputMode="decimal" value={rent} onChange={(e) => setRentText(e.target.value)} />
          </Field>
          {problem(rentProblem)}
        </div>
        {!mapped && (
          <div>
            <Field label="How many boxes your store holds" hint={booked ? `${booked.toLocaleString('en-IN')} are booked now.` : undefined}>
              <input className={`${INPUT} min-h-[48px] text-base`} inputMode="numeric" value={boxes} onChange={(e) => setBoxes(e.target.value)} />
            </Field>
            {problem(boxProblem)}
          </div>
        )}
        <p className="text-sm text-slate-600">To set a rent for each chamber, with bins or crates, tap “Add chambers” and set up your store step by step.</p>
      </form>
    </Modal>
  );
}

/** The two sides of the Cold Storage portal: farmers who store apples, owners who run a cold store. */
function SideSwitch({ side, waiting, onChange }: { side: Side; waiting: number; onChange: (s: Side) => void }) {
  const option = (id: Side, title: string, text: string, Icon: typeof Apple, badge?: number) => {
    const on = side === id;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={() => !on && onChange(id)}
        className={`flex flex-1 cursor-pointer items-start gap-3 rounded-2xl p-4 text-left ring-2 transition ${on ? 'bg-violet-700 text-white shadow-lg ring-violet-700' : 'bg-white/80 text-slate-800 ring-slate-900/10 hover:ring-violet-300'}`}
      >
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${on ? 'bg-white/15' : 'bg-violet-50 text-violet-700'}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-base font-semibold">
            {title}
            {badge ? <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${on ? 'bg-white text-violet-800' : 'bg-amber-400 text-amber-950'}`}>{badge} waiting</span> : null}
          </span>
          <span className={`mt-0.5 block text-sm ${on ? 'text-violet-100' : 'text-slate-600'}`}>{text}</span>
        </span>
      </button>
    );
  };
  return (
    <div role="radiogroup" aria-label="I am" className="flex flex-col gap-3 sm:flex-row">
      {option('farmer', 'I store my apples', 'Farmers: find a cold store, choose your place on the plan or in 3D, see your bookings.', Apple)}
      {option('owner', 'I run a cold store', 'Owners: list your store, enter its chambers (plan & 3D), confirm bookings, get paid.', Warehouse, waiting)}
    </div>
  );
}
