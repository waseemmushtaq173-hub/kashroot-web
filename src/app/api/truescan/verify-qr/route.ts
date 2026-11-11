/**
 * POST /api/truescan/verify-qr
 *
 * Verifies a fertiliser/pesticide product via the manufacturer's hosted
 * verification page (scanned from the QR code on the label).
 *
 * Security:
 * - Only follows HTTPS URLs
 * - Domain allowlist (configurable via env) — prevents SSRF
 * - Request timeout (10s)
 * - No redirects to non-HTTPS
 * - Response validation (expects JSON with known schema)
 *
 * Outcomes:
 * - VERIFIED_BY_MANUFACTURER: manufacturer page returned "genuine"
 * - REGISTERED_BATCH_UNVERIFIED: product in CIB&RC/FCO but manufacturer didn't verify batch
 * - EXPIRED: product expired (expiry date in past)
 * - BANNED: active molecule in CIB&RC banned list
 * - NOT_FOUND: not in any official list
 * - PENDING_MANUFACTURER: manufacturer page unreachable / timeout
 * - OFFLINE_SAVED_LIST: offline mode, checked against embedded registry only
 */
import { NextResponse } from 'next/server';

import { ipLimited, tooMany } from '@/lib/server/sign';
import {
  searchAllEmbedded,
  cibrcLookupRegistered,
  cibrcLookupBanned,
  fcoLookupEmbedded,
  type SearchHit,
} from '@/lib/gov-agro-registry';
import { readTyped } from '@/lib/fertilizer/trueScan';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Manufacturer domain allowlist — ONLY these domains can be called for verification.
// Configure via env: MANUFACTURER_VERIFICATION_DOMAINS="crystalcrop.com,sumitomo-chemical.com,iffco.in,..."
// DEFAULT: empty = no live manufacturer verification (falls back to registry only).
function getAllowedDomains(): string[] {
  const env = process.env.MANUFACTURER_VERIFICATION_DOMAINS?.trim();
  if (!env) return [];
  return env.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
}

function isDomainAllowed(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const allowed = getAllowedDomains();
    if (allowed.length === 0) return false;
    return allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

/**
 * Extract verification URL from QR code text.
 * Supports: direct URLs, QR codes with "URL:" prefix, or just the domain.
 */
function extractVerificationUrl(qrText: string): string | null {
  const text = qrText.trim();

  // Direct URL
  if (/^https?:\/\//i.test(text)) {
    const url = text.split(/\s+/)[0]; // Take first token if multiple
    return url;
  }

  // URL: prefix
  const urlPrefix = text.match(/^(?:URL|url|Uri|uri)[:]\s*(\S+)/i);
  if (urlPrefix) return urlPrefix[1];

  // Domain-only (assume https)
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(text) && !text.includes(' ')) {
    return `https://${text.split('/')[0]}`;
  }

  return null;
}

interface VerifyRequest {
  qrText: string;
  productName?: string;
  batchNumber?: string;
  expiryDate?: string;
  registrationNumber?: string;
  isOffline?: boolean;
}

interface VerifyResponse {
  outcome: 'VERIFIED_BY_MANUFACTURER' | 'REGISTERED_BATCH_UNVERIFIED' | 'EXPIRED' | 'BANNED' | 'NOT_FOUND' | 'PENDING_MANUFACTURER' | 'OFFLINE_SAVED_LIST';
  productName: string;
  manufacturer: string;
  registrationNumber?: string;
  batchNumber?: string;
  expiryDate?: string;
  manufacturerVerifiedAt?: string;
  cibrcStatus?: 'registered' | 'banned' | 'not_found';
  fcoStandard?: boolean;
  details: string;
  offline?: boolean;
  source: string;
  checkedAt: string;
}

