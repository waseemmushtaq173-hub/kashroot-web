'use client';

/**
 * Tracking portal.
 *   Track a load: enter the KashRoot consignment code → live position from
 *     the driver's phone (no government access needed).
 *   My consignments: transporters create a consignment and send the driver
 *     link (driver's phone shares GPS) and the tracking link (buyer / farmer).
 *   Vehicle number: official details from VAHAN and FASTag toll crossings
 *     through ULIP (Govt. of India) via /api/vehicle — needs ULIP access;
 *     FASTag is not live GPS, so the "last seen" point is the latest toll plaza.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle2, Clock, Copy, FileText, Loader2, MapPinned, MessageCircle, PlusCircle, Search, Share2, TriangleAlert, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, Field, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { LiveTrack } from '@/components/tracking/LiveTrack';
import { authFetch } from '@/lib/auth-fetch';
import { ago as agoIso } from '@/lib/db/client';
import { createConsignment, driverUrl, myConsignments, setConsignmentStatus, STATUS_LABEL, trackUrl, type Consignment } from '@/lib/db/consignments';

const RouteMap = dynamic(() => import('@/components/tracking/RouteMap'), {
  ssr: false,
  loading: () => <div className="h-[24rem] animate-pulse rounded-2xl bg-slate-100" />,
});

const theme = PORTAL_THEMES.tracking;

interface Crossing {
  time: string;
  plaza: string;
  lat: number | null;
  lng: number | null;
  direction: string;
}
interface VehicleResult {
  number: string;
  details: { fields: { label: string; value: string }[] } | null;
  crossings: Crossing[] | null;
  fetchedAt: string;
  source: string;
}

/** FASTag times arrive as "2026-10-09 14:22:10" (IST). */
function ago(time: string): string {
  const t = Date.parse(time.replace(' ', 'T') + '+05:30');
  if (!Number.isFinite(t)) return time;
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
}

