'use client';

/**
 * My business (20261115000000_business_consoles.sql): a cold store, dealer,
 * shop or helper team run by more than one person. The owner invites managers
 * and staff by email or phone; a manager invites staff only; staff see the
 * business but change nothing about its people or where it is paid. Bank and
 * UPI details: the owner only, after two-step sign-in, and every owner gets an
 * email when they change. The database checks all of it again — this page
 * only shows what each person may do. A business KashRoot suspended shows why.
 * Stores (20261116000000_business_listings.sql): someone who listed a cold store
 * or machine and owns the business puts it in; then the whole team sees its
 * bookings and confirms, declines or completes them, and farmers pay the
 * business's details. Changing the store itself stays with whoever listed it.
 * Shop and dealer products (20261118000000_business_orders.sql): the same for
 * their orders — the team accepts, ships and hands them to one of the
 * business's drivers, and buyers pay the business's details.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, CalendarCheck, Check, Landmark, Loader2, Mail, Package, Plus, ReceiptText, ShoppingBag, Snowflake, Trash2, Truck, UserPlus, X } from 'lucide-react';

import { InfoPage } from '@/components/layout/InfoPage';
import { OrderCard } from '@/components/market/OrderCard';
import { PORTAL_THEMES } from '@/components/portal/kit';
import { TwoStepVerify, twoStepState } from '@/components/security/TwoStep';
import type { MarketOrder } from '@/lib/db/market';
import { groupBaskets, type OrgDriver } from '@/lib/db/shop';
import { supabase } from '@/lib/supabase';

type Role = 'owner' | 'manager' | 'staff';
interface Org {
  id: string;
  name: string;
  kind: string;
  suspended_at: string | null;
  suspended_reason: string | null;
}
interface Member {
  user_id: string;
  role: Role;
  label: string;
  is_me: boolean;
}
interface Invite {
  id: string;
  org_name?: string;
  contact?: string;
  role: Role;
  expires_at: string;
}
interface Store {
  id: string;
  title: string;
  kind: string;
  district: string;
  active: boolean;
  org_id: string | null;
  owner_id: string;
}
interface Booking {
  id: string;
  listing_id: string;
  renter_name: string;
  renter_phone: string;
  units: number;
  duration: number;
  start_date: string;
  amount: number;
  payment_ref: string | null;
  status: string;
  handled_by: string | null;
  created_at: string;
}
interface Payout {
  account_name: string | null;
  upi_id: string | null;
  account_number: string | null;
  account_end: string | null;
  ifsc: string | null;
  bank_name: string | null;
  updated_at: string;
}

const KINDS: { value: string; label: string }[] = [
  { value: 'cold_store', label: 'Cold store' },
  { value: 'dealer', label: 'Dealer / trader' },
  { value: 'shop', label: 'Shop (seeds, sprays, tools)' },
  { value: 'helper', label: 'Helper team (picking, packing, transport)' },
];
const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;
const INPUT = 'min-h-11 w-full rounded-xl border-0 bg-white px-3 ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-600';
const BUTTON = 'inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60';
const GHOST = 'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60';
const THEME = PORTAL_THEMES.seller;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function BusinessPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [missing, setMissing] = useState(false);
  const [orgs, setOrgs] = useState<(Org & { role: Role })[]>([]);
  const [waiting, setWaiting] = useState<Invite[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSignedIn(Boolean(data.session));
    if (!data.session) return;
    const me = data.session.user.id;
    const [o, m, w] = await Promise.all([
      supabase.from('organisations').select('id, name, kind, suspended_at, suspended_reason').order('created_at'),
      supabase.from('org_members').select('org_id, role').eq('user_id', me),
      supabase.rpc('kr_org_my_invites'),
    ]);
    setMissing(Boolean(o.error));
    const roles = new Map(((m.data ?? []) as { org_id: string; role: Role }[]).map((r) => [r.org_id, r.role]));
    // Only businesses this person belongs to (the Super Admin's view is in Admin → Super Admin).
    const mine = ((o.data ?? []) as Org[]).filter((x) => roles.has(x.id)).map((x) => ({ ...x, role: roles.get(x.id) as Role }));
    setOrgs(mine);
    setWaiting((w.data ?? []) as Invite[]);
    setOpenId((cur) => cur ?? mine[0]?.id ?? null);
  }, []);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  const act = async (key: string, work: () => PromiseLike<{ error: { message: string } | null }>, done: string) => {
    setBusy(key);
    setError(null);
    setNote(null);
    const { error: err } = await work();
    setBusy(null);
    if (err) return setError(err.message);
    setNote(done);
    await load();
  };

  const open = orgs.find((o) => o.id === openId) ?? null;

  return (
    <InfoPage title="My business" intro="Run your cold store, shop or team with the people who work with you. Each business sees only its own people and details.">
      {signedIn === null ? (
        <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking…</p>
      ) : !signedIn ? (
        <p>
          Sign in to your portal first, then come back here. <Link className="font-semibold text-emerald-800 underline" href="/login">Sign in</Link>
        </p>
      ) : missing ? (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-950 ring-1 ring-amber-200">Businesses are not switched on yet. Please try again later.</p>
      ) : (
        <>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-900 ring-1 ring-rose-200">{error}</p>}
          {note && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-950 ring-1 ring-emerald-200">{note}</p>}

          {waiting.length > 0 && (
            <section data-business-invites-waiting>
              <h2 className="flex items-center gap-2"><Mail className="h-5 w-5 text-emerald-700" aria-hidden /> Invitations for you</h2>
              <ul className="!list-none space-y-2 !pl-0">
                {waiting.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                    <span><strong>{i.org_name}</strong> invites you as <strong>{i.role}</strong> · until {day(i.expires_at)}</span>
                    <button type="button" className={BUTTON} disabled={busy !== null} onClick={() => void act(i.id, () => supabase.rpc('kr_org_accept', { p_invite: i.id }), `You joined ${i.org_name}.`)}>
                      {busy === i.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Join
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {orgs.length > 1 && (
            <section>
              <label className="block font-semibold" htmlFor="kr-business-pick">Business</label>
              <select id="kr-business-pick" className={INPUT} value={openId ?? ''} onChange={(e) => setOpenId(e.target.value)}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} — you are {o.role}</option>)}
              </select>
            </section>
          )}

          {open && <BusinessView key={open.id} org={open} busy={busy} act={act} />}

          <NewBusiness first={orgs.length === 0} busy={busy} act={act} />
        </>
      )}
    </InfoPage>
  );
}

type Act = (key: string, work: () => PromiseLike<{ error: { message: string } | null }>, done: string) => Promise<void>;

function NewBusiness({ first, busy, act }: { first: boolean; busy: string | null; act: Act }) {
  const [shown, setShown] = useState(first);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('cold_store');
  if (!shown) {
    return (
      <button type="button" className={GHOST} onClick={() => setShown(true)}>
        <Plus className="h-4 w-4" aria-hidden /> Add another business
      </button>
    );
  }
  return (
    <section data-business-new>
      <h2 className="flex items-center gap-2"><Building2 className="h-5 w-5 text-emerald-700" aria-hidden /> {first ? 'Set up your business' : 'Add a business'}</h2>
      <p className="text-sm text-slate-600">You become its owner. Then invite the people who work with you.</p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act('new', () => supabase.rpc('kr_org_create', { p_name: name.trim(), p_kind: kind }), `${name.trim()} is set up. You are its owner.`).then(() => setName(''));
        }}
      >
        <label className="block">
          <span className="font-semibold">Business name</span>
          <input className={INPUT} required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lolab Cold Store" />
        </label>
        <label className="block">
          <span className="font-semibold">What it is</span>
          <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <div>
          <button type="submit" className={BUTTON} disabled={busy !== null || name.trim().length < 2}>
            {busy === 'new' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Set up
          </button>
        </div>
      </form>
    </section>
  );
}

function BusinessView({ org, busy, act }: { org: Org & { role: Role }; busy: string | null; act: Act }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [contact, setContact] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('staff');
  const lead = org.role === 'owner' || org.role === 'manager';

  const load = useCallback(async () => {
    const [m, i, p] = await Promise.all([
      supabase.rpc('kr_org_members', { p_org: org.id }),
      lead
        ? supabase.from('org_invites').select('id, contact, role, expires_at').eq('org_id', org.id).is('accepted_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase.rpc('kr_org_payout', { p_org: org.id }),
    ]);
    setMembers((m.data ?? []) as Member[]);
    setInvites((i.data ?? []) as Invite[]);
    setPayout((p.data as Payout | null) ?? null);
  }, [org.id, lead]);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  const run: Act = async (key, work, done) => {
    await act(key, work, done);
    await load();
  };
  const suspended = Boolean(org.suspended_at);

  return (
    <>
      <section data-business-view>
        <h2 className="flex items-center gap-2"><Building2 className="h-5 w-5 text-emerald-700" aria-hidden /> {org.name}</h2>
        <p className="text-sm text-slate-600">{kindLabel(org.kind)} · you are <strong>{org.role}</strong></p>
        {suspended && (
          <p role="alert" className="mt-2 rounded-xl bg-rose-50 p-3 text-rose-900 ring-1 ring-rose-200">
            KashRoot has paused this business: {org.suspended_reason ?? 'see Help & support'}. Nothing in it can change until it is re-enabled. <Link className="font-semibold underline" href="/support">Ask Help &amp; support</Link>
          </p>
        )}
      </section>

      <section data-business-members>
        <h3 className="font-semibold">People</h3>
        <ul className="!list-none space-y-2 !pl-0">
          {members.map((m) => {
            const canChange = !suspended && !m.is_me && (org.role === 'owner' || (org.role === 'manager' && m.role === 'staff'));
            return (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <span className="break-all">{m.label}{m.is_me && ' (you)'} · <strong>{m.role}</strong></span>
                {canChange && (
                  <span className="flex flex-wrap gap-2">
                    {org.role === 'owner' && (
                      <select
                        aria-label={`Role of ${m.label}`}
                        className="min-h-11 rounded-lg px-2 text-sm ring-1 ring-slate-300"
                        value={m.role}
                        disabled={busy !== null}
                        onChange={(e) => void run(m.user_id, () => supabase.rpc('kr_org_set_member', { p_org: org.id, p_user: m.user_id, p_role: e.target.value }), 'Role changed.')}
                      >
                        <option value="owner">owner</option>
                        <option value="manager">manager</option>
                        <option value="staff">staff</option>
                      </select>
                    )}
                    <button
                      type="button"
                      className={`${GHOST} text-rose-800`}
                      disabled={busy !== null}
                      onClick={() => window.confirm(`Remove ${m.label} from ${org.name}?`) && void run(m.user_id, () => supabase.rpc('kr_org_set_member', { p_org: org.id, p_user: m.user_id, p_role: null }), 'Removed.')}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden /> Remove
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {lead && !suspended && (
        <section data-business-invite>
          <h3 className="flex items-center gap-2 font-semibold"><UserPlus className="h-5 w-5 text-emerald-700" aria-hidden /> Give access to this business</h3>
          <p className="text-sm text-slate-600">
            This gives access to <strong>{org.name}</strong>&apos;s console only — never to KashRoot Admin. They sign in to KashRoot with this email or phone and open <strong>My business</strong> to join. The invitation lasts 7 days.
            {org.role === 'manager' && ' As a manager you can invite staff.'}
          </p>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void run('invite', () => supabase.rpc('kr_org_invite', { p_org: org.id, p_contact: contact.trim(), p_role: inviteRole }), `Access to ${org.name} offered to ${contact.trim()}. Tell them to open My business after signing in.`).then(() => setContact(''));
            }}
          >
            <label className="block">
              <span className="sr-only">Email or phone</span>
              <input className={INPUT} required value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email or 10-digit phone" autoComplete="off" />
            </label>
            <label className="block">
              <span className="sr-only">Role</span>
              <select className={INPUT} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                <option value="staff">staff</option>
                {org.role === 'owner' && <option value="manager">manager</option>}
              </select>
            </label>
            <button type="submit" className={BUTTON} disabled={busy !== null || contact.trim().length < 5}>
              {busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />} Give access
            </button>
          </form>
          {invites.length > 0 && (
            <ul className="mt-2 !list-none space-y-1 !pl-0 text-sm text-slate-700">
              {invites.map((i) => <li key={i.id}>Waiting: {i.contact} as {i.role} · until {day(i.expires_at)}</li>)}
            </ul>
          )}
        </section>
      )}

      <StoresSection org={org} members={members} suspended={suspended} busy={busy} act={act} />

      <ShopSection org={org} members={members} suspended={suspended} busy={busy} act={act} />

      <PayoutSection org={org} payout={payout} suspended={suspended} busy={busy} run={run} />
    </>
  );
}

function PayoutSection({ org, payout, suspended, busy, run }: { org: Org & { role: Role }; payout: Payout | null; suspended: boolean; busy: string | null; run: Act }) {
  const [editing, setEditing] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const [f, setF] = useState({ name: '', upi: '', account: '', ifsc: '', bank: '' });
  const owner = org.role === 'owner';

  const startEdit = async () => {
    // The database refuses without two-step sign-in; ask for the code first rather than after typing.
    const state = await twoStepState();
    setF({ name: payout?.account_name ?? org.name, upi: payout?.upi_id ?? '', account: payout?.account_number ?? '', ifsc: payout?.ifsc ?? '', bank: payout?.bank_name ?? '' });
    setNeedCode(!state.passed);
    setEditing(true);
  };

  return (
    <section data-business-payout>
      <h3 className="flex items-center gap-2 font-semibold"><Landmark className="h-5 w-5 text-emerald-700" aria-hidden /> Where the business is paid</h3>
      <p className="text-sm text-slate-600">KashRoot never holds money: buyers pay the business directly. Only the owner can change these details, after two-step sign-in, and every owner gets an email when they change.</p>
      {payout ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">Name</dt><dd>{payout.account_name ?? '—'}</dd>
          {payout.upi_id && (<><dt className="text-slate-500">UPI</dt><dd className="break-all">{payout.upi_id}</dd></>)}
          {payout.account_end && (<><dt className="text-slate-500">Account</dt><dd>{payout.account_number ?? `ending ${payout.account_end}`}</dd></>)}
          {payout.ifsc && (<><dt className="text-slate-500">IFSC</dt><dd>{payout.ifsc}</dd></>)}
          {payout.bank_name && (<><dt className="text-slate-500">Bank</dt><dd>{payout.bank_name}</dd></>)}
          <dt className="text-slate-500">Changed</dt><dd>{day(payout.updated_at)}</dd>
        </dl>
      ) : (
        <p className="text-sm">Not set yet.</p>
      )}

      {owner && !suspended && !editing && (
        <button type="button" className={`${GHOST} mt-2`} onClick={() => void startEdit()}>{payout ? 'Change bank / UPI details' : 'Add bank / UPI details'}</button>
      )}
      {!owner && <p className="mt-1 text-sm text-slate-600">Only the owner can change these.</p>}

      {editing && needCode && (
        <div className="mt-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-sm">First type the code from your authenticator app. No app yet? <Link className="font-semibold text-emerald-800 underline" href="/account/two-step">Turn on two-step sign-in</Link>.</p>
          <TwoStepVerify onDone={() => setNeedCode(false)} />
        </div>
      )}
      {editing && !needCode && (
        <form
          className="mt-2 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              'payout',
              () => supabase.rpc('kr_org_set_payout', { p_org: org.id, p_name: f.name.trim(), p_upi: f.upi.trim() || null, p_account: f.account.replace(/\s/g, '') || null, p_ifsc: f.ifsc.trim().toUpperCase() || null, p_bank: f.bank.trim() || null }),
              'Saved. Every owner gets an email about this change.',
            ).then(() => setEditing(false));
          }}
        >
          <label className="block sm:col-span-2"><span className="font-semibold">Account holder name</span><input className={INPUT} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="font-semibold">UPI ID</span><input className={INPUT} value={f.upi} onChange={(e) => setF({ ...f, upi: e.target.value })} placeholder="name@bank" autoComplete="off" /></label>
          <label className="block"><span className="font-semibold">Account number</span><input className={INPUT} inputMode="numeric" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })} autoComplete="off" /></label>
          <label className="block"><span className="font-semibold">IFSC</span><input className={INPUT} value={f.ifsc} onChange={(e) => setF({ ...f, ifsc: e.target.value })} placeholder="SBIN0001234" autoComplete="off" /></label>
          <label className="block sm:col-span-2"><span className="font-semibold">Bank name</span><input className={INPUT} value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} /></label>
          <p className="text-sm text-slate-600 sm:col-span-2">A UPI ID, or an account number with its IFSC (or both).</p>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className={BUTTON} disabled={busy !== null}>{busy === 'payout' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Save</button>
            <button type="button" className={GHOST} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

const STATUS: Record<string, string> = {
  requested: 'waiting for payment',
  paid: 'paid — check and confirm',
  confirmed: 'confirmed',
  rejected: 'declined',
  cancelled: 'cancelled by the farmer',
  completed: 'completed',
};

function StoresSection({ org, members, suspended, busy, act }: { org: Org & { role: Role }; members: Member[]; suspended: boolean; busy: string | null; act: Act }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [mineOutside, setMineOutside] = useState<Store[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [me, setMe] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id ?? null;
    setMe(uid);
    const cols = 'id, title, kind, district, active, org_id, owner_id';
    const [inOrg, outside] = await Promise.all([
      supabase.from('rental_listings').select(cols).eq('org_id', org.id).order('created_at'),
      // The owner's own stores not in any business yet, to put in this one.
      org.role === 'owner' && uid ? supabase.from('rental_listings').select(cols).eq('owner_id', uid).is('org_id', null).order('created_at') : Promise.resolve({ data: [] }),
    ]);
    const list = (inOrg.data ?? []) as Store[];
    setStores(list);
    setMineOutside((outside.data ?? []) as Store[]);
    if (list.length) {
      const b = await supabase
        .from('rental_bookings')
        .select('id, listing_id, renter_name, renter_phone, units, duration, start_date, amount, payment_ref, status, handled_by, created_at')
        .in('listing_id', list.map((x) => x.id))
        .order('created_at', { ascending: false })
        .limit(60);
      setBookings((b.data ?? []) as Booking[]);
    } else setBookings([]);
  }, [org.id, org.role]);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  const run: Act = async (key, work, done) => {
    await act(key, work, done);
    await load();
  };
  const who = (id: string | null) => (id ? (members.find((m) => m.user_id === id)?.label ?? 'someone no longer in the business') : null);
  const title = (id: string) => stores.find((x) => x.id === id)?.title ?? '';
  const decline = (b: Booking) => {
    const note = window.prompt('Decline — a short reason for the farmer (optional):');
    if (note !== null) void run(b.id, () => supabase.rpc('kr_booking_action', { p_booking: b.id, p_action: 'reject', p_note: note.trim() || null }), 'Declined.');
  };

  return (
    <>
      <section data-business-stores>
        <h3 className="flex items-center gap-2 font-semibold"><Snowflake className="h-5 w-5 text-emerald-700" aria-hidden /> Cold stores and machines</h3>
        {stores.length === 0 && <p className="text-sm">None in this business yet.{org.role === 'owner' ? ' Put in a store you listed (below).' : ' The owner puts them in.'}</p>}
        <ul className="!list-none space-y-2 !pl-0">
          {stores.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <span>{x.title} · {x.district}{!x.active && ' · hidden from farmers'}</span>
              {x.owner_id === me && !suspended && (
                <button
                  type="button"
                  className={GHOST}
                  disabled={busy !== null}
                  onClick={() => window.confirm(`Take ${x.title} out of ${org.name}? Your team will stop seeing its bookings, and farmers will pay your own details.`) && void run(x.id, () => supabase.rpc('kr_org_attach_listing', { p_listing: x.id, p_org: null }), 'Taken out of the business.')}
                >
                  Take out
                </button>
              )}
            </li>
          ))}
        </ul>
        {mineOutside.length > 0 && !suspended && (
          <>
            <p className="mt-2 text-sm text-slate-600">Your stores and machines not in a business. Put one in: your team sees and handles its bookings, and farmers pay this business&apos;s bank / UPI details (when set). Only you change the store itself.</p>
            <ul className="!list-none space-y-2 !pl-0">
              {mineOutside.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <span>{x.title} · {x.district}</span>
                  <button type="button" className={BUTTON} disabled={busy !== null} onClick={() => void run(x.id, () => supabase.rpc('kr_org_attach_listing', { p_listing: x.id, p_org: org.id }), `${x.title} is now in ${org.name}.`)}>
                    <Plus className="h-4 w-4" aria-hidden /> Put in {org.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {stores.length > 0 && (
        <section data-business-bookings>
          <h3 className="flex items-center gap-2 font-semibold"><CalendarCheck className="h-5 w-5 text-emerald-700" aria-hidden /> Bookings</h3>
          <p className="text-sm text-slate-600">Confirm only after the money has reached the business&apos;s account — check the reference number in your bank or UPI app. KashRoot never holds money.</p>
          {bookings.length === 0 && <p className="text-sm">No bookings yet.</p>}
          <ul className="!list-none space-y-2 !pl-0">
            {bookings.map((b) => (
              <li key={b.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
                <p className="font-semibold">{title(b.listing_id)} · {b.renter_name} · <a className="underline" href={`tel:${b.renter_phone}`}>{b.renter_phone}</a></p>
                <p className="text-slate-700">
                  {b.units} · {b.duration} {b.duration === 1 ? 'month' : 'months'} from {day(b.start_date)} · ₹{Number(b.amount).toLocaleString('en-IN')} · <strong>{STATUS[b.status] ?? b.status}</strong>
                  {b.payment_ref && <> · reference {b.payment_ref}</>}
                  {who(b.handled_by) && <> · by {who(b.handled_by)}</>}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!suspended && (b.status === 'requested' || b.status === 'paid') && (
                    <>
                      <button
                        type="button"
                        className={BUTTON}
                        disabled={busy !== null}
                        onClick={() => window.confirm(b.status === 'paid' ? `Confirm? First check reference ${b.payment_ref} reached the account.` : 'Confirm without a payment reference yet?') && void run(b.id, () => supabase.rpc('kr_booking_action', { p_booking: b.id, p_action: 'confirm' }), 'Confirmed. The farmer sees it.')}
                      >
                        <Check className="h-4 w-4" aria-hidden /> Confirm
                      </button>
                      <button type="button" className={`${GHOST} text-rose-800`} disabled={busy !== null} onClick={() => decline(b)}>
                        <X className="h-4 w-4" aria-hidden /> Decline
                      </button>
                    </>
                  )}
                  {!suspended && b.status === 'confirmed' && (
                    <button
                      type="button"
                      className={GHOST}
                      disabled={busy !== null}
                      onClick={() => window.confirm('Mark completed? The space becomes free again.') && void run(b.id, () => supabase.rpc('kr_booking_action', { p_booking: b.id, p_action: 'complete' }), 'Completed.')}
                    >
                      <Check className="h-4 w-4" aria-hidden /> Completed
                    </button>
                  )}
                  {(b.status === 'paid' || b.status === 'confirmed' || b.status === 'completed') && (
                    <Link className={GHOST} href={`/rental/receipt/${b.id}`}><ReceiptText className="h-4 w-4" aria-hidden /> Receipt</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

interface Product {
  id: string;
  product: string;
  variety: string | null;
  district: string;
  active: boolean;
  org_id: string | null;
  seller_id: string;
}

/**
 * Shop and dealer products in the business (20261118000000_business_orders.sql): the seller who owns
 * the business puts theirs in; then everyone in it sees their orders and does the seller's steps,
 * and ships with one of the business's drivers (owner and managers keep that list).
 */
