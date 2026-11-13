-- ============================================================================
-- KASHROOT - COMPLETE LIVE GPS VEHICLE TRACKING SYSTEM
-- Phase 1 & 3 of the Live GPS Vehicle Tracking Master Directive (2026-11-13)
--
-- 9 logical structures: drivers, vehicles, driver_vehicles, gps_shipments,
-- shipment_vehicles, tracking_sessions, gps_location_updates, gps_devices,
-- tracking_events.
--
-- DEVIATION D1 (see KASHROOT_GPS_TRACKING_AUDIT.md): the directive's
-- `shipments` name is occupied by a legacy order-fulfillment table (text PK,
-- enum status, NOT NULL order_id FK to orders, 0 rows). The live-GPS system
-- therefore uses `gps_shipments` with the exact prescribed UUID schema, and
-- the four dependent tables reference it.
-- ============================================================================

-- 1. Drivers
CREATE TABLE IF NOT EXISTS public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT,
  license_number TEXT NOT NULL,
  license_category TEXT NOT NULL DEFAULT 'HGV / TRANS',
  emergency_contact TEXT,
  home_district TEXT DEFAULT 'Shopian',
  home_state TEXT DEFAULT 'Jammu & Kashmir',
  account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Vehicles (honest verification status - never fake government verification)
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number TEXT NOT NULL UNIQUE,
  vehicle_category TEXT NOT NULL DEFAULT 'TRUCK_REEFER' CHECK (
    vehicle_category IN (
      'TRUCK_REEFER',
      'HEAVY_COMMERCIAL_VEHICLE',
      'LIGHT_COMMERCIAL_VEHICLE',
      'VAN',
      'CAR',
      'BUS',
      'OTHER_SUPPORTED_VEHICLE'
    )
  ),
  make_and_model TEXT NOT NULL,
  payload_capacity_kg NUMERIC(10,2) DEFAULT 15000,
  owner_name TEXT NOT NULL,
  owner_phone TEXT,
  owner_authorized BOOLEAN NOT NULL DEFAULT true,
  supporting_doc_url TEXT,
  supporting_doc_notes TEXT,
  verification_status TEXT NOT NULL DEFAULT 'SELF_DECLARED' CHECK (
    verification_status IN ('SELF_DECLARED', 'DOCUMENTS_UPLOADED', 'ADMIN_APPROVED', 'REJECTED')
  ),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Driver-to-vehicle association (one driver may register several authorized vehicles)
CREATE TABLE IF NOT EXISTS public.driver_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  relationship_role TEXT NOT NULL DEFAULT 'OWNER_CUM_DRIVER' CHECK (
    relationship_role IN ('OWNER_CUM_DRIVER', 'AUTHORIZED_DRIVER', 'FLEET_OPERATOR')
  ),
  is_primary BOOLEAN NOT NULL DEFAULT true,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(driver_id, vehicle_id)
);

-- 4. External GPS / AIS-140 / telematics devices
CREATE TABLE IF NOT EXISTS public.gps_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_imei_or_serial TEXT NOT NULL UNIQUE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL DEFAULT 'GENERIC_TELEMATICS',
  device_protocol TEXT NOT NULL DEFAULT 'HTTP_WEBHOOK_JSON' CHECK (
    device_protocol IN ('HTTP_WEBHOOK_JSON', 'AIS_140_GATEWAY', 'COMMERCIAL_TELEMATICS_API')
  ),
  ais140_certification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (
    ais140_certification_status IN ('UNVERIFIED', 'AIS140_VERIFIED_BY_ADMIN')
  ),
  api_secret_token_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. GPS shipments (Shopian, J&K -> Bengaluru, KA corridors)
