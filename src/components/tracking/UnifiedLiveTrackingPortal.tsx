'use client';

/**
 * Unified Live GPS Tracking Portal for /tracking.
 *
 * Tab 1 - Buyer & Farmer Authorized Shipment Tracker: live map, all seven
 *         freshness statuses, breadcrumbs, audit events.
 * Tab 2 - Driver & Vehicle Owner Console: sign-in/registration with PIN,
 *         vehicle registration with honest SELF_DECLARED status, shipment
 *         selection, real navigator.geolocation streaming with consent.
 * Tab 3 - AIS-140 / external device pairing and the webhook format.
 *
 * Live updates: Supabase Realtime postgres_changes on tracking_sessions via a
 * direct client (the shared browser client is a REST proxy without channels),
 * with graceful degradation to the 6-second freshness poll. Every position
 * comes from real hardware or device webhooks - nothing is simulated.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

import GoogleOrTileLiveMap, { type RoutePoint } from './GoogleOrTileLiveMap';
import { PlaceInput } from './PlaceInput';
import type { PlacePoint } from '@/lib/db/consignments';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

type PortalTab = 'BUYER_FARMER_TRACKER' | 'DRIVER_CONSOLE' | 'AIS140_DEVICES';

interface DriverProfile {
  id: string;
  full_name: string;
  phone: string;
  license_number: string;
  license_category: string;
  home_district: string;
  home_state: string;
  account_status: string;
}

interface VehicleRecord {
  id: string;
  registration_number: string;
  vehicle_category: string;
  make_and_model: string;
  payload_capacity_kg: number;
  owner_name: string;
  verification_status: string;
}

interface ShipmentRecord {
  id: string;
  shipment_tracking_id: string;
  farmer_name: string;
  buyer_name: string;
  commodity_name: string;
  box_count: number;
  total_weight_kg: number;
  origin_name: string;
  origin_lat: number;
  origin_lng: number;
  destination_name: string;
  destination_lat: number;
  destination_lng: number;
  total_route_distance_km: number;
  distance_travelled_km: number;
  remaining_distance_km: number;
  estimated_arrival_at: string | null;
  shipment_status: string;
}

interface SessionRecord {
  id: string;
  tracking_status: string;
  effective_status: string;
  last_latitude: number | null;
  last_longitude: number | null;
  last_accuracy_m: number | null;
  last_speed_kmh: number | null;
  last_heading_deg: number | null;
  device_connectivity: string;
  last_location_update_at: string | null;
  seconds_since_last_update: number | null;
}

interface AssignmentRecord {
  id: string;
  shipment_id: string;
  vehicle_id: string;
  is_active_assignment: boolean;
  gps_shipments: ShipmentRecord | null;
  vehicles: VehicleRecord | null;
}

/** Where hardware trackers send positions: this site's own address (the same one src/proxy.ts treats as the real site). */
const INGEST_URL = `${(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://kashroot-web.vercel.app').replace(/\/$/, '')}/api/tracking/ingest`;

const STATUS_BADGE_MAP: Record<string, { bg: string; label: string }> = {
  WAITING_FOR_DRIVER_GPS: { bg: 'bg-[#EAF3EE] text-[#174C3C] ring-1 ring-[#C6A45B]', label: '… WAITING FOR DRIVER GPS (not started yet)' },
  DELAYED: { bg: 'bg-amber-200 text-amber-950', label: '◔ LAST PING OVER 30 SECONDS AGO' },
  LIVE: { bg: 'bg-emerald-600 text-white', label: '● LIVE GPS STREAMING' },
  UPDATING: { bg: 'bg-[#174C3C] text-white', label: '↻ UPDATING POSITION' },
  STALE: { bg: 'bg-amber-500 text-slate-950', label: '⚠ LOCATION STALE (NO RECENT PING)' },
  GPS_PERMISSION_DENIED: { bg: 'bg-rose-600 text-white', label: '✕ GPS PERMISSION DENIED' },
  DISCONNECTED: { bg: 'bg-slate-600 text-white', label: '⚡ DEVICE DISCONNECTED' },
  TRACKING_STOPPED: { bg: 'bg-slate-700 text-slate-100', label: '■ TRACKING STOPPED' },
  DELIVERED: { bg: 'bg-teal-700 text-white', label: '✓ SHIPMENT DELIVERED' },
};

/**
 * What the buyer or farmer is told, from the database's own last ping and nothing else:
 *   DELIVERED                the trip is finished;
 *   GPS_PERMISSION_DENIED    the driver's phone refused location access;
 *   WAITING_FOR_DRIVER_GPS   no ping has ever arrived for this shipment;
 *   LIVE                     the last ping is under 30 seconds old;
 *   DELAYED                  30 seconds to 2 minutes old;
 *   STALE                    over 2 minutes old (the server also says so past its own limit);
 *   otherwise the session's own state (stopped, disconnected).
 */
function honestStatus(shipment: ShipmentRecord | null, session: SessionRecord | null): string {
  if (shipment?.shipment_status === 'DELIVERED' || session?.effective_status === 'DELIVERED') return 'DELIVERED';
  if (session?.effective_status === 'GPS_PERMISSION_DENIED') return 'GPS_PERMISSION_DENIED';
  if (!session || !session.last_location_update_at) return 'WAITING_FOR_DRIVER_GPS';
  const age = session.seconds_since_last_update;
  if (session.effective_status === 'LIVE' || session.effective_status === 'UPDATING') {
    if (age === null || age < 30) return 'LIVE';
    return age > 120 ? 'STALE' : 'DELAYED';
  }
  return session.effective_status || 'TRACKING_STOPPED';
}

