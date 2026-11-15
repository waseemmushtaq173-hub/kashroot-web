// src/app/api/cold-storage/book-units/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const UnitItemSchema = z.object({
  levelIndex: z.number().int().min(1).max(12),
  levelCode: z.string().min(1),
  row: z.number().int().min(1),
  col: z.number().int().min(1),
  unitCode: z.string().min(1),
  unitType: z.enum(['WOODEN_BIN', 'PLASTIC_CRATE']),
  unitCapacityKg: z.number().positive(),
  storedQuantityKg: z.number().positive(),
});

const BookUnitsSchema = z.object({
  bookingId: z.string().uuid().optional(),
  facilityId: z.string().uuid(),
  chamberId: z.string().uuid(),
  farmerId: z.string().uuid(),
  farmerName: z.string().min(1),
  transactionId: z.string().min(1),
  idempotencyKeyPrefix: z.string().min(6),
  paymentStatus: z.enum(['PENDING', 'VERIFIED_PAID']),
  storageEndDate: z.string().datetime().optional(),
  units: z.array(UnitItemSchema).min(1).max(500),
});

function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const facilityId = searchParams.get('facilityId');
  const chamberId = searchParams.get('chamberId');

  const supabase = getSupabaseServer();
  let query = supabase
    .from('cold_storage_unit_allocations')
    .select('*')
    .in('payment_status', ['PENDING', 'VERIFIED_PAID', 'RELEASED'])
    .order('created_at', { ascending: true });

  if (facilityId) query = query.eq('facility_id', facilityId);
  if (chamberId) query = query.eq('chamber_id', chamberId);

  const { data: allocations, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message, allocations: [] }, { status: 500 });
  }

  let temperatureLogs: Array<Record<string, unknown>> = [];
  if (chamberId) {
    const { data: logs } = await supabase
      .from('cold_chamber_temperature_logs')
      .select('*')
      .eq('chamber_id', chamberId)
      .order('recorded_at', { ascending: false })
      .limit(20);
    temperatureLogs = logs ?? [];
  }

  return NextResponse.json({
    ok: true,
    allocations: allocations ?? [],
    temperatureLogs,
  });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON request body' }, { status: 400 });
  }

  const parsed = BookUnitsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const supabase = getSupabaseServer();

  // 1. Verify real facility exists in public.rental_listings
  const { data: facility, error: facErr } = await supabase
    .from('rental_listings')
    .select('id, title, facility_code, owner_payout_upi, owner_bank_account_name, owner_bank_account_no, owner_bank_ifsc')
    .eq('id', payload.facilityId)
    .single();

  if (facErr || !facility) {
    return NextResponse.json(
      { ok: false, error: 'Cold storage facility not found in database.' },
      { status: 404 }
    );
  }

  // 2. Verify real chamber exists in public.cold_chambers and belongs to this facility
  const { data: chamber, error: chErr } = await supabase
    .from('cold_chambers')
    .select('id, listing_id, name, chamber_code, storage_unit_type, unit_default_capacity_kg, levels_count')
    .eq('id', payload.chamberId)
    .single();

  if (chErr || !chamber) {
    return NextResponse.json(
      { ok: false, error: 'Selected chamber not found in database.' },
      { status: 404 }
    );
  }

  if (chamber.listing_id !== facility.id) {
    return NextResponse.json(
      { ok: false, error: 'Selected chamber does not belong to this facility.' },
      { status: 400 }
    );
  }

  // 3. Enforce real unit capacity limits
  for (const u of payload.units) {
    if (u.storedQuantityKg > u.unitCapacityKg) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Unit ' + u.unitCode + ' quantity (' + u.storedQuantityKg + ' kg) exceeds unit capacity (' + u.unitCapacityKg + ' kg).',
        },
        { status: 400 }
      );
    }
  }

  const realFacilityCode = facility.facility_code || facility.title || facility.id.slice(0, 8).toUpperCase();
  const realChamberCode = chamber.chamber_code || chamber.name || chamber.id.slice(0, 6).toUpperCase();

  const rowsToInsert = payload.units.map((u) => ({
    booking_id: payload.bookingId ?? null,
    facility_id: facility.id,
    facility_code: realFacilityCode,
    chamber_id: chamber.id,
    chamber_code: realChamberCode,
    level_code: u.levelCode,
    level_index: u.levelIndex,
    row_index: u.row,
    col_index: u.col,
    unit_code: u.unitCode,
    unit_type: u.unitType,
    unit_capacity_kg: u.unitCapacityKg,
    stored_quantity_kg: u.storedQuantityKg,
    farmer_id: payload.farmerId,
    farmer_name: payload.farmerName,
    payment_status: payload.paymentStatus,
    transaction_id: payload.transactionId,
    idempotency_key: payload.idempotencyKeyPrefix + ':' + chamber.id + ':' + u.levelCode + ':' + u.unitCode,
    storage_end_date: payload.storageEndDate ?? null,
  }));

  const { data: inserted, error } = await supabase
    .from('cold_storage_unit_allocations')
    .upsert(rowsToInsert, { onConflict: 'idempotency_key' })
    .select('*');

  if (error) {
    const isConflict = error.code === '23505' || error.message.includes('uq_active_storage_slot');
    return NextResponse.json(
      {
        ok: false,
        code: isConflict ? 'SLOT_ALREADY_RESERVED' : 'DB_ERROR',
        error: isConflict
          ? 'One or more selected 3D storage positions are already booked by another farmer.'
          : error.message,
      },
      { status: isConflict ? 409 : 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    bookedCount: inserted?.length ?? 0,
    totalBookedKg: payload.units.reduce((acc, u) => acc + u.storedQuantityKg, 0),
    transactionId: payload.transactionId,
    paymentStatus: payload.paymentStatus,
    directOwnerSettlement: {
      payoutUpi: facility.owner_payout_upi ?? null,
      accountName: facility.owner_bank_account_name ?? null,
      bankAccountNo: facility.owner_bank_account_no ?? null,
      bankIfsc: facility.owner_bank_ifsc ?? null,
    },
    allocations: inserted ?? [],
  });
}
