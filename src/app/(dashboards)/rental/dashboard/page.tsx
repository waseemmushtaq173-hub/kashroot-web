'use client';

/**
 * Machinery rental — discover equipment, list your own, and run bookings from
 * request to return.
 *
 * Listings and bookings live in the browser (kr_rental_listings /
 * kr_rental_bookings) until a rentals API exists.
 */
import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, List, MapPin, PlusCircle, Search, ShieldCheck, Tractor, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel, inr } from '@/components/portal/kit';
import { localId, usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.rental;

interface Rental {
  id: string;
  title: string;
  category: string;
  owner: string;
  area: string;
  rate: number;
  unit: string;
  deposit: number;
  withOperator: boolean;
  mine?: boolean;
}

type BookingStatus = 'pending' | 'approved' | 'in-use' | 'returned';
interface Booking {
  id: string;
  rentalId: string;
  title: string;
  from: string;
  to: string;
  status: BookingStatus;
}

const CATEGORIES = ['Tractor', 'Power Weeder', 'Hydraulic Sprayer', 'Cold Storage Space', 'Harvest Crates'];
const AREAS = ['Upper valley', 'Lakeside', 'North orchard belt', 'Riverside'];

const SEED_RENTALS: Rental[] = [
  { id: 'R-1', title: '45 HP tractor with trolley', category: 'Tractor', owner: 'Zahoor A.', area: 'North orchard belt', rate: 800, unit: 'day', deposit: 3000, withOperator: true },
  { id: 'R-2', title: 'Cold storage space (100 boxes)', category: 'Cold Storage Space', owner: 'Valley Fresh Storage', area: 'Riverside', rate: 15, unit: 'box / month', deposit: 0, withOperator: false },
  { id: 'R-3', title: 'Heavy-duty power weeder', category: 'Power Weeder', owner: 'Farooq Agri', area: 'Upper valley', rate: 400, unit: 'day', deposit: 1500, withOperator: false },
  { id: 'R-4', title: 'Hydraulic orchard sprayer', category: 'Hydraulic Sprayer', owner: 'Gulzar B.', area: 'Lakeside', rate: 650, unit: 'day', deposit: 2500, withOperator: true },
];

const SEED_BOOKINGS: Booking[] = [
  { id: 'RNT-9283', rentalId: 'R-1', title: '45 HP tractor with trolley', from: '2026-10-10', to: '2026-10-12', status: 'in-use' },
];

const STATUS: Record<BookingStatus, { label: string; tone: 'amber' | 'blue' | 'violet' | 'green'; next?: BookingStatus; action?: string }> = {
  pending: { label: 'Pending approval', tone: 'amber', next: 'approved', action: 'Approve' },
  approved: { label: 'Approved', tone: 'violet', next: 'in-use', action: 'Mark handed over' },
  'in-use': { label: 'Handed over / in use', tone: 'blue', next: 'returned', action: 'Mark returned' },
  returned: { label: 'Returned & inspected', tone: 'green' },
};

const EMPTY_LISTING = { title: '', category: 'Tractor', rate: '', deposit: '', area: 'Upper valley', withOperator: false };

export default function RentalDashboardPage() {
  const [tab, setTab] = useState('discover');
  const [rentals, setRentals] = usePersistentState<Rental[]>('kr_rental_listings', SEED_RENTALS);
  const [bookings, setBookings] = usePersistentState<Booking[]>('kr_rental_bookings', SEED_BOOKINGS);
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('All');
  const [category, setCategory] = useState('All');
  const [requesting, setRequesting] = useState<Rental | null>(null);
  const [dates, setDates] = useState({ from: '', to: '' });
  const [draft, setDraft] = useState(EMPTY_LISTING);

  const booked = (id: string) => bookings.some((b) => b.rentalId === id && b.status !== 'returned');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rentals.filter(
      (r) =>
        (area === 'All' || r.area === area) &&
        (category === 'All' || r.category === category) &&
        (!q || `${r.title} ${r.category} ${r.owner}`.toLowerCase().includes(q)),
    );
  }, [rentals, query, area, category]);

  const sendRequest = () => {
    if (!requesting) return;
    if (!dates.from || !dates.to || dates.to < dates.from) return toast.error('Pick a start and end date (end on or after start).');
    setBookings((all) => [{ id: localId('RNT'), rentalId: requesting.id, title: requesting.title, from: dates.from, to: dates.to, status: 'pending' }, ...all]);
    toast.success(`Booking requested for ${requesting.title}`);
    setRequesting(null);
    setTab('bookings');
  };

  const listEquipment = () => {
    const rate = Number(draft.rate);
    const deposit = Number(draft.deposit || 0);
    if (!draft.title.trim() || !(rate > 0)) return toast.error('Add a title and a daily rate.');
    setRentals((all) => [
      { id: localId('R'), title: draft.title.trim(), category: draft.category, owner: 'You', area: draft.area, rate, unit: 'day', deposit, withOperator: draft.withOperator, mine: true },
      ...all,
    ]);
    setDraft(EMPTY_LISTING);
    toast.success('Equipment listed — renters can now find it');
  };

  return (
    <PortalShell
      title="Machinery & storage rental"
      description="Rent tractors, sprayers and cold-store space by the day — or earn from your own idle equipment."
      eyebrow="Rental marketplace"
      theme="rental"
      kpis={[
        { label: 'Listings', value: String(rentals.length), trend: `${rentals.filter((r) => !booked(r.id)).length} available now` },
        { label: 'Your bookings', value: String(bookings.length), trend: `${bookings.filter((b) => b.status === 'pending').length} pending` },
        { label: 'Your equipment', value: String(rentals.filter((r) => r.mine).length), trend: 'Listed by you' },
      ]}
      tabs={[
        { id: 'discover', label: 'Discover', icon: Search },
        { id: 'list', label: 'List equipment', icon: PlusCircle },
        { id: 'bookings', label: 'Bookings', icon: List, count: bookings.length },
      ]}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === 'discover' && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <label className="relative block">
              <span className="sr-only">Search rentals</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className={`${INPUT} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tractors, cold storage, sprayers…" />
            </label>
            <select aria-label="Area" className={INPUT} value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="All">All areas</option>
              {AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
            <select aria-label="Category" className={INPUT} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="All">All categories</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          {visible.length === 0 ? (
            <EmptyState theme={theme} icon={Tractor} title="Nothing matches" text="Try another area or category." action={<Btn theme={theme} variant="soft" onClick={() => { setQuery(''); setArea('All'); setCategory('All'); }}>Clear filters</Btn>} />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((r) => {
                const isBooked = booked(r.id);
                return (
                  <div key={r.id} className="flex flex-col rounded-2xl bg-white/80 p-5 ring-1 ring-slate-900/5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-violet-700">{r.category}</span>
                      {isBooked ? <Badge tone="amber">Booked</Badge> : <Badge tone="green">Available</Badge>}
                    </div>
                    <h3 className="mt-2 font-sans text-lg font-semibold text-slate-900">{r.title}</h3>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" aria-hidden /> {r.area}</p>
                    <p className="flex items-center gap-1.5 text-sm text-slate-600"><ShieldCheck className="h-4 w-4 text-violet-600" aria-hidden /> {r.owner} (verified)</p>
                    <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-900/5 pt-4">
                      <div>
                        <p className="text-lg font-bold text-slate-900">{inr.format(r.rate)} <span className="text-sm font-normal text-slate-500">/ {r.unit}</span></p>
                        {r.withOperator && <p className="text-xs font-medium text-violet-700">Operator included</p>}
                      </div>
                      {r.mine ? (
                        <Btn theme={theme} variant="danger" size="sm" icon={Trash2} onClick={() => { setRentals((all) => all.filter((x) => x.id !== r.id)); toast.success('Listing removed'); }}>
                          Remove
                        </Btn>
                      ) : (
                        <Btn theme={theme} size="sm" icon={CalendarDays} disabled={isBooked} onClick={() => { setRequesting(r); setDates({ from: '', to: '' }); }}>
                          Request
                        </Btn>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'list' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Panel theme={theme} title="List new equipment" icon={PlusCircle}>
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); listEquipment(); }}>
              <Field label="Category">
                <select className={INPUT} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Title">
                <input className={INPUT} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. 50 HP tractor" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Rate (₹ / day)">
                  <input type="number" min={1} className={INPUT} value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
                </Field>
                <Field label="Deposit (₹)">
                  <input type="number" min={0} className={INPUT} value={draft.deposit} onChange={(e) => setDraft({ ...draft, deposit: e.target.value })} />
                </Field>
              </div>
              <Field label="Area">
                <select className={INPUT} value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })}>
                  {AREAS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-violet-700 focus:ring-violet-500" checked={draft.withOperator} onChange={(e) => setDraft({ ...draft, withOperator: e.target.checked })} />
                Operator included
              </label>
              <Btn theme={theme} type="submit" icon={PlusCircle}>Publish listing</Btn>
            </form>
          </Panel>
          <Panel theme={theme} title="Your listed equipment" icon={Tractor}>
            {rentals.filter((r) => r.mine).length === 0 ? (
              <EmptyState theme={theme} icon={Tractor} title="Nothing listed yet" text="Idle equipment can earn while it waits for the season." />
            ) : (
              <ul className="divide-y divide-slate-900/5">
                {rentals.filter((r) => r.mine).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-semibold text-slate-900">{r.title}</p>
                      <p className="text-sm text-slate-500">{r.category} · {r.area} · {inr.format(r.rate)}/day</p>
                    </div>
                    <Btn theme={theme} variant="danger" size="sm" icon={Trash2} onClick={() => { setRentals((all) => all.filter((x) => x.id !== r.id)); toast.success('Listing removed'); }}>Remove</Btn>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === 'bookings' && (
        <Panel theme={theme} title="Bookings ledger" icon={List}>
          {bookings.length === 0 ? (
            <EmptyState theme={theme} icon={List} title="No bookings" text="Requests you send from Discover appear here." action={<Btn theme={theme} onClick={() => setTab('discover')}>Find equipment</Btn>} />
          ) : (
            <ul className="space-y-3">
              {bookings.map((b) => {
                const s = STATUS[b.status];
                return (
                  <li key={b.id} className="flex flex-col gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs text-slate-500">{b.id} · {b.from} → {b.to}</p>
                      <p className="font-semibold text-slate-900">{b.title}</p>
                      <div className="mt-1"><Badge tone={s.tone}>{s.label}</Badge></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {s.action && (
                        <Btn theme={theme} size="sm" icon={CheckCircle2} onClick={() => { setBookings((all) => all.map((x) => (x.id === b.id ? { ...x, status: s.next! } : x))); toast.success(`${b.id}: ${STATUS[s.next!].label}`); }}>
                          {s.action}
                        </Btn>
                      )}
                      {b.status === 'pending' && (
                        <Btn theme={theme} variant="danger" size="sm" onClick={() => { setBookings((all) => all.filter((x) => x.id !== b.id)); toast.success('Request withdrawn'); }}>
                          Withdraw
                        </Btn>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      <Modal
        open={requesting !== null}
        onClose={() => setRequesting(null)}
        title={requesting ? `Request ${requesting.title}` : 'Request'}
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setRequesting(null)}>Cancel</Btn>
            <Btn theme={theme} icon={CalendarDays} onClick={sendRequest}>Send request</Btn>
          </>
        }
      >
        {requesting && (
          <div className="grid gap-4">
            <p className="text-sm text-slate-600">
              {inr.format(requesting.rate)} / {requesting.unit}
              {requesting.deposit > 0 && <> · refundable deposit {inr.format(requesting.deposit)}, held in escrow</>}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="From">
                <input type="date" className={INPUT} value={dates.from} onChange={(e) => setDates({ ...dates, from: e.target.value })} />
              </Field>
              <Field label="To">
                <input type="date" className={INPUT} value={dates.to} onChange={(e) => setDates({ ...dates, to: e.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </PortalShell>
  );
}
