'use client';

/**
 * Shared Bin & CA Engineering Desk — the operational heart of the KashRoot CA
 * cold storage portal (Leaflet 427 adaptation for apple controlled-atmosphere
 * storage).
 *
 * Owner view (rental portal):
 *  - Gate receiving & shared-bin allocator: several farmers' approved bookings
 *    are allocated into one physical bin (e.g. Bin B-102, 100 crates: farmer A
 *    40 + farmer B 30 + farmer C 20 -> 90/100 occupied, 10 free). Over-
 *    allocation is refused by the database and the API (HTTP 409).
 *  - Farmer-by-farmer breakdown inside every shared bin, with outward gate
 *    dispatch (which decrements occupancy and writes the ledger).
 *  - Leaflet 427 + Apple CA refrigeration load calculator: wall transmittance
 *    U, solar-corrected wall/roof/floor gains, air-change service load, apple
 *    field-heat pulldown + respiration vital heat, motor/light/occupancy load,
 *    10% safety factor, compressor tonnage, evaporator surface area and the
 *    psychrometric relative humidity. Apples are living fruit stored above
 *    freezing - never frozen-fish parameters. Every CA setpoint needs
 *    cultivar-specific agronomic validation.
 *  - Live CA telemetry monitor: temperature, RH%, O2%, CO2%, ethylene with
 *    NORMAL / WARNING / CRITICAL alert chips, and the operator log form.
 *
 * Farmer view (farmer portal "My stored apples"): only the farmer's own
 * bookings, own crates inside shared bins (plus the bin's aggregate free
 * capacity so they can find space - never another farmer's name, phone or
 * inventory), their own movement ledger, and one-tap Request Release.
 *
 * Data isolation is enforced by /api/cold-storage/operations; this component
 * only renders what the API returns for the signed-in role, and always sends
 * the Supabase session as a Bearer header so the server can bind the action
 * to the right farmer / owner.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Apple,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  Factory,
  ListOrdered,
  PackageCheck,
  RefreshCw,
  Send,
  Snowflake,
  Thermometer,
  Truck,
  Warehouse,
} from 'lucide-react';
import { Badge, Btn, EmptyState, Field, INPUT, Panel, Skeleton, type PortalTheme } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import { inr, supabase, type Account } from '@/lib/db/client';
import { listListings, type RentalListing } from '@/lib/db/rentals';
import type { ChamberEngineeringResult } from '@/lib/coldStorageEngineeringEngine';

// ── API payload types (mirror /api/cold-storage/operations) ──────────────────

interface FarmerSlice {
  id: string;
  booking_reference: string;
  farmer_name: string;
  apple_variety: string;
  allocated_crates: number;
  released_crates: number;
  active_crates: number;
  crate_weight_kg: number;
  active_weight_kg: number;
  allocation_status: string;
  received_at: string;
}

interface SharedBin {
  id: string;
  chamber_code: string;
  bin_code: string;
  max_crates: number;
  occupied_crates: number;
  available_crates: number;
  occupancy_status: string;
  dominant_apple_variety: string | null;
  shared_farmers_count: number;
  allocations: FarmerSlice[];
}

interface CaBooking {
  id: string;
  booking_reference: string;
  facility_id: string;
  facility_name: string;
  chamber_code: string | null;
  farmer_name: string;
  farmer_phone: string;
  apple_variety: string;
  apple_grade: string | null;
  requested_crates: number;
  allocated_crates: number;
  crate_weight_kg: number;
  total_weight_kg: number;
  duration_months: number;
  rate_per_crate_per_month_inr: number;
  total_estimated_charge_inr: number;
  booking_status: string;
  owner_decision_notes: string | null;
  created_at: string;
}

interface CaMovement {
  id: string;
  movement_type: string;
  chamber_code: string;
  bin_code: string;
  crates_delta: number;
  weight_kg_delta: number;
  balance_crates_after: number;
  apple_variety: string;
  recorded_by_role: string;
  notes: string | null;
  recorded_at: string;
}

interface CaReading {
  id: string;
  chamber_code: string;
  reading_source: string;
  dry_bulb_temp_f: number;
  dry_bulb_temp_c: number;
  relative_humidity_percent: number;
  oxygen_o2_percent: number | null;
  carbon_dioxide_co2_percent: number | null;
  ethylene_ppm: number | null;
  alert_status: string;
  alert_message: string | null;
  recorded_at: string;
}

interface CaNotification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  bin_code: string | null;
  is_read: boolean;
  created_at: string;
}

interface OpsPayload {
  ok?: boolean;
  bins: SharedBin[];
  bookings: CaBooking[];
  movements: CaMovement[];
  caReadings: CaReading[];
  notifications: CaNotification[];
}

const OPS = '/api/cold-storage/operations';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

// ── Small shared pieces ──────────────────────────────────────────────────────

const VARIETIES = ['Kullu Delicious', 'Royal Delicious', 'Gala', 'Granny Smith', 'Red Fuji', 'Ambri Kashmiri'];

function bookingTone(status: string): 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet' {
  switch (status) {
    case 'PENDING_OWNER_APPROVAL': return 'amber';
    case 'APPROVED_AWAITING_RECEIPT': return 'blue';
    case 'RECEIVED_AND_BIN_ALLOCATED': return 'green';
    case 'RELEASE_REQUESTED': return 'violet';
    case 'PARTIALLY_DISPATCHED': return 'blue';
    case 'DISPATCHED_COMPLETED': return 'green';
    case 'REJECTED_BY_OWNER': return 'red';
    case 'CANCELLED': return 'slate';
    default: return 'slate';
  }
}

function bookingLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function binTone(status: string): 'slate' | 'green' | 'amber' {
  if (status === 'FULL_OCCUPIED') return 'slate';
  if (status === 'PARTIALLY_SHARED') return 'amber';
  return 'green';
}

function binLabel(status: string): string {
  if (status === 'FULL_OCCUPIED') return 'Full';
  if (status === 'PARTIALLY_SHARED') return 'Shared';
  if (status === 'MAINTENANCE') return 'Maintenance';
  if (status === 'RESERVED') return 'Reserved';
  return 'Empty';
}

function alertTone(status: string): 'slate' | 'green' | 'amber' | 'red' {
  if (status === 'CRITICAL_ALARM') return 'red';
  if (status === 'WARNING_THRESHOLD') return 'amber';
  return 'green';
}

function niceDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function RefreshBtn({ theme, onClick, busy }: { theme: PortalTheme; onClick: () => void; busy?: boolean }) {
  return (
    <Btn theme={theme} variant="ghost" size="sm" icon={RefreshCw} disabled={busy} onClick={onClick}>
      Refresh
    </Btn>
  );
}

// ── Owner desk ───────────────────────────────────────────────────────────────

export function OwnerSharedBinDesk({
  account,
  owned,
  theme,
}: {
  account: Account;
  /** The owner's cold stores (rental_listings); at least one is required. */
  owned: RentalListing[];
  theme: PortalTheme;
}) {
  const [facilityId, setFacilityId] = useState<string>(owned[0]?.id ?? '');
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [allocFor, setAllocFor] = useState<Record<string, { binCode: string; crates: string }>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [calc, setCalc] = useState<ChamberEngineeringResult | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [logBusy, setLogBusy] = useState(false);

  const load = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ viewerRole: 'OWNER', facilityId });
      const res = await fetch(`${OPS}?${params}`, { headers: await authHeaders(), cache: 'no-store' });
      const json = (await res.json()) as OpsPayload;
      if (res.ok && json.ok !== false) setOps(json);
      else toast.error('Could not load the cold storage desk.');
    } catch {
      toast.error('Could not reach the cold storage desk.');
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>, okMessage: string, key: string) => {
      setBusyKey(key);
      try {
        const res = await fetch(OPS, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string };
        if (res.ok && json.ok) {
          toast.success(okMessage);
          await load();
          return true;
        }
        toast.error(json.error ?? 'That did not go through. Please try again.');
        return false;
      } catch {
        toast.error('Could not reach KashRoot. Check your internet and try again.');
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [load],
  );

  const awaitingReceipt = useMemo(
    () => (ops?.bookings ?? []).filter((b) => b.booking_status === 'APPROVED_AWAITING_RECEIPT'),
    [ops],
  );
  const releaseWanted = useMemo(
    () =>
      (ops?.bins ?? []).flatMap((bin) =>
        (bin.allocations ?? [])
          .filter((a) => a.allocation_status === 'RELEASE_REQUESTED')
          .map((a) => ({ bin, a })),
      ),
    [ops],
  );

  if (owned.length === 0) {
    return (
      <Panel theme={theme} title="Shared bins & CA desk" icon={Warehouse} className="lg:col-span-2">
        <EmptyState theme={theme} icon={Warehouse} title="Add your cold store first" text="The shared bin allocator, the Leaflet 427 load calculator and the CA telemetry monitor open once your cold store is listed." />
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Cold store">
          <select className={INPUT} value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
            {owned.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
                {l.district ? ` · ${l.district}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <RefreshBtn theme={theme} onClick={() => void load()} busy={loading} />
      </div>

      {/* Gate receiving & shared-bin allocator */}
      <Panel theme={theme} title="Gate receiving · shared bin allocator" icon={PackageCheck} action={<Badge tone="amber">{awaitingReceipt.length} awaiting receipt</Badge>}>
        {awaitingReceipt.length === 0 ? (
          <p className="text-sm text-slate-600">No approved bookings waiting for gate receipt. When you approve a booking (Bookings to confirm) the fruit is received here into a shared bin.</p>
        ) : (
          <ul className="space-y-3">
            {awaitingReceipt.map((b) => {
              const draft = allocFor[b.id] ?? { binCode: 'B-102', crates: String(b.requested_crates) };
              const key = `alloc-${b.id}`;
              return (
                <li key={b.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      {b.farmer_name} · {b.requested_crates} crates of {b.apple_variety}
                      <span className="ml-2 font-mono text-xs font-normal text-slate-500">{b.booking_reference}</span>
                    </p>
                    <span className="text-sm font-semibold text-sky-900">{inr(b.total_estimated_charge_inr)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {b.farmer_phone} · {b.duration_months} month{b.duration_months === 1 ? '' : 's'} · {b.crate_weight_kg} kg per crate · {b.total_weight_kg} kg total
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <Field label="Bin code">
                      <input className={`${INPUT} w-32`} value={draft.binCode} onChange={(e) => setAllocFor((m) => ({ ...m, [b.id]: { ...draft, binCode: e.target.value.toUpperCase() } }))} placeholder="B-102" />
                    </Field>
                    <Field label="Crates to store">
                      <input className={`${INPUT} w-28`} inputMode="numeric" value={draft.crates} onChange={(e) => setAllocFor((m) => ({ ...m, [b.id]: { ...draft, crates: e.target.value.replace(/\D/g, '') } }))} />
                    </Field>
                    <Btn
                      theme={theme}
                      icon={PackageCheck}
                      disabled={busyKey === key}
                      onClick={() =>
                        void post(
                          {
                            action: 'ALLOCATE_TO_SHARED_BIN',
                            bookingId: b.id,
                            facilityId,
                            chamberCode: b.chamber_code || 'CH-01',
                            binCode: draft.binCode || 'B-102',
                            cratesToAllocate: Number(draft.crates || 0),
                          },
                          `Stored into ${draft.binCode || 'B-102'} — the farmer has been notified.`,
                          key,
                        )
                      }
                    >
                      Store into bin
                    </Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* Shared bins with farmer-by-farmer breakdown */}
      <Panel theme={theme} title="Shared bins" icon={Boxes} action={<Badge tone="blue">{ops?.bins.length ?? 0} bins</Badge>}>
        {loading && !ops ? (
          <Skeleton label="Loading bins…" />
        ) : (ops?.bins.length ?? 0) === 0 ? (
          <EmptyState theme={theme} icon={Boxes} title="No bins yet" text="Bins are created the first time you store fruit (for example B-102 with 100 crates)." />
        ) : (
          <ul className="space-y-4">
            {(ops?.bins ?? []).map((bin) => {
              const pct = Math.min(100, Math.round((bin.occupied_crates / bin.max_crates) * 100));
              return (
                <li key={bin.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      Bin {bin.bin_code} · Chamber {bin.chamber_code}
                    </p>
                    <span className="flex items-center gap-2">
                      <Badge tone={binTone(bin.occupancy_status)}>{binLabel(bin.occupancy_status)}</Badge>
                      <span className="text-sm font-semibold tabular-nums text-slate-700">{bin.occupied_crates}/{bin.max_crates} crates · {bin.available_crates} free</span>
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="presentation">
                    <div className={`h-full rounded-full ${pct >= 100 ? 'bg-indigo-500' : pct > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                  {bin.dominant_apple_variety && <p className="mt-2 text-sm text-slate-600">Dominant variety: {bin.dominant_apple_variety}</p>}
                  {(bin.allocations ?? []).length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">Empty — ready for fruit.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {bin.shared_farmers_count} farmer{bin.shared_farmers_count === 1 ? '' : 's'} sharing this bin
                      </p>
                      <ul className="space-y-2">
                        {bin.allocations.map((a) => (
                          <li key={a.id} className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">
                                {a.farmer_name} · {a.active_crates} crates in bin ({a.allocated_crates} stored, {a.released_crates} dispatched) · {a.apple_variety} · {a.active_weight_kg} kg
                              </p>
                              <p className="text-xs text-slate-500">
                                {a.booking_reference} · received {niceDate(a.received_at)} ·{' '}
                                {a.allocation_status === 'RELEASE_REQUESTED'
                                  ? 'wants fruit back — confirm the dispatch below'
                                  : a.allocation_status === 'FULLY_RELEASED'
                                    ? 'all dispatched'
                                    : 'in storage'}
                              </p>
                            </div>
                            <Btn
                              theme={theme}
                              size="sm"
                              variant={a.allocation_status === 'RELEASE_REQUESTED' ? 'solid' : 'soft'}
                              icon={Truck}
                              disabled={busyKey === `disp-${a.id}` || a.active_crates === 0}
                              onClick={() =>
                                void post(
                                  { action: 'RELEASE_OR_DISPATCH_FROM_BIN', allocationId: a.id, subAction: 'CONFIRM_DISPATCH', cratesToRelease: a.active_crates },
                                  `Dispatched ${a.active_crates} crates of ${a.farmer_name} from Bin ${bin.bin_code}.`,
                                  `disp-${a.id}`,
                                )
                              }
                            >
                              {a.allocation_status === 'RELEASE_REQUESTED' ? `Dispatch ${a.active_crates} (requested)` : 'Dispatch all'}
                            </Btn>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {releaseWanted.length > 0 && (
          <p className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900 ring-1 ring-violet-200">
            {releaseWanted.length} release request{releaseWanted.length === 1 ? '' : 's'} waiting — confirm the dispatch on the bin above.
          </p>
        )}
      </Panel>

      <EngineeringCalculator theme={theme} result={calc} busy={calcBusy} onRun={async (inputs) => {
        setCalcBusy(true);
        try {
          const res = await fetch(OPS, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'CALCULATE_ENGINEERING_SPECS', ...inputs }),
          });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; engineering?: ChamberEngineeringResult };
          if (res.ok && json.engineering) {
            setCalc(json.engineering);
            toast.success('Engineering load calculated.');
          } else toast.error('Could not calculate the load.');
        } catch {
          toast.error('Could not reach KashRoot. Check your internet and try again.');
        } finally {
          setCalcBusy(false);
        }
      }} />

      <CaTelemetryDesk theme={theme} ops={ops} facilityId={facilityId} busy={logBusy} onLog={async (payload) => {
        setLogBusy(true);
        try {
          const res = await fetch(OPS, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ action: 'LOG_CA_ENVIRONMENT', facilityId, ...payload }),
          });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reading?: CaReading };
          if (res.ok && json.ok && json.reading) {
            if (json.reading.alert_status === 'CRITICAL_ALARM') toast.error(`Logged — CRITICAL: ${json.reading.alert_message ?? 'threshold breached'}`);
            else if (json.reading.alert_status === 'WARNING_THRESHOLD') toast.error(`Logged — WARNING: ${json.reading.alert_message ?? 'threshold breached'}`);
            else toast.success('Reading logged — all CA values normal.');
            await load();
          } else toast.error(json.error ?? 'Could not log the reading.');
        } catch {
          toast.error('Could not reach KashRoot. Check your internet and try again.');
        } finally {
          setLogBusy(false);
        }
      }} />

      {(ops?.notifications.length ?? 0) > 0 && (
        <Panel theme={theme} title="Cold storage alerts" icon={ClipboardCheck}>
          <ul className="space-y-2">
            {(ops?.notifications ?? []).slice(0, 8).map((n) => (
              <li key={n.id} className="rounded-xl bg-white/85 px-3 py-2 ring-1 ring-slate-900/5">
                <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                <p className="text-sm text-slate-600">{n.message}</p>
                <p className="text-xs text-slate-400">{niceDate(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <p className="sr-only">Desk opened by {account.name}</p>
    </div>
  );
}

// ── Leaflet 427 + Apple CA engineering calculator ────────────────────────────

interface CalcInputs {
  lengthFt: number; widthFt: number; heightFt: number;
  insulationThicknessIn: number; insulationKFactor: number;
  outsideDesignTempF: number; roomTempF: number; evaporatorCoilTempF: number;
  surfaceColor: 'LIGHT' | 'MEDIUM' | 'DARK';
  hasVestibuleFlapperDoors: boolean;
  totalStoredApplesKg: number; dailyIncomingApplesKg: number; incomingFruitTempF: number; pulldownHours: number;
  fanMotorsTotalHp: number; lightingWatts: number; workersCount: number;
  compressorOperatingHoursPerDay: number;
  evaporatorType: string;
}

function EngineeringCalculator({
  theme,
  result,
  busy,
  onRun,
}: {
  theme: PortalTheme;
  result: ChamberEngineeringResult | null;
  busy: boolean;
  onRun: (inputs: CalcInputs) => Promise<void>;
}) {
  const [f, setF] = useState<CalcInputs>({
    lengthFt: 100, widthFt: 50, heightFt: 24,
    insulationThicknessIn: 6, insulationKFactor: 0.22,
    outsideDesignTempF: 90, roomTempF: 32, evaporatorCoilTempF: 29,
    surfaceColor: 'LIGHT',
    hasVestibuleFlapperDoors: true,
    totalStoredApplesKg: 200000, dailyIncomingApplesKg: 15000, incomingFruitTempF: 65, pulldownHours: 24,
    fanMotorsTotalHp: 5, lightingWatts: 600, workersCount: 3,
    compressorOperatingHoursPerDay: 16,
    evaporatorType: 'BLOWER_UNIT_COOLER_OVER_AISLE',
  });
  const num = (key: keyof CalcInputs) => ({
    value: String(f[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [key]: e.target.value === '' ? 0 : Number(e.target.value) })),
  });

  return (
    <Panel theme={theme} title="Leaflet 427 · Apple CA load calculator" icon={Factory}>
      <p className="mb-4 text-sm text-slate-600">
        Heat load, compressor tonnage and evaporator sizing by Fishery Leaflet 427, adapted for living apples: storage above
        freezing (31–36°F), sensible field-heat pulldown (c = 0.87 Btu/lb·°F) plus respiration vital heat, and the
        psychrometric RH formula H = (P1 × 100) / P2. Setpoints need cultivar-specific agronomic validation.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Chamber length (ft)"><input className={INPUT} inputMode="numeric" {...num('lengthFt')} /></Field>
        <Field label="Chamber width (ft)"><input className={INPUT} inputMode="numeric" {...num('widthFt')} /></Field>
        <Field label="Chamber height (ft)"><input className={INPUT} inputMode="numeric" {...num('heightFt')} /></Field>
        <Field label="Insulation thickness (in)"><input className={INPUT} inputMode="decimal" {...num('insulationThicknessIn')} /></Field>
        <Field label="Insulation k factor"><input className={INPUT} inputMode="decimal" {...num('insulationKFactor')} /></Field>
        <Field label="Outside design temp (°F)"><input className={INPUT} inputMode="numeric" {...num('outsideDesignTempF')} /></Field>
        <Field label="Room temp (°F, 31–36)"><input className={INPUT} inputMode="decimal" {...num('roomTempF')} /></Field>
        <Field label="Evaporator coil temp (°F)"><input className={INPUT} inputMode="decimal" {...num('evaporatorCoilTempF')} /></Field>
        <Field label="Stored apples (kg)"><input className={INPUT} inputMode="numeric" {...num('totalStoredApplesKg')} /></Field>
        <Field label="Daily intake (kg)"><input className={INPUT} inputMode="numeric" {...num('dailyIncomingApplesKg')} /></Field>
        <Field label="Fruit in temp (°F)"><input className={INPUT} inputMode="numeric" {...num('incomingFruitTempF')} /></Field>
        <Field label="Pulldown hours"><input className={INPUT} inputMode="numeric" {...num('pulldownHours')} /></Field>
        <Field label="Fan motors (total hp)"><input className={INPUT} inputMode="decimal" {...num('fanMotorsTotalHp')} /></Field>
        <Field label="Lighting watts"><input className={INPUT} inputMode="numeric" {...num('lightingWatts')} /></Field>
        <Field label="Workers inside"><input className={INPUT} inputMode="numeric" {...num('workersCount')} /></Field>
        <Field label="Compressor hours/day"><input className={INPUT} inputMode="numeric" {...num('compressorOperatingHoursPerDay')} /></Field>
        <Field label="Outside surface colour">
          <select className={INPUT} value={f.surfaceColor} onChange={(e) => setF((p) => ({ ...p, surfaceColor: e.target.value as CalcInputs['surfaceColor'] }))}>
            <option value="LIGHT">Light</option>
            <option value="MEDIUM">Medium</option>
            <option value="DARK">Dark</option>
          </select>
        </Field>
        <Field label="Evaporator type">
          <select className={INPUT} value={f.evaporatorType} onChange={(e) => setF((p) => ({ ...p, evaporatorType: e.target.value }))}>
            <option value="BLOWER_UNIT_COOLER_OVER_AISLE">Blower unit cooler over aisle</option>
            <option value="FINNED_PIPE_COIL_OVER_AISLE">Finned pipe coil over aisle</option>
            <option value="BARE_PIPE_COIL">Bare pipe coil</option>
            <option value="REFRIGERATED_PLATES">Refrigerated plates</option>
            <option value="JACKETED_DUCT_SYSTEM">Jacketed duct system</option>
          </select>
        </Field>
        <Field label="Vestibule / flapper doors">
          <select className={INPUT} value={f.hasVestibuleFlapperDoors ? 'yes' : 'no'} onChange={(e) => setF((p) => ({ ...p, hasVestibuleFlapperDoors: e.target.value === 'yes' }))}>
            <option value="yes">Yes (recommended)</option>
            <option value="no">No</option>
          </select>
        </Field>
      </div>
      <Btn theme={theme} className="mt-4" icon={Factory} disabled={busy} onClick={() => void onRun(f)}>
        {busy ? 'Calculating…' : 'Calculate heat load & equipment'}
      </Btn>

      {result && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CalcCard label="Wall heat gain q'w" value={`${result.wallHeatGainBtu24h.toLocaleString('en-IN')} Btu/24h`} />
            <CalcCard label="Air-change load q's" value={`${result.serviceHeatGainBtu24h.toLocaleString('en-IN')} Btu/24h`} hint={`${result.airChangesPer24h} changes/day`} />
            <CalcCard label="Apple pulldown + respiration q'p" value={`${result.productPulldownAndRespirationBtu24h.toLocaleString('en-IN')} Btu/24h`} />
            <CalcCard label="Motors, lights, workers q'm" value={`${result.miscellaneousHeatGainBtu24h.toLocaleString('en-IN')} Btu/24h`} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CalcCard label="Total load q' (incl. 10% safety)" value={`${result.totalHeatLoadWithSafetyBtu24h.toLocaleString('en-IN')} Btu/24h`} strong />
            <CalcCard label="Compressor qct" value={`${result.recommendedStandardCompressorTons} TR standard`} hint={`required ${result.requiredCompressorTons} TR (${result.requiredCompressorBtuPerHr.toLocaleString('en-IN')} Btu/hr)`} />
            <CalcCard label="Evaporator area A" value={`${result.requiredEvaporatorAreaSqFt.toLocaleString('en-IN')} ft²`} hint={`U = ${result.overallUValue} Btu/hr·ft²·°F wall`} />
            <CalcCard label="Relative humidity H" value={`${result.psychrometrics.estimatedLoadedChamberRhPercent}% loaded`} hint={`empty-room ${result.psychrometrics.theoreticalEmptyRoomRhPercent}% · ΔT ${result.psychrometrics.deltaTF}°F`} />
          </div>
          {result.appleStorageSafetyWarnings.length > 0 ? (
            <ul className="space-y-2">
              {result.appleStorageSafetyWarnings.map((w, i) => (
                <li key={i} className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950 ring-1 ring-amber-200">{w}</li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900 ring-1 ring-emerald-200">All values are inside the safe apple CA window. Setpoints still need cultivar-specific agronomic validation.</p>
          )}
        </div>
      )}
    </Panel>
  );
}

function CalcCard({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${strong ? 'bg-sky-50 ring-sky-200' : 'bg-white/85 ring-slate-900/5'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-display ${strong ? 'text-xl font-bold text-sky-900' : 'text-lg font-semibold text-slate-900'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// ── CA telemetry monitor ─────────────────────────────────────────────────────

function CaTelemetryDesk({
  theme,
  ops,
  facilityId,
  busy,
  onLog,
}: {
  theme: PortalTheme;
  ops: OpsPayload | null;
  facilityId: string;
  busy: boolean;
  onLog: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const readings = ops?.caReadings ?? [];
  const [f, setF] = useState({ chamberCode: 'CH-01', dryBulbTempF: '32', relativeHumidityPercent: '92', oxygenO2Percent: '1.8', carbonDioxideCo2Percent: '1.5', ethylenePpm: '0.05', readingSource: 'IOT_SENSOR' });
  return (
    <Panel theme={theme} title="Live CA telemetry" icon={Thermometer} action={<Badge tone="blue">{readings.length} recent readings</Badge>}>
      {readings.length === 0 ? (
        <p className="text-sm text-slate-600">No readings logged yet for this store. Log the chamber conditions below, or point an IoT node at this API.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {readings.slice(0, 6).map((r) => (
            <div key={r.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">Chamber {r.chamber_code}</p>
                <Badge tone={alertTone(r.alert_status)}>{r.alert_status === 'CRITICAL_ALARM' ? 'CRITICAL' : r.alert_status === 'WARNING_THRESHOLD' ? 'WARNING' : 'NORMAL'}</Badge>
              </div>
              <p className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-slate-700">
                <span>Temp</span><strong className="tabular-nums">{r.dry_bulb_temp_f}°F / {r.dry_bulb_temp_c}°C</strong>
                <span>RH</span><strong className="tabular-nums">{r.relative_humidity_percent}%</strong>
                <span>O₂</span><strong className="tabular-nums">{r.oxygen_o2_percent ?? '—'}%</strong>
                <span>CO₂</span><strong className="tabular-nums">{r.carbon_dioxide_co2_percent ?? '—'}%</strong>
                <span>Ethylene</span><strong className="tabular-nums">{r.ethylene_ppm ?? '—'} ppm</strong>
              </p>
              {r.alert_message && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950 ring-1 ring-amber-200">{r.alert_message}</p>}
              <p className="mt-2 text-xs text-slate-400">{r.reading_source === 'IOT_SENSOR' ? 'IoT sensor' : 'Operator log'} · {niceDate(r.recorded_at)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
        <p className="mb-3 text-sm font-semibold text-slate-900">Log a reading</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Chamber"><input className={INPUT} value={f.chamberCode} onChange={(e) => setF((p) => ({ ...p, chamberCode: e.target.value.toUpperCase() }))} /></Field>
          <Field label="Dry-bulb temp (°F)"><input className={INPUT} inputMode="decimal" value={f.dryBulbTempF} onChange={(e) => setF((p) => ({ ...p, dryBulbTempF: e.target.value }))} /></Field>
          <Field label="Relative humidity (%)"><input className={INPUT} inputMode="decimal" value={f.relativeHumidityPercent} onChange={(e) => setF((p) => ({ ...p, relativeHumidityPercent: e.target.value }))} /></Field>
          <Field label="O₂ (%)"><input className={INPUT} inputMode="decimal" value={f.oxygenO2Percent} onChange={(e) => setF((p) => ({ ...p, oxygenO2Percent: e.target.value }))} /></Field>
          <Field label="CO₂ (%)"><input className={INPUT} inputMode="decimal" value={f.carbonDioxideCo2Percent} onChange={(e) => setF((p) => ({ ...p, carbonDioxideCo2Percent: e.target.value }))} /></Field>
          <Field label="Ethylene (ppm)"><input className={INPUT} inputMode="decimal" value={f.ethylenePpm} onChange={(e) => setF((p) => ({ ...p, ethylenePpm: e.target.value }))} /></Field>
          <Field label="Source">
            <select className={INPUT} value={f.readingSource} onChange={(e) => setF((p) => ({ ...p, readingSource: e.target.value }))}>
              <option value="IOT_SENSOR">IoT sensor</option>
              <option value="MANUAL_OPERATOR_LOG">Manual operator log</option>
            </select>
          </Field>
        </div>
        <Btn theme={theme} className="mt-3" icon={Send} disabled={busy || !facilityId} onClick={() => void onLog({
          chamberCode: f.chamberCode || 'CH-01',
          dryBulbTempF: Number(f.dryBulbTempF),
          relativeHumidityPercent: f.relativeHumidityPercent === '' ? undefined : Number(f.relativeHumidityPercent),
          oxygenO2Percent: f.oxygenO2Percent === '' ? undefined : Number(f.oxygenO2Percent),
          carbonDioxideCo2Percent: f.carbonDioxideCo2Percent === '' ? undefined : Number(f.carbonDioxideCo2Percent),
          ethylenePpm: f.ethylenePpm === '' ? undefined : Number(f.ethylenePpm),
          readingSource: f.readingSource,
        })}>
          {busy ? 'Logging…' : 'Log CA reading'}
        </Btn>
      </div>
    </Panel>
  );
}

// ── Farmer desk (strictly isolated) ──────────────────────────────────────────

export function FarmerStoredApplesDesk({
  account,
  theme,
  facilities,
}: {
  account: Account;
  theme: PortalTheme;
  /** Cold stores to book into; fetched when not passed. */
  facilities?: Array<Pick<RentalListing, 'id' | 'title' | 'district'>>;
}) {
  const [allFacilities, setAllFacilities] = useState<Array<Pick<RentalListing, 'id' | 'title' | 'district'>>>(facilities ?? []);
  const [facilityId, setFacilityId] = useState('');
  const [ops, setOps] = useState<OpsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [book, setBook] = useState({ crates: '40', variety: VARIETIES[0], grade: 'Grade A', months: '3', crateKg: '18', rate: '35' });
  const [releaseFor, setReleaseFor] = useState<Record<string, string>>({});

  useEffect(() => {
    if (facilities && facilities.length > 0) return;
    void listListings('cold_store')
      .then((rows) => setAllFacilities(rows.map((l) => ({ id: l.id, title: l.title, district: l.district }))))
      .catch(() => setAllFacilities([]));
  }, [facilities]);

  const load = useCallback(async () => {
    if (!account?.id || !facilityId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ viewerRole: 'FARMER', facilityId, farmerId: account.id });
      const res = await fetch(`${OPS}?${params}`, { headers: await authHeaders(), cache: 'no-store' });
      const json = (await res.json()) as OpsPayload;
      if (res.ok && json.ok !== false) setOps(json);
      else toast.error('Could not load your stored apples.');
    } catch {
      toast.error('Could not reach KashRoot. Check your internet and try again.');
    } finally {
      setLoading(false);
    }
  }, [account?.id, facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (payload: Record<string, unknown>, okMessage: string, key: string) => {
      setBusyKey(key);
      try {
        const res = await fetch(OPS, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ farmerId: account.id, farmerName: account.name, farmerPhone: account.phone, farmerDistrict: account.district, ...payload }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; booking?: CaBooking; status?: string };
        if (res.ok && json.ok) {
          if (json.booking?.booking_reference) toast.success(`Booking ${json.booking.booking_reference} sent — the owner will confirm.`);
          else toast.success(okMessage);
          await load();
          return true;
        }
        toast.error(json.error ?? 'That did not go through. Please try again.');
        return false;
      } catch {
        toast.error('Could not reach KashRoot. Check your internet and try again.');
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [account, load],
  );

  const myBookings = ops?.bookings ?? [];
  const myBins = useMemo(
    () => (ops?.bins ?? []).filter((b) => (b.allocations ?? []).some((a) => a.active_crates > 0)),
    [ops],
  );
  const myMovements = ops?.movements ?? [];
  const myNotifications = ops?.notifications ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Cold store">
          <select className={INPUT} value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
            <option value="">Choose a cold store…</option>
            {allFacilities.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
                {l.district ? ` · ${l.district}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <RefreshBtn theme={theme} onClick={() => void load()} busy={loading} />
      </div>

      {!facilityId ? (
        <Panel theme={theme} title="My stored apples" icon={Apple}>
          <EmptyState theme={theme} icon={Snowflake} title="Choose a cold store" text="Pick a cold store above to book crates, see exactly where your apples are stored, and ask for them back." />
        </Panel>
      ) : (
        <>
          <Panel theme={theme} title="Book cold storage" icon={Send} action={<Badge tone="amber">{myBookings.length} of mine</Badge>}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Crates"><input className={INPUT} inputMode="numeric" value={book.crates} onChange={(e) => setBook((p) => ({ ...p, crates: e.target.value.replace(/\D/g, '') }))} /></Field>
              <Field label="Apple variety">
                <select className={INPUT} value={book.variety} onChange={(e) => setBook((p) => ({ ...p, variety: e.target.value }))}>
                  {VARIETIES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Months">
                <select className={INPUT} value={book.months} onChange={(e) => setBook((p) => ({ ...p, months: e.target.value }))}>
                  {[1, 2, 3, 4, 5, 6].map((m) => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}
                </select>
              </Field>
              <Field label="Kg per crate"><input className={INPUT} inputMode="decimal" value={book.crateKg} onChange={(e) => setBook((p) => ({ ...p, crateKg: e.target.value }))} /></Field>
            </div>
            <Btn
              theme={theme}
              className="mt-4"
              icon={Send}
              disabled={busyKey === 'book' || !book.crates || Number(book.crates) <= 0}
              onClick={() =>
                void post(
                  {
                    action: 'SUBMIT_BOOKING',
                    facilityId,
                    requestedCrates: Number(book.crates || 0),
                    appleVariety: book.variety,
                    appleGrade: book.grade,
                    crateWeightKg: Number(book.crateKg || 18),
                    durationMonths: Number(book.months || 3),
                    ratePerCratePerMonthInr: Number(book.rate || 35),
                  },
                  'Booking sent.',
                  'book',
                )
              }
            >
              Send booking request
            </Btn>
          </Panel>

          <Panel theme={theme} title="My bookings" icon={CalendarClock}>
            {myBookings.length === 0 ? (
              <p className="text-sm text-slate-600">No bookings yet at this store.</p>
            ) : (
              <ul className="space-y-3">
                {myBookings.map((b) => (
                  <li key={b.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">
                        {b.requested_crates} crates of {b.apple_variety}
                        <span className="ml-2 font-mono text-xs font-normal text-slate-500">{b.booking_reference}</span>
                      </p>
                      <Badge tone={bookingTone(b.booking_status)}>{bookingLabel(b.booking_status)}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {b.facility_name} · chamber {b.chamber_code ?? '—'} · {b.allocated_crates} allocated · {b.total_weight_kg} kg · {b.duration_months} month{b.duration_months === 1 ? '' : 's'} · <strong>{inr(b.total_estimated_charge_inr)}</strong>
                    </p>
                    {b.owner_decision_notes && <p className="mt-1 text-sm text-slate-500">Owner: {b.owner_decision_notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel theme={theme} title="Where my apples are stored" icon={Boxes}>
            {myBins.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing stored yet. After the owner receives your fruit, the exact chamber and bin appear here.</p>
            ) : (
              <ul className="space-y-3">
                {myBins.map((bin) => {
                  const mine = (bin.allocations ?? []).filter((a) => a.active_crates > 0);
                  return (
                    <li key={bin.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">Chamber {bin.chamber_code} · Bin {bin.bin_code}</p>
                        <span className="text-sm text-slate-600">Bin capacity {bin.max_crates} crates · <strong className="text-emerald-900">{bin.available_crates} free</strong></span>
                      </div>
                      <ul className="mt-2 space-y-2">
                        {mine.map((a) => {
                          const draft = releaseFor[a.id] ?? String(a.active_crates);
                          return (
                            <li key={a.id} className="flex flex-col gap-2 rounded-xl bg-sky-50/70 px-3 py-2 ring-1 ring-sky-100 lg:flex-row lg:items-center lg:justify-between">
                              <p className="text-sm text-slate-800">
                                <strong>Your allocation: {a.active_crates} crates</strong> ({a.active_weight_kg} kg) · {a.apple_variety} · since {niceDate(a.received_at)} · {a.released_crates} already dispatched
                              </p>
                              <div className="flex items-end gap-2">
                                <Field label="Crates back">
                                  <input className={`${INPUT} w-24`} inputMode="numeric" value={draft} onChange={(e) => setReleaseFor((m) => ({ ...m, [a.id]: e.target.value.replace(/\D/g, '') }))} />
                                </Field>
                                <Btn
                                  theme={theme}
                                  size="sm"
                                  variant="soft"
                                  icon={Truck}
                                  disabled={busyKey === `rel-${a.id}` || !draft || Number(draft) <= 0 || Number(draft) > a.active_crates}
                                  onClick={() =>
                                    void post(
                                      { action: 'RELEASE_OR_DISPATCH_FROM_BIN', allocationId: a.id, cratesToRelease: Number(draft || 0) },
                                      'Release requested — the owner will confirm the dispatch.',
                                      `rel-${a.id}`,
                                    )
                                  }
                                >
                                  Request release
                                </Btn>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">You see only your own crates here, plus how much room is left in each bin — never anyone else&apos;s.</p>
          </Panel>

          <Panel theme={theme} title="My apple movement ledger" icon={ListOrdered}>
            {myMovements.length === 0 ? (
              <p className="text-sm text-slate-600">Every step of your fruit (booking, storing, release) is written here.</p>
            ) : (
              <ul className="space-y-2">
                {myMovements.slice(0, 20).map((m) => (
                  <li key={m.id} className="rounded-xl bg-white/85 px-3 py-2 ring-1 ring-slate-900/5">
                    <p className="text-sm font-semibold text-slate-900">
                      {m.movement_type.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                      {m.crates_delta !== 0 && <span className={m.crates_delta > 0 ? 'ml-2 text-emerald-700' : 'ml-2 text-rose-700'}>{m.crates_delta > 0 ? '+' : ''}{m.crates_delta} crates</span>}
                    </p>
                    <p className="text-sm text-slate-600">{m.notes}</p>
                    <p className="text-xs text-slate-400">{m.chamber_code} · {m.bin_code === 'PENDING' ? 'awaiting placement' : `bin ${m.bin_code}`} · {niceDate(m.recorded_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {myNotifications.length > 0 && (
            <Panel theme={theme} title="Cold storage updates" icon={ClipboardCheck}>
              <ul className="space-y-2">
                {myNotifications.slice(0, 8).map((n) => (
                  <li key={n.id} className="rounded-xl bg-white/85 px-3 py-2 ring-1 ring-slate-900/5">
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <p className="text-sm text-slate-600">{n.message}</p>
                    <p className="text-xs text-slate-400">{niceDate(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
