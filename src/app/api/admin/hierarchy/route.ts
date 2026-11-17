// src/app/api/admin/hierarchy/route.ts
import { NextResponse } from 'next/server';
import { dbFor, orgAccessOf, verifiedCaller, type Caller, type OrgAccess } from '@/lib/server/callerAuth';
import { ipLimited, tooMany } from '@/lib/server/sign';
import {
  BUSINESS_CATEGORIES,
  BUSINESS_CATEGORY_LABEL,
  BusinessStaffRole,
  DEFAULT_BUSINESS_CATEGORY,
  ROLE_DEFAULT_PERMISSIONS,
  categoryHasModule,
  isBusinessCategory,
  noBusinessCategoryColumn,
  normalizeBusinessCategory,
  recordAdministrativeAuditLog,
  type OwnerModule,
} from '@/lib/multiTenantAuth';

export const dynamic = 'force-dynamic';

const SIGN_IN = () => NextResponse.json({ ok: false, error: 'Please sign in to open this.' }, { status: 401 });
const NOT_YOURS = (what = 'this business') =>
  NextResponse.json({ ok: false, error: `You do not have access to ${what}.` }, { status: 403 });
const FAILED = (what: string) => NextResponse.json({ ok: false, error: what }, { status: 500 });

type Db = ReturnType<typeof dbFor>;

/** Who is acting on a business, read from the database (never from the request body), for the audit trail. */
async function actorOf(
  db: Db,
  caller: Caller,
  access: OrgAccess,
  organizationId: string,
): Promise<{ name: string; role: string; allowed: (permission: string) => boolean } | null> {
  if (access.superAdmin) return { name: 'Platform Superadmin', role: 'PLATFORM_SUPERADMIN', allowed: () => true };
  if (access.ownedOrgIds.includes(organizationId)) {
    const { data } = await db.from('cold_storage_organizations').select('owner_full_name').eq('id', organizationId).maybeSingle();
    return { name: data?.owner_full_name || 'Business owner', role: 'BUSINESS_OWNER', allowed: () => true };
  }
  if (!access.orgIds.includes(organizationId)) return null;
  const { data: staff } = await db
    .from('owner_staff_members')
    .select('full_name, staff_role, permissions_matrix, user_id, email')
    .eq('organization_id', organizationId)
    .or(`user_id.eq.${caller.id}${caller.email ? `,email.eq.${caller.email}` : ''}`)
    .maybeSingle();
  if (!staff) return null;
  const perms = (staff.permissions_matrix ?? {}) as Record<string, unknown>;
  return { name: staff.full_name, role: String(staff.staff_role), allowed: (permission) => perms[permission] === true };
}

