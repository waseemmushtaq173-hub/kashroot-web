-- ============================================================================
-- KASHROOT - COMPLETE CA COLD STORAGE ENGINEERING (LEAFLET 427 ADAPTATION),
-- SHARED BIN MULTI-FARMER ALLOCATION, 3D DIGITAL TWIN & INVENTORY TRACEABILITY
-- Phase 1 of the CA Cold Storage Master Directive (2026-11-13)
--
-- 9 logical structures: rental_listings envelope extension, cold_storage_floors,
-- cold_chambers CA extension, cold_storage_bins (shared multi-farmer),
-- cold_storage_bookings, shared_bin_allocations, apple_inventory_movements
-- (immutable ledger), ca_chamber_environment_readings, cold_storage_notifications.
--
-- Verified before apply (probe_ca.mjs): rental_listings and cold_chambers exist
-- (2 rows each) and NONE of the seven new tables existed, so every CREATE runs.
-- ============================================================================

-- 1. Extend rental_listings with Building Typology & Leaflet 427 Thermal Envelope Specs
ALTER TABLE IF EXISTS public.rental_listings
  ADD COLUMN IF NOT EXISTS warehouse_typology TEXT DEFAULT 'ONE_STORY_PALLETIZED' CHECK (
    warehouse_typology IN ('ONE_STORY_PALLETIZED', 'MODIFIED_ONE_STORY_MEZZANINE', 'MULTISTORY_WAREHOUSE', 'WALK_IN_COOLER')
  ),
  ADD COLUMN IF NOT EXISTS floors_count INTEGER DEFAULT 1 CHECK (floors_count >= 1 AND floors_count <= 12),
  ADD COLUMN IF NOT EXISTS insulation_material TEXT DEFAULT 'PUF_OR_CORK_EQUIVALENT',
  ADD COLUMN IF NOT EXISTS insulation_thickness_in NUMERIC(5,2) DEFAULT 6.0,
  ADD COLUMN IF NOT EXISTS insulation_k_factor NUMERIC(6,4) DEFAULT 0.22,
  ADD COLUMN IF NOT EXISTS outside_design_temp_f NUMERIC(6,2) DEFAULT 90.0,
  ADD COLUMN IF NOT EXISTS surface_color_solar TEXT DEFAULT 'LIGHT' CHECK (surface_color_solar IN ('LIGHT', 'MEDIUM', 'DARK')),
  ADD COLUMN IF NOT EXISTS subfloor_frost_protection TEXT DEFAULT 'INSULATED_ABOVE_FREEZING_SLAB',
  ADD COLUMN IF NOT EXISTS vestibule_anteroom_enabled BOOLEAN DEFAULT true;

-- 2. Floors Table (Supports Single-Story, Modified One-Story with Mezzanine, and Multi-Story)
CREATE TABLE IF NOT EXISTS public.cold_storage_floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  floor_number INTEGER NOT NULL DEFAULT 1,
  floor_name TEXT NOT NULL DEFAULT 'Ground Floor',
  floor_type TEXT NOT NULL DEFAULT 'MAIN_PALLETIZED_FLOOR' CHECK (
    floor_type IN ('MAIN_PALLETIZED_FLOOR', 'MEZZANINE_LOW_STACK', 'UPPER_ELEVATOR_FLOOR', 'BASEMENT_MACHINERY')
  ),
  ceiling_height_ft NUMERIC(6,2) NOT NULL DEFAULT 24.0,
  max_piling_height_ft NUMERIC(6,2) NOT NULL DEFAULT 18.0,
  aisle_width_ft NUMERIC(6,2) NOT NULL DEFAULT 12.0,
  forklift_capacity_lbs INTEGER DEFAULT 4000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(facility_id, floor_number)
);

