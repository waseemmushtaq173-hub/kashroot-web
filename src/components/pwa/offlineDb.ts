import Dexie, { type Table } from 'dexie';

/**
 * Offline-first database for KashRoot.
 * Stores:
 * - Data packs (signed, verified payloads)
 * - Connectivity health check results
 * - Outbox items with idempotency keys
 * - User preferences for offline mode
 */

// Data pack types (matching API)
export interface MandiPriceEntry {
  id: string;
  mandiName: string;
  commodity: string;
  variety: string | null;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
  unitOfSale: string;
  currency: string;
  trendIndicator: string;
  recordedAt: string;
  source: string;
}

export interface WeatherEntry {
  district: string;
  stationCode: string;
  stationName: string;
  current: {
    temperature: number;
    humidity: number;
    windSpeed: number;
    windDirection: number;
    rainfall: number;
    pressure: number;
    condition: string;
    observedAt: string;
  };
  warnings: {
    severity: string;
    message: string;
    issuedAt: string;
    validUntil: string;
    affectedDistricts: string[];
  }[];
  fetchedAt: string;
  source: string;
}

export interface RegistryEntry {
  type: 'cibrc_registered' | 'cibrc_banned' | 'fco_standard';
  id: string;
  name: string;
  details: Record<string, unknown>;
  source: string;
  publishedAt: string;
}

export interface AdvisoryEntry {
  id: string;
  topic: string;
  category: string;
  content: string;
  applicableCrops: string[];
  applicableRegions: string[];
  isGovVerified: boolean;
  sourceOrganization: string;
  sourceUrl: string | null;
  createdAt: string;
}

export interface DataPackPayload {
  mandiPrices: MandiPriceEntry[];
  weather: WeatherEntry[];
  registry: RegistryEntry[];
  advisories: AdvisoryEntry[];
  metadata: {
    mandiCount: number;
    weatherCount: number;
    registryCount: number;
    advisoryCount: number;
    generatedAt: string;
  };
}

export interface SignedDataPack {
  version: number;
  keyId: string;
  issuedAt: string;
  expiresAt: string;
  payload: DataPackPayload;
  signature: string;
}

export interface ConnectivityRecord {
  id: string;
  timestamp: number;
  online: boolean;
  latencyMs: number | null;
  endpoint: string;
  error?: string;
}

export interface OutboxItem {
  id: string; // idempotency key
  kind: 'question' | 'rate' | 'listing' | 'photo' | 'scan';
  userId: string;
  label: string;
  payload: unknown;
  createdAt: number;
  state: 'waiting' | 'sending' | 'sent' | 'failed';
  error?: string;
  tries: number;
  idempotencyKey: string;
}

export interface UserPreference {
  id: string;
  key: string;
  value: unknown;
  updatedAt: number;
}

class KashRootDB extends Dexie {
  dataPacks!: Table<SignedDataPack, string>;
  connectivity!: Table<ConnectivityRecord, string>;
  outbox!: Table<OutboxItem, string>;
  preferences!: Table<UserPreference, string>;

  constructor() {
    super('kashroot-offline');
    this.version(1).stores({
      dataPacks: 'keyId, issuedAt, expiresAt',
      connectivity: 'id, timestamp, online',
      outbox: 'id, userId, state, createdAt, idempotencyKey',
      preferences: 'id, key',
    });
  }
}

export const db = new KashRootDB();

/**
 * Get the latest valid data pack from local DB.
 * Returns null if none or expired.
 */
export async function getLatestDataPack(): Promise<SignedDataPack | null> {
  const pack = await db.dataPacks.orderBy('issuedAt').reverse().first();
  if (!pack) return null;
  if (new Date(pack.expiresAt) < new Date()) {
    await db.dataPacks.delete(pack.keyId);
    return null;
  }
  return pack;
}

/**
 * Store a verified data pack in local DB.
 */
export async function storeDataPack(pack: SignedDataPack): Promise<void> {
  await db.dataPacks.put(pack);
  // Keep only last 3 packs
  const all = await db.dataPacks.orderBy('issuedAt').reverse().toArray();
  if (all.length > 3) {
    await db.dataPacks.bulkDelete(all.slice(3).map((p) => p.keyId));
  }
}

/**
 * Record a connectivity check result.
 */
export async function recordConnectivity(record: Omit<ConnectivityRecord, 'id'>): Promise<void> {
  await db.connectivity.add({ ...record, id: crypto.randomUUID() });
  // Keep last 100 checks
  const all = await db.connectivity.orderBy('timestamp').reverse().toArray();
  if (all.length > 100) {
    await db.connectivity.bulkDelete(all.slice(100).map((r) => r.id));
  }
}

/**
 * Get recent connectivity history.
 */
export async function getConnectivityHistory(limit = 20): Promise<ConnectivityRecord[]> {
  return db.connectivity.orderBy('timestamp').reverse().limit(limit).toArray();
}

/**
 * Check if we have recent successful connectivity.
 */
export async function hasRecentConnectivity(maxAgeMs = 5 * 60 * 1000): Promise<boolean> {
  const recent = await db.connectivity
    .where('timestamp')
    .above(Date.now() - maxAgeMs)
    .and((r) => r.online === true)
    .first();
  return !!recent;
}

/**
 * Outbox operations with idempotency keys.
 */
export const outboxDb = {
  async add(item: Omit<OutboxItem, 'createdAt' | 'state' | 'tries'> & Partial<Pick<OutboxItem, 'createdAt'>>): Promise<OutboxItem> {
    const full: OutboxItem = {
      ...item,
      createdAt: item.createdAt ?? Date.now(),
      state: 'waiting',
      tries: 0,
    };
    await db.outbox.put(full);
    return full;
  },

  async get(id: string): Promise<OutboxItem | undefined> {
    return db.outbox.get(id);
  },

  async getByIdempotencyKey(key: string): Promise<OutboxItem | undefined> {
    return db.outbox.where('idempotencyKey').equals(key).first();
  },

  async allForUser(userId: string): Promise<OutboxItem[]> {
    return db.outbox.where('userId').equals(userId).reverse().sortBy('createdAt');
  },

  async waitingForUser(userId: string): Promise<OutboxItem[]> {
    return db.outbox.where('userId').equals(userId).and((item) => item.state === 'waiting').reverse().sortBy('createdAt');
  },

  async update(id: string, patch: Partial<Pick<OutboxItem, 'state' | 'error' | 'tries'>>): Promise<void> {
    const item = await db.outbox.get(id);
    if (!item) return;
    await db.outbox.put({ ...item, ...patch });
  },

  async remove(id: string): Promise<void> {
    await db.outbox.delete(id);
  },

  async clearSent(userId: string): Promise<void> {
    const sent = await db.outbox.where('userId').equals(userId).and((item) => item.state === 'sent').toArray();
    await db.outbox.bulkDelete(sent.map((i) => i.id));
  },
};

/**
 * User preferences.
 */
export const prefsDb = {
  async get(key: string): Promise<unknown> {
    const pref = await db.preferences.get(key);
    return pref?.value;
  },

  async set(key: string, value: unknown): Promise<void> {
    await db.preferences.put({ id: key, key, value, updatedAt: Date.now() });
  },

  async getAll(): Promise<Record<string, unknown>> {
    const all = await db.preferences.toArray();
    return Object.fromEntries(all.map((p) => [p.key, p.value]));
  },
};