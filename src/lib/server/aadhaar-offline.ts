/**
 * Free, offline Aadhaar verification — no API, no fees. Both formats are
 * digitally signed by UIDAI; we check that signature against UIDAI's public
 * certificate, so a forged or edited document fails.
 *
 * 1. Offline e-KYC XML: the person downloads a password-protected ZIP from
 *    myaadhaar.uidai.gov.in (UIDAI texts them an OTP for that, free) and sets
 *    a 4-character share code. We decrypt with the share code, verify the XML
 *    signature, and read the details only from the signed content.
 * 2. Secure QR: the QR on the Aadhaar letter / PVC card / mAadhaar. A large
 *    decimal number → gzip → fields + photo + hashes + RSA-SHA256 signature.
 *
 * Optional mobile check: both formats carry a hash of the mobile registered
 * with that Aadhaar, so we can confirm a number the person types is theirs.
 *
 * Server-only. Never logs or returns the photo, address or full reference.
 */
import 'server-only';
import { createHash, verify as rsaVerify, X509Certificate } from 'node:crypto';
import { unzipSync } from 'node:zlib';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { SignedXml } from 'xml-crypto';

import { uidaiCertificates } from './uidai-certs';

export interface OfflineAadhaar {
  method: 'AADHAAR_OFFLINE_XML' | 'AADHAAR_SECURE_QR';
  aadhaarLast4: string;
  name: string;
  /** DD-MM-YYYY */
  dateOfBirth: string;
  gender: string;
  state: string;
  district: string;
  /** When UIDAI generated the document. */
  generatedAt: string | null;
  /** true/false when a mobile was given and the document carries its hash; null otherwise. */
  mobileMatches: boolean | null;
  /** Short non-reversible id for this document (for audit, never the Aadhaar). */
  documentId: string;
}

export class OfflineKycError extends Error {}

const MAX_XML_AGE_DAYS = 7;

/** sha256 applied n times (n = last Aadhaar digit; 0 or 1 → once), hex. */
function repeatedSha256(value: string, lastDigit: number): string {
  const rounds = lastDigit <= 1 ? 1 : lastDigit;
  let out = value;
  for (let i = 0; i < rounds; i++) out = createHash('sha256').update(out).digest('hex');
  return out;
}