-- 3. Extend cold_chambers with Door Types, Evaporator Surface Types & CA Engineering Calculations
ALTER TABLE IF EXISTS public.cold_chambers
  ADD COLUMN IF NOT EXISTS floor_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS door_type TEXT DEFAULT 'SLIDING_OVERLAP_CA' CHECK (
    door_type IN ('INFITTING_PLUG', 'OVERLAP_HEATED_GASKET', 'SLIDING_OVERLAP_CA')
  ),
  ADD COLUMN IF NOT EXISTS has_flapper_vestibule_doors BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS refrigerated_surface_type TEXT DEFAULT 'BLOWER_UNIT_COOLER_OVER_AISLE' CHECK (
    refrigerated_surface_type IN ('BLOWER_UNIT_COOLER_OVER_AISLE', 'FINNED_PIPE_COIL_OVER_AISLE', 'BARE_PIPE_COIL', 'REFRIGERATED_PLATES', 'JACKETED_DUCT_SYSTEM')
  ),
  ADD COLUMN IF NOT EXISTS refrigerant_type TEXT DEFAULT 'AMMONIA_NH3' CHECK (
    refrigerant_type IN ('AMMONIA_NH3', 'FREON_R22_R404A', 'CO2_SECONDARY_BRINE', 'CALCIUM_CHLORIDE_BRINE')
  ),
  ADD COLUMN IF NOT EXISTS defrost_method TEXT DEFAULT 'WATER_OR_HOT_GAS_AUTOMATIC' CHECK (
    defrost_method IN ('NATURAL_ABOVE_34F', 'WATER_DEFROST', 'HOT_GAS_DEFROST', 'ELECTRIC_DEFROST', 'GLYCOL_SPRAY', 'WATER_OR_HOT_GAS_AUTOMATIC')
  ),
  ADD COLUMN IF NOT EXISTS target_temp_f NUMERIC(5,2) DEFAULT 32.0,
  ADD COLUMN IF NOT EXISTS evaporator_coil_temp_f NUMERIC(5,2) DEFAULT 29.0,
  ADD COLUMN IF NOT EXISTS target_rh_percent NUMERIC(5,2) DEFAULT 92.0,
  ADD COLUMN IF NOT EXISTS target_o2_percent NUMERIC(5,2) DEFAULT 1.8,
  ADD COLUMN IF NOT EXISTS target_co2_percent NUMERIC(5,2) DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS calculated_heat_load_btu_24h NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS required_compressor_tons NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS required_evaporator_area_sqft NUMERIC(10,2);

-- 4. Physical Storage Bins Table (Supports Shared Multi-Farmer Allocation e.g. Bin B-102)
CREATE TABLE IF NOT EXISTS public.cold_storage_bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  chamber_id UUID NOT NULL,
  chamber_code TEXT NOT NULL DEFAULT 'CH-01',
  floor_number INTEGER NOT NULL DEFAULT 1,
  level_index INTEGER NOT NULL DEFAULT 1,
  row_index INTEGER NOT NULL DEFAULT 1,
  col_index INTEGER NOT NULL DEFAULT 1,
  bin_code TEXT NOT NULL, -- e.g. 'B-102'
  bin_type TEXT NOT NULL DEFAULT 'MACRO_PALLET_BIN' CHECK (
    bin_type IN ('MACRO_PALLET_BIN', 'WOODEN_APPLE_BIN_200KG', 'PLASTIC_CRATE_BAY')
  ),
  length_ft NUMERIC(6,2) NOT NULL DEFAULT 4.0,
  width_ft NUMERIC(6,2) NOT NULL DEFAULT 3.5,
  height_ft NUMERIC(6,2) NOT NULL DEFAULT 3.0,
  max_crates INTEGER NOT NULL DEFAULT 100 CHECK (max_crates > 0),
  crate_weight_kg NUMERIC(6,2) NOT NULL DEFAULT 18.0,
  max_capacity_kg NUMERIC(10,2) NOT NULL DEFAULT 1800.0,
  occupied_crates INTEGER NOT NULL DEFAULT 0 CHECK (occupied_crates >= 0),
  occupied_weight_kg NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (occupied_weight_kg >= 0),
  occupancy_status TEXT NOT NULL DEFAULT 'EMPTY' CHECK (
    occupancy_status IN ('EMPTY', 'PARTIALLY_SHARED', 'FULL_OCCUPIED', 'RESERVED', 'MAINTENANCE')
  ),
  dominant_apple_variety TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_bin_no_overallocation CHECK (occupied_crates <= max_crates),
  UNIQUE(facility_id, chamber_code, bin_code)
);

