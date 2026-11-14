'use client';

/**
 * OwnerAdminConsole — the Cold Storage Owner's complete business administration
 * portal (Tier 2 of the administrative hierarchy), one tab inside
 * /rental/dashboard ("Business admin"), plus the separate owner onboarding
 * application for businesses that are not registered yet:
 *
 *   1. Business overview KPIs        6. Booking management (live queue)
 *   2. Facility management           7. Farmer & inventory traceability
 *   3. 3D digital twin architect     8. Temperature & CA monitoring
 *   4. Chamber management            9. Financial ledger + CSV report
 *   5. Bin & shared-bin management  10. Staff & employee RBAC (8 roles)
 *
 * Tenant isolation: every query is scoped by organization_id — Owner A never
 * sees Owner B's facilities, bookings, farmers, staff or financials. When the
 * Platform Superadmin opens this console with ?oversightOrgId=…&oversight=1,
 * a gold oversight banner shows and the inspection itself is audit-logged.
 * Data: GET/POST /api/admin/hierarchy (scope=COLD_STORAGE_OWNER_ADMIN).
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Boxes, Building2, CalendarCheck, ClipboardList, CloudSun, Eye, Landmark, Layers, PackageSearch, PlusCircle, ShieldCheck, ThermometerSnowflake, UserCog, Users, Warehouse,
} from 'lucide-react';

import { Badge, Btn, EmptyState, Field, INPUT, Modal, Panel, Skeleton } from '@/components/portal/kit';
import { PORTAL_THEMES } from '@/components/portal/kit';
import { OWNER_STAFF_ROLES, ROLE_DEFAULT_PERMISSIONS, type StaffPermissionsMatrix } from '@/lib/multiTenantAuth';

const theme = PORTAL_THEMES.rental;

interface Organization {
  id: string;
  organization_code: string;
  business_name: string;
  owner_full_name: string;
  owner_email: string;
  owner_phone: string;
  district: string;
  onboarding_status: string;
  approved_at: string | null;
}
interface Facility { id: string; title: string; district: string | null; address: string | null; capacity: number; available: number; publication_status: string | null; kind: string | null }
interface FloorRow { id: string; facility_id: string; floor_number: number; floor_name: string; floor_type: string; ceiling_height_ft: string | number }
interface ChamberRow { id: string; facility_id: string; chamber_code: string; chamber_name?: string; floor_number?: number; target_temp_f?: string | number; target_rh_percent?: string | number; target_o2_percent?: string | number; target_co2_percent?: string | number }
interface BinRow { id: string; facility_id: string; chamber_code: string; bin_code: string; bin_type: string; max_crates: number; occupied_crates: number; available_crates: number; occupancy_status: string; farmer_allocations: Allocation[] }
interface Allocation { id: string; bin_id: string; bin_code: string; farmer_name: string; apple_variety: string; allocated_crates: number; active_crates: number; released_crates: number; allocation_status: string; received_at: string }
interface BookingRow { id: string; booking_reference: string; facility_id: string; facility_name: string; farmer_name: string; farmer_phone: string; apple_variety: string; requested_crates: number; allocated_crates: number; total_estimated_charge_inr: string | number; booking_status: string; storage_start_date: string; duration_months: number; created_at: string }
interface MovementRow { id: string; farmer_name: string; apple_variety: string; movement_type: string; chamber_code: string; bin_code: string; crates_delta: number; weight_kg_delta: string | number; balance_crates_after: number; recorded_at: string }
interface ReadingRow { id: string; facility_id: string; chamber_code: string; dry_bulb_temp_c: string | number; relative_humidity_percent: string | number; oxygen_o2_percent: string | number | null; carbon_dioxide_co2_percent: string | number | null; alert_status: string; alert_message: string | null; recorded_at: string; reading_source: string }
interface TxnRow { id: string; transaction_reference: string; facility_name: string; farmer_name: string; transaction_type: string; gross_amount_inr: string | number; paid_amount_inr: string | number; outstanding_amount_inr: string | number; payment_status: string; payment_method: string | null; recorded_at: string }
interface StaffRow { id: string; full_name: string; email: string; phone: string; staff_role: string; permissions_matrix: Partial<StaffPermissionsMatrix>; employment_status: string; assigned_facility_id: string | null; last_active_at: string | null }
interface AuditRow { id: string; actor_name: string; actor_role: string; action_category: string; action_summary: string; created_at: string; is_superadmin_oversight_action: boolean }
interface Kpis {
  totalFacilities: number; totalFloors: number; totalChambers: number; totalBins: number;
  totalCapacityCrates: number; occupiedCapacityCrates: number; availableCapacityCrates: number;
  activeBookings: number; pendingBookings: number; pendingReleaseRequests: number; totalFarmersCount: number;
  totalRevenueCollectedInr: number; totalOutstandingInr: number;
}
interface Payload {
  ok: boolean;
  error?: string;
  isSuperadminOversight: boolean;
  organization: Organization | null;
  availableOrganizationsForSwitcher: { id: string; organization_code: string; business_name: string; district: string; onboarding_status: string }[];
  activeFacilityId: string | null;
  facilities: Facility[];
  floors: FloorRow[];
  chambers: ChamberRow[];
  bins: BinRow[];
  sharedAllocations: Allocation[];
  bookings: BookingRow[];
  movements: MovementRow[];
  caReadings: ReadingRow[];
  financialTransactions: TxnRow[];
  staffMembers: StaffRow[];
  auditLogs: AuditRow[];
  ownerKpis: Kpis;
}

const BOOKING_STATUS_TEXT: Record<string, string> = {
  PENDING_OWNER_APPROVAL: 'Pending owner approval',
  APPROVED_AWAITING_RECEIPT: 'Approved · awaiting receipt',
  RECEIVED_AND_BIN_ALLOCATED: 'Received · bins allocated',
  RELEASE_REQUESTED: 'Release requested',
  PARTIALLY_DISPATCHED: 'Partially dispatched',
  DISPATCHED_COMPLETED: 'Dispatched · completed',
  REJECTED_BY_OWNER: 'Rejected',
  CANCELLED: 'Cancelled',
};
const PAY_STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'slate' | 'blue'> = {
  PAID_VERIFIED: 'green',
  PARTIALLY_PAID: 'amber',
  PENDING: 'slate',
  REFUNDED: 'blue',
  FAILED: 'red',
};
const ALERT_TONE: Record<string, 'green' | 'amber' | 'red'> = { NORMAL: 'green', WARNING_THRESHOLD: 'amber', CRITICAL_ALARM: 'red' };

const inr = (n: number | string) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const num = (n: number | string | null | undefined) => Number(n ?? 0).toLocaleString('en-IN');
const when = (iso: string | null) => {
  try {
    return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
  } catch {
    return iso ?? '—';
  }
};
const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function OwnerAdminConsole({ oversightOrgId = null, onAddFacility }: { oversightOrgId?: string | null; onAddFacility?: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(oversightOrgId);
  const [showRegister, setShowRegister] = useState(false);
  const [showStaff, setShowStaff] = useState(false);
  const [editStaff, setEditStaff] = useState<StaffRow | null>(null);
  const [showTxn, setShowTxn] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ scope: 'COLD_STORAGE_OWNER_ADMIN' });
      if (orgId) qs.set('organizationId', orgId);
      if (oversightOrgId) qs.set('oversight', '1');
      const res = await fetch(`/api/admin/hierarchy?${qs.toString()}`, { cache: 'no-store' });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'Could not load the business dashboard.');
      setData(body as Payload);
      setFacilityId((f) => f ?? body.activeFacilityId ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the business dashboard.');
    }
  }, [orgId, oversightOrgId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !data) {
    return <Panel theme={theme} title="Business admin" icon={Building2}><p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p></Panel>;
  }
  if (!data) {
    return <Panel theme={theme} title="Business admin" icon={Building2}><Skeleton label="Loading your business dashboard…" rows={4} height="h-24" /></Panel>;
  }

  // No organization yet: the separate owner onboarding application.
  if (!data.organization) {
    return (
      <Panel theme={theme} title="Business admin" icon={Building2}>
        <EmptyState
          theme={theme}
          icon={Warehouse}
          title="Register your cold storage business"
          text="Your business is the tenant of everything here — facilities, chambers, bins, bookings, farmers, staff and financials. Register it once; the Platform Superadmin verifies it, and then this portal becomes your complete business administration desk."
          action={<Btn theme={theme} icon={PlusCircle} onClick={() => setShowRegister(true)}>Register a cold storage business</Btn>}
        />
        <RegistrationModal open={showRegister} onClose={() => setShowRegister(false)} onDone={(msg) => { setShowRegister(false); setNote(msg); void load(); }} />
        {note && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">{note}</p>}
      </Panel>
    );
  }

  const org = data.organization;
  const k = data.ownerKpis;
  const facilities = data.facilities ?? [];
  const chamberList = (data.chambers ?? []).filter((c) => !facilityId || c.facility_id === facilityId);
  const binList = (data.bins ?? []).filter((b) => !facilityId || b.facility_id === facilityId);
  const readingList = (data.caReadings ?? []).filter((r) => !facilityId || r.facility_id === facilityId);
  const bookingList = data.bookings ?? [];
  const activeFacility = facilities.find((f) => f.id === facilityId) ?? null;

  return (
    <div className="space-y-5">
      {data.isSuperadminOversight && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-400">
          <Eye className="h-4 w-4" aria-hidden />
          👑 PLATFORM SUPERADMIN OVERSIGHT MODE — Inspecting {org.business_name} (All actions are audit-logged; Owner retains full independent access)
        </p>
      )}

      {/* Facility switcher (module 2 entry): an owner with several facilities switches from one account. */}
      <Panel theme={theme} title="Facilities" icon={Warehouse} action={onAddFacility && <Btn theme={theme} variant="soft" size="sm" icon={PlusCircle} onClick={onAddFacility}>Add facility</Btn>}>
        <div className="flex flex-wrap gap-2">
          {facilities.length === 0 && <p className="text-sm text-slate-600">No facility linked to this business yet — add one with the owner wizard.</p>}
          {facilities.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFacilityId(f.id)}
              aria-pressed={facilityId === f.id}
              className={`cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold transition ring-1 ${facilityId === f.id ? 'bg-sky-800 text-white ring-sky-800 shadow' : 'bg-white text-slate-800 ring-slate-300 hover:bg-sky-50'}`}
            >
              {f.title}
              <span className="ml-2 text-[11px] font-medium opacity-80">{f.district ?? ''}</span>
            </button>
          ))}
        </div>
        {data.availableOrganizationsForSwitcher.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold">Business:</span>
            {data.availableOrganizationsForSwitcher.map((o) => (
              <button key={o.id} type="button" onClick={() => { setOrgId(o.id); setFacilityId(null); }} className={`cursor-pointer rounded-lg px-2.5 py-1.5 ring-1 transition ${o.id === org.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}>
                {o.business_name}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* 1. Business overview KPIs */}
      <Panel theme={theme} title="Business overview" icon={Building2}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { label: 'Facilities · Floors · Chambers', value: `${k.totalFacilities} · ${k.totalFloors} · ${k.totalChambers}`, hint: 'Measured spaces in this business' },
            { label: 'Bins', value: num(k.totalBins), hint: 'Physical storage units' },
            { label: 'Capacity', value: `${num(k.totalCapacityCrates)} crates`, hint: `${num(k.occupiedCapacityCrates)} occupied · ${num(k.availableCapacityCrates)} available` },
            { label: 'Farmers served', value: num(k.totalFarmersCount), hint: 'Distinct farmers in the ledger' },
            { label: 'Active bookings', value: num(k.activeBookings), hint: `${num(k.pendingBookings)} pending approval` },
            { label: 'Release requests', value: num(k.pendingReleaseRequests), hint: 'Farmers waiting for dispatch' },
            { label: 'Revenue collected', value: inr(k.totalRevenueCollectedInr), hint: 'Paid & verified' },
            { label: 'Outstanding', value: inr(k.totalOutstandingInr), hint: 'Awaiting payment' },
          ].map((t) => (
            <div key={t.label} className="rounded-2xl bg-white/80 p-4 ring-1 ring-[#E8A317]/25">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.label}</p>
              <p className="mt-1 font-display text-lg font-bold text-slate-900">{t.value}</p>
              <p className="mt-0.5 text-[11px] text-slate-600">{t.hint}</p>
            </div>
          ))}
        </div>
        {note && <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">{note}</p>}
      </Panel>

      {/* 2. Facility management */}
      <Panel theme={theme} title="Facility management" icon={Layers}>
        {activeFacility ? (
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 p-3 ring-1 ring-slate-200">
              <span><strong>{activeFacility.title}</strong> · {activeFacility.district ?? '—'} · {activeFacility.address ?? ''}</span>
              <span className="flex items-center gap-2">
                <Badge tone={activeFacility.publication_status === 'PUBLISHED' || !activeFacility.publication_status ? 'green' : 'amber'}>{titleCase(activeFacility.publication_status ?? 'PUBLISHED')}</Badge>
                <Badge tone="slate">Capacity {num(activeFacility.capacity)} · Free {num(activeFacility.available)}</Badge>
              </span>
            </li>
            {(data.floors ?? []).filter((fl) => fl.facility_id === activeFacility.id).map((fl) => (
              <li key={fl.id} className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200">
                Floor {fl.floor_number}: <strong>{fl.floor_name}</strong> · {titleCase(fl.floor_type)} · ceiling {num(fl.ceiling_height_ft)} ft
              </li>
            ))}
            <li className="text-xs text-slate-500">Building dimensions, floors and operational areas (receiving, grading, sorting, packaging, dispatch, dock) are configured in the owner wizard — open “My cold stores”.</li>
          </ul>
        ) : (
          <p className="text-sm text-slate-600">Pick a facility above to see its floors and publication status.</p>
        )}
      </Panel>

      {/* 3. 3D digital twin architect */}
      <Panel theme={theme} title="3D digital twin architect" icon={Boxes}>
        <p className="text-sm text-slate-600">
          {chamberList.length} chamber{chamberList.length === 1 ? '' : 's'} drawn for {activeFacility?.title ?? 'this business'}: dynamic L-bank / perimeter placement from each chamber's saved wall, doors facing the hall, stacked bins and crates, chamber lighting — the same twin farmers see.
        </p>
        {!oversightOrgId && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn theme={theme} variant="soft" size="sm" icon={Eye} onClick={() => { window.location.href = '/rental/dashboard?as=owner&tab=stores'; }}>Open the 3D twin (My cold stores)</Btn>
            <Btn theme={theme} variant="soft" size="sm" icon={Boxes} onClick={() => { window.location.href = '/rental/dashboard?as=owner&tab=operations'; }}>Chamber diagram & shared bins</Btn>
          </div>
        )}
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          {chamberList.slice(0, 8).map((c) => (
            <li key={c.id}>{c.chamber_code}{c.chamber_name ? ` · ${c.chamber_name}` : ''} — target {num(c.target_temp_f ?? 32)} °F, RH {num(c.target_rh_percent ?? 92)}%, O₂ {num(c.target_o2_percent ?? 1.8)}%, CO₂ {num(c.target_co2_percent ?? 1.5)}%</li>
          ))}
        </ul>
      </Panel>

      {/* 4. Chamber management */}
      <Panel theme={theme} title="Chamber management" icon={ThermometerSnowflake}>
        {chamberList.length === 0 ? (
          <p className="text-sm text-slate-600">No chambers yet for this facility.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Chamber</th><th className="py-2 pr-3">Floor</th><th className="py-2 pr-3">Target temp</th><th className="py-2 pr-3">RH</th><th className="py-2 pr-3">O₂</th><th className="py-2">CO₂</th>
                </tr>
              </thead>
              <tbody>
                {chamberList.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-semibold text-slate-800">{c.chamber_code}{c.chamber_name ? ` · ${c.chamber_name}` : ''}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{c.floor_number ?? 1}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{num(c.target_temp_f ?? 32)} °F</td>
                    <td className="py-2.5 pr-3 text-slate-600">{num(c.target_rh_percent ?? 92)}%</td>
                    <td className="py-2.5 pr-3 text-slate-600">{num(c.target_o2_percent ?? 0)}%</td>
                    <td className="py-2.5 text-slate-600">{num(c.target_co2_percent ?? 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 5. Bin & shared-bin management */}
      <Panel theme={theme} title="Bins & shared-bin allocation" icon={PackageSearch}>
        {binList.length === 0 ? (
          <p className="text-sm text-slate-600">No bins configured yet for this facility.</p>
        ) : (
          <ul className="space-y-3">
            {binList.map((b) => (
              <li key={b.id} className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{b.bin_code} <span className="text-xs font-normal text-slate-500">· {b.chamber_code} · {titleCase(b.bin_type)}</span></span>
                  <span className="text-xs text-slate-600">
                    <Badge tone={b.available_crates > 0 ? 'green' : 'amber'}>{num(b.max_crates)} max · {num(b.occupied_crates)} in · {num(b.available_crates)} free</Badge>
                  </span>
                </div>
                {(b.farmer_allocations ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(b.farmer_allocations ?? []).map((a) => (
                      <Badge key={a.id} tone="blue">{a.farmer_name}: {a.active_crates} crate{a.active_crates === 1 ? '' : 's'} · {a.apple_variety}</Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">Farmers sharing one bin see only their own crates; the owner sees every farmer's slice of the bin.</p>
      </Panel>

      {/* 6. Booking management */}
      <Panel theme={theme} title="Booking management" icon={CalendarCheck}>
        {bookingList.length === 0 ? (
          <p className="text-sm text-slate-600">No bookings in this business yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Reference</th><th className="py-2 pr-3">Farmer</th><th className="py-2 pr-3">Variety</th><th className="py-2 pr-3">Crates</th><th className="py-2 pr-3">Charge</th><th className="py-2 pr-3">Status</th><th className="py-2">Received</th>
                </tr>
              </thead>
              <tbody>
                {bookingList.slice(0, 30).map((b) => (
                  <tr key={b.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-700">{b.booking_reference}</td>
                    <td className="py-2.5 pr-3 text-slate-800">{b.farmer_name}<span className="block text-xs text-slate-500">{b.farmer_phone}</span></td>
                    <td className="py-2.5 pr-3 text-slate-600">{b.apple_variety}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{num(b.requested_crates)} / {num(b.allocated_crates)}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{inr(b.total_estimated_charge_inr)}</td>
                    <td className="py-2.5 pr-3"><Badge tone={b.booking_status === 'DISPATCHED_COMPLETED' ? 'green' : b.booking_status === 'PENDING_OWNER_APPROVAL' ? 'amber' : b.booking_status === 'REJECTED_BY_OWNER' ? 'red' : 'blue'}>{BOOKING_STATUS_TEXT[b.booking_status] ?? b.booking_status}</Badge></td>
                    <td className="py-2.5 text-xs text-slate-500">{when(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">Accept / reject, gate receiving and dispatch run from the owner's own “Bookings to confirm” and “Shared bins & CA desk” tabs, where payment reference checks live. This console shows the whole business queue; {data.isSuperadminOversight ? 'oversight inspection is read-only.' : 'decisions made there are audit-logged.'}</p>
      </Panel>

      {/* 7. Farmer & inventory traceability ledger */}
      <Panel theme={theme} title="Farmer & inventory traceability" icon={Users}>
        {(data.movements ?? []).length === 0 ? (
          <p className="text-sm text-slate-600">No inventory movements recorded yet. Every booking, receiving, allocation and dispatch lands here, immutable.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">When</th><th className="py-2 pr-3">Farmer</th><th className="py-2 pr-3">Movement</th><th className="py-2 pr-3">Place</th><th className="py-2 pr-3">Crates</th><th className="py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(data.movements ?? []).slice(0, 30).map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-slate-500">{when(m.recorded_at)}</td>
                    <td className="py-2.5 pr-3 text-slate-800">{m.farmer_name}<span className="block text-xs text-slate-500">{m.apple_variety}</span></td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600">{titleCase(m.movement_type)}</td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600">{m.chamber_code} · {m.bin_code}</td>
                    <td className={`py-2.5 pr-3 font-semibold ${m.crates_delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{m.crates_delta > 0 ? '+' : ''}{m.crates_delta} ({num(m.weight_kg_delta)} kg)</td>
                    <td className="py-2.5 text-slate-700">{num(m.balance_crates_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 8. Temperature & environmental monitoring */}
      <Panel theme={theme} title="Chamber temperature & CA monitoring" icon={CloudSun}>
        {readingList.length === 0 ? (
          <p className="text-sm text-slate-600">No sensor or operator readings yet for this facility.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Chamber</th><th className="py-2 pr-3">Temp</th><th className="py-2 pr-3">RH</th><th className="py-2 pr-3">O₂</th><th className="py-2 pr-3">CO₂</th><th className="py-2 pr-3">Status</th><th className="py-2">Read at</th>
                </tr>
              </thead>
              <tbody>
                {readingList.slice(0, 20).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-semibold text-slate-800">{r.chamber_code}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{num(r.dry_bulb_temp_c)} °C</td>
                    <td className="py-2.5 pr-3 text-slate-600">{num(r.relative_humidity_percent)}%</td>
                    <td className="py-2.5 pr-3 text-slate-600">{r.oxygen_o2_percent != null ? `${num(r.oxygen_o2_percent)}%` : '—'}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{r.carbon_dioxide_co2_percent != null ? `${num(r.carbon_dioxide_co2_percent)}%` : '—'}</td>
                    <td className="py-2.5 pr-3"><Badge tone={ALERT_TONE[r.alert_status] ?? 'slate'}>{titleCase(r.alert_status)}</Badge>{r.alert_message && <span className="ml-2 text-xs text-slate-500">{r.alert_message}</span>}</td>
                    <td className="py-2.5 text-xs text-slate-500">{when(r.recorded_at)} · {titleCase(r.reading_source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 9. Financial & transaction management */}
      <Panel
        theme={theme}
        title="Financial ledger"
        icon={Landmark}
        action={
          <span className="flex gap-2">
            <Btn theme={theme} variant="soft" size="sm" icon={PlusCircle} onClick={() => setShowTxn(true)}>Record transaction</Btn>
            <Btn theme={theme} variant="soft" size="sm" icon={ClipboardList} onClick={() => downloadCsv(data.financialTransactions ?? [], org.business_name)}>Download CSV report</Btn>
          </span>
        }
      >
        {(data.financialTransactions ?? []).length === 0 ? (
          <p className="text-sm text-slate-600">No transactions recorded yet. Booking charges, handling, advances, settlements and refunds appear here with paid vs. outstanding.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Reference</th><th className="py-2 pr-3">Farmer</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Gross</th><th className="py-2 pr-3">Paid</th><th className="py-2 pr-3">Outstanding</th><th className="py-2 pr-3">Status</th><th className="py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {(data.financialTransactions ?? []).slice(0, 30).map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-700">{t.transaction_reference}</td>
                    <td className="py-2.5 pr-3 text-slate-800">{t.farmer_name}</td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600">{titleCase(t.transaction_type)}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{inr(t.gross_amount_inr)}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{inr(t.paid_amount_inr)}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{inr(t.outstanding_amount_inr)}</td>
                    <td className="py-2.5 pr-3"><Badge tone={PAY_STATUS_TONE[t.payment_status] ?? 'slate'}>{titleCase(t.payment_status)}</Badge></td>
                    <td className="py-2.5 text-xs text-slate-500">{when(t.recorded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* 10. Staff & employee RBAC management */}
      <Panel
        theme={theme}
        title="Staff & employee roles"
        icon={UserCog}
        action={<Btn theme={theme} variant="soft" size="sm" icon={PlusCircle} onClick={() => { setEditStaff(null); setShowStaff(true); }}>Add staff member</Btn>}
      >
        {(data.staffMembers ?? []).length === 0 ? (
          <p className="text-sm text-slate-600">No staff yet. Add your facility, operations, booking, inventory, accounts and technical managers — each gets exactly the permissions their role needs.</p>
        ) : (
          <ul className="space-y-3">
            {(data.staffMembers ?? []).map((s) => (
              <li key={s.id} className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <strong className="text-slate-900">{s.full_name}</strong>
                    <span className="ml-2 text-xs text-slate-500">{s.email} · {s.phone}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone="violet">{titleCase(s.staff_role)}</Badge>
                    <Badge tone={s.employment_status === 'ACTIVE' ? 'green' : s.employment_status === 'SUSPENDED' ? 'red' : 'slate'}>{titleCase(s.employment_status)}</Badge>
                    <Btn theme={theme} variant="soft" size="sm" onClick={() => { setEditStaff(s); setShowStaff(true); }}>Edit</Btn>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(s.permissions_matrix ?? {}).filter(([, on]) => on).map(([perm]) => (
                    <Badge key={perm} tone="slate">{titleCase(perm)}</Badge>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">Last active: {when(s.last_active_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Organization-scoped audit trail */}
      <Panel theme={theme} title="Business audit trail" icon={ShieldCheck}>
        {(data.auditLogs ?? []).length === 0 ? (
          <p className="text-sm text-sm text-slate-600">No administrative actions logged for this business yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(data.auditLogs ?? []).slice(0, 15).map((l) => (
              <li key={l.id} className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200">
                <span className="text-xs text-slate-500">{when(l.created_at)} · {l.actor_name} ({titleCase(l.actor_role)}){l.is_superadmin_oversight_action ? ' · 👑 oversight' : ''}</span>
                <p className="mt-0.5 text-slate-700">{l.action_summary}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <RegistrationModal open={showRegister} onClose={() => setShowRegister(false)} onDone={(msg) => { setShowRegister(false); setNote(msg); void load(); }} />
      <StaffModal
        open={showStaff}
        staff={editStaff}
        organizationId={org.id}
        facilities={facilities}
        onClose={() => setShowStaff(false)}
        onDone={(msg) => { setShowStaff(false); setNote(msg); void load(); }}
      />
      <TxnModal
        open={showTxn}
        organizationId={org.id}
        facilities={facilities}
        defaultFacilityId={facilityId}
        bookings={bookingList}
        onClose={() => setShowTxn(false)}
        onDone={(msg) => { setShowTxn(false); setNote(msg); void load(); }}
      />
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
    </div>
  );
}

/** 1-click financial CSV report (module 9). */
function downloadCsv(txns: TxnRow[], businessName: string) {
  const header = 'transaction_reference,facility,farmer,type,gross_inr,paid_inr,outstanding_inr,payment_status,payment_method,recorded_at';
  const rows = (txns ?? []).map((t) => [
    t.transaction_reference, t.facility_name, t.farmer_name, t.transaction_type,
    Number(t.gross_amount_inr || 0), Number(t.paid_amount_inr || 0), Number(t.outstanding_amount_inr || 0),
    t.payment_status, t.payment_method ?? '', t.recorded_at,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${businessName.replace(/[^a-z0-9]+/gi, '-')}-financial-report.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** The separate owner onboarding application (never touches the Superadmin login). */
function RegistrationModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const [form, setForm] = useState({ businessName: '', legalEntityType: 'PRIVATE_LIMITED', ownerFullName: '', ownerEmail: '', ownerPhone: '', headquartersAddress: '', district: 'Shopian', stateUt: 'Jammu & Kashmir', gstinOrRegNo: '', panNumber: '', upiId: '', bankName: 'J&K Bank', verificationNotes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/hierarchy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'REGISTER_OWNER_ORGANIZATION', ...form }) });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'Registration failed.');
      onDone(`Application submitted: ${body.organization.business_name} (${body.organization.organization_code}) is now PENDING_VERIFICATION with the Platform Superadmin.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Register a cold storage business" wide>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Business name"><input className={INPUT} value={form.businessName} onChange={set('businessName')} placeholder="e.g. Al Noor Agri Fresh Pvt. Ltd." /></Field>
        <Field label="Legal entity type">
          <select className={INPUT} value={form.legalEntityType} onChange={set('legalEntityType')}>
            {['PRIVATE_LIMITED', 'LLP', 'PARTNERSHIP', 'PROPRIETORSHIP', 'COOPERATIVE'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
        </Field>
        <Field label="Owner full name"><input className={INPUT} value={form.ownerFullName} onChange={set('ownerFullName')} /></Field>
        <Field label="Owner email"><input className={INPUT} type="email" value={form.ownerEmail} onChange={set('ownerEmail')} /></Field>
        <Field label="Owner phone"><input className={INPUT} value={form.ownerPhone} onChange={set('ownerPhone')} placeholder="+91…" /></Field>
        <Field label="Headquarters address"><input className={INPUT} value={form.headquartersAddress} onChange={set('headquartersAddress')} /></Field>
        <Field label="District"><input className={INPUT} value={form.district} onChange={set('district')} /></Field>
        <Field label="State / UT"><input className={INPUT} value={form.stateUt} onChange={set('stateUt')} /></Field>
        <Field label="GSTIN / registration no." hint="Optional"><input className={INPUT} value={form.gstinOrRegNo} onChange={set('gstinOrRegNo')} /></Field>
        <Field label="PAN number" hint="Optional"><input className={INPUT} value={form.panNumber} onChange={set('panNumber')} /></Field>
        <Field label="UPI ID for farmer payments" hint="Optional now"><input className={INPUT} value={form.upiId} onChange={set('upiId')} /></Field>
        <Field label="Bank"><input className={INPUT} value={form.bankName} onChange={set('bankName')} /></Field>
        <div className="sm:col-span-2">
          <Field label="Verification notes"><textarea className={INPUT} rows={2} value={form.verificationNotes} onChange={set('verificationNotes')} placeholder="Tell the Platform Superadmin about your facility and licence" /></Field>
        </div>
      </div>
      {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800 ring-1 ring-rose-200">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn theme={theme} variant="soft" onClick={onClose}>Cancel</Btn>
        <Btn theme={theme} disabled={busy} onClick={() => void submit()}>Submit application</Btn>
      </div>
    </Modal>
  );
}

/** Staff & employee RBAC: 8 business roles, granular permission toggles. */
function StaffModal({ open, staff, organizationId, facilities, onClose, onDone }: { open: boolean; staff: StaffRow | null; organizationId: string; facilities: Facility[]; onClose: () => void; onDone: (message: string) => void }) {
  const role = staff?.staff_role ?? 'FACILITY_MANAGER';
  const [form, setForm] = useState({ fullName: staff?.full_name ?? '', email: staff?.email ?? '', phone: staff?.phone ?? '', staffRole: role, assignedFacilityId: staff?.assigned_facility_id ?? '', employmentStatus: staff?.employment_status ?? 'ACTIVE' });
  const [perms, setPerms] = useState<StaffPermissionsMatrix>({ ...ROLE_DEFAULT_PERMISSIONS[role as keyof typeof ROLE_DEFAULT_PERMISSIONS], ...(staff?.permissions_matrix ?? {}) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const roleChanged = (nextRole: string) => {
    setForm((f) => ({ ...f, staffRole: nextRole }));
    setPerms({ ...ROLE_DEFAULT_PERMISSIONS[nextRole as keyof typeof ROLE_DEFAULT_PERMISSIONS] });
  };
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/hierarchy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'UPSERT_OWNER_STAFF', organizationId, ...form, permissionsMatrix: perms }) });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'Could not save the staff member.');
      onDone(`${body.staff.full_name} saved as ${titleCase(body.staff.staff_role)} (audit-logged).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the staff member.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={staff ? `Edit staff · ${staff.full_name}` : 'Add staff member'} wide>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name"><input className={INPUT} value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} /></Field>
        <Field label="Email"><input className={INPUT} type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
        <Field label="Phone"><input className={INPUT} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
        <Field label="Business role" hint="Picking a role loads its default permissions">
          <select className={INPUT} value={form.staffRole} onChange={(e) => roleChanged(e.target.value)}>
            {OWNER_STAFF_ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}
          </select>
        </Field>
        <Field label="Assigned facility" hint="Empty: authorized across all facilities of this business">
          <select className={INPUT} value={form.assignedFacilityId} onChange={(e) => setForm((f) => ({ ...f, assignedFacilityId: e.target.value }))}>
            <option value="">All facilities</option>
            {(facilities ?? []).map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </Field>
        <Field label="Employment status">
          <select className={INPUT} value={form.employmentStatus} onChange={(e) => setForm((f) => ({ ...f, employmentStatus: e.target.value }))}>
            {['ACTIVE', 'INACTIVE', 'SUSPENDED'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
        </Field>
      </div>
      <p className="mt-4 mb-2 text-sm font-semibold text-slate-800">Permissions</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(Object.keys(ROLE_DEFAULT_PERMISSIONS.COLD_STORAGE_OWNER) as (keyof StaffPermissionsMatrix)[]).map((perm) => (
          <label key={perm} className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm text-slate-800 ring-1 ring-slate-200">
            {titleCase(perm)}
            <input type="checkbox" className="h-4 w-4 accent-sky-700" checked={Boolean(perms[perm])} onChange={(e) => setPerms((p) => ({ ...p, [perm]: e.target.checked }))} />
          </label>
        ))}
      </div>
      {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800 ring-1 ring-rose-200">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn theme={theme} variant="soft" onClick={onClose}>Cancel</Btn>
        <Btn theme={theme} disabled={busy} onClick={() => void submit()}>Save staff member</Btn>
      </div>
    </Modal>
  );
}

/** Record a business financial transaction against a farmer (module 9). */
function TxnModal({ open, organizationId, facilities, defaultFacilityId, bookings, onClose, onDone }: { open: boolean; organizationId: string; facilities: Facility[]; defaultFacilityId: string | null; bookings: BookingRow[]; onClose: () => void; onDone: (message: string) => void }) {
  const [form, setForm] = useState({ facilityId: defaultFacilityId ?? facilities[0]?.id ?? '', farmerName: '', bookingId: '', transactionType: 'STORAGE_BOOKING_CHARGE', grossAmountInr: '', paidAmountInr: '', paymentMethod: 'UPI_OR_NEFT', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setForm((f) => ({ ...f, facilityId: f.facilityId || defaultFacilityId || facilities[0]?.id || '' }));
  }, [defaultFacilityId, facilities]);
  const pickedBooking = (bookings ?? []).find((b) => b.id === form.bookingId) ?? null;
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/hierarchy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'RECORD_FINANCIAL_TRANSACTION', organizationId, ...form, facilityName: facilities.find((f) => f.id === form.facilityId)?.title, farmerName: form.farmerName || pickedBooking?.farmer_name || '', bookingReference: pickedBooking?.booking_reference }) });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'Could not record the transaction.');
      onDone(`${body.transaction.transaction_reference} recorded: ${inr(body.transaction.paid_amount_inr)} paid of ${inr(body.transaction.gross_amount_inr)} (${titleCase(body.transaction.payment_status)}).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not record the transaction.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record a financial transaction" wide>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Facility">
          <select className={INPUT} value={form.facilityId} onChange={(e) => setForm((f) => ({ ...f, facilityId: e.target.value }))}>
            {(facilities ?? []).map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </Field>
        <Field label="Link a booking" hint="Optional — fills the farmer and reference">
          <select className={INPUT} value={form.bookingId} onChange={(e) => setForm((f) => ({ ...f, bookingId: e.target.value, farmerName: (bookings ?? []).find((b) => b.id === e.target.value)?.farmer_name ?? f.farmerName }))}>
            <option value="">No booking link</option>
            {(bookings ?? []).slice(0, 30).map((b) => <option key={b.id} value={b.id}>{b.booking_reference} · {b.farmer_name}</option>)}
          </select>
        </Field>
        <Field label="Farmer name"><input className={INPUT} value={form.farmerName} onChange={(e) => setForm((f) => ({ ...f, farmerName: e.target.value }))} /></Field>
        <Field label="Transaction type">
          <select className={INPUT} value={form.transactionType} onChange={(e) => setForm((f) => ({ ...f, transactionType: e.target.value }))}>
            {['STORAGE_BOOKING_CHARGE', 'HANDLING_AND_GRADING_CHARGE', 'PARTIAL_ADVANCE_PAYMENT', 'FINAL_SETTLEMENT', 'REFUND'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
        </Field>
        <Field label="Gross amount (₹)"><input className={INPUT} type="number" min="0" value={form.grossAmountInr} onChange={(e) => setForm((f) => ({ ...f, grossAmountInr: e.target.value }))} /></Field>
        <Field label="Paid amount (₹)"><input className={INPUT} type="number" min="0" value={form.paidAmountInr} onChange={(e) => setForm((f) => ({ ...f, paidAmountInr: e.target.value }))} /></Field>
        <Field label="Payment method"><input className={INPUT} value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} /></Field>
        <Field label="Notes" hint="Optional"><input className={INPUT} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
      </div>
      {err && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800 ring-1 ring-rose-200">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Btn theme={theme} variant="soft" onClick={onClose}>Cancel</Btn>
        <Btn theme={theme} disabled={busy} onClick={() => void submit()}>Record transaction</Btn>
      </div>
    </Modal>
  );
}