export async function GET(request: Request) {
  if (ipLimited(request, 'hierarchy-get', 120)) return tooMany();

  const caller = await verifiedCaller(request);
  if (!caller) return SIGN_IN();
  const supabase = dbFor(caller);
  const access = await orgAccessOf(request, supabase, caller);

  const { searchParams } = new URL(request.url);
  const scope = (searchParams.get('scope') || 'COLD_STORAGE_OWNER_ADMIN').toUpperCase();
  const organizationId = searchParams.get('organizationId');
  const facilityId = searchParams.get('facilityId');
  // Oversight is the Super Admin's alone: for anyone else the flag is ignored, not honoured.
  const isSuperadminOversight = access.superAdmin && searchParams.get('oversight') === '1';

  // ============================================================================
  // LEVEL 1: PLATFORM SUPERADMIN (FOUNDER) GLOBAL OVERVIEW
  // ============================================================================
  if (scope === 'PLATFORM_SUPERADMIN') {
    if (!access.superAdmin) return NOT_YOURS('the platform overview');
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

    // business_category is absent until its migration is run: every organization then reads as cold storage.
    const orgs = (orgsRes.data ?? []).map((o) => ({
      ...o,
      business_category: normalizeBusinessCategory(o.business_category),
    }));
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
  // LEVEL 2: OWNER ADMIN (MULTI-TENANT SCOPED BY organizationId, MODULES BY BUSINESS CATEGORY)
  // ============================================================================
  // A business is opened by the person who owns it or works for it (or by the Super Admin): the id in the address
  // is only a choice among the businesses the database says they may open.
  let targetOrgId = organizationId;
  if (targetOrgId) {
    if (!access.superAdmin && !access.orgIds.includes(targetOrgId)) return NOT_YOURS();
  } else if (!access.superAdmin) {
    targetOrgId = access.orgIds[0] ?? null;
  } else {
    targetOrgId = access.orgIds[0] ?? null;
    if (!targetOrgId) {
      const { data: firstOrg } = await supabase
        .from('cold_storage_organizations')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      targetOrgId = firstOrg?.id || null;
    }
  }

  if (!targetOrgId) {
    return NextResponse.json({
      ok: true,
      scope: 'COLD_STORAGE_OWNER_ADMIN',
      organization: null,
      facilities: [],
    });
  }

  // The category decides which modules (and so which tables) this console reads.
  const orgRes = await supabase
    .from('cold_storage_organizations')
    .select('*')
    .eq('id', targetOrgId)
    .maybeSingle();
  const businessCategory = normalizeBusinessCategory(orgRes.data?.business_category);
  const has = (module: OwnerModule) => categoryHasModule(businessCategory, module);
  const skipped = { data: [] as never[] };

  if (isSuperadminOversight) {
    await recordAdministrativeAuditLog(supabase, {
      actorName: 'Platform Superadmin',
      actorRole: 'PLATFORM_SUPERADMIN',
      isSuperadminOversightAction: true,
      organizationId: targetOrgId,
      actionCategory: 'SUPERADMIN_OVERSIGHT_INSPECTION',
      actionSummary: `Platform Superadmin opened Owner Admin Portal (${BUSINESS_CATEGORY_LABEL[businessCategory]}) in authorized oversight mode for organization ${targetOrgId}.`,
    });
  }

  const [
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
    (access.superAdmin
      ? supabase.from('cold_storage_organizations').select('*')
      : supabase.from('cold_storage_organizations').select('*').in('id', access.orgIds)
    ).order('created_at', { ascending: true }),
    has('facilities')
      ? supabase
          .from('rental_listings')
          .select('*')
          .eq('organization_id', targetOrgId)
          .order('created_at', { ascending: true })
      : skipped,
    has('facilities')
      ? supabase.from('cold_storage_floors').select('*').eq('organization_id', targetOrgId)
      : skipped,
    has('chambers')
      ? supabase.from('cold_chambers').select('*').eq('organization_id', targetOrgId)
      : skipped,
    has('bins')
      ? supabase
          .from('cold_storage_bins')
          .select('*')
          .eq('organization_id', targetOrgId)
          .order('bin_code', { ascending: true })
      : skipped,
    has('bins')
      ? supabase
          .from('shared_bin_allocations')
          .select('*')
          .eq('organization_id', targetOrgId)
          .order('received_at', { ascending: false })
      : skipped,
    has('bookings')
      ? supabase
          .from('cold_storage_bookings')
          .select('*')
          .eq('organization_id', targetOrgId)
          .order('created_at', { ascending: false })
      : skipped,
    has('inventory')
      ? supabase
          .from('apple_inventory_movements')
          .select('*')
          .eq('organization_id', targetOrgId)
          .order('recorded_at', { ascending: false })
          .limit(100)
      : skipped,
    has('telemetry')
      ? supabase
          .from('ca_chamber_environment_readings')
          .select('*')
          .eq('organization_id', targetOrgId)
          .order('recorded_at', { ascending: false })
          .limit(50)
      : skipped,
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
    organization: orgRes.data ? { ...orgRes.data, business_category: businessCategory } : null,
    businessCategory,
    availableOrganizationsForSwitcher: (allApprovedOrgsRes.data ?? []).map((o) => ({
      id: o.id,
      organization_code: o.organization_code,
      business_name: o.business_name,
      district: o.district,
      onboarding_status: o.onboarding_status,
      business_category: normalizeBusinessCategory(o.business_category),
    })),
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
  if (ipLimited(request, 'hierarchy-post', 60)) return tooMany();

  const body = await request.json().catch(() => null);
  if (!body || !body.action) {
    return NextResponse.json({ ok: false, error: 'Missing action parameter' }, { status: 400 });
  }

  const caller = await verifiedCaller(request);
  if (!caller) return SIGN_IN();
  const supabase = dbFor(caller);
  const access = await orgAccessOf(request, supabase, caller);
  const nowIso = new Date().toISOString();

  // ============================================================================
  // ACTION 1: SEPARATE OWNER ONBOARDING APPLICATION (ANY BUSINESS CATEGORY)
  // ============================================================================
  if (body.action === 'REGISTER_OWNER_ORGANIZATION') {
    if (
      !body.businessName ||
      !body.ownerFullName ||
      !body.ownerEmail ||
      !body.ownerPhone ||
      !String(body.headquartersAddress ?? '').trim() ||
      !String(body.district ?? '').trim() ||
      !String(body.stateUt ?? '').trim()
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Business Name, Owner Name, Email, Phone, Headquarters Address, District and State are required.',
        },
        { status: 400 }
      );
    }

    const rawCategory = body.businessCategory ?? body.business_category;
    const businessCategory =
      rawCategory == null || String(rawCategory).trim() === ''
        ? DEFAULT_BUSINESS_CATEGORY
        : String(rawCategory).trim().toUpperCase();
    if (!isBusinessCategory(businessCategory)) {
      return NextResponse.json(
        { ok: false, error: `Business category must be one of: ${BUSINESS_CATEGORIES.join(', ')}.` },
        { status: 400 }
      );
    }

    const orgCode = `KR-ORG-${Date.now().toString().slice(-6)}`;
    const orgRow = {
      organization_code: orgCode,
      business_name: String(body.businessName).trim(),
      legal_entity_type: body.legalEntityType || 'PRIVATE_LIMITED',
      gstin_or_reg_no: body.gstinOrRegNo || null,
      pan_number: body.panNumber || null,
      owner_full_name: String(body.ownerFullName).trim(),
      owner_email: String(body.ownerEmail).trim().toLowerCase(),
      owner_phone: String(body.ownerPhone).trim(),
      headquarters_address: String(body.headquartersAddress).trim(),
      district: String(body.district).trim(),
      state_ut: String(body.stateUt).trim(),
      verification_notes: body.verificationNotes ? String(body.verificationNotes).trim() : null,
      onboarding_status: 'PENDING_VERIFICATION',
      // The account that applied is the business's owner; it is never taken from the form.
      owner_user_id: caller.id,
      upi_id: body.upiId || null,
      bank_name: body.bankName ? String(body.bankName).trim() : null,
    };

    let insertRes = await supabase
      .from('cold_storage_organizations')
      .insert({ ...orgRow, business_category: businessCategory })
      .select('*')
      .single();
    let categoryPersisted = true;
    if (insertRes.error && noBusinessCategoryColumn(insertRes.error.message)) {
      // The category column is not in the database yet: register without it and keep the
      // requested category in the notes the Platform Superadmin reads while reviewing.
      categoryPersisted = false;
      insertRes = await supabase
        .from('cold_storage_organizations')
        .insert({
          ...orgRow,
          verification_notes:
            businessCategory === DEFAULT_BUSINESS_CATEGORY
              ? orgRow.verification_notes
              : `Business category: ${BUSINESS_CATEGORY_LABEL[businessCategory]}. ${orgRow.verification_notes}`,
        })
        .select('*')
        .single();
    }
    const { data: org, error } = insertRes;

    if (error || !org) {
      return FAILED('Could not register the business just now. Please try again.');
    }

    await recordAdministrativeAuditLog(supabase, {
      actorName: org.owner_full_name,
      actorRole: `${businessCategory}_OWNER_APPLICANT`,
      organizationId: org.id,
      actionCategory: 'OWNER_ONBOARDING',
      actionSummary: `New ${BUSINESS_CATEGORY_LABEL[businessCategory]} business "${org.business_name}" (${org.organization_code}) submitted onboarding application (Status: PENDING_VERIFICATION).`,
      targetTable: 'cold_storage_organizations',
      targetRecordId: org.id,
      afterValues: org,
    });

    return NextResponse.json({
      ok: true,
      categoryPersisted,
      organization: { ...org, business_category: normalizeBusinessCategory(org.business_category) },
    });
  }

  // ============================================================================
  // ACTION 2: PLATFORM SUPERADMIN APPROVES / REJECTS / SUSPENDS OWNER BUSINESS
  // ============================================================================
  if (body.action === 'SUPERADMIN_REVIEW_OWNER') {
    if (!access.superAdmin) return NOT_YOURS('this decision');
    const { organizationId, decisionStatus, reviewNotes } = body;
    if (!organizationId || !decisionStatus) {
      return NextResponse.json(
        { ok: false, error: 'organizationId and decisionStatus required' },
        { status: 400 }
      );
    }
    if (!['PENDING_VERIFICATION', 'INFO_REQUESTED', 'APPROVED_ACTIVE', 'REJECTED', 'SUSPENDED'].includes(String(decisionStatus))) {
      return NextResponse.json({ ok: false, error: 'Unknown decision.' }, { status: 400 });
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

    if (error || !updatedOrg) return FAILED('Could not save the decision just now. Please try again.');

    await recordAdministrativeAuditLog(supabase, {
      actorName: 'Platform Superadmin',
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

    const actor = await actorOf(supabase, caller, access, String(body.organizationId));
    if (!actor || !actor.allowed('manage_staff')) return NOT_YOURS('this business’s staff');

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

    if (error || !staff) return FAILED('Could not save this staff member just now. Please try again.');

    await recordAdministrativeAuditLog(supabase, {
      actorName: actor.name,
      actorRole: actor.role,
      isSuperadminOversightAction: access.superAdmin && Boolean(body.isSuperadminOversight),
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
    if (!body.organizationId || !body.farmerName) {
      return NextResponse.json(
        { ok: false, error: 'organizationId and the farmer / customer name are required' },
        { status: 400 }
      );
    }

    const actor = await actorOf(supabase, caller, access, String(body.organizationId));
    if (!actor || !actor.allowed('manage_financials')) return NOT_YOURS('this business’s ledger');
    if (body.facilityId) {
      // A facility of another business cannot be written to from this one.
      const { data: fac } = await supabase.from('rental_listings').select('organization_id').eq('id', body.facilityId).maybeSingle();
      if (fac?.organization_id && String(fac.organization_id) !== String(body.organizationId)) return NOT_YOURS('that facility');
    }

    // Businesses with no facility (logistics, agro-dealer, mandi) keep their ledger
    // against the business itself: the ledger needs a facility id and name.
    let ledgerFacilityId: string = body.facilityId;
    let ledgerFacilityName: string = body.facilityName || 'Authorized CA Facility';
    if (!ledgerFacilityId) {
      const { data: ownerOrg } = await supabase
        .from('cold_storage_organizations')
        .select('business_name')
        .eq('id', body.organizationId)
        .maybeSingle();
      if (!ownerOrg) {
        return NextResponse.json({ ok: false, error: 'Organization not found' }, { status: 404 });
      }
      ledgerFacilityId = body.organizationId;
      ledgerFacilityName = ownerOrg.business_name;
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
        facility_id: ledgerFacilityId,
        facility_name: ledgerFacilityName,
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

    if (error || !txn) return FAILED('Could not record this entry just now. Please try again.');

    await recordAdministrativeAuditLog(supabase, {
      actorName: actor.name,
      actorRole: actor.role,
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