-- 5. Cold Storage Bookings Table (Enhanced Workflow: Pending -> Approved -> Allocated -> Released)
CREATE TABLE IF NOT EXISTS public.cold_storage_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference TEXT NOT NULL UNIQUE,
  facility_id UUID NOT NULL,
  facility_name TEXT NOT NULL,
  chamber_id UUID,
  chamber_code TEXT DEFAULT 'CH-01',
  farmer_id UUID NOT NULL,
  farmer_name TEXT NOT NULL,
  farmer_phone TEXT NOT NULL,
  farmer_village_or_district TEXT DEFAULT 'Shopian',
  apple_variety TEXT NOT NULL DEFAULT 'Kullu Delicious',
  apple_grade TEXT DEFAULT 'Grade A',
  requested_crates INTEGER NOT NULL CHECK (requested_crates > 0),
  allocated_crates INTEGER NOT NULL DEFAULT 0 CHECK (allocated_crates >= 0),
  crate_weight_kg NUMERIC(6,2) NOT NULL DEFAULT 18.0,
  total_weight_kg NUMERIC(10,2) NOT NULL,
  incoming_fruit_temp_f NUMERIC(5,2) DEFAULT 65.0,
  storage_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_months INTEGER NOT NULL DEFAULT 3 CHECK (duration_months >= 1),
  rate_per_crate_per_month_inr NUMERIC(10,2) NOT NULL DEFAULT 35.0,
  total_estimated_charge_inr NUMERIC(12,2) NOT NULL,
  booking_status TEXT NOT NULL DEFAULT 'PENDING_OWNER_APPROVAL' CHECK (
    booking_status IN (
      'PENDING_OWNER_APPROVAL',
      'APPROVED_AWAITING_RECEIPT',
      'RECEIVED_AND_BIN_ALLOCATED',
      'RELEASE_REQUESTED',
      'PARTIALLY_DISPATCHED',
      'DISPATCHED_COMPLETED',
      'REJECTED_BY_OWNER',
      'CANCELLED'
    )
  ),
  owner_decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Shared Bin Allocations Table (CRITICAL: Multiple Farmers in One Physical Bin e.g. Bin B-102)
CREATE TABLE IF NOT EXISTS public.shared_bin_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  chamber_id UUID NOT NULL,
  chamber_code TEXT NOT NULL,
  bin_id UUID NOT NULL REFERENCES public.cold_storage_bins(id) ON DELETE CASCADE,
  bin_code TEXT NOT NULL, -- e.g. 'B-102'
  booking_id UUID NOT NULL REFERENCES public.cold_storage_bookings(id) ON DELETE CASCADE,
  booking_reference TEXT NOT NULL,
  farmer_id UUID NOT NULL,
  farmer_name TEXT NOT NULL,
  farmer_phone TEXT,
  apple_variety TEXT NOT NULL,
  apple_grade TEXT DEFAULT 'Grade A',
  allocated_crates INTEGER NOT NULL CHECK (allocated_crates > 0),
  released_crates INTEGER NOT NULL DEFAULT 0 CHECK (released_crates >= 0),
  active_crates INTEGER NOT NULL CHECK (active_crates >= 0),
  crate_weight_kg NUMERIC(6,2) NOT NULL DEFAULT 18.0,
  active_weight_kg NUMERIC(10,2) NOT NULL CHECK (active_weight_kg >= 0),
  allocation_status TEXT NOT NULL DEFAULT 'ACTIVE_IN_BIN' CHECK (
    allocation_status IN ('ACTIVE_IN_BIN', 'RELEASE_REQUESTED', 'PARTIALLY_RELEASED', 'FULLY_RELEASED')
  ),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_active_crates_valid CHECK (active_crates = allocated_crates - released_crates)
);

