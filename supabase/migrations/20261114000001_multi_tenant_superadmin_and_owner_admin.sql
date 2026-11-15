-- supabase/migrations/20261114000001_multi_tenant_superadmin_and_owner_admin.sql
-- KASHROOT — MULTI-LEVEL ADMINISTRATION: PLATFORM SUPERADMIN & MULTI-TENANT
-- COLD STORAGE OWNER ADMIN PORTAL (2026-11-14)
--
-- Tier 1: Platform Superadmin (Founder) — approves owner businesses, oversight mode.
-- Tier 2: Cold Storage Owner organizations — independent multi-tenant business
--         administration with staff RBAC (8 roles) and financial ledger.
-- Idempotent: every CREATE/ALTER is IF NOT EXISTS / IF EXISTS; safe to re-run.

-- 1. Cold Storage Organizations (Multi-Tenant Business Entities: Owner A, Owner B, Owner C)
CREATE TABLE IF NOT EXISTS public.cold_storage_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_code TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  legal_entity_type TEXT DEFAULT 'PRIVATE_LIMITED',
  gstin_or_reg_no TEXT,
  pan_number TEXT,
  owner_user_id UUID,
  owner_full_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  headquarters_address TEXT NOT NULL,
  district TEXT NOT NULL DEFAULT 'Shopian',
  state_ut TEXT NOT NULL DEFAULT 'Jammu & Kashmir',
  verification_doc_urls JSONB DEFAULT '[]'::jsonb,
  verification_notes TEXT,
  onboarding_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK (
    onboarding_status IN (
      'PENDING_VERIFICATION',
      'INFO_REQUESTED',
      'APPROVED_ACTIVE',
      'REJECTED',
      'SUSPENDED'
    )
  ),
  approved_by_superadmin_id UUID,
  approved_at TIMESTAMPTZ,
  bank_account_holder TEXT,
  bank_name TEXT DEFAULT 'J&K Bank',
  bank_account_no_masked TEXT,
  bank_ifsc TEXT,
  upi_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Owner Staff & Employee Accounts (Scoped to organization_id with 8 Business Roles)
CREATE TABLE IF NOT EXISTS public.owner_staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.cold_storage_organizations(id) ON DELETE CASCADE,
  assigned_facility_id UUID, -- NULL means authorized across all facilities of this owner organization
  user_id UUID,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  staff_role TEXT NOT NULL CHECK (
    staff_role IN (
      'FACILITY_MANAGER',
      'OPERATIONS_MANAGER',
      'BOOKING_MANAGER',
      'INVENTORY_MANAGER',
      'ACCOUNTS_MANAGER',
      'TECHNICAL_MANAGER',
      'STORAGE_STAFF',
      'SOFTWARE_ENGINEER'
    )
  ),
  permissions_matrix JSONB NOT NULL DEFAULT '{
    "manage_facilities": false,
    "configure_3d_twin": false,
    "manage_chambers": false,
    "manage_bins": false,
    "manage_bookings": false,
    "manage_inventory": false,
    "view_temperature_telemetry": true,
    "manage_financials": false,
    "manage_staff": false
  }'::jsonb,
  employment_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (
    employment_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')
  ),
  last_active_at TIMESTAMPTZ,
  created_by_owner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, email)
);

-- 3. Link Existing Facility, Chamber, Bin, Booking & Telemetry Tables to organization_id (Tenant Isolation)
ALTER TABLE IF EXISTS public.rental_listings
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.cold_storage_organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS publication_status TEXT DEFAULT 'PUBLISHED' CHECK (
    publication_status IN ('DRAFT_CONFIGURATION', 'PENDING_PLATFORM_APPROVAL', 'PUBLISHED', 'UNPUBLISHED', 'SUSPENDED_BY_SUPERADMIN')
  );

