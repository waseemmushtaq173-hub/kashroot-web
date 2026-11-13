-- KashRoot: master upgrade (Phases 5, 6, 7) — 20261112000002_kashroot_master_upgrade.sql
--
-- Directive schema outcomes layered onto the existing tables. The four tables
-- already exist from 20261112000001_kashroot_ecosystem_phases.sql with a
-- slightly different column set (their directive CREATE TABLEs are therefore
-- no-ops here), so the required columns arrive as idempotent ALTERs — safe to
-- run again, nothing existing is dropped or narrowed:
--
--   Phase 5  shipment_tracking_trips: driver identity + explicit driver
--            consent (granted / timestamp), RTO metadata for the vehicle,
--            route deviation alert, geofence status, rolling route history,
--            distance travelled, and the ARRIVED trip status. Telemetry
--            events gain SIGNAL_STALE. New authorized_fleet: the RTO fleet
--            registry the Driver Console's CSV import fills and the tracking
--            API verifies vehicles against.
--   Phase 6  product_photo_verifications: SHA-256 image hash, the 5-state
--            verification lifecycle, the raw capture location kept private
--            beside a masked public twin, GPS accuracy and the original
--            photo URL.
--   Phase 7  universal_price_listings: seller type, human-readable location
--            label, transport cost per unit, source name, price history
--            (sparklines), last-updated stamp, and the OTHER_INPUTS category
--            beside EQUIPMENT.
--
-- Grants: the app's server routes run on the anon key (Vercel holds no
-- service-role secret), so every table keeps standard privileges for anon /
-- authenticated / service_role with RLS + an open policy — the same
-- server-mediated model as every other KashRoot table.
-- Run after 20261112000001_kashroot_ecosystem_phases.sql. Safe to run again.

-- ───────────────────────── Phase 5 — live GPS logistics ─────────────────────────

ALTER TABLE IF EXISTS public.shipment_tracking_trips
  ADD COLUMN IF NOT EXISTS driver_id UUID,
  ADD COLUMN IF NOT EXISTS driver_consent_granted BOOLEAN,
  ADD COLUMN IF NOT EXISTS driver_consent_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rto_metadata JSONB,
  ADD COLUMN IF NOT EXISTS route_deviation_alert BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geofence_status TEXT,
  ADD COLUMN IF NOT EXISTS route_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS distance_travelled_km NUMERIC(8,2) DEFAULT 0;

-- ARRIVED joins the trip lifecycle. The CHECK is dropped and re-added with the
-- union list, only when the live constraint does not admit ARRIVED yet.
DO $$
DECLARE con text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.shipment_tracking_trips'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%trip_status%'
       AND pg_get_constraintdef(c.oid) LIKE '%ARRIVED%'
  ) THEN
    SELECT c.conname INTO con
      FROM pg_constraint c
     WHERE c.conrelid = 'public.shipment_tracking_trips'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%trip_status%';
    IF con IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.shipment_tracking_trips DROP CONSTRAINT %I', con);
    END IF;
    ALTER TABLE public.shipment_tracking_trips
      ADD CONSTRAINT shipment_tracking_trips_trip_status_check
      CHECK (trip_status IN ('ASSIGNED', 'IN_TRANSIT_LIVE', 'SIGNAL_STALE', 'ARRIVED_GEOFENCE', 'ARRIVED', 'DELIVERED', 'CANCELLED'));
  END IF;
END $$;

-- Telemetry events: SIGNAL_STALE (the trip stopped reporting but has not
-- confirmed arrival) joins the event lifecycle the same way.
DO $$
DECLARE con text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.shipment_telemetry_events'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%event_type%'
       AND pg_get_constraintdef(c.oid) LIKE '%SIGNAL_STALE%'
  ) THEN
    SELECT c.conname INTO con
      FROM pg_constraint c
     WHERE c.conrelid = 'public.shipment_telemetry_events'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%event_type%';
    IF con IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.shipment_telemetry_events DROP CONSTRAINT %I', con);
    END IF;
    ALTER TABLE public.shipment_telemetry_events
      ADD CONSTRAINT shipment_telemetry_events_event_type_check
      CHECK (event_type IN ('CONSENT_GRANTED', 'GPS_PING', 'SIGNAL_LOST', 'SIGNAL_STALE', 'ROUTE_DEVIATION', 'GEOFENCE_ARRIVAL', 'DELIVERY_CONFIRMED'));
  END IF;
END $$;