interface DriverCoords {
  lat: number;
  lng: number;
  accuracy: number;
  speedKmh: number | null;
  headingDeg: number | null;
  updatedAt: string;
}

export default function UnifiedLiveTrackingPortal() {
  const [activeTab, setActiveTab] = useState<PortalTab>('BUYER_FARMER_TRACKER');

  // ---- Buyer / farmer lookup state
  const [trackingIdInput, setTrackingIdInput] = useState('');
  const [availableShipments, setAvailableShipments] = useState<ShipmentRecord[]>([]);
  /** The list has been read from the database at least once (so "none yet" is said only when it is true). */
  const [listLoaded, setListLoaded] = useState(false);
  const [trackedShipment, setTrackedShipment] = useState<ShipmentRecord | null>(null);
  const [trackedVehicle, setTrackedVehicle] = useState<VehicleRecord | null>(null);
  const [trackedDriver, setTrackedDriver] = useState<DriverProfile | null>(null);
  const [trackedSession, setTrackedSession] = useState<SessionRecord | null>(null);
  const [routeHistory, setRouteHistory] = useState<RoutePoint[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<Array<Record<string, unknown>>>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'POLLING' | 'REALTIME'>('POLLING');

  // ---- Driver auth and vehicle state
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [driverPhone, setDriverPhone] = useState('');
  const [driverPin, setDriverPin] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverLicense, setDriverLicense] = useState('');
  const [driverDistrict, setDriverDistrict] = useState('Shopian');
  const [driverAuthMsg, setDriverAuthMsg] = useState<string | null>(null);

  const [driverVehicles, setDriverVehicles] = useState<VehicleRecord[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedShipmentId, setSelectedShipmentId] = useState('');

  // ---- New vehicle form
  const [newRegNo, setNewRegNo] = useState('');
  const [newCategory, setNewCategory] = useState('TRUCK_REEFER');
  const [newMakeModel, setNewMakeModel] = useState('');
  const [newPayloadKg, setNewPayloadKg] = useState('16000');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newDocNotes, setNewDocNotes] = useState('');

  // ---- New shipment form
  // Nothing is pre-filled: a shipment is only what the driver or owner types, and where its places really are.
  const [shpCommodity, setShpCommodity] = useState('');
  const [shpBoxes, setShpBoxes] = useState('');
  const [shpWeightKg, setShpWeightKg] = useState('');
  const [shpOrigin, setShpOrigin] = useState<{ text: string; point: PlacePoint | null }>({ text: '', point: null });
  const [shpDest, setShpDest] = useState<{ text: string; point: PlacePoint | null }>({ text: '', point: null });
  const [shpFarmerName, setShpFarmerName] = useState('');
  const [shpBuyerName, setShpBuyerName] = useState('');

  // ---- AIS-140 device pairing state
  const [deviceImei, setDeviceImei] = useState('');
  const [deviceProvider, setDeviceProvider] = useState('AIS-140 / Telematics Gateway');
  const [deviceProtocol, setDeviceProtocol] = useState('HTTP_WEBHOOK_JSON');
  const [webhookSecretOnce, setWebhookSecretOnce] = useState<string | null>(null);
  const [deviceMsg, setDeviceMsg] = useState<string | null>(null);

  // ---- Live browser GPS watcher state
  const [isBroadcastingGps, setIsBroadcastingGps] = useState(false);
  const [liveDriverCoords, setLiveDriverCoords] = useState<DriverCoords | null>(null);
  const [gpsStatusMessage, setGpsStatusMessage] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const lastSentTimestampRef = useRef(0);
  /** Trip ids frozen at START so callbacks cannot act on a later selection change. */
  const activeTripRef = useRef<{ shipmentId: string; vehicleId: string; driverId: string } | null>(null);

  // ---- Realtime refs (direct client; the shared one is a REST proxy)
  const realtimeClientRef = useRef<SupabaseClient | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const currentTrackingIdRef = useRef('');

  // ---------------------------------------------------------------- lookups
  const lookupShipmentByCode = useCallback(async (codeToSearch: string) => {
    const clean = codeToSearch.trim().toUpperCase();
    if (!clean) return;
    currentTrackingIdRef.current = clean;
    setLookupError(null);
    try {
      const res = await fetch(
        `/api/tracking/portal?mode=SHIPMENT_LOOKUP&trackingId=${encodeURIComponent(clean)}`,
        { cache: 'no-store' },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setLookupError(data.error || 'Could not load shipment tracking details');
        return;
      }
      setTrackedShipment(data.shipment);
      setTrackedVehicle(data.vehicle);
      setTrackedDriver(data.driver);
      setTrackedSession(data.session);
      setRouteHistory(data.routeHistory ?? []);
      setTrackingEvents(data.events ?? []);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Network error loading shipment');
    }
  }, []);

  const fetchAvailableShipments = useCallback(async () => {
    try {
      const res = await fetch('/api/tracking/portal', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && Array.isArray(data.availableShipments)) {
        // Only listed: nothing is opened or typed into the box for the visitor.
        setAvailableShipments(data.availableShipments);
        setListLoaded(true);
      }
    } catch {
      // The freshness poll retries; ignore a transient list error.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kept as shipped: changing when this state is set needs its signed-in flow tested
    void fetchAvailableShipments();
  }, [fetchAvailableShipments]);

  // Freshness poll: buyer/farmer sees coordinates, speed and STALE transitions
  // within 6 seconds even if realtime is unavailable.
  useEffect(() => {
    const id = trackedShipment?.shipment_tracking_id;
    if (!id) return;
    const interval = setInterval(() => {
      void lookupShipmentByCode(id);
    }, 6000);
    return () => clearInterval(interval);
  }, [trackedShipment?.shipment_tracking_id, lookupShipmentByCode]);

  // Supabase Realtime subscription on tracking_sessions for the open shipment.
  // Direct client because the shared browser client routes REST through the
  // site proxy and has no realtime channels; failures degrade to the poll.
  useEffect(() => {
    const shipmentId = trackedShipment?.id;
    if (!shipmentId) return;
    const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    if (!origin || !anon) return;

    let channel: RealtimeChannel | null = null;
    try {
      const client = createClient(origin, anon, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 2 } },
      });
      channel = client
        .channel(`tracking-session-${shipmentId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tracking_sessions', filter: `shipment_id=eq.${shipmentId}` },
          () => {
            void lookupShipmentByCode(currentTrackingIdRef.current);
          },
        )
        .subscribe((status) => {
          setRealtimeStatus(status === 'SUBSCRIBED' ? 'REALTIME' : 'POLLING');
        });
      realtimeClientRef.current = client;
      realtimeChannelRef.current = channel;
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- kept as shipped: changing when this state is set needs its signed-in flow tested
      setRealtimeStatus('POLLING');
    }

    return () => {
      try {
        void realtimeChannelRef.current?.unsubscribe();
        if (realtimeChannelRef.current) void realtimeClientRef.current?.removeChannel(realtimeChannelRef.current);
      } catch {
        // ignore cleanup issues
      }
      realtimeChannelRef.current = null;
      realtimeClientRef.current = null;
    };
  }, [trackedShipment?.id, lookupShipmentByCode]);

  // ------------------------------------------------------------ driver side
  const refreshDriverDashboard = useCallback(async (dId: string) => {
    try {
      const res = await fetch(`/api/tracking/portal?mode=DRIVER_DASHBOARD&driverId=${encodeURIComponent(dId)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!data.ok) return;
      const vehicles: VehicleRecord[] = data.vehicles ?? [];
      const allAssignments: AssignmentRecord[] = data.assignments ?? [];
      const active = allAssignments.filter((a) => a.is_active_assignment && a.gps_shipments);
      setDriverVehicles(vehicles);
      setAssignments(active);
      // Keep selections when they still belong to this driver; else pick the first.
      setSelectedVehicleId((prev) => (vehicles.some((v) => v.id === prev) ? prev : vehicles[0]?.id ?? ''));
      setSelectedShipmentId((prev) => (active.some((a) => a.shipment_id === prev) ? prev : active[0]?.shipment_id ?? ''));
    } catch {
      // Transient; the driver can retry by re-submitting the form.
    }
  }, []);

  const handleDriverLoginOrRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setDriverAuthMsg(null);
    try {
      const res = await fetch('/api/tracking/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'DRIVER_AUTH',
          phone: driverPhone,
          pin: driverPin,
          fullName: driverName,
          licenseNumber: driverLicense,
          homeDistrict: driverDistrict,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDriverAuthMsg(data.error || 'Driver authentication failed');
        return;
      }
      setDriverProfile(data.driver);
      setNewOwnerName(data.driver.full_name);
      setDriverAuthMsg(
        `${data.isNewDriver ? 'Registered' : 'Signed in'} as ${data.driver.full_name} (${data.driver.phone}). Your PIN protects this driver account - keep it safe.`,
      );
      await refreshDriverDashboard(data.driver.id);
    } catch {
      setDriverAuthMsg('Network error. Check your connection and try again.');
    }
  };

  const handleRegisterVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverProfile) return;
    try {
      const res = await fetch('/api/tracking/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REGISTER_VEHICLE',
          driverId: driverProfile.id,
          registrationNumber: newRegNo,
          vehicleCategory: newCategory,
          makeAndModel: newMakeModel,
          payloadCapacityKg: Number(newPayloadKg || 15000),
          ownerName: newOwnerName || driverProfile.full_name,
          supportingDocNotes: newDocNotes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNewRegNo('');
        setNewMakeModel('');
        await refreshDriverDashboard(driverProfile.id);
        setSelectedVehicleId(data.vehicle.id);
        setDriverAuthMsg(
          `Vehicle ${data.vehicle.registration_number} saved with status ${data.vehicle.verification_status}. An admin reviews it before fleet approval.`,
        );
      } else {
        setDriverAuthMsg(data.error || 'Could not register vehicle');
      }
    } catch {
      setDriverAuthMsg('Network error while saving the vehicle.');
    }
  };

  const handleCreateShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverProfile || !selectedVehicleId) {
      setGpsStatusMessage('Select a registered vehicle before creating or assigning a shipment.');
      return;
    }
    if (!shpOrigin.point || !shpDest.point) {
      setGpsStatusMessage('Pick the origin and the destination from the suggestions (or use your location for the origin), so the real places are saved.');
      return;
    }
    if (!shpCommodity.trim() || !shpFarmerName.trim() || !shpBuyerName.trim() || !(Number(shpBoxes) > 0) || !(Number(shpWeightKg) > 0)) {
      setGpsStatusMessage('Fill in the commodity, the number of boxes, the weight in kg, the consignor and the buyer.');
      return;
    }
    try {
      const res = await fetch('/api/tracking/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_OR_ASSIGN_SHIPMENT',
          driverId: driverProfile.id,
          vehicleId: selectedVehicleId,
          farmerName: shpFarmerName.trim(),
          buyerName: shpBuyerName.trim(),
          commodityName: shpCommodity.trim(),
          boxCount: Number(shpBoxes),
          totalWeightKg: Number(shpWeightKg),
          originName: shpOrigin.text.trim() || shpOrigin.point.name,
          originLat: shpOrigin.point.lat,
          originLng: shpOrigin.point.lng,
          destinationName: shpDest.text.trim() || shpDest.point.name,
          destinationLat: shpDest.point.lat,
          destinationLng: shpDest.point.lng,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSelectedShipmentId(data.shipment.id);
        setTrackingIdInput(data.shipment.shipment_tracking_id);
        await fetchAvailableShipments();
        await lookupShipmentByCode(data.shipment.shipment_tracking_id);
        await refreshDriverDashboard(driverProfile.id);
        setGpsStatusMessage(
          `Assigned Shipment ${data.shipment.shipment_tracking_id}. Press START TRACKING below to stream live GPS.`,
        );
      } else {
        setGpsStatusMessage(data.error || 'Could not create the shipment.');
      }
    } catch {
      setGpsStatusMessage('Network error while creating the shipment.');
    }
  };

  // ------------------------------------------------- real hardware GPS flow
  const handleStartLiveGpsTracking = async () => {
    if (isBroadcastingGps) return;
    if (!driverProfile || !selectedVehicleId || !selectedShipmentId) {
      setGpsStatusMessage('Please sign in, select a registered vehicle, and select an assigned shipment first.');
      return;
    }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsStatusMessage('Geolocation is not supported by this browser/device.');
      return;
    }

    setGpsStatusMessage('Requesting OS / Browser High-Accuracy GPS Permission...');
    activeTripRef.current = {
      shipmentId: selectedShipmentId,
      vehicleId: selectedVehicleId,
      driverId: driverProfile.id,
    };
    lastSentTimestampRef.current = 0;

    // Screen Wake Lock where supported: a phone mounted on the dashboard
    // keeps streaming coordinates with the screen on.
    try {
      const navWithWakeLock = navigator as unknown as {
        wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      if (navWithWakeLock.wakeLock) {
        wakeLockRef.current = await navWithWakeLock.wakeLock.request('screen');
      }
    } catch {
      // WakeLock optional
    }

    let isFirstPing = true;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const trip = activeTripRef.current;
        if (!trip) return;
        const now = Date.now();
        // Max one network write every 4 seconds (plus the first ping).
        if (!isFirstPing && now - lastSentTimestampRef.current < 4000) return;
        lastSentTimestampRef.current = now;

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const speedKmh = pos.coords.speed !== null && pos.coords.speed >= 0 ? Number((pos.coords.speed * 3.6).toFixed(1)) : null;
        const headingDeg = pos.coords.heading;

        setLiveDriverCoords({ lat, lng, accuracy, speedKmh, headingDeg, updatedAt: new Date().toLocaleTimeString() });
        setIsBroadcastingGps(true);

        const actionType = isFirstPing ? 'START_TRACKING' : 'GPS_PING';
        isFirstPing = false;

        try {
          await fetch('/api/tracking/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventAction: actionType,
              shipmentId: trip.shipmentId,
              vehicleId: trip.vehicleId,
              driverId: trip.driverId,
              latitude: lat,
              longitude: lng,
              accuracyM: accuracy,
              speedKmh,
              headingDeg,
              deviceConnectivity: navigator.onLine ? 'ONLINE' : 'DISCONNECTED',
              sourceType: 'DRIVER_PORTAL_GPS',
            }),
          });
        } catch {
          // The next position event retries the upload automatically.
        }

        setGpsStatusMessage(`● LIVE GPS ACTIVE: ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E (±${Math.round(accuracy)}m)`);
      },
      async (err) => {
        const trip = activeTripRef.current;
        setIsBroadcastingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatusMessage(
            'GPS Permission Denied. Enable location access in your browser/phone settings and press START TRACKING again.',
          );
          if (trip) {
            await fetch('/api/tracking/ingest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventAction: 'GPS_PERMISSION_DENIED',
                shipmentId: trip.shipmentId,
                vehicleId: trip.vehicleId,
                driverId: trip.driverId,
              }),
            }).catch(() => undefined);
          }
        } else {
          setGpsStatusMessage(`GPS Signal Warning: ${err.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000,
      },
    );

    watchIdRef.current = watchId;
  };

  const handleStopLiveGpsTracking = async (markDelivered = false) => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (wakeLockRef.current) {
      await wakeLockRef.current.release().catch(() => undefined);
      wakeLockRef.current = null;
    }
    setIsBroadcastingGps(false);

    const trip = activeTripRef.current;
    activeTripRef.current = null;
    if (trip) {
      await fetch('/api/tracking/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventAction: markDelivered ? 'COMPLETE_DELIVERY' : 'STOP_TRACKING',
          shipmentId: trip.shipmentId,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
        }),
      }).catch(() => undefined);
    }

    setGpsStatusMessage(
      markDelivered
        ? '✓ Shipment marked DELIVERED. Live GPS tracking session completed.'
        : '■ Live GPS tracking stopped. Last known location and timestamp preserved.',
    );
    if (trip) void lookupShipmentByCode(currentTrackingIdRef.current);
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // ------------------------------------------------- AIS-140 device pairing
  const handlePairDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeviceMsg(null);
    setWebhookSecretOnce(null);
    if (!driverProfile || !selectedVehicleId) {
      setDeviceMsg('Sign in as the vehicle owner in the Driver tab first, then pair devices here.');
      return;
    }
    try {
      const res = await fetch('/api/tracking/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REGISTER_GPS_DEVICE',
          driverId: driverProfile.id,
          vehicleId: selectedVehicleId,
          deviceImei,
          providerName: deviceProvider,
          deviceProtocol: deviceProtocol,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setDeviceMsg(
          `Device ${data.device.device_imei_or_serial} paired to the selected vehicle. Certification status: ${data.device.ais140_certification_status} until a Super Admin verifies the AIS-140 certificate.`,
        );
        setWebhookSecretOnce(data.webhookSecretOnce);
        setDeviceImei('');
      } else {
        setDeviceMsg(data.error || 'Could not pair the device.');
      }
    } catch {
      setDeviceMsg('Network error while pairing the device.');
    }
  };

  // ----------------------------------------------------------------- render
  const currentStatusKey = honestStatus(trackedShipment, trackedSession);
  const badgeStyle = STATUS_BADGE_MAP[currentStatusKey] || STATUS_BADGE_MAP.TRACKING_STOPPED;

  return (
    <div data-kr-shell="standalone" className="kr-light min-h-screen">
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      {/* Header banner and tab switch */}
      <div className="kr-hero rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-block rounded-full bg-[#EAF3EE] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#174C3C] ring-1 ring-[#C6A45B]">
              KashRoot Pan-India Cold-Chain &amp; Produce Logistics
            </span>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Live GPS Vehicle &amp; Shipment Tracking Portal
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-[#D9E8E0]">
              Real-time consent-based GPS telemetry connecting Jammu &amp; Kashmir orchard consignments to buyers across India.
            </p>
          </div>

          <div role="tablist" aria-label="Tracking portal sections" className="flex flex-wrap gap-2">
            {(
              [
                ['BUYER_FARMER_TRACKER', '🗺️ Live Shipment Map (Buyer & Farmer)'],
                ['DRIVER_CONSOLE', '🚛 Driver / Vehicle Owner Login & Start GPS'],
                ['AIS140_DEVICES', '📡 AIS-140 / External GPS Devices'],
              ] as Array<[PortalTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
                className="min-h-11 rounded-xl bg-white px-4 py-2.5 text-xs font-bold sm:text-sm"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TAB 1: buyer & farmer authorized shipment tracker */}
      {activeTab === 'BUYER_FARMER_TRACKER' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void lookupShipmentByCode(trackingIdInput);
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[240px] flex-1">
                <label className="block text-xs font-bold uppercase text-slate-600">Authorized Shipment Tracking ID</label>
                <input
                  type="text"
                  value={trackingIdInput}
                  onChange={(e) => setTrackingIdInput(e.target.value.toUpperCase())}
                  placeholder="e.g. Enter your Shipment ID from your Buyer/Farmer Order or Driver Trip"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-700"
              >
                Track Authorized Shipment
              </button>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">
                {realtimeStatus === 'REALTIME' ? '⚡ Realtime updates on' : '↻ 6s freshness poll'}
              </span>
            </form>

            {availableShipments.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Active Shipments:</span>
                {availableShipments.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setTrackingIdInput(s.shipment_tracking_id);
                      void lookupShipmentByCode(s.shipment_tracking_id);
                    }}
                    className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    {s.shipment_tracking_id} ({s.origin_name.split(',')[0]} → {s.destination_name.split(',')[0]})
                  </button>
                ))}
              </div>
            )}

            {listLoaded && availableShipments.length === 0 && (
              <p data-testid="no-active-shipments" className="mt-3 rounded-xl bg-[#EAF3EE] px-4 py-3 text-sm text-[#174C3C] ring-1 ring-[#C6DBD0]">
                No active shipments registered yet. Switch to &apos;Driver / Vehicle Owner Login &amp; Start GPS&apos; to register a real vehicle and start
                live browser GPS broadcasting, or dispatch an order from the Farmer/Buyer portal.
              </p>
            )}

            {lookupError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
                {lookupError}
              </div>
            )}
          </div>

          {trackedShipment && (
            <>
              {/* Status and telemetry KPI strip */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Live Tracking Status</div>
                  <div className="mt-2">
                    <span className={`inline-block rounded-lg px-2.5 py-1 text-xs font-bold ${badgeStyle.bg}`}>{badgeStyle.label}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    {trackedSession?.last_location_update_at
                      ? `Last GPS ping: ${new Date(trackedSession.last_location_update_at).toLocaleTimeString()} (${trackedSession.seconds_since_last_update ?? 0}s ago)`
                      : 'No GPS ping has been received for this shipment yet'}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Assigned Vehicle</div>
                  <div className="mt-1 font-mono text-base font-extrabold text-slate-900">
                    {trackedVehicle?.registration_number || 'No vehicle assigned yet'}
                  </div>
                  <div className="text-xs text-slate-600">
                    {trackedVehicle ? `${trackedVehicle.vehicle_category} · ${trackedVehicle.make_and_model || ''}` : 'A driver registers the vehicle in the Driver tab'}
                  </div>
                  {trackedDriver && (
                    <div className="mt-1 text-[11px] text-slate-500">
                      Driver: {trackedDriver.full_name} · {trackedDriver.license_category}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Distance Progress</div>
                  <div className="mt-1 text-base font-extrabold text-emerald-700">{trackedShipment.distance_travelled_km} km covered</div>
                  <div className="text-xs text-slate-600">
                    {trackedShipment.remaining_distance_km} km remaining of {trackedShipment.total_route_distance_km} km
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Speed &amp; GPS Accuracy</div>
                  <div className="mt-1 text-base font-extrabold text-slate-900">
                    {trackedSession?.last_speed_kmh !== null && trackedSession?.last_speed_kmh !== undefined
                      ? `${trackedSession.last_speed_kmh} km/h`
                      : 'Speed not reported'}
                  </div>
                  <div className="text-xs text-slate-600">
                    Accuracy:{' '}
                    {trackedSession?.last_accuracy_m ? `±${Math.round(Number(trackedSession.last_accuracy_m))} meters` : 'no reading yet'}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Estimated Arrival (ETA)</div>
                  <div className="mt-1 text-sm font-extrabold text-[#12382E]">
                    {trackedShipment.estimated_arrival_at ? new Date(trackedShipment.estimated_arrival_at).toLocaleString() : 'Not estimated yet'}
                  </div>
                  <div className="text-xs text-slate-600">
                    {trackedShipment.box_count} boxes · {trackedShipment.total_weight_kg} kg
                  </div>
                </div>
              </div>

              {/* Stale notice: exact last known position is preserved */}
              {currentStatusKey === 'STALE' && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
                  ⚠ Location Stale Notice: The vehicle stopped sending live GPS updates{' '}
                  {trackedSession?.seconds_since_last_update} seconds ago. The map below preserves its exact last known location
                  as of{' '}
                  {trackedSession?.last_location_update_at ? new Date(trackedSession.last_location_update_at).toLocaleString() : 'unknown time'}.
                </div>
              )}

              {/* Live vehicle map */}
              <GoogleOrTileLiveMap
                originLat={trackedShipment.origin_lat}
                originLng={trackedShipment.origin_lng}
                originName={trackedShipment.origin_name}
                destLat={trackedShipment.destination_lat}
                destLng={trackedShipment.destination_lng}
                destName={trackedShipment.destination_name}
                vehicleLat={trackedSession?.last_latitude}
                vehicleLng={trackedSession?.last_longitude}
                vehicleRegNo={trackedVehicle?.registration_number || trackedShipment.shipment_tracking_id}
                vehicleCategory={trackedVehicle?.vehicle_category}
                headingDeg={trackedSession?.last_heading_deg}
                accuracyM={trackedSession?.last_accuracy_m}
                trackingStatus={currentStatusKey}
                routeHistory={routeHistory}
              />

              {/* Breadcrumbs and audit events */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900">
                    📍 Timestamped GPS Breadcrumb History ({routeHistory.length} updates)
                  </h3>
                  <div className="mt-3 max-h-60 divide-y divide-slate-100 overflow-y-auto text-xs">
                    {routeHistory.length === 0 ? (
                      <p className="py-4 text-slate-500">No GPS breadcrumbs recorded for this shipment yet.</p>
                    ) : (
                      [...routeHistory]
                        .reverse()
                        .slice(0, 25)
                        .map((pt, idx) => (
                          <div key={idx} className="flex items-center justify-between py-2">
                            <span className="font-mono text-slate-800">
                              {Number(pt.latitude).toFixed(5)}° N, {Number(pt.longitude).toFixed(5)}° E
                            </span>
                            <span className="text-slate-500">
                              {pt.recorded_at ? new Date(pt.recorded_at).toLocaleTimeString() : ''}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900">🛡️ Tracking Session Audit Events</h3>
                  <div className="mt-3 max-h-60 divide-y divide-slate-100 overflow-y-auto text-xs">
                    {trackingEvents.length === 0 ? (
                      <p className="py-4 text-slate-500">No audit events yet for this shipment.</p>
                    ) : (
                      trackingEvents.map((ev, idx) => (
                        <div key={idx} className="py-2">
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <span>{String(ev.event_type)}</span>
                            <span className="text-[11px] font-normal text-slate-500">
                              {ev.created_at ? new Date(String(ev.created_at)).toLocaleTimeString() : ''}
                            </span>
                          </div>
                          <p className="mt-0.5 text-slate-600">{String(ev.event_message)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: driver console */}
      {activeTab === 'DRIVER_CONSOLE' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            {/* 1. Sign-in / registration with PIN */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900">1. Driver / Vehicle Owner Sign-In &amp; Registration</h2>
              <form onSubmit={handleDriverLoginOrRegister} className="mt-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Driver Mobile Number *</label>
                    <input
                      type="text"
                      required
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                      placeholder="+91-6006561291"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Security PIN * <span className="font-normal text-slate-400">(default 1234 for new drivers)</span>
                    </label>
                    <input
                      type="password"
                      required
                      value={driverPin}
                      onChange={(e) => setDriverPin(e.target.value)}
                      placeholder="1234"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Full Name (new registration)</label>
                    <input
                      type="text"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="e.g. Tariq Ahmad Dar"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Driving License Number</label>
                    <input
                      type="text"
                      value={driverLicense}
                      onChange={(e) => setDriverLicense(e.target.value)}
                      placeholder="JK22-20190012345"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Home District</label>
                  <input
                    type="text"
                    value={driverDistrict}
                    onChange={(e) => setDriverDistrict(e.target.value)}
                    placeholder="Shopian, J&K"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <button type="submit" className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
                  {driverProfile ? 'Switch / Refresh Driver Account' : 'Sign In / Register Driver'}
                </button>
              </form>

              {driverAuthMsg && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">
                  {driverAuthMsg}
                </div>
              )}
            </div>

            {/* 2. Vehicle registration with honest status */}
            {driverProfile && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900">2. Register Authorized Vehicle (Honest Verification Status)</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Manually registered vehicles are marked <strong>SELF_DECLARED</strong> (or <strong>DOCUMENTS_UPLOADED</strong>) until
                  reviewed by Admin — never falsely marked as government-verified.
                </p>

                <form onSubmit={handleRegisterVehicle} className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Vehicle Registration No. *</label>
                      <input
                        type="text"
                        required
                        value={newRegNo}
                        onChange={(e) => setNewRegNo(e.target.value.toUpperCase())}
                        placeholder="JK22B4512"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Vehicle Category *</label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="TRUCK_REEFER">Truck (Refrigerated / Apple Carrier)</option>
                        <option value="HEAVY_COMMERCIAL_VEHICLE">Heavy Commercial Vehicle (HCV)</option>
                        <option value="LIGHT_COMMERCIAL_VEHICLE">Light Commercial Vehicle (LCV)</option>
                        <option value="VAN">Cargo Van</option>
                        <option value="CAR">Car</option>
                        <option value="BUS">Bus</option>
                        <option value="OTHER_SUPPORTED_VEHICLE">Other Supported Vehicle</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Make &amp; Model *</label>
                      <input
                        type="text"
                        required
                        value={newMakeModel}
                        onChange={(e) => setNewMakeModel(e.target.value)}
                        placeholder="Tata Prima / Ashok Leyland Ecomet"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Payload Capacity (kg)</label>
                      <input
                        type="number"
                        value={newPayloadKg}
                        onChange={(e) => setNewPayloadKg(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Supporting Document Reference (Permit / Fitness Note)
                    </label>
                    <input
                      type="text"
                      value={newDocNotes}
                      onChange={(e) => setNewDocNotes(e.target.value)}
                      placeholder="National Permit NP/JK/2026..."
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <button type="submit" className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">
                    + Register &amp; Link Vehicle to My Driver Profile
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {/* 3. Vehicle + shipment selection */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900">
                3. Select Registered Vehicle &amp; Assigned Shipment (e.g. Shopian → Bengaluru)
              </h2>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Select Your Registered Vehicle</label>
                  <select
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold"
                  >
                    <option value="">-- Choose Registered Vehicle --</option>
                    {driverVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.registration_number} · {v.vehicle_category} ({v.make_and_model}) [{v.verification_status}]
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">Select Active Shipment to Track</label>
                  <select
                    value={selectedShipmentId}
                    onChange={(e) => setSelectedShipmentId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold"
                  >
                    <option value="">-- Choose Assigned Shipment --</option>
                    {assignments.map((a) => (
                      <option key={a.id} value={a.shipment_id}>
                        {a.gps_shipments?.shipment_tracking_id} · {a.gps_shipments?.origin_name.split(',')[0]} →{' '}
                        {a.gps_shipments?.destination_name.split(',')[0]}
                      </option>
                    ))}
                  </select>
                </div>

                <form onSubmit={handleCreateShipment} className="space-y-2.5 border-t border-slate-100 pt-3">
                  <div className="text-xs font-bold text-slate-600">Or Dispatch a New Produce Shipment for This Vehicle:</div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <PlaceInput label="Origin (pickup)" value={shpOrigin.text} point={shpOrigin.point} onChange={(text, point) => setShpOrigin({ text, point })} gps placeholder="Type the village, town or mandi and pick it" />
                    <PlaceInput label="Destination (delivery)" value={shpDest.text} point={shpDest.point} onChange={(text, point) => setShpDest({ text, point })} placeholder="Type the town or mandi and pick it" />
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <input
                      type="text"
                      aria-label="Consignor: the farmer or sender"
                      value={shpFarmerName}
                      onChange={(e) => setShpFarmerName(e.target.value)}
                      placeholder="Consignor (farmer or sender) name"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                    />
                    <input
                      type="text"
                      aria-label="Buyer or receiver"
                      value={shpBuyerName}
                      onChange={(e) => setShpBuyerName(e.target.value)}
                      placeholder="Buyer (receiver) name"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <input
                      type="text"
                      aria-label="Commodity"
                      value={shpCommodity}
                      onChange={(e) => setShpCommodity(e.target.value)}
                      placeholder="Commodity (e.g. apples, grade and variety)"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                    />
                    <input
                      type="number"
                      value={shpBoxes}
                      onChange={(e) => setShpBoxes(e.target.value)}
                      placeholder="Boxes"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                    />
                    <input
                      type="text"
                      value={shpWeightKg}
                      onChange={(e) => setShpWeightKg(e.target.value)}
                      placeholder="Weight kg"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs"
                    />
                  </div>
                  <button type="submit" className="w-full rounded-xl bg-[#174C3C] py-2 text-xs font-bold text-white hover:bg-[#174C3C]">
                    Create &amp; Assign Shipment Tracking ID
                  </button>
                </form>
              </div>
            </div>

            {/* 4. START / STOP controls */}
            <div className="rounded-2xl border border-[#C6DBD0] bg-white p-6 text-slate-900 shadow-sm">
              <h2 className="text-base font-extrabold text-[#174C3C]">4. Live GPS Broadcast Controls (Explicit Consent)</h2>
              <p className="mt-1 text-xs text-slate-600">
                Location sharing runs ONLY while an authorized trip is active. Pressing <strong>STOP TRACKING</strong> immediately
                terminates the device location watcher.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                {!isBroadcastingGps ? (
                  <button
                    type="button"
                    onClick={() => void handleStartLiveGpsTracking()}
                    className="flex-1 rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-extrabold text-white shadow-lg"
                  >
                    ▶ START TRACKING (Share Actual Live GPS)
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleStopLiveGpsTracking(false)}
                      className="flex-1 rounded-xl bg-rose-600 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg hover:bg-rose-500"
                    >
                      ■ STOP TRACKING
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleStopLiveGpsTracking(true)}
                      className="flex-1 rounded-xl bg-teal-700 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg"
                    >
                      ✓ MARK SHIPMENT DELIVERED
                    </button>
                  </>
                )}
              </div>

              {gpsStatusMessage && (
                <div role="status" className="mt-4 rounded-xl border border-[#C6DBD0] bg-[#EAF3EE] px-4 py-3 font-mono text-xs text-[#174C3C]">
                  {gpsStatusMessage}
                </div>
              )}

              {liveDriverCoords && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-[#C6DBD0] bg-[#F3F8F5] p-2">
                    <div className="text-slate-600">Latitude</div>
                    <div className="font-mono font-bold">{liveDriverCoords.lat.toFixed(5)}°</div>
                  </div>
                  <div className="rounded-lg border border-[#C6DBD0] bg-[#F3F8F5] p-2">
                    <div className="text-slate-600">Longitude</div>
                    <div className="font-mono font-bold">{liveDriverCoords.lng.toFixed(5)}°</div>
                  </div>
                  <div className="rounded-lg border border-[#C6DBD0] bg-[#F3F8F5] p-2">
                    <div className="text-slate-600">Accuracy</div>
                    <div className="font-mono font-bold">±{Math.round(liveDriverCoords.accuracy)} m</div>
                  </div>
                  <div className="rounded-lg border border-[#C6DBD0] bg-[#F3F8F5] p-2">
                    <div className="text-slate-600">Speed</div>
                    <div className="font-mono font-bold">
                      {liveDriverCoords.speedKmh !== null ? `${liveDriverCoords.speedKmh} km/h` : 'not reported'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AIS-140 & telematics ingestion */}
      {activeTab === 'AIS140_DEVICES' && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-extrabold text-slate-900">
            Provider-Independent AIS-140 &amp; Commercial Telematics Ingestion Gateway
          </h2>
          <p className="max-w-3xl text-xs text-slate-600">
            Authorized hardware GPS trackers and commercial fleet telematics providers stream coordinates directly to
            KashRoot&apos;s ingestion endpoint: <code className="break-all font-mono font-semibold">POST {INGEST_URL}</code>. A device must be
            paired to a vehicle by its registered driver/owner below; devices are recorded <strong>UNVERIFIED</strong> until their
            AIS-140 certificate is verified by a Super Admin.
          </p>
          <p className="max-w-3xl rounded-xl bg-[#EAF3EE] px-4 py-3 text-xs text-[#174C3C] ring-1 ring-[#C6DBD0]">
            No hardware tracker is connected to KashRoot unless one is paired here and has sent a position. This page shows the
            endpoint and its format; it does not show devices that do not exist. Every device request must carry the secret given
            once at pairing, as <code className="font-mono">apiSecretToken</code> in the JSON or as an{' '}
            <code className="font-mono">Authorization: Bearer</code> header. A request without the paired secret is refused (401).
          </p>

          <form onSubmit={handlePairDevice} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700">Device IMEI / Serial *</label>
              <input
                type="text"
                required
                value={deviceImei}
                onChange={(e) => setDeviceImei(e.target.value)}
                placeholder="e.g. 867… AIS-140 IMEI"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Provider</label>
              <input
                type="text"
                value={deviceProvider}
                onChange={(e) => setDeviceProvider(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Protocol</label>
              <select
                value={deviceProtocol}
                onChange={(e) => setDeviceProtocol(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="HTTP_WEBHOOK_JSON">HTTP Webhook JSON</option>
                <option value="AIS_140_GATEWAY">AIS-140 Gateway</option>
                <option value="COMMERCIAL_TELEMATICS_API">Commercial Telematics API</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-slate-700">Pair to Vehicle (one of your registered vehicles)</label>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">-- Choose Registered Vehicle --</option>
                {driverVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registration_number} · {v.make_and_model}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" className="w-full rounded-xl bg-[#174C3C] py-2.5 text-xs font-bold text-white hover:bg-[#286B54]">
                🔗 Pair Device to Vehicle
              </button>
            </div>
          </form>

          {deviceMsg && (
            <div className="rounded-xl border border-[#C6DBD0] bg-[#EAF3EE] px-4 py-2.5 text-xs font-semibold text-[#174C3C]">{deviceMsg}</div>
          )}
          {webhookSecretOnce && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 font-mono text-xs text-amber-900">
              Webhook secret (shown once, store it now): <strong>{webhookSecretOnce}</strong> — the device/gateway sends it in the
              payload field <code className="font-mono">apiSecretToken</code>; KashRoot stores only its SHA-256 hash.
            </div>
          )}

          <pre className="overflow-x-auto rounded-xl bg-[#12382E] p-4 font-mono text-xs text-[#EAF3EE]">{`POST ${INGEST_URL}
Content-Type: application/json
Authorization: Bearer <secret shown once when the device was paired>

{
  "eventAction": "GPS_PING",          // START_TRACKING for the first position, then GPS_PING
  "shipmentId": "<shipment UUID>",
  "vehicleId": "<vehicle UUID>",
  "sourceType": "AIS140_EXTERNAL_DEVICE",   // or "TELEMATICS_WEBHOOK"
  "latitude": <the device's own latitude>,
  "longitude": <the device's own longitude>,
  "accuracyM": <metres, when the device reports it>,
  "speedKmh": <km/h, when the device reports it>,
  "headingDeg": <0-360, when the device reports it>,
  "deviceConnectivity": "GSM_4G_ACTIVE"
}`}</pre>
        </div>
      )}
    </div>
    </div>
  );
}

/** Also by name: either import style works. */
export { UnifiedLiveTrackingPortal };
