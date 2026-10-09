/**
 * ULIP — Unified Logistics Interface Platform (DPIIT, Govt. of India).
 * Real vehicle data by registration number:
 *   - VAHAN/01  registration details (class, maker, fitness, insurance …)
 *   - FASTAG/01 toll-plaza crossings (the last ~72 h) — the vehicle's real,
 *               recent route. FASTag is not continuous GPS: between plazas the
 *               position is unknown, and the UI says so.
 *
 * Credentials come from a company registration at goulip.in:
 *   ULIP_USERNAME, ULIP_PASSWORD, optional ULIP_BASE_URL (staging:
 *   https://www.ulipstaging.dpiit.gov.in/ulip/v1.0.0).
 * Production ULIP only accepts whitelisted server IPs, so on Vercel route it
 * through a static-IP egress if login is refused.
 */
import 'server-only';

const BASE = (process.env.ULIP_BASE_URL?.trim() || 'https://www.ulip.dpiit.gov.in/ulip/v1.0.0').replace(/\/$/, '');

let cached: { token: string; at: number } | null = null;

export const ulipConfigured = () => Boolean(process.env.ULIP_USERNAME && process.env.ULIP_PASSWORD);

async function token(force = false): Promise<string> {
  if (!force && cached && Date.now() - cached.at < 20 * 60_000) return cached.token;
  const res = await fetch(`${BASE}/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: process.env.ULIP_USERNAME, password: process.env.ULIP_PASSWORD }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  const t = json?.response?.id;
  if (!res.ok || !t) throw new Error(`ULIP login failed (${res.status}) — check credentials or the server IP whitelist.`);
  cached = { token: t, at: Date.now() };
  return t;
}

async function call(path: string, body: Record<string, string>) {
  for (const retry of [false, true]) {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${await token(retry)}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    if ((res.status === 401 || res.status === 403) && !retry) continue;
    if (!res.ok) throw new Error(`ULIP ${path} answered ${res.status}`);
    return res.json();
  }
  throw new Error(`ULIP ${path} refused the session`);
}

/** Fields that identify a person or the vehicle's hardware — never shown. */
const PRIVATE = /owner|father|mobile|phone|address|email|chasi|chassis|engine|aadhaar|pan|permanent|present|financer|hypothecat/i;

/** Pulls every <tag>value</tag> out of VAHAN's XML-in-JSON (and any flat JSON fields). */
function flatten(node: unknown, out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === 'string') {
    for (const m of node.matchAll(/<([A-Za-z_][\w.-]*)>([^<]*)<\/\1>/g)) if (m[2].trim()) out[m[1]] = m[2].trim();
  } else if (Array.isArray(node)) node.forEach((n) => flatten(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && !v.includes('<')) {
        if (v.trim() && !['code', 'message', 'error'].includes(k)) out[k] = v.trim();
      } else flatten(v, out);
    }
  }
  return out;
}

const LABELS: Record<string, string> = {
  rc_regn_no: 'Registration no.',
  rc_regn_dt: 'Registered on',
  rc_registered_at: 'Registering office',
  rc_vh_class_desc: 'Vehicle class',
  rc_vch_catg: 'Category',
  rc_maker_desc: 'Maker',
  rc_maker_model: 'Model',
  rc_body_type_desc: 'Body type',
  rc_fuel_desc: 'Fuel',
  rc_gvw: 'Gross weight (kg)',
  rc_unld_wt: 'Unladen weight (kg)',
  rc_fit_upto: 'Fitness valid to',
  rc_insurance_upto: 'Insurance valid to',
  rc_tax_upto: 'Tax paid to',
  rc_pucc_upto: 'PUC valid to',
  rc_np_upto: 'National permit to',
  rc_status: 'RC status',
  rc_norms_desc: 'Emission norms',
};

export interface VehicleDetails {
  fields: { label: string; value: string }[];
}

export async function vahan(vehicleNumber: string): Promise<VehicleDetails> {
  const all = flatten(await call('/VAHAN/01', { vehiclenumber: vehicleNumber }));
  const known = Object.entries(LABELS).filter(([k]) => all[k]).map(([k, label]) => ({ label, value: all[k] }));
  const extra = Object.entries(all)
    .filter(([k]) => !LABELS[k] && !PRIVATE.test(k) && k.startsWith('rc_'))
    .slice(0, 8)
    .map(([k, value]) => ({ label: k.replace(/^rc_/, '').replace(/_/g, ' '), value }));
  return { fields: [...known, ...extra] };
}

export interface TollCrossing {
  time: string;
  plaza: string;
  lat: number | null;
  lng: number | null;
  direction: string;
}

export async function fastag(vehicleNumber: string): Promise<TollCrossing[]> {
  const json = await call('/FASTAG/01', { vehiclenumber: vehicleNumber });
  const txns: Record<string, string>[] = json?.response?.[0]?.response?.vehicle?.vehltxnList?.txn ?? [];
  return txns
    .map((t) => {
      const [lat, lng] = String(t.tollPlazaGeocode ?? '').split(',').map(Number);
      const valid = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 11.0001 && lng === 11.0001);
      return { time: t.readerReadTime ?? '', plaza: t.tollPlazaName ?? 'Toll plaza', lat: valid ? lat : null, lng: valid ? lng : null, direction: t.laneDirection ?? '' };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}
