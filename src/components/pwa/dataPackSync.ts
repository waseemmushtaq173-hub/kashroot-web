'use client';

/**
 * Data pack synchronization for offline-first operation.
 * Fetches signed data packs from API, verifies ES256 signature,
 * and stores in local Dexie DB.
 */

import { subtle } from 'crypto'; // Web Crypto API
import { getLatestDataPack, storeDataPack, type SignedDataPack, type DataPackPayload } from './offlineDb';
import { checkConnectivity } from './connectivity';

export const DATA_PACK_ENDPOINT = '/api/v1/data-packs';
export const DATA_PACK_PUBLIC_KEY_ENDPOINT = '/api/v1/data-packs/public-key';
export const DATA_PACK_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export type { DataPackPayload, SignedDataPack } from './offlineDb';

let publicKey: CryptoKey | null = null;
let publicKeyRaw: string | null = null;

/**
 * Load the public key for verifying data pack signatures.
 * Called on app startup.
 */
export async function loadDataPackPublicKey(): Promise<void> {
  if (publicKey) return;

  try {
    const res = await fetch(DATA_PACK_PUBLIC_KEY_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Public key endpoint returned ${res.status}`);

    const data = await res.json();
    if (!data.ok || !data.publicKey) {
      console.warn('[DataPack] Public key not configured (dev mode)');
      return;
    }

    publicKeyRaw = data.publicKey;

    // Import SPKI public key (ECDSA P-256, ES256)
    const spkiDer = base64urlToBuffer(data.publicKey);
    publicKey = await subtle.importKey(
      'spki',
      spkiDer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    console.log('[DataPack] Public key loaded', { keyId: data.keyId, algorithm: data.algorithm });
  } catch (err) {
    console.warn('[DataPack] Failed to load public key:', err instanceof Error ? err.message : err);
  }
}

/**
 * Fetch the latest data pack from API.
 */
export async function fetchDataPack(): Promise<SignedDataPack | null> {
  try {
    const res = await fetch(DATA_PACK_ENDPOINT, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Data pack endpoint returned ${res.status}`);

    const pack = await res.json();
    return pack as SignedDataPack;
  } catch (err) {
    console.warn('[DataPack] Failed to fetch:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Verify a data pack's ES256 signature.
 */
export async function verifyDataPack(pack: SignedDataPack): Promise<DataPackPayload | null> {
  // Dev mode: unsigned packs allowed
  if (pack.signature === 'UNSIGNED_DEV_ONLY') {
    if (new Date(pack.expiresAt) < new Date()) {
      console.warn('[DataPack] Pack expired');
      return null;
    }
    return pack.payload;
  }

  if (!publicKey) {
    console.warn('[DataPack] Public key not loaded, cannot verify');
    return null;
  }

  // Check expiration
  if (new Date(pack.expiresAt) < new Date()) {
    console.warn('[DataPack] Pack expired');
    return null;
  }

  // Reconstruct canonical signed data
  const canonical = canonicalize({
    header: {
      version: pack.version,
      keyId: pack.keyId,
      issuedAt: pack.issuedAt,
      expiresAt: pack.expiresAt,
    },
    payload: pack.payload,
  });

  const signature = base64urlToBuffer(pack.signature);
  const data = new TextEncoder().encode(canonical);

  try {
    const valid = await subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      data,
    );

    if (!valid) {
      console.error('[DataPack] Invalid signature');
      return null;
    }

    return pack.payload;
  } catch (err) {
    console.error('[DataPack] Verification error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Sync data pack: fetch, verify, store.
 * Returns the verified payload or null.
 */
export async function syncDataPack(): Promise<DataPackPayload | null> {
  // Check connectivity first
  const { online } = await checkConnectivity();
  if (!online) {
    console.log('[DataPack] Offline, skipping sync');
    return null;
  }

  const pack = await fetchDataPack();
  if (!pack) return null;

  const payload = await verifyDataPack(pack);
  if (!payload) return null;

  await storeDataPack(pack);
  console.log('[DataPack] Synced and stored', {
    mandiCount: payload.metadata.mandiCount,
    weatherCount: payload.metadata.weatherCount,
    registryCount: payload.metadata.registryCount,
    advisoryCount: payload.metadata.advisoryCount,
  });

  return payload;
}

/**
 * Get cached data pack payload (for offline use).
 */
export async function getCachedDataPack(): Promise<DataPackPayload | null> {
  const pack = await getLatestDataPack();
  if (!pack) return null;
  return pack.payload;
}

/**
 * Start periodic data pack sync.
 */
export function startDataPackSync(): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const runSync = async () => {
    await syncDataPack();
  };

  // Initial sync
  runSync();

  // Schedule recurring sync
  intervalId = setInterval(runSync, DATA_PACK_SYNC_INTERVAL_MS);

  // Also sync on visibility change
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') runSync();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    if (intervalId) clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

// Helpers

function base64urlToBuffer(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
}