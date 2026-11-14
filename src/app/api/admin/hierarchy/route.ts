// src/app/api/admin/hierarchy/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  BusinessStaffRole,
  ROLE_DEFAULT_PERMISSIONS,
  recordAdministrativeAuditLog,
} from '@/lib/multiTenantAuth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = (searchParams.get('scope') || 'COLD_STORAGE_OWNER_ADMIN').toUpperCase();
  const organizationId = searchParams.get('organizationId');
  const facilityId = searchParams.get('facilityId');
  const isSuperadminOversight = searchParams.get('oversight') === '1';

  const supabase = getSupabase();

  // ============================================================================
  // LEVEL 1: PLATFORM SUPERADMIN (FOUNDER) GLOBAL OVERVIEW
  // ============================================================================
  if (scope === 'PLATFORM_SUPERADMIN') {
    const [
      orgsRes,
      facilitiesRes,
      chambersRes,
      binsRes,
      bookingsRes,
      finRes,
      envAlertsRes,
      auditRes,
    ] = await Promise.all([
      supabase
        .from('cold_storage_organizations')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('rental_listings').select('*').order('created_at', { ascending: false }),
      supabase.from('cold_chambers').select('*'),
      supabase.from('cold_storage_bins').select('*'),
      supabase
        .from('cold_storage_bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('facility_financial_transactions')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(100),
      supabase
        .from('ca_chamber_environment_readings')
        .select('*')
        .neq('alert_status', 'NORMAL')
        .order('recorded_at', { ascending: false })
        .limit(30),
      supabase
        .from('platform_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    const orgs = orgsRes.data ?? [];
    const facilities = facilitiesRes.data ?? [];
    const chambers = chambersRes.data ?? [];
    const bins = binsRes.data ?? [];
    const bookings = bookingsRes.data ?? [];
    const financials = finRes.data ?? [];

    const totalCapacityCrates = bins.reduce((s, b) => s + Number(b.max_crates || 0), 0);
    const occupiedCapacityCrates = bins.reduce((s, b) => s + Number(b.occupied_crates || 0), 0);
    const totalRevenueInr = financials.reduce((s, f) => s + Number(f.paid_amount_inr || 0), 0);

    // Enrich each organization with its facility & occupancy summary
    const enrichedOrgs = orgs.map((org) => {
      const orgFacilities = facilities.filter((f) => f.organization_id === org.id);
      const orgBookings = bookings.filter((b) => b.organization_id === org.id);
      const orgBins = bins.filter((b) => b.organization_id === org.id);
      const orgMaxCrates = orgBins.reduce((s, b) => s + Number(b.max_crates || 0), 0);
      const orgOccupiedCrates = orgBins.reduce((s, b) => s + Number(b.occupied_crates || 0), 0);

      return {
        ...org,
        facilities_count: orgFacilities.length,
        facilities: orgFacilities,
        active_bookings_count: orgBookings.length,
        total_capacity_crates: orgMaxCrates,
        occupied_capacity_crates: orgOccupiedCrates,
        available_capacity_crates: Math.max(0, orgMaxCrates - orgOccupiedCrates),
      };
    });

    return NextResponse.json({
      ok: true,
      scope: 'PLATFORM_SUPERADMIN',
      summary: {
        totalOrganizations: orgs.length,
        approvedOrganizations: orgs.filter((o) => o.onboarding_status === 'APPROVED_ACTIVE').length,
        pendingApplications: orgs.filter((o) => o.onboarding_status === 'PENDING_VERIFICATION').length,
        suspendedOrRejected: orgs.filter((o) =>
          ['REJECTED', 'SUSPENDED'].includes(o.onboarding_status)
        ).length,
        totalFacilities: facilities.length,
        totalChambers: chambers.length,
        totalBins: bins.length,
        totalCapacityCrates,
        occupiedCapacityCrates,
        availableCapacityCrates: Math.max(0, totalCapacityCrates - occupiedCapacityCrates),
        totalBookings: bookings.length,
        totalPlatformRevenueInr: totalRevenueInr,
      },
      organizations: enrichedOrgs,
      facilities,
      recentBookings: bookings,
      financialTransactions: financials,
      environmentalAlerts: envAlertsRes.data ?? [],
      auditLogs: auditRes.data ?? [],
    });
  }

  // ============================================================================
  // LEVEL 2: COLD STORAGE OWNER ADMIN (MULTI-TENANT SCOPED BY organizationId)
  // ============================================================================
  let targetOrgId = organizationId;
  if (!targetOrgId) {
    const { data: firstOrg } = await supabase
      .from('cold_storage_organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    targetOrgId = firstOrg?.id || null;
  }

  if (!targetOrgId) {
    return NextResponse.json({
      ok: true,
      scope: 'COLD_STORAGE_OWNER_ADMIN',
      organization: null,
      facilities: [],
    });
  }

  if (isSuperadminOversight) {
    await recordAdministrativeAuditLog(supabase, {
      actorName: 'Waseem Mushtaq Mir (Platform Superadmin)',
      actorRole: 'PLATFORM_SUPERADMIN',
      isSuperadminOversightAction: true,
      organizationId: targetOrgId,
      actionCategory: 'SUPERADMIN_OVERSIGHT_INSPECTION',
      actionSummary: `Platform Superadmin opened Owner Admin Portal in authorized oversight mode for organization ${targetOrgId}.`,
    });
  }

  const [
    orgRes,
    allApprovedOrgsRes,
    facilitiesRes,
    floorsRes,
    chambersRes,
    binsRes,
    allocationsRes,
    bookingsRes,
    movementsRes,
    envRes,
    finRes,
    staffRes,
    auditRes,
  ] = await Promise.all([
    supabase.from('cold_storage_organizations').select('*').eq('id', targetOrgId).maybeSingle(),
    supabase
      .from('cold_storage_organizations')
      .select('id, organization_code, business_name, district, onboarding_status')
      .order('created_at', { ascending: true }),
    supabase
      .from('rental_listings')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('created_at', { ascending: true }),
    supabase.from('cold_storage_floors').select('*').eq('organization_id', targetOrgId),
    supabase.from('cold_chambers').select('*').eq('organization_id', targetOrgId),
    supabase
      .from('cold_storage_bins')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('bin_code', { ascending: true }),
    supabase
      .from('shared_bin_allocations')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('received_at', { ascending: false }),
    supabase
      .from('cold_storage_bookings')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('apple_inventory_movements')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('recorded_at', { ascending: false })
      .limit(100),
    supabase
      .from('ca_chamber_environment_readings')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('recorded_at', { ascending: false })
      .limit(50),
    supabase
      .from('facility_financial_transactions')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('owner_staff_members')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('created_at', { ascending: false }),
    supabase
      .from('platform_audit_logs')
      .select('*')
      .eq('organization_id', targetOrgId)
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  const facilities = facilitiesRes.data ?? [];
  const activeFacilityId = facilityId || facilities[0]?.id || null;

  const bins = binsRes.data ?? [];
  const allocations = allocationsRes.data ?? [];
  const bookings = bookingsRes.data ?? [];
  const financials = finRes.data ?? [];

  const enrichedBins = bins.map((b) => ({
    ...b,
    available_crates: Math.max(0, Number(b.max_crates || 0) - Number(b.occupied_crates || 0)),
    farmer_allocations: allocations.filter((a) => a.bin_id === b.id && a.active_crates > 0),
  }));

  const uniqueFarmers = Array.from(
    new Set(bookings.map((bk) => bk.farmer_phone || bk.farmer_name).filter(Boolean))
  );

  return NextResponse.json({
    ok: true,
    scope: 'COLD_STORAGE_OWNER_ADMIN',
    isSuperadminOversight,
    organization: orgRes.data,
    availableOrganizationsForSwitcher: allApprovedOrgsRes.data ?? [],
    activeFacilityId,
    facilities,
    floors: floorsRes.data ?? [],
    chambers: chambersRes.data ?? [],
    bins: enrichedBins,
    sharedAllocations: allocations,
    bookings,
    movements: movementsRes.data ?? [],
    caReadings: envRes.data ?? [],
    financialTransactions: financials,
    staffMembers: staffRes.data ?? [],
    auditLogs: auditRes.data ?? [],
    ownerKpis: {
      totalFacilities: facilities.length,
      totalFloors: (floorsRes.data ?? []).length || facilities.length,
      totalChambers: (chambersRes.data ?? []).length,
      totalBins: bins.length,
      totalCapacityCrates: bins.reduce((s, b) => s + Number(b.max_crates || 0), 0),
      occupiedCapacityCrates: bins.reduce((s, b) => s + Number(b.occupied_crates || 0), 0),
      availableCapacityCrates: bins.reduce(
        (s, b) => s + Math.max(0, Number(b.max_crates || 0) - Number(b.occupied_crates || 0)),
        0
      ),
      activeBookings: bookings.filter((b) =>
        ['APPROVED_AWAITING_RECEIPT', 'RECEIVED_AND_BIN_ALLOCATED'].includes(b.booking_status)
      ).length,
      pendingBookings: bookings.filter((b) => b.booking_status === 'PENDING_OWNER_APPROVAL').length,
      pendingReleaseRequests: allocations.filter((a) => a.allocation_status === 'RELEASE_REQUESTED')
        .length,
      totalFarmersCount: uniqueFarmers.length,
      totalRevenueCollectedInr: financials.reduce((s, f) => s + Number(f.paid_amount_inr || 0), 0),
      totalOutstandingInr: financials.reduce(
        (s, f) => s + Number(f.outstanding_amount_inr || 0),
        0
      ),
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !body.action) {
    return NextResponse.json({ ok: false, error: 'Missing action parameter' }, { status: 400 });
  }

  const supabase = getSupabase();
  const nowIso = new Date().toISOString();

  // ============================================================================
  // ACTION 1: SEPARATE COLD STORAGE OWNER ONBOARDING APPLICATION
  // ============================================================================
  if (body.action === 'REGISTER_OWNER_ORGANIZATION') {
    if (!body.businessName || !body.ownerFullName || !body.ownerEmail || !body.ownerPhone) {
      return NextResponse.json(
        { ok: false, error: 'Business Name, Owner Name, Email, and Phone are required.' },
        { status: 400 }
      );
    }

    const orgCode = `KR-ORG-${Date.now().toString().slice(-6)}`;
    const { data: org, error } = await supabase
      .from('cold_storage_organizations')
      .insert({
        organization_code: orgCode,
        business_name: String(body.businessName).trim(),
        legal_entity_type: body.legalEntityType || 'PRIVATE_LIMITED',
        gstin_or_reg_no: body.gstinOrRegNo || null,
        pan_number: body.panNumber || null,
        owner_full_name: String(body.ownerFullName).trim(),
        owner_email: String(body.ownerEmail).trim().toLowerCase(),
        owner_phone: String(body.ownerPhone).trim(),
        headquarters_address: body.headquartersAddress || 'Industrial Growth Centre, Lassipora',
        district: body.district || 'Shopian',
        state_ut: body.stateUt || 'Jammu & Kashmir',
        verification_notes: body.verificationNotes || 'Submitted via Owner Onboarding Portal',
        onboarding_status: 'PENDING_VERIFICATION',
        upi_id: body.upiId || null,
        bank_name: body.bankName || 'J&K Bank',
      })
      .select('*')
      .single();

    if (error || !org) {
      return NextResponse.json(
        { ok: false, error: error?.message || 'Owner registration failed' },
        { status: 500 }
      );
    }

    await recordAdministrativeAuditLog(supabase, {
      actorName: org.owner_full_name,
      actorRole: 'COLD_STORAGE_OWNER_APPLICANT',
      organizationId: org.id,
      actionCategory: 'OWNER_ONBOARDING',
      actionSummary: `New Cold Storage Owner business "${org.business_name}" (${org.organization_code}) submitted onboarding application (Status: PENDING_VERIFICATION).`,
      targetTable: 'cold_storage_organizations',
      targetRecordId: org.id,
      afterValues: org,
    });

    return NextResponse.json({ ok: true, organization: org });
  }

  // ============================================================================
  // ACTION 2: PLATFORM SUPERADMIN APPROVES / REJECTS / SUSPENDS OWNER BUSINESS
  // ============================================================================
  if (body.action === 'SUPERADMIN_REVIEW_OWNER') {
    const { organizationId, decisionStatus, reviewNotes } = body;
    if (!organizationId || !decisionStatus) {
      return NextResponse.json(
        { ok: false, error: 'organizationId and decisionStatus required' },
        { status: 400 }
      );
    }

    const { data: beforeOrg } = await supabase
      .from('cold_storage_organizations')
      .select('*')
      .eq('id', organizationId)
      .maybeSingle();

    const { data: updatedOrg, error } = await supabase
      .from('cold_storage_organizations')
      .update({
        onboarding_status: decisionStatus,
        verification_notes: reviewNotes || beforeOrg?.verification_notes,
        approved_at: decisionStatus === 'APPROVED_ACTIVE' ? nowIso : beforeOrg?.approved_at,
        updated_at: nowIso,
      })
      .eq('id', organizationId)
      .select('*')
      .single();

    if (error || !updatedOrg) {
      return NextResponse.json(
        { ok: false, error: error?.message || 'Failed to update organization status' },
        { status: 500 }
      );
    }

    await recordAdministrativeAuditLog(supabase, {
      actorName: 'Waseem Mushtaq Mir (Platform Superadmin)',
      actorRole: 'PLATFORM_SUPERADMIN',
      organizationId,
      actionCategory: 'OWNER_APPROVAL_DECISION',
      actionSummary: `Platform Superadmin set "${updatedOrg.business_name}" status to ${decisionStatus}.`,
      targetTable: 'cold_storage_organizations',
      targetRecordId: organizationId,
      beforeValues: beforeOrg,
      afterValues: updatedOrg,
    });

    return NextResponse.json({ ok: true, organization: updatedOrg });
  }

  // ============================================================================
  // ACTION 3: OWNER ADDS OR UPDATES STAFF / EMPLOYEE WITH GRANULAR PERMISSIONS
  // ============================================================================
  if (body.action === 'UPSERT_OWNER_STAFF') {
    const role = (body.staffRole || 'BOOKING_MANAGER') as BusinessStaffRole;
    const defaultPerms =
      ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS.BOOKING_MANAGER;
    const finalPerms = body.permissionsMatrix
      ? { ...defaultPerms, ...body.permissionsMatrix }
      : defaultPerms;

    if (!body.organizationId || !body.fullName || !body.email || !body.phone) {
      return NextResponse.json(
        { ok: false, error: 'organizationId, fullName, email, and phone are required' },
        { status: 400 }
      );
    }

    const { data: staff, error } = await supabase
      .from('owner_staff_members')
      .upsert(
        {
          organization_id: body.organizationId,
          assigned_facility_id: body.assignedFacilityId || null,
          full_name: String(body.fullName).trim(),
          email: String(body.email).trim().toLowerCase(),
          phone: String(body.phone).trim(),
          staff_role: role,
          permissions_matrix: finalPerms,
          employment_status: body.employmentStatus || 'ACTIVE',
          updated_at: nowIso,
        },
        { onConflict: 'organization_id,email' }
      )
      .select('*')
      .single();

    if (error || !staff) {
      return NextResponse.json(
        { ok: false, error: error?.message || 'Could not save staff member' },
        { status: 500 }
      );
    }

    await recordAdministrativeAuditLog(supabase, {
      actorName: body.actorName || 'Cold Storage Owner Admin',
      actorRole: body.actorRole || 'COLD_STORAGE_OWNER',
      isSuperadminOversightAction: Boolean(body.isSuperadminOversight),
      organizationId: body.organizationId,
      actionCategory: 'STAFF_PERMISSION_CHANGE',
      actionSummary: `Assigned role ${role} to staff member ${staff.full_name} (${staff.email}).`,
      targetTable: 'owner_staff_members',
      targetRecordId: staff.id,
      afterValues: staff,
    });

    return NextResponse.json({ ok: true, staff });
  }

  // ============================================================================
  // ACTION 4: OWNER RECORDS OR UPDATES BUSINESS FINANCIAL TRANSACTION
  // ============================================================================
  if (body.action === 'RECORD_FINANCIAL_TRANSACTION') {
    if (!body.organizationId || !body.facilityId || !body.farmerName) {
      return NextResponse.json(
        { ok: false, error: 'organizationId, facilityId, and farmerName required' },
        { status: 400 }
      );
    }

    const gross = Number(body.grossAmountInr || 0);
    const paid = Number(body.paidAmountInr || 0);
    const outstanding = Math.max(0, gross - paid);
    const paymentStatus =
      paid >= gross && gross > 0 ? 'PAID_VERIFIED' : paid > 0 ? 'PARTIALLY_PAID' : 'PENDING';
    const txnRef = `KR-TXN-${Date.now().toString().slice(-6)}`;

    const { data: txn, error } = await supabase
      .from('facility_financial_transactions')
      .insert({
        transaction_reference: txnRef,
        organization_id: body.organizationId,
        facility_id: body.facilityId,
        facility_name: body.facilityName || 'Authorized CA Facility',
        booking_id: body.bookingId || null,
        booking_reference: body.bookingReference || null,
        farmer_name: body.farmerName,
        transaction_type: body.transactionType || 'STORAGE_BOOKING_CHARGE',
        gross_amount_inr: gross,
        paid_amount_inr: paid,
        outstanding_amount_inr: outstanding,
        payment_method: body.paymentMethod || 'UPI_OR_NEFT',
        payment_status: paymentStatus,
        notes: body.notes || null,
      })
      .select('*')
      .single();

    if (error || !txn) {
      return NextResponse.json(
        { ok: false, error: error?.message || 'Failed to record financial transaction' },
        { status: 500 }
      );
    }

    await recordAdministrativeAuditLog(supabase, {
      actorName: body.actorName || 'Cold Storage Owner Admin',
      actorRole: body.actorRole || 'COLD_STORAGE_OWNER',
      organizationId: body.organizationId,
      facilityId: body.facilityId,
      actionCategory: 'FINANCIAL_STATUS_CHANGE',
      actionSummary: `Recorded ${txn.transaction_type} (${txn.transaction_reference}) for ${txn.farmer_name}: Gross ₹${gross}, Paid ₹${paid} (${paymentStatus}).`,
      targetTable: 'facility_financial_transactions',
      targetRecordId: txn.id,
      afterValues: txn,
    });

    return NextResponse.json({ ok: true, transaction: txn });
  }

  return NextResponse.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
}