function VehicleLookup() {
  const [plate, setPlate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ text: string; setup?: boolean } | null>(null);
  const [result, setResult] = useState<VehicleResult | null>(null);

  const track = async (e?: FormEvent) => {
    e?.preventDefault();
    const number = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (number.length < 6) return setError({ text: 'Enter the full registration number, e.g. JK01AB1234.' });
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/vehicle?number=${encodeURIComponent(number)}`);
      const data = await res.json();
      if (!res.ok) {
        setResult(null);
        setError({ text: data.error ?? 'Lookup failed.', setup: data.configured === false });
      } else setResult(data as VehicleResult);
    } catch {
      setError({ text: 'Could not reach the tracking service. Check your connection.' });
    } finally {
      setLoading(false);
    }
  };

  const mapped = (result?.crossings ?? []).filter((c): c is Crossing & { lat: number; lng: number } => c.lat !== null && c.lng !== null);
  const last = result?.crossings?.[result.crossings.length - 1];

  const share = async () => {
    if (!result || !last) return;
    const text = `${result.number} last crossed ${last.plaza} (${last.time}, ${ago(last.time)}) — via KashRoot tracking`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success('Status copied — paste it to your buyer');
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <>
      <Panel theme={theme} title="Look up a vehicle number" icon={Search}>
        <p className="mb-4 text-sm text-slate-600">Official registration details (VAHAN) and FASTag toll crossings through the Government’s ULIP platform. For live position, use a KashRoot consignment code instead.</p>
        <form onSubmit={track} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="plate" className="sr-only">Vehicle registration number</label>
          <input
            id="plate"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Registration number, e.g. JK01AB1234"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT} flex-1 font-mono text-base uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`}
          />
          <Btn theme={theme} type="submit" icon={loading ? Loader2 : Truck} disabled={loading}>
            {loading ? 'Looking up…' : 'Track vehicle'}
          </Btn>
        </form>
        {error && (
          <div role="alert" className={`mt-4 flex items-start gap-2 rounded-2xl p-4 text-sm ring-1 ${error.setup ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-rose-50 text-rose-800 ring-rose-200'}`}>
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error.text}
          </div>
        )}
      </Panel>

      {!result && !error && (
        <div className="mt-6">
          <EmptyState theme={theme} icon={MapPinned} title="Real data only" text="Details come from the national vehicle registry (VAHAN) and the route from FASTag toll crossings, through the Government's ULIP platform." />
        </div>
      )}

      {result && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Panel
            theme={theme}
            title="Route so far"
            icon={MapPinned}
            action={last ? <Btn theme={theme} size="sm" variant="soft" icon={Share2} onClick={share}>Share status</Btn> : undefined}
          >
            {mapped.length > 0 ? (
              <>
                <RouteMap crossings={mapped} />
                <p className="mt-2 text-xs text-slate-500">Dots are toll plazas the vehicle crossed. Between plazas its exact position is not known.</p>
              </>
            ) : (
              <EmptyState theme={theme} icon={MapPinned} title="No toll crossings found" text="No FASTag crossings were reported for this vehicle in the last ~72 hours — it may be parked, on roads without tolls, or its tag may be inactive." />
            )}
            {result.crossings && result.crossings.length > 0 && (
              <ol className="mt-5 space-y-3 border-l-2 border-cyan-200 pl-5">
                {[...result.crossings].reverse().map((c) => (
                  <li key={c.time + c.plaza} className="relative">
                    <span aria-hidden className="absolute -left-[27px] top-1 h-4 w-4 rounded-full bg-cyan-600 ring-4 ring-white" />
                    <p className="text-sm font-semibold text-slate-900">{c.plaza}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-500"><Clock className="h-3.5 w-3.5" aria-hidden /> {c.time} · {ago(c.time)}{c.direction ? ` · ${c.direction}` : ''}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          <Panel theme={theme} title="Registration details" icon={FileText}>
            {result.details && result.details.fields.length > 0 ? (
              <dl className="grid gap-2.5 text-sm">
                {result.details.fields.map((f) => (
                  <div key={f.label} className="flex justify-between gap-3 border-b border-slate-900/5 pb-2">
                    <dt className="text-slate-500">{f.label}</dt>
                    <dd className="text-right font-medium text-slate-900">{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-slate-600">VAHAN returned no details for this number.</p>
            )}
            <p className="mt-4 text-xs text-slate-500">
              <Badge tone="blue">Official</Badge> {result.source}. Owner and contact details are never shown.
            </p>
          </Panel>
        </div>
      )}
    </>
  );
}

export default function TrackingPage() {
  const [tab, setTab] = useState('track');
  const [code, setCode] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [mine, setMine] = useState<Consignment[]>([]);

  const reload = useCallback(async () => {
    try {
      setMine(await myConsignments());
    } catch {
      setMine([]);
    }
  }, []);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await reload();
    };
    void run();
    return () => {
      live = false;
    };
  }, [reload]);

  const moving = mine.filter((c) => c.status === 'in_transit').length;

  return (
    <PortalShell
      theme="tracking"
      eyebrow="Consignment tracking"
      title="Where is my load?"
      description="Live position from the driver’s phone with a KashRoot consignment code — or official vehicle details by registration number."
      kpis={[
        { label: 'Your consignments', value: String(mine.length), trend: `${moving} on the way` },
        { label: 'Delivered', value: String(mine.filter((c) => c.status === 'delivered').length), trend: 'Marked by the driver' },
        { label: 'Tracking', value: active ?? '—', trend: active ? 'Updates every 30 s' : 'Enter a code' },
      ]}
      tabs={[
        { id: 'track', label: 'Track a load', icon: MapPinned },
        { id: 'mine', label: 'My consignments', icon: Truck, count: moving || undefined },
        { id: 'vehicle', label: 'Vehicle number', icon: FileText },
      ]}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === 'track' && (
        <div className="space-y-6">
          <Panel theme={theme} title="Track with a consignment code" icon={Search}>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 4) setActive(code.trim().toUpperCase()); }}>
              <label htmlFor="track-code" className="sr-only">Consignment code</label>
              <input id="track-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code from your transporter, e.g. KR-7F3K9Q2A" autoCapitalize="characters" className={`${INPUT} flex-1 font-mono text-base uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`} />
              <Btn theme={theme} type="submit" icon={MapPinned}>Track</Btn>
            </form>
          </Panel>
          {active ? <LiveTrack key={active} code={active} /> : <EmptyState theme={theme} icon={MapPinned} title="Live position from the driver’s phone" text="Your transporter gives you a KashRoot code. The driver’s phone shares the truck’s position while it drives — no app needed." />}
        </div>
      )}
      {tab === 'mine' && <MyConsignments list={mine} onChange={() => void reload()} onTrack={(c) => { setActive(c); setCode(c); setTab('track'); }} />}
      {tab === 'vehicle' && <VehicleLookup />}
    </PortalShell>
  );
}

