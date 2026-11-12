-- KashRoot: Phase 1.1 — ecosystem restoration schema (Phases 1, 5, 6, 7).
--
--   * rental_listings + cold_chambers grow the owner's full architectural
--     configuration: main door wall/direction/dimensions, main passage
--     width, and the leisure / operational work zones (cleaning, grading,
--     packing, machinery, loading bay) as one JSONB config block.
--   * shipment_tracking_trips + shipment_telemetry_events: consent-based
--     live GPS shipment tracking (driver phone pings, Haversine distance
--     covered / remaining, speed, ETA, signal-stale detection).
--   * product_photo_verifications: GPS-verified farmer product photography
--     audit log (device fix captured live at the orchard, never uploaded).
--   * universal_price_listings: universal agricultural price comparison
--     across all 13 categories (produce + inputs + machinery).
--
-- All four new tables: row level security on, an open read/write policy
-- (the app's server routes mediate access and rate-limit callers), no
-- grants to anon / authenticated beyond the policy — same model as the
-- other KashRoot server-mediated tables.
-- Run after 20261122000000_order_live_gps_escrow.sql. Safe to run again.

-- 1. Extend rental_listings & cold_chambers with full owner architectural & leisure zone config.
ALTER TABLE IF EXISTS public.rental_listings
  ADD COLUMN IF NOT EXISTS main_door_wall TEXT DEFAULT 'FRONT' CHECK (main_door_wall IN ('FRONT', 'BACK', 'LEFT', 'RIGHT')),
  ADD COLUMN IF NOT EXISTS main_door_direction TEXT DEFAULT 'OUTSIDE_SLIDING' CHECK (main_door_direction IN ('OUTSIDE_SLIDING', 'INSIDE_SLIDING', 'ROLL_UP')),
  ADD COLUMN IF NOT EXISTS main_door_width_ft NUMERIC(6,2) DEFAULT 10.0,
  ADD COLUMN IF NOT EXISTS main_door_height_ft NUMERIC(6,2) DEFAULT 12.0,
  ADD COLUMN IF NOT EXISTS main_passage_width_ft NUMERIC(6,2) DEFAULT 12.0,
  ADD COLUMN IF NOT EXISTS leisure_zones_config JSONB DEFAULT '{
    "cleaning": {"lengthFt": 24, "widthFt": 15, "side": "FRONT_LEFT"},
    "grading": {"lengthFt": 30, "widthFt": 18, "side": "FRONT_RIGHT"},
    "packing": {"lengthFt": 24, "widthFt": 15, "side": "MID_LEFT"},
    "machinery": {"lengthFt": 20, "widthFt": 15, "side": "BACK_LEFT"},
    "loadingBay": {"lengthFt": 25, "widthFt": 12, "side": "ENTRANCE"}
  }'::jsonb;

ALTER TABLE IF EXISTS public.cold_chambers
  ADD COLUMN IF NOT EXISTS offset_from_front_ft NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offset_from_side_ft NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS door_wall_side TEXT DEFAULT 'PASSAGE_INSIDE' CHECK (door_wall_side IN ('PASSAGE_INSIDE', 'EXTERIOR_OUTSIDE', 'LEFT_WALL', 'RIGHT_WALL')),
  ADD COLUMN IF NOT EXISTS door_position_align TEXT DEFAULT 'CENTER' CHECK (door_position_align IN ('LEFT', 'CENTER', 'RIGHT')),
  ADD COLUMN IF NOT EXISTS door_width_ft NUMERIC(6,2) DEFAULT 8.0,
  ADD COLUMN IF NOT EXISTS door_height_ft NUMERIC(6,2) DEFAULT 10.0,
  ADD COLUMN IF NOT EXISTS aisle_width_ft NUMERIC(6,2) DEFAULT 5.0;

