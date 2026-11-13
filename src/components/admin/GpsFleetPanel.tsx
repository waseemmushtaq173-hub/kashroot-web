'use client';

/**
 * Super Admin oversight of the live GPS tracking system (admin dashboard only):
 * registered drivers and vehicles with honest verification states, every
 * tracking session (LIVE / STALE / STOPPED / DELIVERED), AIS-140 devices
 * (UNVERIFIED -> AIS140_VERIFIED_BY_ADMIN) and the tamper-evident audit log.
 * Data comes from the tracking portal API in SUPER_ADMIN_OVERVIEW mode; the
 * API re-checks the team pass server-side for every call.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Satellite, ShieldCheck, ShieldX, Truck } from 'lucide-react';

interface DriverRow {
  id: string;
  full_name: string;
  phone: string;
  license_number: string;
  license_category: string;
  home_district: string | null;
  account_status: string;
  created_at: string;
}

interface VehicleRow {
  id: string;
  registration_number: string;
  vehicle_category: string;
  make_and_model: string;
  owner_name: string;
  verification_status: string;
  is_active: boolean;
}

interface ShipmentRow {
  id: string;
  shipment_tracking_id: string;
  commodity_name: string;
  origin_name: string;
  destination_name: string;
  shipment_status: string;
  distance_travelled_km: number;
  remaining_distance_km: number;
}

interface SessionRow {
  id: string;
  shipment_id: string;
  vehicle_id: string;
  tracking_status: string;
  last_latitude: number | null;
  last_longitude: number | null;
  last_speed_kmh: number | null;
  last_location_update_at: string | null;
  source_type: string;
}

interface DeviceRow {
  id: string;
  device_imei_or_serial: string;
  vehicle_id: string | null;
  provider_name: string;
  device_protocol: string;
  ais140_certification_status: string;
}

interface EventRow {
  id: string;
  event_type: string;
  event_message: string;
  created_at: string;
}

interface Overview {
  ok: boolean;
  drivers: DriverRow[];
  vehicles: VehicleRow[];
  shipments: ShipmentRow[];
  sessions: SessionRow[];
  devices: DeviceRow[];
  events: EventRow[];
}

const card = 'rounded-2xl bg-white p-5 ring-1 ring-slate-200';
const th = 'px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500';
const td = 'px-3 py-2 text-xs text-slate-700';

const statusChip = (s: string) => {
  if (s === 'LIVE') return 'bg-emerald-100 text-emerald-800';
  if (s === 'STALE' || s === 'UPDATING') return 'bg-amber-100 text-amber-800';
  if (s === 'DELIVERED') return 'bg-teal-100 text-teal-800';
  if (s === 'GPS_PERMISSION_DENIED') return 'bg-rose-100 text-rose-800';
  if (s === 'ADMIN_APPROVED' || s === 'AIS140_VERIFIED_BY_ADMIN' || s === 'ACTIVE') return 'bg-sky-100 text-sky-800';
  if (s === 'REJECTED' || s === 'SUSPENDED') return 'bg-rose-100 text-rose-800';
  return 'bg-slate-100 text-slate-700';
};

export function GpsFleetPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tracking/portal?mode=SUPER_ADMIN_OVERVIEW&admin=1', { cache: 'no-store' });
      const json = (await res.json()) as Overview & { error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || 'Could not load the fleet overview.');
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError('Network error loading the fleet overview.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approveVehicle = async (vehicleId: string, status: 'ADMIN_APPROVED' | 'REJECTED') => {
    setMsg(null);
    try {
      const res = await fetch('/api/tracking/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ADMIN_APPROVE_VEHICLE', vehicleId, status }),
      });
      const json = await res.json();
      setMsg(json.ok ? `Vehicle ${status === 'ADMIN_APPROVED' ? 'approved' : 'rejected'}.` : json.error || 'Action failed.');
      await load();
    } catch {
      setMsg('Network error.');
    }
  };

  const verifyDevice = async (deviceId: string, status: 'AIS140_VERIFIED_BY_ADMIN' | 'UNVERIFIED') => {
    setMsg(null);
    try {
      const res = await fetch('/api/tracking/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ADMIN_VERIFY_GPS_DEVICE', deviceId, status }),
      });
      const json = await res.json();
      setMsg(json.ok ? `Device ${status === 'AIS140_VERIFIED_BY_ADMIN' ? 'certified as AIS-140 verified' : 'reset to UNVERIFIED'}.` : json.error || 'Action failed.');
      await load();
    } catch {
      setMsg('Network error.');
    }
  };

  if (error) {
    return (
      <div className={card}>
        <p className="text-sm text-rose-700">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={card}>
        <p className="text-sm text-slate-500">{busy ? 'Loading the live fleet…' : 'No data yet.'}</p>
      </div>
    );
  }

  const liveCount = data.sessions.filter((s) => s.tracking_status === 'LIVE').length;
  const pendingVehicles = data.vehicles.filter((v) => v.verification_status === 'SELF_DECLARED' || v.verification_status === 'DOCUMENTS_UPLOADED');
  const unverifiedDevices = data.devices.filter((d) => d.ais140_certification_status === 'UNVERIFIED');
  const shipmentById = new Map(data.shipments.map((s) => [s.id, s]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-900 px-3 py-1.5 font-bold text-white">Drivers {data.drivers.length}</span>
          <span className="rounded-full bg-slate-900 px-3 py-1.5 font-bold text-white">Vehicles {data.vehicles.length}</span>
          <span className="rounded-full bg-emerald-600 px-3 py-1.5 font-bold text-white">LIVE sessions {liveCount}</span>
          <span className="rounded-full bg-slate-900 px-3 py-1.5 font-bold text-white">Devices {data.devices.length}</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800"
        >
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {msg && <div className="rounded-xl bg-sky-50 px-4 py-2.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">{msg}</div>}

      {/* Vehicles: honest verification states, approve or reject */}
      <div className={card}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Truck size={15} /> Registered vehicles
          {pendingVehicles.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{pendingVehicles.length} awaiting review</span>}
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className={th}>Registration</th>
                <th className={th}>Category / Model</th>
                <th className={th}>Owner</th>
                <th className={th}>Verification</th>
                <th className={th}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.vehicles.length === 0 && (
                <tr><td className={td} colSpan={5}>No vehicles registered yet.</td></tr>
              )}
              {data.vehicles.map((v) => (
                <tr key={v.id}>
                  <td className={`${td} font-mono font-bold`}>{v.registration_number}</td>
                  <td className={td}>{v.vehicle_category} · {v.make_and_model}</td>
                  <td className={td}>{v.owner_name}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusChip(v.verification_status)}`}>{v.verification_status}</span>
                  </td>
                  <td className={td}>
                    {v.verification_status === 'ADMIN_APPROVED' ? (
                      <button type="button" onClick={() => void approveVehicle(v.id, 'SELF_DECLARED')} className="text-[11px] font-semibold text-slate-500 underline">Reset to SELF_DECLARED</button>
                    ) : v.verification_status === 'REJECTED' ? (
                      <button type="button" onClick={() => void approveVehicle(v.id, 'ADMIN_APPROVED')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"><ShieldCheck size={12} /> Approve</button>
                    ) : (
                      <span className="inline-flex gap-1.5">
                        <button type="button" onClick={() => void approveVehicle(v.id, 'ADMIN_APPROVED')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"><ShieldCheck size={12} /> Approve</button>
                        <button type="button" onClick={() => void approveVehicle(v.id, 'REJECTED')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white"><ShieldX size={12} /> Reject</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drivers */}
      <div className={card}>
        <h3 className="text-sm font-bold text-slate-900">Registered drivers</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Phone</th>
                <th className={th}>License</th>
                <th className={th}>District</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.drivers.length === 0 && (
                <tr><td className={td} colSpan={5}>No drivers registered yet.</td></tr>
              )}
              {data.drivers.map((d) => (
                <tr key={d.id}>
                  <td className={`${td} font-semibold`}>{d.full_name}</td>
                  <td className={`${td} font-mono`}>{d.phone}</td>
                  <td className={`${td} font-mono`}>{d.license_number} · {d.license_category}</td>
                  <td className={td}>{d.home_district ?? '—'}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusChip(d.account_status)}`}>{d.account_status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tracking sessions */}
      <div className={card}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Satellite size={15} /> Tracking sessions
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className={th}>Shipment</th>
                <th className={th}>Status</th>
                <th className={th}>Last position</th>
                <th className={th}>Speed</th>
                <th className={th}>Last ping</th>
                <th className={th}>Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.sessions.length === 0 && (
                <tr><td className={td} colSpan={6}>No tracking sessions yet.</td></tr>
              )}
              {data.sessions.map((s) => (
                <tr key={s.id}>
                  <td className={`${td} font-mono`}>{shipmentById.get(s.shipment_id)?.shipment_tracking_id ?? s.shipment_id.slice(0, 8)}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusChip(s.tracking_status)}`}>{s.tracking_status}</span>
                  </td>
                  <td className={`${td} font-mono`}>
                    {s.last_latitude !== null && s.last_longitude !== null ? `${Number(s.last_latitude).toFixed(4)}, ${Number(s.last_longitude).toFixed(4)}` : '—'}
                  </td>
                  <td className={td}>{s.last_speed_kmh !== null ? `${s.last_speed_kmh} km/h` : '—'}</td>
                  <td className={td}>{s.last_location_update_at ? new Date(s.last_location_update_at).toLocaleString() : '—'}</td>
                  <td className={td}>{s.source_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AIS-140 devices */}
      <div className={card}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Satellite size={15} /> AIS-140 / telematics devices
          {unverifiedDevices.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{unverifiedDevices.length} UNVERIFIED</span>}
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className={th}>IMEI / Serial</th>
                <th className={th}>Provider</th>
                <th className={th}>Protocol</th>
                <th className={th}>Certification</th>
                <th className={th}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.devices.length === 0 && (
                <tr><td className={td} colSpan={5}>No devices paired yet.</td></tr>
              )}
              {data.devices.map((d) => (
                <tr key={d.id}>
                  <td className={`${td} font-mono font-bold`}>{d.device_imei_or_serial}</td>
                  <td className={td}>{d.provider_name}</td>
                  <td className={td}>{d.device_protocol}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusChip(d.ais140_certification_status)}`}>{d.ais140_certification_status}</span>
                  </td>
                  <td className={td}>
                    {d.ais140_certification_status === 'UNVERIFIED' ? (
                      <button type="button" onClick={() => void verifyDevice(d.id, 'AIS140_VERIFIED_BY_ADMIN')} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-bold text-white"><ShieldCheck size={12} /> Certify AIS-140</button>
                    ) : (
                      <button type="button" onClick={() => void verifyDevice(d.id, 'UNVERIFIED')} className="text-[11px] font-semibold text-slate-500 underline">Reset</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tamper-evident audit log */}
      <div className={card}>
        <h3 className="text-sm font-bold text-slate-900">Audit log (tracking events)</h3>
        <div className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto text-xs">
          {data.events.length === 0 && <p className="py-3 text-slate-500">No events recorded yet.</p>}
          {data.events.map((ev) => (
            <div key={ev.id} className="py-2">
              <div className="flex items-center justify-between font-bold text-slate-800">
                <span>{ev.event_type}</span>
                <span className="text-[11px] font-normal text-slate-500">{new Date(ev.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-0.5 text-slate-600">{ev.event_message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
