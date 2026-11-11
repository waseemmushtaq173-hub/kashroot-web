/**
 * RC Verification Adapter — pluggable providers for vehicle registration lookup.
 *
 * Providers implement `lookup(registration)` → `RcRecord | null`.
 * The adapter tries each configured provider in order until one succeeds.
 * If none succeed, returns null (not an error — the plate may be new/private).
 */
import 'server-only';

import { normaliseRegistration } from '@/lib/vehicle/registry';

export interface RcRecord {
  /** Normalised registration number (no separators). */
  registration: string;
  /** Formatted for display (e.g. JK-01-AB-1234). */
  formatted: string;
  /** VAHAN vehicle class description (e.g. "Light Goods Vehicle"). */
  vehicleClass: string;
  /** Make / manufacturer (e.g. "Tata", "Ashok Leyland", "Mahindra"). */
  maker: string;
  /** Model (e.g. "Ace", "1618", "Bolero Pickup"). */
  model: string;
  /** Fuel type (e.g. "Diesel", "CNG", "Electric"). */
  fuel: string;
  /** Body type (e.g. "Container", "Open Body", "Refrigerated Van"). */
  bodyType?: string;
  /** Gross vehicle weight in kg. */
  gvwKg?: number;
  /** Unladen weight in kg. */
  unladenKg?: number;
  /** Fitness certificate valid to (ISO date). */
  fitnessValidTo?: string;
  /** Insurance valid to (ISO date). */
  insuranceValidTo?: string;
  /** Tax paid to (ISO date). */
  taxValidTo?: string;
  /** PUC valid to (ISO date). */
  pucValidTo?: string;
  /** RC status (e.g. "Active", "Suspended", "Cancelled"). */
  rcStatus?: string;
  /** Emission norms (e.g. "BS6"). */
  emissionNorms?: string;
  /** Registering authority / RTO. */
  rto?: string;
  /** Registration date (ISO). */
  registeredAt?: string;
  /** Raw provider response for debugging. */
  raw?: unknown;
}

export interface RcProvider {
  /** Unique provider key. */
  key: string;
  /** Human-readable name. */
  name: string;
  /** Look up a registration. Returns null if not found. Throws on error. */
  lookup(registration: string): Promise<RcRecord | null>;
  /** Check if provider is configured (has credentials). */
  isConfigured(): boolean;
}

const providers: RcProvider[] = [];

/** Register a provider (called at startup). */
export function registerRcProvider(provider: RcProvider): void {
  providers.push(provider);
}

/** Get all configured providers. */
export function getConfiguredProviders(): RcProvider[] {
  return providers.filter((p) => p.isConfigured());
}

/**
 * Look up a registration using all configured providers in order.
 * Returns the first successful result, or null if none found.
 */
export async function verifyRc(registration: string): Promise<{ record: RcRecord | null; provider: string | null; error?: string }> {
  const norm = normaliseRegistration(registration);
  const configured = getConfiguredProviders();

  if (configured.length === 0) {
    return { record: null, provider: null, error: 'No RC verification provider configured' };
  }

  for (const provider of configured) {
    try {
      const record = await provider.lookup(norm);
      if (record) return { record, provider: provider.key };
    } catch (err) {
      console.warn(`RC provider ${provider.key} failed:`, err instanceof Error ? err.message : err);
      // Try next provider
    }
  }

  return { record: null, provider: null, error: 'Registration not found in any configured provider' };
}

/** Built-in provider: ULIP/VAHAN (already exists in ulip.ts). */
export function createUlipRcProvider(): RcProvider {
  return {
    key: 'ulip',
    name: 'ULIP / VAHAN (Government of India)',
    isConfigured: () => {
      const { ulipConfigured } = require('@/lib/server/ulip');
      return ulipConfigured();
    },
    async lookup(registration: string) {
      const { vahan } = require('@/lib/server/ulip');
      const details = await vahan(registration);
      if (!details?.fields?.length) return null;

      const fields = Object.fromEntries(details.fields.map((f: { label: string; value: string }) => [f.label, f.value]));

      return {
        registration: normaliseRegistration(registration),
        formatted: fields['Registration no.'] ?? registration,
        vehicleClass: fields['Vehicle class'] ?? 'Unknown',
        maker: fields['Maker'] ?? 'Unknown',
        model: fields['Model'] ?? 'Unknown',
        fuel: fields['Fuel'] ?? 'Unknown',
        bodyType: fields['Body type'],
        gvwKg: fields['Gross weight (kg)'] ? parseInt(fields['Gross weight (kg)'], 10) : undefined,
        unladenKg: fields['Unladen weight (kg)'] ? parseInt(fields['Unladen weight (kg)'], 10) : undefined,
        fitnessValidTo: fields['Fitness valid to'],
        insuranceValidTo: fields['Insurance valid to'],
        taxValidTo: fields['Tax paid to'],
        pucValidTo: fields['PUC valid to'],
        rcStatus: fields['RC status'],
        emissionNorms: fields['Emission norms'],
        rto: fields['Registering office'],
        registeredAt: fields['Registered on'],
        raw: fields,
      };
    },
  };
}

/** Placeholder for future providers (e.g. VAHAN direct API, third-party gateways). */
export function createCustomRcProvider(key: string, name: string, fn: (reg: string) => Promise<RcRecord | null>, check: () => boolean): RcProvider {
  return {
    key,
    name,
    isConfigured: check,
    async lookup(registration: string) {
      return fn(normaliseRegistration(registration));
    },
  };
}