'use client';

/**
 * DriverConsole — the "Driver console" tab of the Tracking portal (Phase 5):
 * the RTO authorized-fleet registry and its CSV import.
 *
 *   • Fleet list — every registered vehicle (GET ?fleet=1, 500 newest).
 *   • Import — a CSV from the state transport corporation / VAHAN export,
 *     parsed in the browser and upserted through POST FLEET_IMPORT
 *     (registration number is the key, at most 500 rows per call).
 *   • Check — one registration number against the registry (GET ?fleetCheck=),
 *     the same lookup the tracking API does when a trip is created.
 *
 * A vehicle in the registry makes new trips show "RTO-verified" on the trip
 * card and fills the trip's rto_metadata from the record.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { CheckCircle2, FileUp, Loader2, Search, ShieldCheck, TriangleAlert, Truck, XCircle } from 'lucide-react';
import { toast } from '@/lib/client/toast';
import { Badge, Btn, EmptyState, Field, INPUT, Panel, PORTAL_THEMES } from '@/components/portal/kit';

const theme = PORTAL_THEMES.tracking;

interface FleetRow {
  id: string;
  vehicle_registration_no: string;
  vehicle_type: string | null;
  owner_name: string | null;
  rto_office: string | null;
  rto_code: string | null;
  fitness_valid_upto: string | null;
  permit_type: string | null;
  permit_valid_upto: string | null;
  insurance_valid_upto: string | null;
  fuel_type: string | null;
  source: string;
  updated_at: string;
}

/** CSV header → payload field (a few common spellings each). */
const HEADER_ALIASES: Record<string, string> = {
  registration: 'vehicleRegistrationNo',
  regno: 'vehicleRegistrationNo',
  reg_no: 'vehicleRegistrationNo',
  reg_number: 'vehicleRegistrationNo',
  vehicle_registration_no: 'vehicleRegistrationNo',
  vehicle_registration: 'vehicleRegistrationNo',
  vehicletype: 'vehicleType',
  vehicle_type: 'vehicleType',
  owner: 'ownerName',
  owner_name: 'ownerName',
  rto_office: 'rtoOffice',
  rtooffice: 'rtoOffice',
  rto_code: 'rtoCode',
  rto: 'rtoCode',
  fitness_valid_upto: 'fitnessValidUpto',
  fitness: 'fitnessValidUpto',
  permit_type: 'permitType',
  permit: 'permitType',
  permit_valid_upto: 'permitValidUpto',
  insurance_valid_upto: 'insuranceValidUpto',
  insurance: 'insuranceValidUpto',
  fuel_type: 'fuelType',
  fuel: 'fuelType',
};

/** One CSV line → fields, honouring "quoted, commas". */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string): { rows: Record<string, string>[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], skipped: 0 };
  const headers = splitCsvLine(lines[0]).map((h) => HEADER_ALIASES[h.toLowerCase().replace(/[\s-]+/g, '_').replace(/_/g, '')] ?? HEADER_ALIASES[h.toLowerCase().replace(/[\s-]+/g, '_')] ?? '');
  const rows: Record<string, string>[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h && cells[i]) row[h] = cells[i];
    });
    if (row.vehicleRegistrationNo) rows.push(row);
    else skipped++;
  }
  return { rows, skipped };
}

const TEMPLATE = `vehicle_registration_no,vehicle_type,owner_name,rto_office,rto_code,fitness_valid_upto,permit_type,permit_valid_upto,insurance_valid_upto,fuel_type
JK01AB1234,TRUCK,Mudasir Ahmad,Shopian,JK01,2027-03-31,NATIONAL_PERMIT,2027-03-31,2026-12-15,DIESEL
JK02XY5678,REFRIGERATED_TRUCK,Truck Owners Assoc Srinagar,Srinagar,JK02,2026-11-30,NATIONAL_PERMIT,2026-11-30,2026-10-01,DIESEL`;

