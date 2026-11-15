-- supabase/migrations/20261111000002_kashroot_direct_booking_and_3d_units.sql

-- 1. Extend cold_stores with operational & machinery zone dimensions + owner direct settlement account
ALTER TABLE IF EXISTS public.cold_stores
  ADD COLUMN IF NOT EXISTS facility_code TEXT,
  ADD COLUMN IF NOT EXISTS corridor_layout TEXT DEFAULT 'BOTH_SIDES' CHECK (corridor_layout IN ('LEFT_SIDE', 'RIGHT_SIDE', 'BOTH_SIDES', 'CUSTOM')),
  ADD COLUMN IF NOT EXISTS cleaning_zone_sqft NUMERIC(8,2) DEFAULT 600,
  ADD COLUMN IF NOT EXISTS grading_sorting_zone_sqft NUMERIC(8,2) DEFAULT 900,
  ADD COLUMN IF NOT EXISTS packing_zone_sqft NUMERIC(8,2) DEFAULT 600,
  ADD COLUMN IF NOT EXISTS machinery_room_sqft NUMERIC(8,2) DEFAULT 500,
  ADD COLUMN IF NOT EXISTS loading_bay_sqft NUMERIC(8,2) DEFAULT 800,
  ADD COLUMN IF NOT EXISTS owner_payout_upi TEXT,
  ADD COLUMN IF NOT EXISTS owner_bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_bank_account_no TEXT,
  ADD COLUMN IF NOT EXISTS owner_bank_ifsc TEXT;

-- 2. Extend cold_store_chambers with Wooden Bin (~200kg) vs Blue Plastic Crate (~16.5kg) config
ALTER TABLE IF EXISTS public.cold_store_chambers
  ADD COLUMN IF NOT EXISTS chamber_code TEXT,
  ADD COLUMN IF NOT EXISTS side_position TEXT DEFAULT 'LEFT' CHECK (side_position IN ('LEFT', 'RIGHT', 'CENTER', 'CUSTOM')),
  ADD COLUMN IF NOT EXISTS storage_unit_type TEXT DEFAULT 'WOODEN_BIN' CHECK (storage_unit_type IN ('WOODEN_BIN', 'PLASTIC_CRATE')),
  ADD COLUMN IF NOT EXISTS unit_default_capacity_kg NUMERIC(6,2) DEFAULT 200.0,
  ADD COLUMN IF NOT EXISTS unit_length_m NUMERIC(5,3) DEFAULT 1.200,
  ADD COLUMN IF NOT EXISTS unit_width_m NUMERIC(5,3) DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS unit_height_m NUMERIC(5,3) DEFAULT 0.780,
  ADD COLUMN IF NOT EXISTS unit_spacing_m NUMERIC(4,3) DEFAULT 0.120,
  ADD COLUMN IF NOT EXISTS levels_count INTEGER DEFAULT 4;

-- 3. Individual Storage Position Allocations (Facility -> Chamber -> Level -> Bin/Crate)
CREATE TABLE IF NOT EXISTS public.cold_storage_unit_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID,
  facility_id UUID NOT NULL,
  facility_code TEXT NOT NULL,
  chamber_id UUID NOT NULL,
  chamber_code TEXT NOT NULL,
  level_code TEXT NOT NULL,         -- e.g. 'LEVEL-02'
  level_index INTEGER NOT NULL,     -- 1..N
  row_index INTEGER NOT NULL,
  col_index INTEGER NOT NULL,
  unit_code TEXT NOT NULL,          -- e.g. 'BIN-001' or 'CRATE-001'
  unit_type TEXT NOT NULL CHECK (unit_type IN ('WOODEN_BIN', 'PLASTIC_CRATE')),
  unit_capacity_kg NUMERIC(7,2) NOT NULL,
  stored_quantity_kg NUMERIC(7,2) NOT NULL,
  farmer_id UUID NOT NULL,
  farmer_name TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'VERIFIED_PAID', 'FAILED', 'REFUNDED', 'RELEASED')),
  transaction_id TEXT,
  idempotency_key TEXT UNIQUE,
  storage_start_date TIMESTAMPTZ DEFAULT now(),
  storage_end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- table-level so it can reference unit_capacity_kg (Postgres column
  -- constraints may only reference their own column)
  CONSTRAINT ck_alloc_quantity CHECK (stored_quantity_kg >= 0 AND stored_quantity_kg <= unit_capacity_kg),
  CONSTRAINT uq_active_storage_slot UNIQUE (chamber_id, level_index, row_index, col_index)
);

