'use client';

/**
 * The Live GPS Tracking portal's menu, and its Verification screen.
 *
 * The portal used to be one long page behind three buttons. It is now a menu — one screen for each
 * job (the live map, signing in as a driver, vehicles, pickup jobs, starting a trip, live GPS, GPS
 * devices) — with a Verification screen that says plainly what KashRoot has and has not checked
 * for the signed-in driver and each vehicle.
 */
import { useState, type ElementType } from 'react';
import { BadgeCheck, CircleAlert, MapPinned, Menu, PackageCheck, Radio, Route, Satellite, ShieldCheck, Truck, UserRound } from 'lucide-react';

import { SidebarDrawer } from '@/components/layout/portal/ShellSidebar';

export type TrackingSection = 'MAP' | 'SIGN_IN' | 'VEHICLES' | 'PICKUPS' | 'TRIP' | 'GPS' | 'DEVICES' | 'VERIFY';

interface MenuItem {
  id: TrackingSection;
  label: string;
  icon: ElementType;
  group: string;
}

const ITEMS: MenuItem[] = [
  { id: 'MAP', label: 'Live shipment map', icon: MapPinned, group: 'Track a shipment' },
  { id: 'SIGN_IN', label: 'Driver sign-in', icon: UserRound, group: 'Drivers and vehicle owners' },
  { id: 'VEHICLES', label: 'My vehicles', icon: Truck, group: 'Drivers and vehicle owners' },
  { id: 'PICKUPS', label: 'Orchard pickup jobs', icon: PackageCheck, group: 'Drivers and vehicle owners' },
  { id: 'TRIP', label: 'Start a trip', icon: Route, group: 'Drivers and vehicle owners' },
  { id: 'GPS', label: 'Live GPS', icon: Satellite, group: 'Drivers and vehicle owners' },
  { id: 'DEVICES', label: 'GPS devices (AIS-140)', icon: Radio, group: 'Devices and checks' },
  { id: 'VERIFY', label: 'Verification', icon: ShieldCheck, group: 'Devices and checks' },
];

/**
 * One soft colour for each section, going round the spectrum (red, orange, yellow, green, teal, blue, violet, pink): a rainbow menu
 * on a light page, not one deep colour. Pale chips and tints, never a dark block, so nothing here shouts.
 */
const HUES = [
  { chip: 'bg-rose-100 text-rose-700', on: 'bg-rose-50 ring-rose-200' },
  { chip: 'bg-orange-100 text-orange-700', on: 'bg-orange-50 ring-orange-200' },
  { chip: 'bg-amber-100 text-amber-700', on: 'bg-amber-50 ring-amber-200' },
  { chip: 'bg-emerald-100 text-emerald-700', on: 'bg-emerald-50 ring-emerald-200' },
  { chip: 'bg-teal-100 text-teal-700', on: 'bg-teal-50 ring-teal-200' },
  { chip: 'bg-sky-100 text-sky-700', on: 'bg-sky-50 ring-sky-200' },
  { chip: 'bg-violet-100 text-violet-700', on: 'bg-violet-50 ring-violet-200' },
  { chip: 'bg-fuchsia-100 text-fuchsia-700', on: 'bg-fuchsia-50 ring-fuchsia-200' },
];

/** The thin rainbow line the site draws under its banners. */
const RAINBOW = 'h-1 w-full bg-[linear-gradient(90deg,#fb7185,#fb923c,#fbbf24,#34d399,#2dd4bf,#38bdf8,#a78bfa,#e879f9)]';

