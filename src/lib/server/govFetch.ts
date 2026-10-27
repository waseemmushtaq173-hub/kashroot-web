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

/**
 * `endOnClose`: a response with no length that ends by the server dropping
 * the connection is taken as complete (what a browser does) instead of failing.
 */
function getWith(url: string, headers: Record<string, string>, ca: string[], timeout: number, endOnClose = false): Promise<GovResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const chunks: Buffer[] = [];
    let status = 0;
    let closeDelimited = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      const body = Buffer.concat(chunks).toString('utf8');
      resolve({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body), text: async () => body });
    };
    const fail = (err: unknown) => {
      if (settled) return;
      // The server dropped the connection after sending the body it had: that was the end.
      if (endOnClose && closeDelimited && chunks.length && (err as Error)?.name !== 'TimeoutError') return finish();
      settled = true;
      reject(err);
    };
    const req = https.get(url, { headers, ca, timeout }, (res) => {
      status = res.statusCode ?? 0;
      closeDelimited = res.headers['content-length'] === undefined && res.headers['transfer-encoding'] === undefined;
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', finish);
      res.on('error', fail);
      res.on('close', () => (res.complete ? finish() : fail(Object.assign(new Error('The connection was closed'), { code: 'ECONNRESET' }))));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('The request timed out'), { name: 'TimeoutError' })));
    req.on('error', fail);
  });
}

/**
 * GET with Node's https module instead of fetch(), for a server that ends its
 * answer by dropping the connection (the NHB cold storage file: no length,
 * then a reset). fetch() can crash the whole server process on that — an
 * internal assertion, thrown where no try/catch can reach it. Here such a
 * body counts as the whole answer. Missing intermediate certificates are
 * fetched as in govFetch. Not cached by Next.js: the caller keeps its copy.
 */
export async function nodeGet(url: string, headers: Record<string, string>, timeout = 12_000): Promise<GovResponse> {
  const { hostname, port } = new URL(url);
  const host = `${hostname}:${port || 443}`;
  try {
    return await getWith(url, headers, [...roots(), ...(intermediates.get(host) ?? [])], timeout, true);
  } catch (err) {
    if (!CHAIN_ERRORS.has(causeCode(err) ?? '')) throw err;
    const found = await missingIntermediates(hostname, Number(port) || 443).catch(() => []);
    if (!found.length) throw err;
    intermediates.set(host, found);
    return getWith(url, headers, [...roots(), ...found], timeout, true);
  }
}

/** `revalidate`: seconds Next.js may keep the answer (0: always ask the site again). */
export async function govFetch(url: string, headers: Record<string, string>, timeout = 12_000, revalidate = 900): Promise<GovResponse> {
  const { hostname, port } = new URL(url);
  const host = `${hostname}:${port || 443}`;
  const known = intermediates.get(host);
  if (known?.length) return getWith(url, headers, [...roots(), ...known], timeout);
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeout), ...(revalidate > 0 ? { next: { revalidate } } : { cache: 'no-store' as const }) });
    return { ok: res.ok, status: res.status, json: () => res.json(), text: () => res.text() };
  } catch (err) {
    if (!CHAIN_ERRORS.has(causeCode(err) ?? '')) throw err;
    const found = await missingIntermediates(hostname, Number(port) || 443).catch(() => []);
    if (!found.length) throw err;
    intermediates.set(host, found);
    return getWith(url, headers, [...roots(), ...found], timeout);
  }
}
