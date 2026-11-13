// src/app/api/cold-storage/operations/route.ts
//
// KashRoot CA Cold Storage operations: shared-bin multi-farmer allocation
// (e.g. Bin B-102 holding crates from several farmers at once), the booking
// workflow, the immutable inventory movement ledger, and live CA chamber
// telemetry.
//
// Engineering: thermodynamics follow Fishery Leaflet 427 as adapted for
// APPLE controlled-atmosphere storage in src/lib/coldStorageEngineeringEngine
// (apples are living fruit stored above freezing - frozen-fish parameters are
// never applied). Every CA setpoint requires cultivar-specific agronomic
// validation.
//
// Data isolation contract (GET):
// - OWNER / ADMIN sees the complete farmer-by-farmer breakdown inside every
//   shared bin.
// - FARMER sees only their own bookings, own allocations and own ledger
//   movements, while still getting each bin's aggregate max/occupied/free
//   crates so they can find free space - never another farmer's name, phone
//   or inventory.
//
// Identity hardening (audit D1): all POST actions are IP-rate-limited; when
// the caller sends an Authorization Bearer token it is verified and bound to
// the acted-on farmer / facility owner. Header-less calls stay allowed and
// rate-limited, matching the platform-wide client-asserted identity model.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  calculateAppleChamberEngineering,
  calculatePsychrometricRelativeHumidity,
} from '@/lib/coldStorageEngineeringEngine';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createClient(url, key, { auth: { persistSession: false } });
}

/** The verified caller when an Authorization Bearer token is present, else null. */
async function verifiedUser(
  supabase: ReturnType<typeof getSupabase>,
  request: Request,
): Promise<{ id: string } | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const { data } = await supabase.auth.getUser(match[1].trim());
  return data.user ? { id: data.user.id } : null;
}

/** 403 when a verified caller acts as a farmer other than themselves. */
function farmerGuard(user: { id: string } | null, farmerId: unknown): NextResponse | null {
  if (user && farmerId && String(user.id) !== String(farmerId)) {
    return NextResponse.json(
      { ok: false, error: 'Signed-in account does not match the farmer on this request.' },
      { status: 403 },
    );
  }
  return null;
}

