'use client';

/**
 * Consignment tracking by vehicle registration number — real data only:
 *   - registration details from VAHAN,
 *   - the route so far from FASTag toll-plaza crossings,
 * both through ULIP (Govt. of India) via /api/vehicle. FASTag is not live GPS:
 * the "last seen" point is the latest toll plaza the vehicle crossed, and the
 * page says when that was.
 */
import { useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { Clock, FileText, Loader2, MapPinned, Search, Share2, TriangleAlert, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { authFetch } from '@/lib/auth-fetch';

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

export default function TrackingPage() {
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
    <PortalShell
      theme="tracking"
      eyebrow="Consignment tracking"
      title="Where is my load?"
      description="Enter the truck’s registration number to see its official details and the toll plazas it has crossed on the way to market."
      kpis={[
        { label: 'Vehicle', value: result?.number ?? '—', trend: result ? 'Registration verified via VAHAN' : 'Enter a number' },
        { label: 'Last seen', value: last ? last.plaza : '—', trend: last ? ago(last.time) : 'FASTag toll crossings' },
        { label: 'Toll crossings', value: result?.crossings ? String(result.crossings.length) : '—', trend: 'Last ~72 hours' },
      ]}
    >
      <Panel theme={theme} title="Track a vehicle" icon={Search}>
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
    </PortalShell>
  );
}