function MyConsignments({ list, onChange, onTrack }: { list: Consignment[]; onChange: () => void; onTrack: (code: string) => void }) {
  const [form, setForm] = useState({ origin: '', destination: '', cargo: '', vehicle_no: '', driver_name: '', driver_phone: '' });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (form.origin.trim().length < 2 || form.destination.trim().length < 2) return toast.error('Add where the load starts and where it goes.');
    setBusy(true);
    try {
      const c = await createConsignment({ ...form, origin: form.origin.trim(), destination: form.destination.trim(), driver_phone: form.driver_phone.replace(/\D/g, '').slice(-10) || undefined });
      toast.success(`Consignment ${c.code} created — send the driver link to the driver`);
      setForm({ origin: '', destination: '', cargo: '', vehicle_no: '', driver_name: '', driver_phone: '' });
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy — press and hold the link to copy it.');
    }
  };
  const whatsapp = (phone: string | null, text: string) => {
    const digits = (phone ?? '').replace(/\D/g, '').slice(-10);
    window.open(`https://wa.me/${/^[6-9]\d{9}$/.test(digits) ? `91${digits}` : ''}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <Panel theme={theme} title="New consignment" icon={PlusCircle}>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><input className={INPUT} value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="e.g. Shopian" /></Field>
            <Field label="To"><input className={INPUT} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="e.g. Azadpur, Delhi" /></Field>
          </div>
          <Field label="Load (optional)"><input className={INPUT} value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="e.g. 600 boxes Delicious apple" /></Field>
          <Field label="Truck number (optional)"><input className={`${INPUT} uppercase`} value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} placeholder="e.g. JK22A1234" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Driver’s name"><input className={INPUT} value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} /></Field>
            <Field label="Driver’s mobile"><input type="tel" className={INPUT} value={form.driver_phone} onChange={(e) => setForm({ ...form, driver_phone: e.target.value })} /></Field>
          </div>
          <Btn theme={theme} type="submit" icon={PlusCircle} disabled={busy}>{busy ? 'Creating…' : 'Create and get links'}</Btn>
        </form>
      </Panel>
      <Panel theme={theme} title="Your consignments" icon={Truck}>
        {list.length === 0 ? (
          <EmptyState theme={theme} icon={Truck} title="None yet" text="Create a consignment, send the driver link to the driver on WhatsApp, and share the tracking link with your buyer or farmer." />
        ) : (
          <ul className="space-y-3">
            {list.map((c) => {
              const driverText = `KashRoot: please open this link on your phone during the trip ${c.origin} → ${c.destination} and tap “Start sharing location”: ${driverUrl(c.driver_token)}`;
              const buyerText = `Track my load ${c.origin} → ${c.destination} live on KashRoot: ${trackUrl(c.code)}`;
              return (
                <li key={c.code} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{c.origin} → {c.destination}</p>
                      <p className="font-mono text-sm text-slate-700">{c.code}</p>
                      <p className="text-xs text-slate-500">{[c.cargo, c.vehicle_no, c.driver_name].filter(Boolean).join(' · ') || 'No details'}{c.last_seen ? ` · last position ${agoIso(c.last_seen)}` : ''}</p>
                    </div>
                    <Badge tone={c.status === 'in_transit' ? 'blue' : c.status === 'delivered' ? 'green' : c.status === 'cancelled' ? 'slate' : 'amber'}>{STATUS_LABEL[c.status]}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Btn theme={theme} size="sm" icon={MessageCircle} onClick={() => whatsapp(c.driver_phone, driverText)}>Send driver link</Btn>
                    <Btn theme={theme} size="sm" variant="soft" icon={Copy} onClick={() => void copy(driverUrl(c.driver_token))}>Copy driver link</Btn>
                    <Btn theme={theme} size="sm" variant="soft" icon={Share2} onClick={() => whatsapp(null, buyerText)}>Share tracking</Btn>
                    <Btn theme={theme} size="sm" variant="ghost" icon={MapPinned} onClick={() => onTrack(c.code)}>Track</Btn>
                    {c.status !== 'delivered' && c.status !== 'cancelled' && (
                      <Btn theme={theme} size="sm" variant="ghost" icon={CheckCircle2} onClick={() => void setConsignmentStatus(c.code, 'delivered').then(onChange, (e: Error) => toast.error(e.message))}>Mark delivered</Btn>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-4 text-xs text-slate-500">The driver link is private — only send it to the driver. Anyone with the tracking link or code can see where the load is.</p>
      </Panel>
    </div>
  );
}