-- 4. Authentic Temperature Log Table (Distinguishes Manual Entry vs Real IoT Sensor)
CREATE TABLE IF NOT EXISTS public.cold_chamber_temperature_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chamber_id UUID NOT NULL,
  temperature_c NUMERIC(4,2) NOT NULL,
  humidity_pct NUMERIC(4,1),
  source_type TEXT NOT NULL DEFAULT 'MANUAL_ENTRY' CHECK (source_type IN ('MANUAL_ENTRY', 'IOT_SENSOR')),
  sensor_device_id TEXT,
  recorded_by UUID,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cold_storage_unit_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_chamber_temperature_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cold_storage_unit_allocations' AND policyname = 'Read availability allocations'
  ) THEN
    CREATE POLICY "Read availability allocations" ON public.cold_storage_unit_allocations FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cold_chamber_temperature_logs' AND policyname = 'Read chamber temperature logs'
  ) THEN
    CREATE POLICY "Read chamber temperature logs" ON public.cold_chamber_temperature_logs FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cold_storage_unit_allocations' AND policyname = 'Write availability allocations'
  ) THEN
    CREATE POLICY "Write availability allocations" ON public.cold_storage_unit_allocations
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cold_chamber_temperature_logs' AND policyname = 'Write chamber temperature logs'
  ) THEN
    CREATE POLICY "Write chamber temperature logs" ON public.cold_chamber_temperature_logs
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. The live tables: rental_listings is the facility row, cold_chambers the
-- chamber rows (cold_stores / cold_store_chambers do not exist here).
ALTER TABLE IF EXISTS public.rental_listings
  ADD COLUMN IF NOT EXISTS facility_code TEXT,
  ADD COLUMN IF NOT EXISTS corridor_layout TEXT DEFAULT 'BOTH_SIDES' CHECK (corridor_layout IN ('LEFT_SIDE', 'RIGHT_SIDE', 'BOTH_SIDES', 'CUSTOM')),
  ADD COLUMN IF NOT EXISTS cleaning_zone_sqft NUMERIC(8,2) DEFAULT 600,
  ADD COLUMN IF NOT EXISTS grading_sorting_zone_sqft NUMERIC(8,2) DEFAULT 900,
  ADD COLUMN IF NOT EXISTS packing_zone_sqft NUMERIC(8,2) DEFAULT 600,
  ADD COLUMN IF NOT EXISTS machinery_room_sqft NUMERIC(8,2) DEFAULT 500,
  ADD COLUMN IF NOT EXISTS loading_bay_sqft NUMERIC(8,2) DEFAULT 800,
  ADD COLUMN IF NOT EXISTS owner_payout_upi TEXT,
  ADD COLUMN IF NOT EXISTS owner_bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_bank_account_no TEXT,
  ADD COLUMN IF NOT EXISTS owner_bank_ifsc TEXT;

ALTER TABLE IF EXISTS public.cold_chambers
  ADD COLUMN IF NOT EXISTS chamber_code TEXT,
  ADD COLUMN IF NOT EXISTS side_position TEXT DEFAULT 'LEFT' CHECK (side_position IN ('LEFT', 'RIGHT', 'CENTER', 'CUSTOM')),
  ADD COLUMN IF NOT EXISTS storage_unit_type TEXT DEFAULT 'WOODEN_BIN' CHECK (storage_unit_type IN ('WOODEN_BIN', 'PLASTIC_CRATE')),
  ADD COLUMN IF NOT EXISTS unit_default_capacity_kg NUMERIC(6,2) DEFAULT 200.0,
  ADD COLUMN IF NOT EXISTS unit_length_m NUMERIC(5,3) DEFAULT 1.200,
  ADD COLUMN IF NOT EXISTS unit_width_m NUMERIC(5,3) DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS unit_height_m NUMERIC(5,3) DEFAULT 0.780,
  ADD COLUMN IF NOT EXISTS unit_spacing_m NUMERIC(4,3) DEFAULT 0.120,
  ADD COLUMN IF NOT EXISTS levels_count INTEGER DEFAULT 4;