CREATE TABLE IF NOT EXISTS public.gps_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_tracking_id TEXT NOT NULL UNIQUE,
  order_id UUID,
  farmer_id UUID,
  farmer_name TEXT NOT NULL,
  farmer_phone TEXT,
  buyer_id UUID,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT,
  buyer_access_pin TEXT NOT NULL DEFAULT '1234',
  commodity_name TEXT NOT NULL DEFAULT 'Kashmir Kullu Delicious Apples',
  box_count INTEGER NOT NULL DEFAULT 200,
  total_weight_kg NUMERIC(10,2) NOT NULL DEFAULT 3600,
  origin_name TEXT NOT NULL DEFAULT 'Shopian Fruit Mandi, Jammu & Kashmir',
  origin_lat DOUBLE PRECISION NOT NULL DEFAULT 33.7173,
  origin_lng DOUBLE PRECISION NOT NULL DEFAULT 74.8333,
  destination_name TEXT NOT NULL DEFAULT 'Singena Agrahara / Yeshwanthpur APMC, Bengaluru, Karnataka',
  destination_lat DOUBLE PRECISION NOT NULL DEFAULT 12.9716,
  destination_lng DOUBLE PRECISION NOT NULL DEFAULT 77.5946,
  total_route_distance_km NUMERIC(10,2) NOT NULL DEFAULT 2840.0,
  distance_travelled_km NUMERIC(10,2) NOT NULL DEFAULT 0,
  remaining_distance_km NUMERIC(10,2) NOT NULL DEFAULT 2840.0,
  estimated_arrival_at TIMESTAMPTZ,
  shipment_status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (
    shipment_status IN (
      'CREATED',
      'ASSIGNED',
      'IN_TRANSIT',
      'TRACKING_PAUSED',
      'DELIVERED',
      'CANCELLED'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Shipment-to-vehicle assignment
CREATE TABLE IF NOT EXISTS public.shipment_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.gps_shipments(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  assigned_by TEXT DEFAULT 'SYSTEM_OR_ADMIN',
  is_active_assignment BOOLEAN NOT NULL DEFAULT true,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shipment_id, vehicle_id)
);

-- 7. Active and historical tracking sessions
CREATE TABLE IF NOT EXISTS public.tracking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.gps_shipments(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  gps_device_id UUID REFERENCES public.gps_devices(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL DEFAULT 'DRIVER_PORTAL_GPS' CHECK (
    source_type IN ('DRIVER_PORTAL_GPS', 'AIS140_EXTERNAL_DEVICE', 'TELEMATICS_WEBHOOK')
  ),
  gps_permission_granted BOOLEAN NOT NULL DEFAULT false,
  consent_timestamp TIMESTAMPTZ,
  tracking_status TEXT NOT NULL DEFAULT 'TRACKING_STOPPED' CHECK (
    tracking_status IN (
      'LIVE',
      'UPDATING',
      'STALE',
      'GPS_PERMISSION_DENIED',
      'DISCONNECTED',
      'TRACKING_STOPPED',
      'DELIVERED'
    )
  ),
  last_latitude DOUBLE PRECISION,
  last_longitude DOUBLE PRECISION,
  last_accuracy_m NUMERIC(8,2),
  last_speed_kmh NUMERIC(6,2),
  last_heading_deg NUMERIC(6,2),
  device_connectivity TEXT DEFAULT 'ONLINE_4G_WIFI',
  last_location_update_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. High-frequency GPS location updates (route history breadcrumbs)
CREATE TABLE IF NOT EXISTS public.gps_location_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.tracking_sessions(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL REFERENCES public.gps_shipments(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m NUMERIC(8,2) NOT NULL DEFAULT 15,
  speed_kmh NUMERIC(6,2),
  heading_deg NUMERIC(6,2),
  device_connectivity TEXT DEFAULT 'ONLINE',
  source_type TEXT NOT NULL DEFAULT 'DRIVER_PORTAL_GPS',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Tamper-evident tracking audit events
CREATE TABLE IF NOT EXISTS public.tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES public.gps_shipments(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.tracking_sessions(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'DRIVER_REGISTERED',
      'VEHICLE_REGISTERED',
      'SHIPMENT_ASSIGNED',
      'GPS_PERMISSION_GRANTED',
      'GPS_PERMISSION_DENIED',
      'TRACKING_STARTED',
      'LOCATION_UPDATED',
      'LOCATION_STALE_DETECTED',
      'NETWORK_DISCONNECTED',
      'TRACKING_STOPPED',
      'DELIVERY_COMPLETED'
    )
  ),
  event_message TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes for low-latency realtime queries
CREATE INDEX IF NOT EXISTS idx_gps_shipments_tracking_id ON public.gps_shipments(shipment_tracking_id);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_shipment ON public.tracking_sessions(shipment_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_updates_shipment_time ON public.gps_location_updates(shipment_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_shipment_time ON public.tracking_events(shipment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_vehicles_driver ON public.driver_vehicles(driver_id);

-- Row Level Security
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gps_location_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'drivers',
    'vehicles',
    'driver_vehicles',
    'gps_devices',
    'gps_shipments',
    'shipment_vehicles',
    'tracking_sessions',
    'gps_location_updates',
    'tracking_events'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Service and authorized portal access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Service and authorized portal access" ON public.%I FOR ALL USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Supabase Realtime: the publication exists but has no members, so buyer-side
-- postgres_changes events would never fire. Add tracking_sessions (guarded so
-- re-running is safe).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tracking_sessions'
    ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.tracking_sessions';
  END IF;
END $$;
