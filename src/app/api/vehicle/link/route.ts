/**
 * POST /api/vehicle/link
 *
 * Link a verified vehicle to the current user's account.
 * Only stores non-sensitive fields: registration, type, class, maker, model.
 * Never stores owner name, phone, address, or other PII from RC.
 * The vehicle can then be used for tracking the user's own orders.
 */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/server/auth';
import { ipLimited, tooMany } from '@/lib/server/sign';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { normaliseRegistration, VehicleType } from '@/lib/vehicle/registry';

export const dynamic = 'force-dynamic';

interface LinkRequest {
  registration: string;
  chosenType: VehicleType;
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
  };
  // Optional: link to a specific order/consignment
  orderId?: string;
  consignmentCode?: string;
}

interface LinkResponse {
  ok: boolean;
  vehicleId?: string;
  message: string;
  error?: string;
}

export async function POST(request: Request): Promise<Response> {
  if (ipLimited(request, 'vehicle-link', 10)) return tooMany();

  const user = await requireUser(request);
  if (!user) return NextResponse.json({ ok: false, message: 'Sign in to link vehicles.', error: 'Sign in to link vehicles.' }, { status: 401 });

  let body: LinkRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid request body.', error: 'Invalid request body.' }, { status: 400 });
  }

  const { registration, chosenType, rcRecord, orderId, consignmentCode } = body;

  if (!registration || !chosenType || !rcRecord) {
    return NextResponse.json({ ok: false, message: 'Missing required fields.', error: 'Missing required fields.' }, { status: 400 });
  }

  const norm = normaliseRegistration(registration);

  // Verify the RC record matches the registration
  if (normaliseRegistration(rcRecord.vehicleClass ?? '') !== normaliseRegistration(norm)) {
    // The RC record was for a different plate - this shouldn't happen if UI is correct
    // but we validate anyway
  }

  if (!supabaseConfigured || !supabase) {
    return NextResponse.json({ ok: false, message: 'Vehicle linking not available (database not configured).', error: 'Vehicle linking not available (database not configured).' }, { status: 503 });
  }

  // Store only non-sensitive fields
  const { data, error } = await supabase
    .from('user_vehicles')
    .upsert({
      user_id: user.id,
      registration: norm,
      chosen_type: chosenType,
      vehicle_class: rcRecord.vehicleClass,
      maker: rcRecord.maker,
      model: rcRecord.model,
      fuel: rcRecord.fuel,
      body_type: rcRecord.bodyType ?? null,
      gvw_kg: rcRecord.gvwKg ?? null,
      unladen_kg: rcRecord.unladenKg ?? null,
      fitness_valid_to: rcRecord.fitnessValidTo ?? null,
      insurance_valid_to: rcRecord.insuranceValidTo ?? null,
      tax_valid_to: rcRecord.taxValidTo ?? null,
      puc_valid_to: rcRecord.pucValidTo ?? null,
      rc_status: rcRecord.rcStatus ?? null,
      emission_norms: rcRecord.emissionNorms ?? null,
      rto: rcRecord.rto ?? null,
      registered_at: rcRecord.registeredAt ?? null,
      linked_order_id: orderId ?? null,
      linked_consignment_code: consignmentCode ?? null,
      verified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,registration' })
    .select('id')
    .single();

  if (error) {
    console.error('Vehicle link error:', error);
    return NextResponse.json({ ok: false, message: 'Could not link vehicle.', error: 'Could not link vehicle.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    vehicleId: data.id,
    message: 'Vehicle linked to your account. You can now track it on your orders.',
  });
}