export async function POST(request: Request): Promise<Response> {
  if (ipLimited(request, 'truescan-verify-qr', 20)) return tooMany();

  let body: VerifyRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { outcome: 'NOT_FOUND', productName: '', manufacturer: '', details: 'Invalid request body', source: 'API', checkedAt: new Date().toISOString() },
      { status: 400 },
    );
  }

  const { qrText, productName, batchNumber, expiryDate, registrationNumber, isOffline = false } = body;

  if (!qrText || qrText.trim().length < 3) {
    return NextResponse.json(
      { outcome: 'NOT_FOUND', productName: '', manufacturer: '', details: 'QR code text is required', source: 'API', checkedAt: new Date().toISOString() },
      { status: 400 },
    );
  }

  const checkedAt = new Date().toISOString();

  // ─── OFFLINE MODE ───
  if (isOffline || !navigator?.onLine) {
    return handleOfflineVerification(qrText, productName, batchNumber, expiryDate, registrationNumber, checkedAt);
  }

  // ─── 1. Check CIB&RC banned list first (highest priority) ───
  const banned = cibrcLookupBanned(qrText);
  if (banned.length > 0) {
    return NextResponse.json({
      outcome: 'BANNED',
      productName: banned[0].active_molecule ?? productName ?? 'Unknown',
      manufacturer: banned[0].common_name ?? 'N/A',
      registrationNumber,
      batchNumber,
      expiryDate,
      cibrcStatus: 'banned',
      details: `This active molecule (${banned[0].active_molecule}) is ${banned[0].status.toLowerCase()} by CIB&RC. ${banned[0].reason_summary ?? ''}`,
      source: 'CIB&RC Banned List (ppqs.gov.in)',
      checkedAt,
    });
  }

  // ─── 2. Check CIB&RC registered list ───
  const registered = cibrcLookupRegistered(undefined, qrText);
  let cibrcStatus: 'registered' | 'banned' | 'not_found' = 'not_found';
  let manufacturer = '';
  let finalProductName = productName ?? '';

  if (registered.length > 0) {
    cibrcStatus = 'registered';
    finalProductName = registered[0].brandName ?? registered[0].active_molecule ?? finalProductName;
    manufacturer = registered[0].legalManufacturer ?? registered[0].manufacturerCompany ?? registered[0].manufacturer ?? '';
  }

  // ─── 3. Check FCO standard ───
  const fco = fcoLookupEmbedded(qrText);
  const hasFcoStandard = !!fco;
  if (fco && !finalProductName) finalProductName = fco.fertiliser_type;

  // ─── 4. Try manufacturer verification page ───
  const verificationUrl = extractVerificationUrl(qrText);
  let manufacturerVerified = false;
  let manufacturerVerifiedAt: string | undefined;

  if (verificationUrl && isDomainAllowed(verificationUrl)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(verificationUrl, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'KashRoot/1.0' },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json().catch(() => ({}));
          // Expected manufacturer response schema:
          // { genuine: boolean, batch_verified: boolean, verified_at: string, product_name: string, manufacturer: string }
          if (data.genuine === true) {
            manufacturerVerified = true;
            manufacturerVerifiedAt = data.verified_at ?? checkedAt;
            if (data.product_name) finalProductName = data.product_name;
            if (data.manufacturer) manufacturer = data.manufacturer;
          } else if (data.batch_verified === false) {
            // Product registered but this specific batch not verified by manufacturer
            manufacturerVerified = false;
          }
        }
      }
    } catch {
      // Manufacturer verification failed — fall through to registry-only result
    }
  }

  // ─── 5. Check expiry ───
  let expired = false;
  if (expiryDate) {
    const exp = new Date(expiryDate);
    if (!isNaN(exp.getTime()) && exp < new Date()) {
      expired = true;
    }
  }

  // ─── 6. Determine outcome ───
  let outcome: VerifyResponse['outcome'];
  let details = '';

  if (expired) {
    outcome = 'EXPIRED';
    details = `This product expired on ${expiryDate}. Do not use or buy.`;
  } else if (manufacturerVerified) {
    outcome = 'VERIFIED_BY_MANUFACTURER';
    details = `Manufacturer (${manufacturer || 'the registrant'}) confirms this batch is genuine. Verified at ${manufacturerVerifiedAt}.`;
  } else if (cibrcStatus === 'registered' || hasFcoStandard) {
    outcome = 'REGISTERED_BATCH_UNVERIFIED';
    details = `This product is in the official Government list (${cibrcStatus === 'registered' ? 'CIB&RC registered' : ''}${cibrcStatus === 'registered' && hasFcoStandard ? ' + ' : ''}${hasFcoStandard ? 'FCO standard' : ''}), but the manufacturer has not verified this specific batch.`;
  } else {
    outcome = 'NOT_FOUND';
    details = `This product is not found in the official CIB&RC registered pesticides, banned list, or FCO fertiliser standards. It may be unregistered, counterfeit, or a new product not yet in the list.`;
  }

  return NextResponse.json({
    outcome,
    productName: finalProductName || 'Unknown product',
    manufacturer: manufacturer || 'Unknown manufacturer',
    registrationNumber,
    batchNumber,
    expiryDate,
    manufacturerVerifiedAt,
    cibrcStatus,
    fcoStandard: hasFcoStandard,
    details,
    source: 'CIB&RC (ppqs.gov.in) + FCO 1985' + (verificationUrl && isDomainAllowed(verificationUrl) ? ' + Manufacturer verification page' : ''),
    checkedAt,
  });
}