export function DriverConsole() {
  const [fleet, setFleet] = useState<FleetRow[] | null>(null);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [reg, setReg] = useState('');
  const [check, setCheck] = useState<{ found: boolean; vehicle: FleetRow | null; done: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/logistics/track?fleet=1');
      const data = (await res.json()) as { ok: boolean; vehicles?: FleetRow[] };
      setFleet(data.ok ? data.vehicles ?? [] : []);
    } catch {
      setFleet([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const importRows = async (raw: string) => {
    const { rows, skipped } = parseCsv(raw);
    if (!rows.length) {
      toast.error('No importable rows — the CSV needs a vehicle_registration_no (or "registration") column.');
      return;
    }
    setImporting(true);
    let imported = 0;
    try {
      for (let i = 0; i < rows.length; i += 500) {
        const res = await fetch('/api/logistics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'FLEET_IMPORT', rows: rows.slice(i, i + 500) }),
        });
        const data = (await res.json()) as { ok: boolean; imported?: number; error?: string };
        if (!data.ok) {
          toast.error(data.error ?? 'The import was not accepted.');
          break;
        }
        imported += data.imported ?? 0;
      }
      if (imported > 0) {
        toast.success(`${imported} vehicle${imported === 1 ? '' : 's'} imported into the RTO fleet registry`);
        setCsvText('');
        if (fileRef.current) fileRef.current.value = '';
        void reload();
      }
      if (skipped > 0) toast.info(`${skipped} row${skipped === 1 ? '' : 's'} skipped — no registration number.`);
    } catch {
      toast.error('Could not reach the tracking service. Check your connection.');
    } finally {
      setImporting(false);
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => void importRows(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const checkReg = (e: FormEvent) => {
    e.preventDefault();
    const r = reg.trim().toUpperCase();
    if (!r) return;
    setCheck(null);
    fetch(`/api/logistics/track?fleetCheck=${encodeURIComponent(r)}`)
      .then((res) => res.json() as Promise<{ ok: boolean; found: boolean; vehicle: FleetRow | null }>)
      .then((data) => setCheck({ found: data.found, vehicle: data.vehicle, done: true }))
      .catch(() => setCheck({ found: false, vehicle: null, done: true }));
  };

  return (
    <div className="space-y-6">
      <Panel theme={theme} title="RTO fleet registry" icon={ShieldCheck}>
        <p className="text-sm text-slate-600">
          Vehicles registered here are verified against the RTO record the moment a trip is created — the trip card then
          shows an <strong>RTO-verified vehicle</strong> badge and carries the registry details. Import the fleet CSV from
          the transport corporation, or check one number below.
        </p>
      </Panel>

      <Panel theme={theme} title="Import the fleet CSV" icon={FileUp}>
        <div className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="cursor-pointer">
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="sr-only" />
              <span className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 ring-1 ring-slate-900/10 hover:bg-slate-50">
                <FileUp className="h-4 w-4" aria-hidden /> Choose a CSV file…
              </span>
            </label>
            <p className="text-xs text-slate-500">…or paste the rows below. Registration number is required; the rest is optional.</p>
          </div>
          <Field label="Fleet rows (CSV)">
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder={TEMPLATE}
              className={`${INPUT} font-mono text-xs`}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Btn theme={theme} icon={importing ? Loader2 : FileUp} disabled={importing || !csvText.trim()} onClick={() => void importRows(csvText)}>
              {importing ? 'Importing…' : 'Import into registry'}
            </Btn>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer font-semibold text-slate-700 underline underline-offset-2">Show the template</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 font-mono text-[10px] leading-4 ring-1 ring-slate-900/10">{TEMPLATE}</pre>
            </details>
          </div>
        </div>
      </Panel>

      <Panel theme={theme} title="Check a vehicle number" icon={Search}>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={checkReg}>
          <label htmlFor="fleet-check" className="sr-only">Vehicle registration number</label>
          <input
            id="fleet-check"
            value={reg}
            onChange={(e) => setReg(e.target.value.toUpperCase())}
            placeholder="e.g. JK01AB1234"
            autoCapitalize="characters"
            className={`${INPUT} flex-1 font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal`}
          />
          <Btn theme={theme} type="submit" icon={Search}>Check registry</Btn>
        </form>
        {check?.done && (
          check.found && check.vehicle ? (
            <div className="mt-4 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> {check.vehicle.vehicle_registration_no} is registered
                <Badge tone="blue">{check.vehicle.source.replaceAll('_', ' ')}</Badge>
              </p>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-emerald-900 sm:grid-cols-2">
                {[
                  ['Type', check.vehicle.vehicle_type],
                  ['Owner', check.vehicle.owner_name],
                  ['RTO office', check.vehicle.rto_office],
                  ['RTO code', check.vehicle.rto_code],
                  ['Fitness till', check.vehicle.fitness_valid_upto],
                  ['Permit', check.vehicle.permit_type ? `${check.vehicle.permit_type}${check.vehicle.permit_valid_upto ? ` till ${check.vehicle.permit_valid_upto}` : ''}` : null],
                  ['Insurance till', check.vehicle.insurance_valid_upto],
                  ['Fuel', check.vehicle.fuel_type],
                ]
                  .filter(([, v]) => Boolean(v))
                  .map(([k, v]) => (
                    <div key={k as string} className="flex justify-between gap-3 border-b border-emerald-900/10 pb-1">
                      <dt className="text-emerald-700">{k}</dt>
                      <dd className="text-right font-semibold">{v}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ) : (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {reg.toUpperCase()} is not in the registry yet — trips with it still run, but show &ldquo;unverified&rdquo; until the fleet CSV includes it.
            </p>
          )
        )}
      </Panel>

      <Panel theme={theme} title="Registered vehicles" icon={Truck}>
        {fleet === null ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the registry…
          </p>
        ) : fleet.length === 0 ? (
          <EmptyState
            theme={theme}
            icon={Truck}
            title="The registry is empty"
            text="Import the fleet CSV above — after that every trip with a registered vehicle is RTO-verified automatically."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Registration</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3">RTO</th>
                  <th className="py-2 pr-3">Fitness till</th>
                  <th className="py-2 pr-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {fleet.map((v) => (
                  <tr key={v.id} className="border-t border-slate-900/5">
                    <td className="py-2 pr-3 font-mono font-semibold text-slate-900">{v.vehicle_registration_no}</td>
                    <td className="py-2 pr-3 text-slate-600">{v.vehicle_type ?? '—'}</td>
                    <td className="py-2 pr-3 text-slate-600">{v.owner_name ?? '—'}</td>
                    <td className="py-2 pr-3 text-slate-600">{v.rto_office ?? v.rto_code ?? '—'}</td>
                    <td className="py-2 pr-3 text-slate-600">{v.fitness_valid_upto ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={v.source === 'MANUAL' ? 'slate' : 'blue'}>{v.source.replaceAll('_', ' ')}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
              <XCircle className="h-3 w-3" aria-hidden /> Showing the first 500 vehicles, A→Z by registration.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}