/** The sections, grouped: the same list in the phone's side panel and down the side of a large screen. */
function MenuList({ active, onPick, signedInAs, vehicleCount }: { active: TrackingSection; onPick: (id: TrackingSection) => void; signedInAs: string | null; vehicleCount: number }) {
  return (
    <ul className="space-y-0.5">
      {ITEMS.map(({ id, label, icon: Icon, group }, i) => {
        const on = active === id;
        const hue = HUES[i % HUES.length];
        const note = id === 'SIGN_IN' && signedInAs ? signedInAs : id === 'VEHICLES' && vehicleCount > 0 ? String(vehicleCount) : null;
        const first = i === 0 || ITEMS[i - 1].group !== group;
        return (
          <li key={id} className={first && i > 0 ? 'pt-3' : undefined}>
            {first && <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{group}</p>}
            <button
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => onPick(id)}
              className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 text-left text-[15px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-500 ${
                on ? `${hue.on} text-slate-900 ring-1` : 'text-slate-700 hover:bg-slate-900/[0.04]'
              }`}
            >
              <span data-hue={i} className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${hue.chip}`}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">{label}</span>
              {note && <span className="rounded-full bg-slate-900/[0.07] px-1.5 text-[11px] font-bold text-slate-700">{note}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function TrackingMenu({
  active,
  onSelect,
  signedInAs,
  vehicleCount,
}: {
  active: TrackingSection;
  onSelect: (id: TrackingSection) => void;
  /** The signed-in driver's first name, if any. */
  signedInAs: string | null;
  vehicleCount: number;
}) {
  // A phone: a small Menu button that opens a slim, light panel on the left (the page stays visible beside it).
  // A large screen: the same list, always open down the side.
  const [open, setOpen] = useState(false);
  const here = ITEMS.find((x) => x.id === active) ?? ITEMS[0];
  const hereHue = HUES[ITEMS.indexOf(here) % HUES.length];
  const HereIcon = here.icon;
  return (
    // data-kr-plain: the site's big tactile button style is left off, so this stays a small, quiet menu.
    <nav aria-label="Tracking menu" data-kr-plain className="min-w-0 lg:sticky lg:top-4 lg:self-start">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-12 max-w-full cursor-pointer items-center gap-2.5 rounded-xl bg-white/90 py-1.5 pl-3 pr-4 text-left text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-900/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 lg:hidden"
      >
        <Menu className="h-5 w-5 shrink-0 text-slate-600" aria-hidden />
        <span className="shrink-0">Menu</span>
        <span aria-hidden className="text-slate-300">·</span>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${hereHue.chip}`}>
          <HereIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 truncate font-bold">{here.label}</span>
      </button>
      {open && (
        <SidebarDrawer narrow light onClose={() => setOpen(false)} label="Tracking menu">
          <div className="min-h-full flex-1 bg-[linear-gradient(180deg,#fff7f5_0%,#f4faff_55%,#f8f5ff_100%)]">
            <div className={RAINBOW} aria-hidden />
            <div className="px-3 pb-6 pt-4">
              <p className="px-2 pb-4 pr-16 text-lg font-bold text-slate-800">Tracking</p>
              <MenuList
                active={active}
                signedInAs={signedInAs}
                vehicleCount={vehicleCount}
                onPick={(id) => {
                  onSelect(id);
                  setOpen(false);
                }}
              />
            </div>
          </div>
        </SidebarDrawer>
      )}
      <div className="hidden overflow-hidden rounded-2xl bg-[linear-gradient(180deg,#fff7f5_0%,#f4faff_55%,#f8f5ff_100%)] shadow-sm ring-1 ring-slate-900/10 lg:block">
        <div className={RAINBOW} aria-hidden />
        <div className="p-3">
          <MenuList active={active} onPick={onSelect} signedInAs={signedInAs} vehicleCount={vehicleCount} />
        </div>
      </div>
    </nav>
  );
}

// ───────────────────────────── Verification ─────────────────────────────

interface DriverLike {
  full_name: string;
  phone: string;
  license_number: string;
  license_category: string;
  home_district: string;
  home_state: string;
  account_status: string;
}
interface VehicleLike {
  id: string;
  registration_number: string;
  vehicle_category: string;
  make_and_model: string;
  owner_name: string;
  verification_status: string;
}

const VEHICLE_STATUS: Record<string, { label: string; tone: string; says: string }> = {
  SELF_DECLARED: { label: 'Declared by the owner', tone: 'bg-amber-100 text-amber-950 ring-amber-300', says: 'The details were typed in by the owner. KashRoot has not checked a document yet.' },
  DOCUMENTS_UPLOADED: { label: 'Documents received', tone: 'bg-sky-100 text-sky-950 ring-sky-300', says: 'A document was added. A KashRoot admin has not reviewed it yet.' },
  ADMIN_APPROVED: { label: 'Approved by KashRoot', tone: 'bg-emerald-100 text-emerald-950 ring-emerald-300', says: 'A KashRoot admin reviewed the documents and approved this vehicle.' },
  REJECTED: { label: 'Not approved', tone: 'bg-rose-100 text-rose-950 ring-rose-300', says: 'A KashRoot admin did not approve this vehicle. Register it again with the right documents, or contact KashRoot support.' },
};

const DRIVER_STATUS: Record<string, string> = {
  ACTIVE: 'Active: this driver can start trips.',
  PENDING_APPROVAL: 'Waiting for KashRoot to approve this driver.',
  SUSPENDED: 'Suspended by KashRoot: trips cannot be started.',
};

function Row({ ok, title, children }: { ok: boolean | null; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {ok === true ? <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden /> : <CircleAlert className={`mt-0.5 h-5 w-5 shrink-0 ${ok === false ? 'text-amber-700' : 'text-slate-500'}`} aria-hidden />}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-700">{children}</p>
      </div>
    </li>
  );
}

export function VerificationPanel({ driver, vehicles, onGo }: { driver: DriverLike | null; vehicles: VehicleLike[]; onGo: (id: TrackingSection) => void }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900">Your driver account</h2>
        {!driver ? (
          <p className="mt-2 text-sm text-slate-700">
            You are not signed in as a driver.{' '}
            <button type="button" onClick={() => onGo('SIGN_IN')} className="min-h-11 cursor-pointer font-semibold text-indigo-800 underline">Sign in or register</button> to see what is checked.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            <Row ok title={`${driver.full_name} · mobile ${driver.phone}`}>The mobile number is confirmed with a one-time code when a new driver registers, and the PIN you chose opens the account.</Row>
            <Row ok={driver.account_status === 'ACTIVE'} title={`Account status: ${driver.account_status.replace(/_/g, ' ').toLowerCase()}`}>{DRIVER_STATUS[driver.account_status] ?? 'Status as set by KashRoot.'}</Row>
            <Row ok={false} title={`Driving licence ${driver.license_number} · ${driver.license_category}`}>Entered by you. KashRoot has not checked it against the Government’s licence register, so it is shown as declared, never as verified.</Row>
            <Row ok={null} title={`Home: ${driver.home_district}, ${driver.home_state}`}>As you wrote it.</Row>
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900">Your vehicles</h2>
        {vehicles.length === 0 ? (
          <p className="mt-2 text-sm text-slate-700">
            {driver ? 'No vehicle yet. ' : ''}
            <button type="button" onClick={() => onGo(driver ? 'VEHICLES' : 'SIGN_IN')} className="min-h-11 cursor-pointer font-semibold text-indigo-800 underline">{driver ? 'Register a vehicle' : 'Sign in first'}</button>
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {vehicles.map((v) => {
              const st = VEHICLE_STATUS[v.verification_status] ?? { label: v.verification_status, tone: 'bg-slate-100 text-slate-900 ring-slate-300', says: 'Status as set by KashRoot.' };
              return (
                <li key={v.id} className="py-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900">{v.registration_number}</span>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${st.tone}`}>{st.label}</span>
                  </p>
                  <p className="text-sm text-slate-700">{v.vehicle_category.replace(/_/g, ' ').toLowerCase()} · {v.make_and_model} · owner {v.owner_name}</p>
                  <p className="text-sm text-slate-600">{st.says}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900">What KashRoot checks, and what it does not</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          <Row ok title="Mobile number">Confirmed with a one-time code before a driver account is made.</Row>
          <Row ok title="A trip’s Tracking ID and PIN">The buyer and the farmer see a trip only with its Tracking ID and 6-digit PIN. There is no public list of trips.</Row>
          <Row ok title="Live position">Comes only from this phone’s GPS or a paired device, while a trip is running: nothing is simulated or filled in.</Row>
          <Row ok title="Vehicle approval">Only a KashRoot admin can mark a vehicle approved, after looking at its documents.</Row>
          <Row ok={false} title="Driving licence and vehicle papers">Not checked against the Government’s registers by KashRoot. They are shown as declared until an admin approves them.</Row>
          <Row ok={false} title="GPS device (AIS-140)">A device is “unverified” until a KashRoot admin certifies it; a device that is not certified still sends positions, marked as such.</Row>
        </ul>
      </div>
    </div>
  );
}