-- 7. Immutable Farmer Apple Inventory Movement Ledger
CREATE TABLE IF NOT EXISTS public.apple_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  chamber_code TEXT NOT NULL,
  bin_code TEXT NOT NULL,
  booking_id UUID REFERENCES public.cold_storage_bookings(id) ON DELETE SET NULL,
  allocation_id UUID REFERENCES public.shared_bin_allocations(id) ON DELETE SET NULL,
  farmer_id UUID NOT NULL,
  farmer_name TEXT NOT NULL,
  apple_variety TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN (
      'BOOKING_SUBMITTED',
      'BOOKING_APPROVED',
      'INWARD_GATE_RECEIVING',
      'SHARED_BIN_ALLOCATION',
      'INTERNAL_BIN_TRANSFER',
      'RELEASE_REQUESTED_BY_FARMER',
      'OUTWARD_GATE_DISPATCH'
    )
  ),
  crates_delta INTEGER NOT NULL,
  weight_kg_delta NUMERIC(10,2) NOT NULL,
  balance_crates_after INTEGER NOT NULL,
  recorded_by_role TEXT NOT NULL DEFAULT 'OWNER',
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Live CA Chamber Environmental & Psychrometric Readings Table
CREATE TABLE IF NOT EXISTS public.ca_chamber_environment_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL,
  chamber_id UUID NOT NULL,
  chamber_code TEXT NOT NULL,
  reading_source TEXT NOT NULL DEFAULT 'IOT_SENSOR' CHECK (
    reading_source IN ('IOT_SENSOR', 'MANUAL_OPERATOR_LOG')
  ),
  sensor_device_id TEXT,
  dry_bulb_temp_f NUMERIC(5,2) NOT NULL,
  dry_bulb_temp_c NUMERIC(5,2) NOT NULL,
  evaporator_coil_temp_f NUMERIC(5,2),
  relative_humidity_percent NUMERIC(5,2) NOT NULL,
  oxygen_o2_percent NUMERIC(5,2),
  carbon_dioxide_co2_percent NUMERIC(5,2),
  ethylene_ppm NUMERIC(6,3),
  air_velocity_fpm NUMERIC(6,1),
  alert_status TEXT NOT NULL DEFAULT 'NORMAL' CHECK (
    alert_status IN ('NORMAL', 'WARNING_THRESHOLD', 'CRITICAL_ALARM')
  ),
  alert_message TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Cold Storage Notifications Table
CREATE TABLE IF NOT EXISTS public.cold_storage_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('FARMER', 'OWNER', 'ADMIN')),
  recipient_user_id UUID,
  recipient_phone TEXT,
  notification_type TEXT NOT NULL CHECK (
    notification_type IN (
      'BOOKING_CONFIRMED',
      'BOOKING_REJECTED',
      'STORAGE_ALLOCATED',
      'RECEIVING_CONFIRMED',
      'SHARED_BIN_ALLOCATED',
      'ENVIRONMENT_ALERT',
      'RELEASE_REQUESTED',
      'DISPATCH_CONFIRMED'
    )
  ),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  booking_reference TEXT,
  bin_code TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for Fast Queries
CREATE INDEX IF NOT EXISTS idx_bins_facility_chamber ON public.cold_storage_bins(facility_id, chamber_code);
CREATE INDEX IF NOT EXISTS idx_shared_alloc_bin ON public.shared_bin_allocations(bin_id, allocation_status);
CREATE INDEX IF NOT EXISTS idx_shared_alloc_farmer ON public.shared_bin_allocations(farmer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_facility ON public.cold_storage_bookings(facility_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_bookings_farmer ON public.cold_storage_bookings(farmer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_farmer ON public.apple_inventory_movements(farmer_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ca_readings_chamber ON public.ca_chamber_environment_readings(facility_id, chamber_code, recorded_at DESC);

-- Enable RLS on all new tables
ALTER TABLE public.cold_storage_floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_storage_bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_storage_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_bin_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_chamber_environment_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_storage_notifications ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'cold_storage_floors',
    'cold_storage_bins',
    'cold_storage_bookings',
    'shared_bin_allocations',
    'apple_inventory_movements',
    'ca_chamber_environment_readings',
    'cold_storage_notifications'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = 'Authorized cold storage access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Authorized cold storage access" ON public.%I FOR ALL USING (true) WITH CHECK (true)',
        tbl
      );
    END IF;
  END LOOP;
END $$;