-- 2. Phase 5: Advanced Live GPS Shipment Tracking & Telemetry Events.
CREATE TABLE IF NOT EXISTS public.shipment_tracking_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID,
  shipment_code TEXT NOT NULL UNIQUE,
  seller_id UUID,
  buyer_id UUID,
  driver_name TEXT NOT NULL,
  driver_phone TEXT NOT NULL,
  vehicle_registration_no TEXT NOT NULL,
  vehicle_type TEXT DEFAULT 'REFRIGERATED_TRUCK',
  rto_verified_status TEXT DEFAULT 'UNVERIFIED' CHECK (rto_verified_status IN ('UNVERIFIED', 'VERIFIED_RTO_RECORD', 'PENDING')),
  tracking_source TEXT DEFAULT 'DRIVER_APP_GPS' CHECK (tracking_source IN ('DRIVER_APP_GPS', 'EXTERNAL_GPS_DEVICE', 'TELEMATICS_PROVIDER')),
  consent_granted BOOLEAN NOT NULL DEFAULT false,
  consent_granted_at TIMESTAMPTZ,
  origin_name TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lng DOUBLE PRECISION NOT NULL,
  destination_name TEXT NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  current_speed_kmh NUMERIC(6,2),
  current_accuracy_m NUMERIC(8,2),
  last_ping_at TIMESTAMPTZ,
  total_distance_km NUMERIC(8,2),
  covered_distance_km NUMERIC(8,2) DEFAULT 0,
  remaining_distance_km NUMERIC(8,2),
  eta_minutes INTEGER,
  trip_status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (trip_status IN ('ASSIGNED', 'IN_TRANSIT_LIVE', 'SIGNAL_STALE', 'ARRIVED_GEOFENCE', 'DELIVERED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shipment_telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.shipment_tracking_trips(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('CONSENT_GRANTED', 'GPS_PING', 'SIGNAL_LOST', 'ROUTE_DEVIATION', 'GEOFENCE_ARRIVAL', 'DELIVERY_CONFIRMED')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  speed_kmh NUMERIC(6,2),
  accuracy_m NUMERIC(8,2),
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Phase 6: GPS-Verified Farmer Product Photography Audit Log.
CREATE TABLE IF NOT EXISTS public.product_photo_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID,
  farmer_id UUID NOT NULL,
  photo_hash_sha256 TEXT,
  device_lat DOUBLE PRECISION NOT NULL,
  device_lng DOUBLE PRECISION NOT NULL,
  accuracy_m NUMERIC(8,2) NOT NULL,
  public_locality_label TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verification_status TEXT NOT NULL DEFAULT 'DEVICE_GPS_RECORDED' CHECK (verification_status IN ('DEVICE_GPS_RECORDED', 'DUPLICATE_SUSPECTED', 'PRIVACY_MASKED'))
);

-- 4. Phase 7: Universal Agricultural Price Comparison Listings.
CREATE TABLE IF NOT EXISTS public.universal_price_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID,
  seller_name TEXT NOT NULL,
  seller_role TEXT NOT NULL DEFAULT 'farmer' CHECK (seller_role IN ('farmer', 'agro_dealer', 'mandi_trader', 'govt_agmarknet')),
  category TEXT NOT NULL CHECK (category IN ('APPLES', 'WALNUTS', 'ALMONDS', 'SAFFRON', 'FRUITS', 'VEGETABLES', 'DRY_FRUITS', 'SEEDS', 'FERTILIZERS', 'PESTICIDES', 'MACHINERY', 'IRRIGATION', 'EQUIPMENT')),
  product_name TEXT NOT NULL,
  variety TEXT,
  grade TEXT DEFAULT 'Grade A',
  district TEXT NOT NULL,
  market_or_village TEXT NOT NULL,
  price_inr NUMERIC(12,2) NOT NULL CHECK (price_inr > 0),
  unit_label TEXT NOT NULL DEFAULT '18 kg Box',
  available_quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  delivery_cost_inr NUMERIC(10,2) DEFAULT 0,
  source_label TEXT NOT NULL DEFAULT 'Verified Seller Submission',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shipment_tracking_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_photo_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.universal_price_listings ENABLE ROW LEVEL SECURITY;

-- The API roles keep standard table privileges: row level security and the
-- open policies below are what decide which rows they can touch. (Revoking
-- the privileges outright would break the anon-key server routes.)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_tracking_trips TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipment_telemetry_events TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_photo_verifications TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.universal_price_listings TO anon, authenticated, service_role;

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
END $$;

CREATE INDEX IF NOT EXISTS shipment_trips_updated_at ON public.shipment_tracking_trips (updated_at);
CREATE INDEX IF NOT EXISTS shipment_events_trip_id ON public.shipment_telemetry_events (trip_id, recorded_at);
CREATE INDEX IF NOT EXISTS universal_price_active ON public.universal_price_listings (is_active, category, price_inr);

notify pgrst, 'reload schema';