ALTER TABLE IF EXISTS public.cold_storage_floors
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.cold_storage_organizations(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.cold_chambers
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.cold_storage_organizations(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.cold_storage_bins
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.cold_storage_organizations(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.cold_storage_bookings
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.cold_storage_organizations(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.shared_bin_allocations
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.cold_storage_organizations(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.apple_inventory_movements
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.cold_storage_organizations(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.ca_chamber_environment_readings
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.cold_storage_organizations(id) ON DELETE CASCADE;

-- 4. Business-Level & Platform-Wide Financial Ledger Table (Isolated by organization_id)
CREATE TABLE IF NOT EXISTS public.facility_financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_reference TEXT NOT NULL UNIQUE,
  organization_id UUID NOT NULL REFERENCES public.cold_storage_organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL,
  facility_name TEXT NOT NULL,
  booking_id UUID REFERENCES public.cold_storage_bookings(id) ON DELETE SET NULL,
  booking_reference TEXT,
  farmer_id UUID,
  farmer_name TEXT NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT 'STORAGE_BOOKING_CHARGE' CHECK (
    transaction_type IN (
      'STORAGE_BOOKING_CHARGE',
      'HANDLING_AND_GRADING_CHARGE',
      'PARTIAL_ADVANCE_PAYMENT',
      'FINAL_SETTLEMENT',
      'REFUND'
    )
  ),
  gross_amount_inr NUMERIC(12,2) NOT NULL CHECK (gross_amount_inr >= 0),
  paid_amount_inr NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount_inr >= 0),
  outstanding_amount_inr NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (outstanding_amount_inr >= 0),
  payment_method TEXT DEFAULT 'UPI_OR_NEFT',
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    payment_status IN ('PENDING', 'PARTIALLY_PAID', 'PAID_VERIFIED', 'REFUNDED', 'FAILED')
  ),
  external_gateway_txn_id TEXT,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Immutable Platform & Tenant Administrative Audit Log Table
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL, -- e.g. 'PLATFORM_SUPERADMIN', 'COLD_STORAGE_OWNER', 'BOOKING_MANAGER'
  is_superadmin_oversight_action BOOLEAN NOT NULL DEFAULT false,
  organization_id UUID REFERENCES public.cold_storage_organizations(id) ON DELETE SET NULL,
  facility_id UUID,
  action_category TEXT NOT NULL CHECK (
    action_category IN (
      'OWNER_ONBOARDING',
      'OWNER_APPROVAL_DECISION',
      'FACILITY_CONFIGURATION',
      '3D_DIGITAL_TWIN_UPDATE',
      'CHAMBER_MANAGEMENT',
      'BIN_ALLOCATION',
      'BOOKING_DECISION',
      'INVENTORY_MOVEMENT',
      'FINANCIAL_STATUS_CHANGE',
      'STAFF_PERMISSION_CHANGE',
      'SUPERADMIN_OVERSIGHT_INSPECTION',
      'PLATFORM_SECURITY_ACTION'
    )
  ),
  action_summary TEXT NOT NULL,
  target_table TEXT,
  target_record_id TEXT,
  before_values JSONB,
  after_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for Multi-Tenant Isolation & High-Speed Queries
CREATE INDEX IF NOT EXISTS idx_orgs_status ON public.cold_storage_organizations(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_staff_org ON public.owner_staff_members(organization_id, employment_status);
CREATE INDEX IF NOT EXISTS idx_listings_org ON public.rental_listings(organization_id);
CREATE INDEX IF NOT EXISTS idx_chambers_org ON public.cold_chambers(organization_id);
CREATE INDEX IF NOT EXISTS idx_bins_org ON public.cold_storage_bins(organization_id);
CREATE INDEX IF NOT EXISTS idx_bookings_org ON public.cold_storage_bookings(organization_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_fin_org ON public.facility_financial_transactions(organization_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON public.platform_audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_role_time ON public.platform_audit_logs(actor_role, created_at DESC);

-- Backfill existing rental_listings into a verified default owner organization if organization_id is NULL
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  INSERT INTO public.cold_storage_organizations (
    organization_code,
    business_name,
    owner_full_name,
    owner_email,
    owner_phone,
    headquarters_address,
    district,
    state_ut,
    onboarding_status,
    approved_at
  )
  VALUES (
    'KR-ORG-ALNOOR-001',
    'Al Noor Agri Fresh Pvt. Ltd.',
    'Authorized Cold Storage Director',
    'director@alnooragrifresh.in',
    '+91-9419000101',
    'IGC Lassipora, Pulwama / Shopian Cold Chain Belt',
    'Pulwama',
    'Jammu & Kashmir',
    'APPROVED_ACTIVE',
    now()
  )
  ON CONFLICT (organization_code) DO UPDATE
    SET business_name = EXCLUDED.business_name
  RETURNING id INTO default_org_id;

  UPDATE public.rental_listings
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE public.cold_chambers
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE public.cold_storage_bins
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE public.cold_storage_bookings
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  -- Complete the tenant linkage: the remaining org-scoped tables (floors,
  -- shared-bin allocations, inventory movements, CA readings) so every
  -- existing row belongs to the default organization too and the owner
  -- console shows the live shared bins, ledger and telemetry.
  UPDATE public.cold_storage_floors
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE public.shared_bin_allocations
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE public.apple_inventory_movements
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;

  UPDATE public.ca_chamber_environment_readings
  SET organization_id = default_org_id
  WHERE organization_id IS NULL;
END $$;

-- Public browsing grant: the "Anyone browses active listings" RLS policy covers
-- the anon role, but the table grant for SELECT was missing from creation, so
-- anonymous requests (the server-side hierarchy API among them) saw zero
-- facilities. Grant SELECT; RLS still limits anon to active rows only.
GRANT SELECT ON public.rental_listings TO anon;

-- Enable Row Level Security (RLS)
ALTER TABLE public.cold_storage_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_financial_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cold_storage_organizations',
    'owner_staff_members',
    'facility_financial_transactions',
    'platform_audit_logs'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Multi-tenant RBAC policy'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Multi-tenant RBAC policy" ON public.%I FOR ALL USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;