/** referenceId = last 4 Aadhaar digits + YYYYMMDDHHMMSSmmm. */
function parseReference(ref: string) {
  const last4 = ref.slice(0, 4);
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(ref.slice(4));
  const generatedAt = m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+05:30`) : null;
  return { last4: /^\d{4}$/.test(last4) ? last4 : '', generatedAt: generatedAt && !Number.isNaN(generatedAt.getTime()) ? generatedAt : null };
}

const cleanMobile = (m?: string) => (m ? m.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '') : '');

// ── Offline e-KYC XML ─────────────────────────────────────────────────────

export function verifyOfflineXmlZip(zipBytes: Buffer, shareCode: string, mobile?: string, trusted: string[] = uidaiCertificates()): OfflineAadhaar {
  if (!/^[A-Za-z0-9]{4}$/.test(shareCode)) throw new OfflineKycError('The share code is the 4 characters you chose when downloading the file.');
  let xml: string;
  try {
    const zip = new AdmZip(zipBytes);
    const entry = zip.getEntries().find((e) => !e.isDirectory && /\.xml$/i.test(e.entryName));
    if (!entry) throw new Error('no xml');
    const data = zip.readFile(entry, shareCode);
    if (!data) throw new Error('decrypt');
    xml = data.toString('utf8');
  } catch {
    throw new OfflineKycError('Could not open the file. Check that it is the Aadhaar ZIP from UIDAI and the share code is correct.');
  }
  if (!xml.includes('OfflinePaperlessKyc')) throw new OfflineKycError('This is not an Aadhaar Offline e-KYC file.');

  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const sigNode = doc.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0];
  if (!sigNode) throw new OfflineKycError('The file has no UIDAI signature.');

  // Verify against each trusted UIDAI key; keep the content that was signed.
  let signedContent: string | null = null;
  for (const pem of trusted) {
    try {
      const sig = new SignedXml({ publicCert: pem, getCertFromKeyInfo: () => null });
      sig.loadSignature(sigNode as unknown as Node);
      // UIDAI signs the whole document (Reference URI=""); refuse anything narrower.
      if (sig.checkSignature(xml) && sig.getReferences().length === 1 && sig.getReferences()[0].uri === '') {
        signedContent = sig.getSignedReferences()[0] ?? null;
        break;
      }
    } catch {
      /* try the next key */
    }
  }
  if (!signedContent) {
    throw new OfflineKycError('UIDAI’s signature did not verify. The file may have been edited — or it was signed with a newer UIDAI key that this site has not been given yet.');
  }

  // Read only from what UIDAI signed (defends against signature wrapping).
  const signed = new DOMParser().parseFromString(signedContent, 'text/xml');
  const root = signed.getElementsByTagName('OfflinePaperlessKyc')[0];
  const poi = signed.getElementsByTagName('Poi')[0];
  const poa = signed.getElementsByTagName('Poa')[0];
  if (!root || !poi) throw new OfflineKycError('The signed file is missing identity details.');

  const ref = root.getAttribute('referenceId') ?? '';
  const { last4, generatedAt } = parseReference(ref);
  if (generatedAt && Date.now() - generatedAt.getTime() > MAX_XML_AGE_DAYS * 864e5) {
    throw new OfflineKycError(`This file is older than ${MAX_XML_AGE_DAYS} days. Download a fresh one from UIDAI — it takes a minute.`);
  }

  const mobileHash = poi.getAttribute('m') ?? '';
  const typed = cleanMobile(mobile);
  const mobileMatches = typed && mobileHash && last4 ? repeatedSha256(typed + shareCode, Number(last4[3])) === mobileHash.toLowerCase() : null;

  return {
    method: 'AADHAAR_OFFLINE_XML',
    aadhaarLast4: last4,
    name: poi.getAttribute('name') ?? '',
    dateOfBirth: poi.getAttribute('dob') ?? '',
    gender: poi.getAttribute('gender') ?? '',
    state: poa?.getAttribute('state') ?? '',
    district: poa?.getAttribute('dist') ?? '',
    generatedAt: generatedAt?.toISOString() ?? null,
    mobileMatches,
    documentId: createHash('sha256').update(ref).digest('hex').slice(0, 16),
  };
}

// ── Secure QR ─────────────────────────────────────────────────────────────

const QR_FIELDS = ['emailMobile', 'referenceId', 'name', 'dob', 'gender', 'careOf', 'district', 'landmark', 'house', 'location', 'pincode', 'postOffice', 'state', 'street', 'subDistrict', 'vtc'] as const;

function decimalToBytes(decimal: string): Buffer {
  let n = BigInt(decimal);
  const bytes: number[] = [];
  while (n > BigInt(0)) {
    bytes.push(Number(n & BigInt(255)));
    n >>= BigInt(8);
  }
  return Buffer.from(bytes.reverse());
}

export function verifySecureQr(qrText: string, mobile?: string, trusted: string[] = uidaiCertificates()): OfflineAadhaar {
  const digits = qrText.trim();
  if (!/^\d{200,}$/.test(digits)) {
    throw new OfflineKycError(digits.startsWith('<') ? 'This is an old-style Aadhaar QR without UIDAI’s signature. Use the QR on a newer Aadhaar, mAadhaar, or upload the Offline e-KYC file.' : 'That is not an Aadhaar Secure QR code.');
  }
  let data: Buffer;
  try {
    data = unzipSync(decimalToBytes(digits));
  } catch {
    throw new OfflineKycError('That QR code could not be read as an Aadhaar Secure QR.');
  }
  if (data.length < 300) throw new OfflineKycError('That QR code is incomplete.');

  const signature = data.subarray(data.length - 256);
  const signedData = data.subarray(0, data.length - 256);
  const valid = trusted.some((pem) => {
    try {
      return rsaVerify('sha256', signedData, new X509Certificate(pem).publicKey, signature);
    } catch {
      return false;
    }
  });
  if (!valid) throw new OfflineKycError('UIDAI’s signature on this QR did not verify. It may be fake — or signed with a newer UIDAI key that this site has not been given yet.');

  // Text fields are separated by 0xFF; newer QRs start with a version field ("V2"…).
  const fields: string[] = [];
  let start = 0;
  for (let i = 0; i < signedData.length && fields.length < QR_FIELDS.length + 2; i++) {
    if (signedData[i] === 255) {
      fields.push(signedData.subarray(start, i).toString('latin1'));
      start = i + 1;
    }
  }
  if (/^V\d+$/.test(fields[0] ?? '')) fields.shift();
  const f = Object.fromEntries(QR_FIELDS.map((k, i) => [k, fields[i] ?? ''])) as Record<(typeof QR_FIELDS)[number], string>;

  const { last4, generatedAt } = parseReference(f.referenceId);
  const flags = Number(f.emailMobile);
  const typed = cleanMobile(mobile);
  // Mobile hash sits just before the signature when flag is 2 (mobile) or 3 (both).
  const mobileHash = flags === 2 || flags === 3 ? data.subarray(data.length - 256 - 32, data.length - 256).toString('hex') : '';
  const mobileMatches = typed && mobileHash && last4 ? repeatedSha256(typed, Number(last4[3])) === mobileHash : null;

  return {
    method: 'AADHAAR_SECURE_QR',
    aadhaarLast4: last4,
    name: f.name,
    dateOfBirth: f.dob,
    gender: f.gender,
    state: f.state,
    district: f.district,
    generatedAt: generatedAt?.toISOString() ?? null,
    mobileMatches,
    documentId: createHash('sha256').update(f.referenceId).digest('hex').slice(0, 16),
  };
}