/** 403 when a verified caller acts on a facility they do not own. */
async function ownerGuard(
  supabase: ReturnType<typeof getSupabase>,
  user: { id: string } | null,
  facilityId: unknown,
): Promise<NextResponse | null> {
  if (!user || !facilityId) return null;
  const { data: listing } = await supabase
    .from('rental_listings')
    .select('owner_id')
    .eq('id', facilityId)
    .single();
  if (listing && String(listing.owner_id) !== String(user.id)) {
    return NextResponse.json(
      { ok: false, error: 'Only the cold storage owner of this facility can do that.' },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(request: Request) {
  if (ipLimited(request, 'cold-operations-get', 120)) return tooMany();

  const { searchParams } = new URL(request.url);
  const facilityId = searchParams.get('facilityId');
  const viewerRole = (searchParams.get('viewerRole') || 'FARMER').toUpperCase();
  const farmerId = searchParams.get('farmerId');
  const chamberCode = searchParams.get('chamberCode');

  const supabase = getSupabase();

  // Fetch physical bins (aggregate capacity is visible to every role).
  let binsQuery = supabase
    .from('cold_storage_bins')
    .select('*')
    .order('bin_code', { ascending: true });
  if (facilityId) binsQuery = binsQuery.eq('facility_id', facilityId);
  if (chamberCode) binsQuery = binsQuery.eq('chamber_code', chamberCode);

  const { data: bins } = await binsQuery.limit(500);

  // Fetch shared-bin allocations.
  let allocQuery = supabase
    .from('shared_bin_allocations')
    .select('*')
    .order('received_at', { ascending: false });
  if (facilityId) allocQuery = allocQuery.eq('facility_id', facilityId);

  const { data: allAllocations } = await allocQuery.limit(1000);

  // STRICT DATA ISOLATION:
  // Owner/Admin sees all farmers inside every shared bin.
  // Farmer sees ONLY their own allocations inside shared bins.
  const visibleAllocations =
    viewerRole === 'OWNER' || viewerRole === 'ADMIN'
      ? allAllocations ?? []
      : (allAllocations ?? []).filter(
          (a) => farmerId && String(a.farmer_id) === String(farmerId),
        );

  // Enrich bins with role-isolated farmer allocations.
  const enrichedBins = (bins ?? []).map((b) => {
    const allInBin = (allAllocations ?? []).filter(
      (a) => a.bin_id === b.id && a.active_crates > 0,
    );
    const visibleInBin = visibleAllocations.filter(
      (a) => a.bin_id === b.id && a.active_crates > 0,
    );

    return {
      ...b,
      available_crates: Math.max(0, b.max_crates - b.occupied_crates),
      shared_farmers_count: allInBin.length,
      // Owner gets the full farmer breakdown; Farmer gets ONLY their own slice.
      allocations: visibleInBin,
    };
  });

  // Bookings: Owner sees the facility's bookings; Farmer sees only their own.
  let bookingsQuery = supabase
    .from('cold_storage_bookings')
    .select('*')
    .order('created_at', { ascending: false });
  if (facilityId && (viewerRole === 'OWNER' || viewerRole === 'ADMIN')) {
    bookingsQuery = bookingsQuery.eq('facility_id', facilityId);
  } else if (farmerId) {
    bookingsQuery = bookingsQuery.eq('farmer_id', farmerId);
  }
  const { data: bookings } = await bookingsQuery.limit(200);

  // Inventory movement ledger (strictly isolated for farmers).
  let movementsQuery = supabase
    .from('apple_inventory_movements')
    .select('*')
    .order('recorded_at', { ascending: false });
  if (facilityId && (viewerRole === 'OWNER' || viewerRole === 'ADMIN')) {
    movementsQuery = movementsQuery.eq('facility_id', facilityId);
  } else if (farmerId) {
    movementsQuery = movementsQuery.eq('farmer_id', farmerId);
  }
  const { data: movements } = await movementsQuery.limit(200);

  // Live CA environmental readings.
  let envQuery = supabase
    .from('ca_chamber_environment_readings')
    .select('*')
    .order('recorded_at', { ascending: false });
  if (facilityId) envQuery = envQuery.eq('facility_id', facilityId);
  if (chamberCode) envQuery = envQuery.eq('chamber_code', chamberCode);
  const { data: caReadings } = await envQuery.limit(60);

  // Notifications.
  let notifQuery = supabase
    .from('cold_storage_notifications')
    .select('*')
    .order('created_at', { ascending: false });
  if (viewerRole === 'FARMER' && farmerId) {
    notifQuery = notifQuery.eq('recipient_user_id', farmerId);
  } else if (facilityId) {
    notifQuery = notifQuery.eq('facility_id', facilityId);
  }
  const { data: notifications } = await notifQuery.limit(50);

  return NextResponse.json({
    ok: true,
    viewerRole,
    bins: enrichedBins,
    bookings: bookings ?? [],
    movements: movements ?? [],
    caReadings: caReadings ?? [],
    notifications: notifications ?? [],
  });
}

export async function POST(request: Request) {
  if (ipLimited(request, 'cold-operations-post', 60)) return tooMany();

  const body = await request.json().catch(() => null);
  if (!body || !body.action) {
    return NextResponse.json({ ok: false, error: 'Missing action' }, { status: 400 });
  }

  const supabase = getSupabase();
  const nowIso = new Date().toISOString();
  const user = await verifiedUser(supabase, request);

  // ACTION 1: LEAFLET 427 + APPLE CA ENGINEERING LOAD & EQUIPMENT SIZING.
  if (body.action === 'CALCULATE_ENGINEERING_SPECS') {
    const result = calculateAppleChamberEngineering({
      lengthFt: Number(body.lengthFt || 100),
      widthFt: Number(body.widthFt || 50),
      heightFt: Number(body.heightFt || 24),
      insulationThicknessIn: Number(body.insulationThicknessIn || 6),
      insulationKFactor: Number(body.insulationKFactor || 0.22),
      outsideDesignTempF: Number(body.outsideDesignTempF || 90),
      roomTempF: Number(body.roomTempF || 32),
      evaporatorCoilTempF: Number(body.evaporatorCoilTempF || 29),
      surfaceColor: body.surfaceColor || 'LIGHT',
      hasVestibuleFlapperDoors: Boolean(body.hasVestibuleFlapperDoors ?? true),
      totalStoredApplesKg: Number(body.totalStoredApplesKg || 200000),
      dailyIncomingApplesKg: Number(body.dailyIncomingApplesKg || 15000),
      incomingFruitTempF: Number(body.incomingFruitTempF || 65),
      pulldownHours: Number(body.pulldownHours || 24),
      fanMotorsTotalHp: Number(body.fanMotorsTotalHp || 5),
      lightingWatts: Number(body.lightingWatts || 600),
      workersCount: Number(body.workersCount || 3),
      compressorOperatingHoursPerDay: Number(body.compressorOperatingHoursPerDay || 16),
      evaporatorType: body.evaporatorType || 'BLOWER_UNIT_COOLER_OVER_AISLE',
    });

    return NextResponse.json({ ok: true, engineering: result });
  }

  // ACTION 2: FARMER SUBMITS BOOKING REQUEST.
  if (body.action === 'SUBMIT_BOOKING') {
    const crates = Number(body.requestedCrates || 0);
    const crateKg = Number(body.crateWeightKg || 18);
    const months = Number(body.durationMonths || 3);
    const rate = Number(body.ratePerCratePerMonthInr || 35);

    if (!body.facilityId || !body.farmerId || crates <= 0) {
      return NextResponse.json(
        { ok: false, error: 'facilityId, farmerId, and requestedCrates > 0 are required' },
        { status: 400 },
      );
    }

    const guard = farmerGuard(user, body.farmerId);
    if (guard) return guard;

    const bookingRef = `KR-BK-${new Date().getFullYear()}-${Math.floor(
      100000 + Math.random() * 900000,
    )}`;
    const totalWeightKg = Number((crates * crateKg).toFixed(2));
    const totalChargeInr = Number((crates * rate * months).toFixed(2));

    const { data: booking, error } = await supabase
      .from('cold_storage_bookings')
      .insert({
        booking_reference: bookingRef,
        facility_id: body.facilityId,
        facility_name: body.facilityName || 'KashRoot CA Cold Storage',
        chamber_id: body.chamberId || null,
        chamber_code: body.chamberCode || 'CH-01',
        farmer_id: body.farmerId,
        farmer_name: body.farmerName || 'Verified Orchardist',
        farmer_phone: body.farmerPhone || '',
        farmer_village_or_district: body.farmerDistrict || 'Shopian',
        apple_variety: body.appleVariety || 'Kullu Delicious',
        apple_grade: body.appleGrade || 'Grade A',
        requested_crates: crates,
        crate_weight_kg: crateKg,
        total_weight_kg: totalWeightKg,
        duration_months: months,
        rate_per_crate_per_month_inr: rate,
        total_estimated_charge_inr: totalChargeInr,
        booking_status: 'PENDING_OWNER_APPROVAL',
      })
      .select('*')
      .single();

    if (error || !booking) {
      return NextResponse.json(
        { ok: false, error: error?.message || 'Booking failed' },
        { status: 500 },
      );
    }

    await supabase.from('apple_inventory_movements').insert({
      facility_id: body.facilityId,
      chamber_code: booking.chamber_code,
      bin_code: 'PENDING',
      booking_id: booking.id,
      farmer_id: booking.farmer_id,
      farmer_name: booking.farmer_name,
      apple_variety: booking.apple_variety,
      movement_type: 'BOOKING_SUBMITTED',
      crates_delta: crates,
      weight_kg_delta: totalWeightKg,
      balance_crates_after: 0,
      recorded_by_role: 'FARMER',
      notes: `Farmer requested storage for ${crates} crates (${totalWeightKg} kg) of ${booking.apple_variety}.`,
    });

    return NextResponse.json({ ok: true, booking });
  }

  // ACTION 3: OWNER ACCEPTS OR REJECTS BOOKING.
  if (body.action === 'OWNER_DECIDE_BOOKING') {
    const { data: existing } = await supabase
      .from('cold_storage_bookings')
      .select('facility_id')
      .eq('id', body.bookingId)
      .single();
    const ownerBlock = await ownerGuard(supabase, user, existing?.facility_id);
    if (ownerBlock) return ownerBlock;

    const decision =
      body.decision === 'REJECT' ? 'REJECTED_BY_OWNER' : 'APPROVED_AWAITING_RECEIPT';
    const { data: booking, error } = await supabase
      .from('cold_storage_bookings')
      .update({
        booking_status: decision,
        owner_decision_notes: body.notes || null,
        updated_at: nowIso,
      })
      .eq('id', body.bookingId)
      .select('*')
      .single();

    if (error || !booking) {
      return NextResponse.json(
        { ok: false, error: error?.message || 'Booking not found' },
        { status: 404 },
      );
    }

    await supabase.from('apple_inventory_movements').insert({
      facility_id: booking.facility_id,
      chamber_code: booking.chamber_code,
      bin_code: 'PENDING',
      booking_id: booking.id,
      farmer_id: booking.farmer_id,
      farmer_name: booking.farmer_name,
      apple_variety: booking.apple_variety,
      movement_type: 'BOOKING_APPROVED',
      crates_delta: 0,
      weight_kg_delta: 0,
      balance_crates_after: 0,
      recorded_by_role: 'OWNER',
      notes: `Booking ${booking.booking_reference} ${decision === 'REJECTED_BY_OWNER' ? 'rejected' : 'approved'} by the cold storage owner.`,
    });

    await supabase.from('cold_storage_notifications').insert({
      facility_id: booking.facility_id,
      recipient_role: 'FARMER',
      recipient_user_id: booking.farmer_id,
      recipient_phone: booking.farmer_phone,
      notification_type:
        decision === 'REJECTED_BY_OWNER' ? 'BOOKING_REJECTED' : 'BOOKING_CONFIRMED',
      title:
        decision === 'REJECTED_BY_OWNER'
          ? `Booking ${booking.booking_reference} Rejected`
          : `Booking ${booking.booking_reference} Approved`,
      message:
        decision === 'REJECTED_BY_OWNER'
          ? `Your cold storage booking request was declined. ${body.notes || ''}`
          : `Your booking for ${booking.requested_crates} crates of ${booking.apple_variety} at ${booking.facility_name} is approved for gate receiving.`,
      booking_reference: booking.booking_reference,
    });

    return NextResponse.json({ ok: true, booking });
  }

  // ACTION 4: SHARED BIN MULTI-FARMER ALLOCATION
  // (e.g. Bin B-102: Farmer A 40 + Farmer B 30 + Farmer C 20 -> 90/100, 10 free).
  if (body.action === 'ALLOCATE_TO_SHARED_BIN') {
    const cratesToAllocate = Number(body.cratesToAllocate || 0);
    const binCode = String(body.binCode || 'B-102').trim().toUpperCase();
    const chamberCode = String(body.chamberCode || 'CH-01').trim().toUpperCase();

    if (!body.bookingId || !body.facilityId || cratesToAllocate <= 0) {
      return NextResponse.json(
        { ok: false, error: 'bookingId, facilityId, and cratesToAllocate > 0 required' },
        { status: 400 },
      );
    }

    const { data: booking } = await supabase
      .from('cold_storage_bookings')
      .select('*')
      .eq('id', body.bookingId)
      .single();

    if (!booking) {
      return NextResponse.json({ ok: false, error: 'Booking record not found' }, { status: 404 });
    }

    const ownerBlock = await ownerGuard(supabase, user, booking.facility_id);
    if (ownerBlock) return ownerBlock;

    // Find or initialize the physical bin (e.g. B-102, default max 100 crates).
    let bin = (
      await supabase
        .from('cold_storage_bins')
        .select('*')
        .eq('facility_id', booking.facility_id)
        .eq('chamber_code', chamberCode)
        .eq('bin_code', binCode)
        .maybeSingle()
    ).data;

    if (!bin) {
      // The bin's crate limit: what the owner's desk sent, else the chamber's
      // own "crates one shared bin holds" (the owner wizard, cold_chambers
      // .crates_per_bin), else 100.
      let maxCrates = Number(body.binMaxCrates || 0);
      if (!Number.isFinite(maxCrates) || maxCrates < 1) {
        const chamberRef = body.chamberId || booking.chamber_id || null;
        if (chamberRef) {
          const { data: ch } = await supabase
            .from('cold_chambers')
            .select('crates_per_bin')
            .eq('id', chamberRef)
            .maybeSingle();
          maxCrates = Number(ch?.crates_per_bin) || 0;
        }
        maxCrates = Math.max(1, Math.min(1000, maxCrates || 100));
      }
      const { data: createdBin, error: createBinErr } = await supabase
        .from('cold_storage_bins')
        .insert({
          facility_id: booking.facility_id,
          chamber_id: body.chamberId || booking.chamber_id || booking.facility_id,
          chamber_code: chamberCode,
          floor_number: Number(body.floorNumber || 1),
          level_index: Number(body.levelIndex || 1),
          row_index: Number(body.rowIndex || 1),
          col_index: Number(body.colIndex || 2),
          bin_code: binCode,
          bin_type: 'MACRO_PALLET_BIN',
          max_crates: maxCrates,
          crate_weight_kg: booking.crate_weight_kg,
          max_capacity_kg: maxCrates * booking.crate_weight_kg,
          occupied_crates: 0,
          occupied_weight_kg: 0,
          occupancy_status: 'EMPTY',
        })
        .select('*')
        .single();

      if (createBinErr || !createdBin) {
        return NextResponse.json(
          { ok: false, error: createBinErr?.message || 'Failed to initialize bin' },
          { status: 500 },
        );
      }
      bin = createdBin;
    }

    // Over-allocation guard: the bin's CHECK constraint is the final backstop,
    // this check returns the readable 409 first.
    const remainingCratesInBin = bin.max_crates - bin.occupied_crates;
    if (cratesToAllocate > remainingCratesInBin) {
      return NextResponse.json(
        {
          ok: false,
          error: `Over-allocation prevented on Bin ${binCode}: requested ${cratesToAllocate} crates, but only ${remainingCratesInBin} of ${bin.max_crates} crates are available.`,
        },
        { status: 409 },
      );
    }

    const weightKg = Number((cratesToAllocate * booking.crate_weight_kg).toFixed(2));
    const newOccupiedCrates = bin.occupied_crates + cratesToAllocate;
    const newOccupiedWeight = Number((Number(bin.occupied_weight_kg) + weightKg).toFixed(2));
    const newBinStatus = newOccupiedCrates >= bin.max_crates ? 'FULL_OCCUPIED' : 'PARTIALLY_SHARED';

    // The farmer's independent slice in the shared bin.
    const { data: allocation, error: allocErr } = await supabase
      .from('shared_bin_allocations')
      .insert({
        facility_id: booking.facility_id,
        chamber_id: bin.chamber_id,
        chamber_code: chamberCode,
        bin_id: bin.id,
        bin_code: binCode,
        booking_id: booking.id,
        booking_reference: booking.booking_reference,
        farmer_id: booking.farmer_id,
        farmer_name: booking.farmer_name,
        farmer_phone: booking.farmer_phone,
        apple_variety: booking.apple_variety,
        apple_grade: booking.apple_grade,
        allocated_crates: cratesToAllocate,
        released_crates: 0,
        active_crates: cratesToAllocate,
        crate_weight_kg: booking.crate_weight_kg,
        active_weight_kg: weightKg,
        allocation_status: 'ACTIVE_IN_BIN',
      })
      .select('*')
      .single();

    if (allocErr || !allocation) {
      return NextResponse.json(
        { ok: false, error: allocErr?.message || 'Shared bin allocation failed' },
        { status: 500 },
      );
    }

    // Physical bin occupancy.
    const { data: updatedBin } = await supabase
      .from('cold_storage_bins')
      .update({
        occupied_crates: newOccupiedCrates,
        occupied_weight_kg: newOccupiedWeight,
        occupancy_status: newBinStatus,
        dominant_apple_variety: bin.dominant_apple_variety || booking.apple_variety,
        updated_at: nowIso,
      })
      .eq('id', bin.id)
      .select('*')
      .single();

    // Booking allocated count and status.
    const newBookingAllocated = Number(booking.allocated_crates || 0) + cratesToAllocate;
    await supabase
      .from('cold_storage_bookings')
      .update({
        allocated_crates: newBookingAllocated,
        chamber_code: chamberCode,
        booking_status: 'RECEIVED_AND_BIN_ALLOCATED',
        updated_at: nowIso,
      })
      .eq('id', booking.id);

    // Inward gate receiving + traceable inventory movement.
    await supabase.from('apple_inventory_movements').insert({
      facility_id: booking.facility_id,
      chamber_code: chamberCode,
      bin_code: binCode,
      booking_id: booking.id,
      allocation_id: allocation.id,
      farmer_id: booking.farmer_id,
      farmer_name: booking.farmer_name,
      apple_variety: booking.apple_variety,
      movement_type: 'SHARED_BIN_ALLOCATION',
      crates_delta: cratesToAllocate,
      weight_kg_delta: weightKg,
      balance_crates_after: cratesToAllocate,
      recorded_by_role: 'OWNER',
      notes: `Allocated ${cratesToAllocate} crates (${weightKg} kg) of ${booking.apple_variety} for ${booking.farmer_name} into Shared Bin ${binCode} (${newOccupiedCrates}/${bin.max_crates} crates occupied).`,
    });

    // Notify the farmer.
    await supabase.from('cold_storage_notifications').insert({
      facility_id: booking.facility_id,
      recipient_role: 'FARMER',
      recipient_user_id: booking.farmer_id,
      recipient_phone: booking.farmer_phone,
      notification_type: 'SHARED_BIN_ALLOCATED',
      title: `Apples Stored in Chamber ${chamberCode} · Bin ${binCode}`,
      message: `${cratesToAllocate} crates (${weightKg} kg) of your ${booking.apple_variety} have been received and allocated to Bin ${binCode} under Booking ${booking.booking_reference}.`,
      booking_reference: booking.booking_reference,
      bin_code: binCode,
    });

    return NextResponse.json({ ok: true, bin: updatedBin ?? bin, allocation });
  }

  // ACTION 5: FARMER REQUESTS RELEASE, OWNER CONFIRMS GATE DISPATCH.
  if (body.action === 'RELEASE_OR_DISPATCH_FROM_BIN') {
    const cratesToRelease = Number(body.cratesToRelease || 0);
    const isFinalDispatch = body.subAction === 'CONFIRM_DISPATCH';

    const { data: alloc } = await supabase
      .from('shared_bin_allocations')
      .select('*')
      .eq('id', body.allocationId)
      .single();

    if (!alloc || cratesToRelease <= 0 || cratesToRelease > alloc.active_crates) {
      return NextResponse.json(
        { ok: false, error: 'Invalid release quantity or allocation not found' },
        { status: 400 },
      );
    }

    if (!isFinalDispatch) {
      // Farmer-initiated release request.
      const guard = farmerGuard(user, alloc.farmer_id);
      if (guard) return guard;

      await supabase
        .from('shared_bin_allocations')
        .update({ allocation_status: 'RELEASE_REQUESTED', updated_at: nowIso })
        .eq('id', alloc.id);

      await supabase
        .from('cold_storage_bookings')
        .update({ booking_status: 'RELEASE_REQUESTED', updated_at: nowIso })
        .eq('id', alloc.booking_id);

      await supabase.from('apple_inventory_movements').insert({
        facility_id: alloc.facility_id,
        chamber_code: alloc.chamber_code,
        bin_code: alloc.bin_code,
        booking_id: alloc.booking_id,
        allocation_id: alloc.id,
        farmer_id: alloc.farmer_id,
        farmer_name: alloc.farmer_name,
        apple_variety: alloc.apple_variety,
        movement_type: 'RELEASE_REQUESTED_BY_FARMER',
        crates_delta: 0,
        weight_kg_delta: 0,
        balance_crates_after: alloc.active_crates,
        recorded_by_role: 'FARMER',
        notes: `Farmer requested release of ${cratesToRelease} crates from Bin ${alloc.bin_code}.`,
      });

      await supabase.from('cold_storage_notifications').insert({
        facility_id: alloc.facility_id,
        recipient_role: 'OWNER',
        notification_type: 'RELEASE_REQUESTED',
        title: `Release Requested from Bin ${alloc.bin_code}`,
        message: `${alloc.farmer_name} requested release of ${cratesToRelease} crates of ${alloc.apple_variety} from Bin ${alloc.bin_code} (booking ${alloc.booking_reference}).`,
        booking_reference: alloc.booking_reference,
        bin_code: alloc.bin_code,
      });

      return NextResponse.json({ ok: true, status: 'RELEASE_REQUESTED' });
    }

    // Owner confirms the outward gate dispatch: decrement the farmer's slice
    // and the physical bin occupancy.
    const ownerBlock = await ownerGuard(supabase, user, alloc.facility_id);
    if (ownerBlock) return ownerBlock;

    const weightReleased = Number((cratesToRelease * alloc.crate_weight_kg).toFixed(2));
    const newReleased = alloc.released_crates + cratesToRelease;
    const newActive = alloc.allocated_crates - newReleased;

    await supabase
      .from('shared_bin_allocations')
      .update({
        released_crates: newReleased,
        active_crates: newActive,
        active_weight_kg: Number((newActive * alloc.crate_weight_kg).toFixed(2)),
        allocation_status: newActive === 0 ? 'FULLY_RELEASED' : 'PARTIALLY_RELEASED',
        released_at: newActive === 0 ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('id', alloc.id);

    const { data: bin } = await supabase
      .from('cold_storage_bins')
      .select('*')
      .eq('id', alloc.bin_id)
      .single();

    if (bin) {
      const nextOccupied = Math.max(0, bin.occupied_crates - cratesToRelease);
      await supabase
        .from('cold_storage_bins')
        .update({
          occupied_crates: nextOccupied,
          occupied_weight_kg: Math.max(
            0,
            Number((Number(bin.occupied_weight_kg) - weightReleased).toFixed(2)),
          ),
          occupancy_status:
            nextOccupied === 0
              ? 'EMPTY'
              : nextOccupied >= bin.max_crates
                ? 'FULL_OCCUPIED'
                : 'PARTIALLY_SHARED',
          updated_at: nowIso,
        })
        .eq('id', bin.id);
    }

    await supabase
      .from('cold_storage_bookings')
      .update({
        booking_status: newActive === 0 ? 'DISPATCHED_COMPLETED' : 'PARTIALLY_DISPATCHED',
        updated_at: nowIso,
      })
      .eq('id', alloc.booking_id);

    await supabase.from('apple_inventory_movements').insert({
      facility_id: alloc.facility_id,
      chamber_code: alloc.chamber_code,
      bin_code: alloc.bin_code,
      booking_id: alloc.booking_id,
      allocation_id: alloc.id,
      farmer_id: alloc.farmer_id,
      farmer_name: alloc.farmer_name,
      apple_variety: alloc.apple_variety,
      movement_type: 'OUTWARD_GATE_DISPATCH',
      crates_delta: -cratesToRelease,
      weight_kg_delta: -weightReleased,
      balance_crates_after: newActive,
      recorded_by_role: 'OWNER',
      notes: `Dispatched ${cratesToRelease} crates (${weightReleased} kg) for ${alloc.farmer_name} from Shared Bin ${alloc.bin_code}.`,
    });

    await supabase.from('cold_storage_notifications').insert({
      facility_id: alloc.facility_id,
      recipient_role: 'FARMER',
      recipient_user_id: alloc.farmer_id,
      recipient_phone: alloc.farmer_phone,
      notification_type: 'DISPATCH_CONFIRMED',
      title: `Dispatch Confirmed from Bin ${alloc.bin_code}`,
      message: `${cratesToRelease} crates (${weightReleased} kg) of ${alloc.apple_variety} have been released and dispatched. Remaining in Bin ${alloc.bin_code}: ${newActive} crates.`,
      booking_reference: alloc.booking_reference,
      bin_code: alloc.bin_code,
    });

    return NextResponse.json({ ok: true, remainingActiveCrates: newActive });
  }

  // ACTION 6: LOG LIVE CA CHAMBER TELEMETRY (TEMP, RH%, O2%, CO2%, ETHYLENE).
  if (body.action === 'LOG_CA_ENVIRONMENT') {
    const ownerBlock = await ownerGuard(supabase, user, body.facilityId);
    if (ownerBlock) return ownerBlock;

    const tempF = Number(body.dryBulbTempF ?? 32.0);
    const tempC = Number((((tempF - 32) * 5) / 9).toFixed(2));
    const coilF = Number(body.evaporatorCoilTempF ?? tempF - 3.0);
    const psychro = calculatePsychrometricRelativeHumidity(tempF, coilF);
    const rh = Number(body.relativeHumidityPercent ?? psychro.estimatedLoadedChamberRhPercent);
    const o2 = body.oxygenO2Percent !== undefined ? Number(body.oxygenO2Percent) : 1.8;
    const co2 =
      body.carbonDioxideCo2Percent !== undefined ? Number(body.carbonDioxideCo2Percent) : 1.5;

    let alertStatus: 'NORMAL' | 'WARNING_THRESHOLD' | 'CRITICAL_ALARM' = 'NORMAL';
    const alerts: string[] = [];

    if (tempF < 29.5) {
      alertStatus = 'CRITICAL_ALARM';
      alerts.push(
        `Freezing hazard: Chamber temperature (${tempF}°F) approaching the apple freezing point (~28.5°F). Setpoints require cultivar-specific agronomic validation.`,
      );
    } else if (tempF > 38.0) {
      alertStatus = 'WARNING_THRESHOLD';
      alerts.push(`High chamber temperature (${tempF}°F > 38°F threshold).`);
    }
    if (rh < 85.0) {
      if (alertStatus === 'NORMAL') alertStatus = 'WARNING_THRESHOLD';
      alerts.push(`Low Relative Humidity (${rh}% < 85%): check coil ΔT (${psychro.deltaTF}°F).`);
    }
    if (o2 < 0.9 || o2 > 5.0) {
      if (alertStatus === 'NORMAL') alertStatus = 'WARNING_THRESHOLD';
      alerts.push(`CA Oxygen O2 (${o2}%) outside the target window (0.9%–5.0%).`);
    }
    if (co2 > 5.0) {
      if (alertStatus === 'NORMAL') alertStatus = 'WARNING_THRESHOLD';
      alerts.push(`CA Carbon Dioxide CO2 (${co2}%) above the 5% ceiling - check scrubber/ventilation.`);
    }

    const { data: reading, error } = await supabase
      .from('ca_chamber_environment_readings')
      .insert({
        facility_id: body.facilityId,
        chamber_id: body.chamberId || body.facilityId,
        chamber_code: body.chamberCode || 'CH-01',
        reading_source: body.readingSource || 'IOT_SENSOR',
        sensor_device_id: body.sensorDeviceId || 'CA-NODE-01',
        dry_bulb_temp_f: tempF,
        dry_bulb_temp_c: tempC,
        evaporator_coil_temp_f: coilF,
        relative_humidity_percent: rh,
        oxygen_o2_percent: o2,
        carbon_dioxide_co2_percent: co2,
        ethylene_ppm: body.ethylenePpm ? Number(body.ethylenePpm) : 0.05,
        air_velocity_fpm: body.airVelocityFpm ? Number(body.airVelocityFpm) : 45,
        alert_status: alertStatus,
        alert_message: alerts.length > 0 ? alerts.join(' ') : null,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Surface an ENVIRONMENT_ALERT notification so owners see alarms instantly.
    if (alertStatus !== 'NORMAL' && body.facilityId) {
      await supabase.from('cold_storage_notifications').insert({
        facility_id: body.facilityId,
        recipient_role: 'OWNER',
        notification_type: 'ENVIRONMENT_ALERT',
        title: `CA Alert · Chamber ${body.chamberCode || 'CH-01'} (${alertStatus === 'CRITICAL_ALARM' ? 'CRITICAL' : 'WARNING'})`,
        message: alerts.join(' '),
        bin_code: null,
      });
    }

    return NextResponse.json({ ok: true, reading, psychrometrics: psychro });
  }

  return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
}