function ShopSection({ org, members, suspended, busy, act }: { org: Org & { role: Role }; members: Member[]; suspended: boolean; busy: string | null; act: Act }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [mineOutside, setMineOutside] = useState<Product[]>([]);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [drivers, setDrivers] = useState<OrgDriver[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [driver, setDriver] = useState({ name: '', phone: '', vehicle: '' });
  const lead = org.role === 'owner' || org.role === 'manager';

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id ?? null;
    setMe(uid);
    const cols = 'id, product, variety, district, active, org_id, seller_id';
    const [inOrg, outside, o, d] = await Promise.all([
      supabase.from('market_listings').select(cols).eq('org_id', org.id).order('created_at'),
      // The owner's own products not in any business yet, to put in this one.
      org.role === 'owner' && uid ? supabase.from('market_listings').select(cols).eq('seller_id', uid).is('org_id', null).order('created_at') : Promise.resolve({ data: [] }),
      supabase.from('market_orders').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('org_drivers').select('id, name, phone, vehicle').eq('org_id', org.id).order('name'),
    ]);
    setProducts((inOrg.data ?? []) as Product[]);
    setMineOutside((outside.data ?? []) as Product[]);
    setOrders((o.data ?? []) as MarketOrder[]);
    setDrivers((d.data ?? []) as OrgDriver[]);
  }, [org.id, org.role]);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  const run: Act = async (key, work, done) => {
    await act(key, work, done);
    await load();
  };
  const who = (id: string | null) => (id ? (members.find((m) => m.user_id === id)?.label ?? 'someone no longer in the business') : null);
  const name = (p: Product) => `${p.product}${p.variety ? ` · ${p.variety}` : ''}`;
  const baskets = groupBaskets(orders);
  if (!products.length && !mineOutside.length && !orders.length && !drivers.length) return null;

  return (
    <>
      <section data-business-products>
        <h3 className="flex items-center gap-2 font-semibold"><Package className="h-5 w-5 text-emerald-700" aria-hidden /> Shop and dealer products</h3>
        {products.length === 0 && <p className="text-sm">None in this business yet.{org.role === 'owner' ? ' Put in a product you sell (below).' : ' The owner puts them in.'}</p>}
        <ul className="!list-none space-y-2 !pl-0">
          {products.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <span>{name(x)} · {x.district}{!x.active && ' · hidden from buyers'}</span>
              {x.seller_id === me && !suspended && (
                <button
                  type="button"
                  className={GHOST}
                  disabled={busy !== null}
                  onClick={() => window.confirm(`Take ${name(x)} out of ${org.name}? Your team will stop seeing its new orders, and buyers will pay your own details.`) && void run(x.id, () => supabase.rpc('kr_org_attach_product', { p_listing: x.id, p_org: null }), 'Taken out of the business.')}
                >
                  Take out
                </button>
              )}
            </li>
          ))}
        </ul>
        {mineOutside.length > 0 && !suspended && (
          <>
            <p className="mt-2 text-sm text-slate-600">Your products not in a business. Put one in: your team sees and handles its orders, and buyers pay this business&apos;s bank / UPI details (when set). Only you change the product itself.</p>
            <ul className="!list-none space-y-2 !pl-0">
              {mineOutside.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <span>{name(x)} · {x.district}</span>
                  <button type="button" className={BUTTON} disabled={busy !== null} onClick={() => void run(x.id, () => supabase.rpc('kr_org_attach_product', { p_listing: x.id, p_org: org.id }), `${name(x)} is now in ${org.name}.`)}>
                    <Plus className="h-4 w-4" aria-hidden /> Put in {org.name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {(products.length > 0 || orders.length > 0) && (
        <section data-business-orders>
          <h3 className="flex items-center gap-2 font-semibold"><ShoppingBag className="h-5 w-5 text-emerald-700" aria-hidden /> Orders</h3>
          <p className="text-sm text-slate-600">Press “Money received” only after it has reached the business&apos;s account — check the reference in your bank or UPI app. KashRoot never holds money.</p>
          {suspended && <p className="text-sm font-semibold text-rose-800">While the business is paused, its team cannot change orders.</p>}
          {baskets.length === 0 && <p className="text-sm">No orders yet.</p>}
          <ul className="!list-none space-y-2 !pl-0">
            {baskets.map((lines) => (
              <li key={lines[0].basket ?? lines[0].id} className="!list-none">
                <ul className="!list-none !pl-0">
                  <OrderCard order={lines[0]} lines={lines} as="seller" theme={THEME} drivers={drivers} onChange={() => void load()} />
                </ul>
                {who(lines[0].handled_by ?? null) && <p className="px-4 pt-1 text-xs text-slate-500">Last step by {who(lines[0].handled_by ?? null)}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section data-business-drivers>
        <h3 className="flex items-center gap-2 font-semibold"><Truck className="h-5 w-5 text-emerald-700" aria-hidden /> Drivers</h3>
        <p className="text-sm text-slate-600">Anyone in the business ships an order with one of these drivers: the buyer sees their name and can call them, and the driver gets a link that shows the buyer where the vehicle is.{lead ? '' : ' The owner or a manager keeps this list.'}</p>
        {drivers.length === 0 && <p className="text-sm">No drivers yet.</p>}
        <ul className="!list-none space-y-2 !pl-0">
          {drivers.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
              <span>{d.name} · <a className="underline" href={`tel:${d.phone}`}>{d.phone}</a>{d.vehicle && ` · ${d.vehicle}`}</span>
              {lead && !suspended && (
                <button type="button" className={`${GHOST} text-rose-800`} disabled={busy !== null} aria-label={`Remove ${d.name}`} onClick={() => window.confirm(`Remove ${d.name} from the drivers?`) && void run(d.id, () => supabase.rpc('kr_org_driver_remove', { p_driver: d.id }), 'Removed.')}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {lead && !suspended && (
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              void run('driver', () => supabase.rpc('kr_org_driver_save', { p_org: org.id, p_name: driver.name.trim(), p_phone: driver.phone.trim(), p_vehicle: driver.vehicle.trim() || null }), `${driver.name.trim()} added.`).then(() => setDriver({ name: '', phone: '', vehicle: '' }));
            }}
          >
            <label className="text-sm">
              <span className="font-semibold">Driver&apos;s name</span>
              <input className={INPUT} value={driver.name} onChange={(e) => setDriver({ ...driver, name: e.target.value })} required maxLength={80} autoComplete="off" />
            </label>
            <label className="text-sm">
              <span className="font-semibold">Mobile</span>
              <input className={INPUT} type="tel" inputMode="numeric" value={driver.phone} onChange={(e) => setDriver({ ...driver, phone: e.target.value })} required placeholder="9876543210" autoComplete="off" />
            </label>
            <label className="text-sm">
              <span className="font-semibold">Vehicle (optional)</span>
              <input className={`${INPUT} uppercase`} value={driver.vehicle} onChange={(e) => setDriver({ ...driver, vehicle: e.target.value })} maxLength={40} placeholder="JK01 AB 1234" autoComplete="off" />
            </label>
            <button type="submit" className={`${BUTTON} self-end`} disabled={busy !== null}>
              <Plus className="h-4 w-4" aria-hidden /> Add driver
            </button>
          </form>
        )}
      </section>
    </>
  );
}
