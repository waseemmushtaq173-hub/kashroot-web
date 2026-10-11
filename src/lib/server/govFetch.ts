/**
 * fetch() for Indian government APIs (agmarknet.gov.in, data.gov.in).
 *
 * Several government servers send only their own certificate, not the
 * intermediate one that links it to a trusted root. Browsers quietly
 * download the missing link (from the "CA Issuers" address inside the
 * certificate — AIA); Node does not, so every request fails with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE and the site looks unreachable.
 *
 * This does what the browser does: on that error it reads the certificate,
 * downloads the missing intermediate(s), and repeats the request with them
 * added. Verification stays fully on — the chain must still end at one of
 * Node's trusted roots; downloaded self-signed certificates are never used.
 * Server-only.
 */
import 'server-only';

import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import tls from 'node:tls';

const CHAIN_ERRORS = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_GET_ISSUER_CERT']);

/** Intermediates found per host, so only the first request pays for the lookup. */
const intermediates = new Map<string, string[]>();

export interface GovResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

/** The reason fetch() hides in `cause` (e.g. a certificate or reset error). */
export function causeCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.cause?.code ?? e?.code;
}

/** Trusted roots: Node's own, plus NODE_EXTRA_CA_CERTS like Node itself. */
function roots(): string[] {
  const extra = process.env.NODE_EXTRA_CA_CERTS;
  if (!extra) return [...tls.rootCertificates];
  try {
    return [...tls.rootCertificates, readFileSync(extra, 'utf8')];
  } catch {
    return [...tls.rootCertificates];
  }
}

/** Only reads the certificates the server presents; nothing is sent or trusted. */
function presented(host: string, port: number): Promise<tls.DetailedPeerCertificate> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate(true);
      socket.end();
      resolve(cert);
    });
    socket.setTimeout(10_000, () => socket.destroy(new Error('Timed out reading the certificate')));
    socket.on('error', reject);
  });
}

const issuerUrl = (infoAccess: string | undefined) => /CA Issuers - URI:(\S+)/.exec(infoAccess ?? '')?.[1];

async function missingIntermediates(host: string, port: number): Promise<string[]> {
  const leaf = await presented(host, port);
  // Walk to the last certificate the server sent.
  let last = leaf;
  const seen = new Set<string>();
  while (last.issuerCertificate && last.issuerCertificate !== last && !seen.has(last.fingerprint256)) {
    seen.add(last.fingerprint256);
    last = last.issuerCertificate;
  }
  const info = last.infoAccess as Record<string, string[]> | undefined;
  let url = info?.['CA Issuers - URI']?.[0];
  const found: string[] = [];
  for (let i = 0; url && i < 3; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) break;
    let cert: X509Certificate;
    try {
      cert = new X509Certificate(Buffer.from(await res.arrayBuffer()));
    } catch {
      break; // not a single DER/PEM certificate (e.g. a PKCS#7 bundle)
    }
    if (cert.subject === cert.issuer) break; // a root: only Node's own roots are trusted
    found.push(cert.toString());
    url = issuerUrl(cert.infoAccess);
  }
  return found;
}

function getWith(url: string, headers: Record<string, string>, ca: string[], timeout: number): Promise<GovResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, ca, timeout }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const status = res.statusCode ?? 0;
        resolve({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body), text: async () => body });
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('The request timed out'), { name: 'TimeoutError' })));
    req.on('error', reject);
  });
}

export async function govFetch(url: string, headers: Record<string, string>, timeout = 12_000): Promise<GovResponse> {
  const { hostname, port } = new URL(url);
  const host = `${hostname}:${port || 443}`;
  const known = intermediates.get(host);
  if (known?.length) return getWith(url, headers, [...roots(), ...known], timeout);
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeout), next: { revalidate: 900 } });
    return { ok: res.ok, status: res.status, json: () => res.json(), text: () => res.text() };
  } catch (err) {
    if (!CHAIN_ERRORS.has(causeCode(err) ?? '')) throw err;
    const found = await missingIntermediates(hostname, Number(port) || 443).catch(() => []);
    if (!found.length) throw err;
    intermediates.set(host, found);
    return getWith(url, headers, [...roots(), ...found], timeout);
  }
}
