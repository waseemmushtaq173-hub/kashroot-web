/**
 * POST /api/vehicle/verify
 *
 * Verify a vehicle registration number against configured RC providers (ULIP/VAHAN).
 * Returns the RC record and checks for vehicle type conflict if a type was chosen.
 */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/server/auth';
import { ipLimited, tooMany } from '@/lib/server/sign';
import { normaliseRegistration, isValidRegistration, formatRegistration, checkTypeConflict, VehicleType } from '@/lib/vehicle/registry';
import { verifyRc, createUlipRcProvider, registerRcProvider } from '@/lib/vehicle/rcAdapter';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Register ULIP provider on first request
let providerRegistered = false;
function ensureProvider() {
  if (!providerRegistered) {
    registerRcProvider(createUlipRcProvider());
    providerRegistered = true;
  }
}

interface VerifyRequest {
  registration: string;
  chosenType?: VehicleType;
}

interface VerifyResponse {
  ok: boolean;
  registration: string;
  formatted: string;
  rcRecord: {
    vehicleClass: string;
    maker: string;
    model: string;
    fuel: string;
    bodyType?: string;
    gvwKg?: number;
    unladenKg?: number;
    fitnessValidTo?: string;
    insuranceValidTo?: string;
    taxValidTo?: string;
    pucValidTo?: string;
    rcStatus?: string;
    emissionNorms?: string;
    rto?: string;
    registeredAt?: string;
  } | null;
  typeConflict?: {
    conflict: boolean;
    message?: string;
    rcInferredType?: VehicleType;
    chosenType?: VehicleType;
  };
  provider?: string;
  error?: string;
  source: string;
  checkedAt: string;
}

export async function POST(request: Request): Promise<Response> {
  if (ipLimited(request, 'vehicle-verify', 20)) return tooMany();

  const user = await requireUser(request);
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in to verify vehicles.', registration: '', formatted: '', rcRecord: null, source: '', checkedAt: new Date().toISOString() }, { status: 401 });

  let body: VerifyRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.', registration: '', formatted: '', rcRecord: null, source: '', checkedAt: new Date().toISOString() }, { status: 400 });
  }

  const { registration, chosenType } = body;

  if (!registration || !isValidRegistration(registration)) {
    return NextResponse.json({ ok: false, error: 'Enter a valid Indian registration number (e.g. JK01AB1234).', registration: '', formatted: '', rcRecord: null, source: '', checkedAt: new Date().toISOString() }, { status: 400 });
  }

  const norm = normaliseRegistration(registration);
  const formatted = formatRegistration(norm);
  ensureProvider();

  const { record, provider, error } = await verifyRc(norm);
  const checkedAt = new Date().toISOString();

  if (!record) {
    return NextResponse.json({
      ok: false,
      registration: norm,
      formatted,
      rcRecord: null,
      error: error ?? 'Registration not found in Government records.',
      source: provider ? `${provider} (no record)` : 'No provider configured',
      checkedAt,
    }, { status: 404 });
  }

  // Check for type conflict if user chose a type
  let typeConflict: VerifyResponse['typeConflict'];
  if (chosenType) {
    const conflict = checkTypeConflict(record.vehicleClass, chosenType);
    typeConflict = {
      conflict: conflict.conflict,
      message: conflict.message,
      rcInferredType: conflict.conflict ? (record.vehicleClass ? VehicleType.UNKNOWN : VehicleType.UNKNOWN) : undefined,
      chosenType,
    };
  }

  return NextResponse.json({
    ok: true,
    registration: norm,
    formatted,
    rcRecord: {
      vehicleClass: record.vehicleClass,
      maker: record.maker,
      model: record.model,
      fuel: record.fuel,
      bodyType: record.bodyType,
      gvwKg: record.gvwKg,
      unladenKg: record.unladenKg,
      fitnessValidTo: record.fitnessValidTo,
      insuranceValidTo: record.insuranceValidTo,
      taxValidTo: record.taxValidTo,
      pucValidTo: record.pucValidTo,
      rcStatus: record.rcStatus,
      emissionNorms: record.emissionNorms,
      rto: record.rto,
      registeredAt: record.registeredAt,
    },
    typeConflict,
    provider: provider ?? 'ulip',
    source: 'ULIP / VAHAN (Government of India)',
    checkedAt,
  });
}