-- The RTO fleet registry: rows come from the Driver Console's CSV import
-- (state transport corpora publish these) or the admin's manual entry. The
-- tracking API checks a vehicle's registration against this table to set
-- rto_verified_status and to fill rto_metadata.
CREATE TABLE IF NOT EXISTS public.authorized_fleet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_registration_no TEXT NOT NULL UNIQUE,
  vehicle_type TEXT,
  owner_name TEXT,
  rto_office TEXT,
  rto_code TEXT,
  fitness_valid_upto DATE,
  permit_type TEXT,
  permit_valid_upto DATE,
  insurance_valid_upto DATE,
  fuel_type TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'RTO_CSV_IMPORT', 'VAHAN_LOOKUP')),
  imported_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────── Phase 6 — photo verification v2 ─────────────────────────

ALTER TABLE IF EXISTS public.product_photo_verifications
  ADD COLUMN IF NOT EXISTS image_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS verification_state TEXT,
  ADD COLUMN IF NOT EXISTS private_raw_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS private_raw_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS public_masked_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS public_masked_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_accuracy_m NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS original_photo_url TEXT;

-- Existing rows keep their meaning: the v1 status becomes the starting v2 state.
UPDATE public.product_photo_verifications
   SET verification_state = verification_status
 WHERE verification_state IS NULL;

-- ───────────────────────── Phase 7 — universal prices v2 ─────────────────────────

ALTER TABLE IF EXISTS public.universal_price_listings
  ADD COLUMN IF NOT EXISTS seller_type TEXT,
  ADD COLUMN IF NOT EXISTS location_label TEXT,
  ADD COLUMN IF NOT EXISTS transport_cost_per_unit_inr NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_name TEXT,
  ADD COLUMN IF NOT EXISTS price_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ DEFAULT now();

-- The v1 columns seed the v2 ones (both sets are written from here on).
UPDATE public.universal_price_listings
   SET seller_type = seller_role,
       location_label = market_or_village,
       source_name = source_label,
       last_updated_at = updated_at
 WHERE seller_type IS NULL;

-- OTHER_INPUTS joins EQUIPMENT in the machinery side of the board. Same
-- drop-and-extend pattern, only when the live constraint lacks the category.
DO $$
DECLARE con text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.universal_price_listings'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%category%'
       AND pg_get_constraintdef(c.oid) LIKE '%OTHER_INPUTS%'
  ) THEN
    SELECT c.conname INTO con
      FROM pg_constraint c
     WHERE c.conrelid = 'public.universal_price_listings'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%category%';
    IF con IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.universal_price_listings DROP CONSTRAINT %I', con);
    END IF;
    ALTER TABLE public.universal_price_listings
      ADD CONSTRAINT universal_price_listings_category_check
      CHECK (category IN ('APPLES', 'WALNUTS', 'ALMONDS', 'SAFFRON', 'FRUITS', 'VEGETABLES', 'DRY_FRUITS', 'SEEDS', 'FERTILIZERS', 'PESTICIDES', 'MACHINERY', 'IRRIGATION', 'EQUIPMENT', 'OTHER_INPUTS'));
  END IF;
END $$;

-- ───────────────────────── RLS, grants, policies, indexes ─────────────────────────

ALTER TABLE public.shipment_tracking_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_photo_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universal_price_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_fleet ENABLE ROW LEVEL SECURITY;

-- The API roles keep standard table privileges: row level security and the
-- open policies below are what decide which rows they can touch. (Revoking
-- the privileges outright would break the anon-key server routes.)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_tracking_trips TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_telemetry_events TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_photo_verifications TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.universal_price_listings TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authorized_fleet TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shipment_tracking_trips' AND policyname = 'Read write shipment trips') THEN
    CREATE POLICY "Read write shipment trips" ON public.shipment_tracking_trips FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shipment_telemetry_events' AND policyname = 'Read write shipment events') THEN
    CREATE POLICY "Read write shipment events" ON public.shipment_telemetry_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_photo_verifications' AND policyname = 'Read write photo verifications') THEN
    CREATE POLICY "Read write photo verifications" ON public.product_photo_verifications FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'universal_price_listings' AND policyname = 'Read write universal prices') THEN
    CREATE POLICY "Read write universal prices" ON public.universal_price_listings FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'authorized_fleet' AND policyname = 'Read write authorized fleet') THEN
    CREATE POLICY "Read write authorized fleet" ON public.authorized_fleet FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shipment_trips_updated_at ON public.shipment_tracking_trips (updated_at);
CREATE INDEX IF NOT EXISTS shipment_trips_driver_id ON public.shipment_tracking_trips (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS shipment_events_trip_id ON public.shipment_telemetry_events (trip_id, recorded_at);
CREATE INDEX IF NOT EXISTS universal_price_active ON public.universal_price_listings (is_active, category, price_inr);
CREATE INDEX IF NOT EXISTS universal_price_updated ON public.universal_price_listings (last_updated_at) WHERE last_updated_at IS NOT NULL;

notify pgrst, 'reload schema';