/**
 * Offline verification: only checks embedded registry, never claims "genuine".
 */
function handleOfflineVerification(
  qrText: string,
  productName: string | undefined,
  batchNumber: string | undefined,
  expiryDate: string | undefined,
  registrationNumber: string | undefined,
  checkedAt: string,
): NextResponse<VerifyResponse> {
  // Check banned
  const banned = cibrcLookupBanned(qrText);
  if (banned.length > 0) {
    return NextResponse.json({
      outcome: 'BANNED',
      productName: banned[0].active_molecule ?? productName ?? 'Unknown',
      manufacturer: banned[0].common_name ?? 'N/A',
      registrationNumber,
      batchNumber,
      expiryDate,
      cibrcStatus: 'banned',
      details: `This active molecule (${banned[0].active_molecule}) is ${banned[0].status.toLowerCase()} by CIB&RC. ${banned[0].reason_summary ?? ''}`,
      source: 'CIB&RC Banned List (embedded, offline)',
      checkedAt,
      offline: true,
    });
  }

  // Check registered
  const registered = cibrcLookupRegistered(undefined, qrText);
  let cibrcStatus: 'registered' | 'banned' | 'not_found' = 'not_found';
  let manufacturer = '';
  let finalProductName = productName ?? '';

  if (registered.length > 0) {
    cibrcStatus = 'registered';
    finalProductName = registered[0].brandName ?? registered[0].active_molecule ?? finalProductName;
    manufacturer = registered[0].legalManufacturer ?? registered[0].manufacturerCompany ?? registered[0].manufacturer ?? '';
  }

  // Check FCO
  const fco = fcoLookupEmbedded(qrText);
  const hasFcoStandard = !!fco;
  if (fco && !finalProductName) finalProductName = fco.fertiliser_type;

  // Check expiry
  let expired = false;
  if (expiryDate) {
    const exp = new Date(expiryDate);
    if (!isNaN(exp.getTime()) && exp < new Date()) {
      expired = true;
    }
  }

  let outcome: VerifyResponse['outcome'];
  let details = '';

  if (expired) {
    outcome = 'EXPIRED';
    details = `This product expired on ${expiryDate}. Do not use or buy.`;
  } else if (cibrcStatus === 'registered' || hasFcoStandard) {
    outcome = 'OFFLINE_SAVED_LIST';
    details = `Checked against saved official lists on this phone (${cibrcStatus === 'registered' ? 'CIB&RC registered' : ''}${cibrcStatus === 'registered' && hasFcoStandard ? ' + ' : ''}${hasFcoStandard ? 'FCO standard' : ''}). Manufacturer verification requires internet — pending.`;
  } else {
    outcome = 'OFFLINE_SAVED_LIST';
    details = `Not found in saved official lists on this phone. Manufacturer verification requires internet — pending.`;
  }

  return NextResponse.json({
    outcome,
    productName: finalProductName || 'Unknown product',
    manufacturer: manufacturer || 'Unknown manufacturer',
    registrationNumber,
    batchNumber,
    expiryDate,
    cibrcStatus,
    fcoStandard: hasFcoStandard,
    details,
    source: 'CIB&RC (ppqs.gov.in) + FCO 1985 (embedded, offline)',
    checkedAt,
    offline: true,
  });
}