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
import { OrchardPickupJobs } from './OrchardPickupJobs';
import { TrackingMenu, VerificationPanel, type TrackingSection } from './TrackingMenu';
import { ContactOtp } from '@/components/auth/ContactOtp';
import type { PlacePoint } from '@/lib/db/consignments';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

type PortalTab = TrackingSection;

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
  /** The PIN the buyer and farmer need with the Tracking ID (only the driver's own trips carry it). */
  buyer_access_pin?: string;
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
  WAITING_FOR_DRIVER_GPS: { bg: 'bg-forest-soft text-forest ring-1 ring-[#C6A45B]', label: '… WAITING FOR DRIVER GPS (not started yet)' },
  DELAYED: { bg: 'bg-amber-200 text-amber-950', label: '◔ LAST PING OVER 30 SECONDS AGO' },
  LIVE: { bg: 'bg-forest text-white', label: '● LIVE GPS STREAMING' },
  UPDATING: { bg: 'bg-forest text-white', label: '↻ UPDATING POSITION' },
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
  const [activeTab, setActiveTab] = useState<PortalTab>('MAP');

  // ---- Buyer / farmer lookup state
  const [trackingIdInput, setTrackingIdInput] = useState('');
  const [trackingPinInput, setTrackingPinInput] = useState('');
  /** The PIN the visible trip was opened with: the freshness poll and the live feed use it again. */
  const currentPinRef = useRef('');
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
  const [driverDistrict, setDriverDistrict] = useState('');
  const [driverState, setDriverState] = useState('');
  const [driverLicenseCategory, setDriverLicenseCategory] = useState('');
  const [driverEmergency, setDriverEmergency] = useState('');
  /** The server asked for a one-time code (a new mobile number): the code screen shows. */
  const [needsOtp, setNeedsOtp] = useState(false);
  const [driverOtpProof, setDriverOtpProof] = useState('');
  const [driverAuthMsg, setDriverAuthMsg] = useState<string | null>(null);

  const [driverVehicles, setDriverVehicles] = useState<VehicleRecord[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedShipmentId, setSelectedShipmentId] = useState('');

  // ---- New vehicle form
  const [newRegNo, setNewRegNo] = useState('');
  const [newCategory, setNewCategory] = useState('TRUCK_REEFER');
  const [newMakeModel, setNewMakeModel] = useState('');
  const [newPayloadKg, setNewPayloadKg] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerAuthorized, setNewOwnerAuthorized] = useState(false);
  /** The trip just made: its Tracking ID and the PIN to give the buyer and the farmer. */
  const [createdTrip, setCreatedTrip] = useState<{ id: string; pin: string } | null>(null);
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
  const lookupShipmentByCode = useCallback(async (codeToSearch: string, pin?: string) => {
    const clean = codeToSearch.trim().toUpperCase();
    if (!clean) return;
    currentTrackingIdRef.current = clean;
    if (pin !== undefined) currentPinRef.current = pin.trim();
    setLookupError(null);
    try {
      const res = await fetch(
        `/api/tracking/portal?mode=SHIPMENT_LOOKUP&trackingId=${encodeURIComponent(clean)}&pin=${encodeURIComponent(currentPinRef.current)}`,
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

  const submitDriverAuth = async (proof?: string) => {
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
          licenseCategory: driverLicenseCategory,
          emergencyContact: driverEmergency,
          homeDistrict: driverDistrict,
          homeState: driverState,
          otpProof: proof ?? driverOtpProof,
        }),
      });
      const data = await res.json();
      if (data.needsVerification) {
        // A new mobile number: it is proved with a one-time code before the account is made.
        setNeedsOtp(true);
        setDriverAuthMsg(data.error);
        return;
      }
      if (!res.ok || !data.ok) {
        setDriverAuthMsg(data.error || 'Driver authentication failed');
        return;
      }
      setNeedsOtp(false);
      setDriverOtpProof('');
      setDriverPin('');
      setDriverProfile(data.driver);
      setNewOwnerName(data.driver.full_name);
      setDriverAuthMsg(
        `${data.isNewDriver ? 'Registered' : 'Signed in'} as ${data.driver.full_name} (${data.driver.phone}). Your PIN protects this driver account - keep it safe.`,
      );
      await refreshDriverDashboard(data.driver.id);
      setActiveTab(data.isNewDriver ? 'VEHICLES' : 'TRIP');
    } catch {
      setDriverAuthMsg('Network error. Check your connection and try again.');
    }
  };

  const handleDriverLoginOrRegister = (e: React.FormEvent) => {
    e.preventDefault();
    void submitDriverAuth();
  };

  const signOutDriver = () => {
    setDriverProfile(null);
    setDriverVehicles([]);
    setAssignments([]);
    setSelectedVehicleId('');
    setSelectedShipmentId('');
    setDriverPin('');
    setDriverOtpProof('');
    setNeedsOtp(false);
    setDriverAuthMsg('Signed out of the driver account on this phone.');
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
          payloadCapacityKg: Number(newPayloadKg),
          ownerName: newOwnerName.trim(),
          ownerPhone: newOwnerPhone.trim(),
          ownerAuthorized: newOwnerAuthorized,
          supportingDocNotes: newDocNotes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNewRegNo('');
        setNewMakeModel('');
        setNewPayloadKg('');
        setNewDocNotes('');
        setNewOwnerPhone('');
        setNewOwnerAuthorized(false);
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
        setTrackingPinInput(data.shipment.buyer_access_pin ?? '');
        setCreatedTrip({ id: data.shipment.shipment_tracking_id, pin: data.shipment.buyer_access_pin ?? '' });
        await lookupShipmentByCode(data.shipment.shipment_tracking_id, data.shipment.buyer_access_pin ?? '');
        await refreshDriverDashboard(driverProfile.id);
        setGpsStatusMessage(
          `Trip ${data.shipment.shipment_tracking_id} is ready. Give the buyer and the farmer its Tracking ID and PIN, then press START TRACKING on the Live GPS screen.`,
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
      setDeviceMsg('Sign in as the vehicle owner on the Driver sign-in screen first, then pair devices here.');
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
    <div data-kr-shell="standalone" data-portal="tracking" className="kr-light min-h-screen">
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      {/* Header banner and tab switch */}
      <div className="kr-hero rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="inline-block rounded-full bg-forest-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-forest ring-1 ring-[#C6A45B]">
              KashRoot Pan-India Cold-Chain &amp; Produce Logistics
            </span>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Live GPS Vehicle &amp; Shipment Tracking Portal
            </h1>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <TrackingMenu active={activeTab} onSelect={setActiveTab} signedInAs={driverProfile ? driverProfile.full_name.split(' ')[0] : null} vehicleCount={driverVehicles.length} />
        <div id="tracking-panel" className="min-w-0 space-y-6">
      {/* Live shipment map: buyer & farmer, with the Tracking ID and PIN */}
      {activeTab === 'MAP' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void lookupShipmentByCode(trackingIdInput, trackingPinInput);
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[240px] flex-1">
                <label htmlFor="shipment-tracking-id" className="block text-xs font-bold uppercase text-slate-600">Tracking ID</label>
                <input
                  id="shipment-tracking-id"
                  type="text"
                  value={trackingIdInput}
                  onChange={(e) => setTrackingIdInput(e.target.value.toUpperCase())}
                  placeholder="As given by the sender or the driver"
                  autoComplete="off"
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-sm font-semibold text-slate-900 focus:border-forest focus:outline-none"
                />
              </div>
              <div className="w-40">
                <label htmlFor="shipment-pin" className="block text-xs font-bold uppercase text-slate-600">6-digit PIN</label>
                <input
                  id="shipment-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={trackingPinInput}
                  onChange={(e) => setTrackingPinInput(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-sm font-semibold text-slate-900 focus:border-forest focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="min-h-11 rounded-xl bg-forest px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-forest-deep"
              >
                Track this shipment
              </button>
              <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">
                {realtimeStatus === 'REALTIME' ? '⚡ Realtime updates on' : '↻ 6s freshness poll'}
              </span>
            </form>

            {!trackedShipment && !lookupError && (
              <p data-testid="no-active-shipments" className="mt-3 rounded-xl bg-forest-soft px-4 py-3 text-sm text-forest ring-1 ring-forest-line">
                Enter the Tracking ID and the 6-digit PIN that the sender or the driver gave you. A trip is shown only to someone who has both: there is no public list of trips.
                Drivers and vehicle owners: use the menu to sign in, register a vehicle and start a trip.
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
                    {trackedVehicle ? `${trackedVehicle.vehicle_category} · ${trackedVehicle.make_and_model || ''}` : 'The driver registers the vehicle in the menu'}
                  </div>
                  {trackedDriver && (
                    <div className="mt-1 text-[11px] text-slate-500">
                      Driver: {trackedDriver.full_name} · {trackedDriver.license_category}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">Distance Progress</div>
                  <div className="mt-1 text-base font-extrabold text-forest">{trackedShipment.distance_travelled_km} km covered</div>
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
                  <div className="mt-1 text-sm font-extrabold text-forest-deep">
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

      {/* Orchard pickup jobs on real marketplace orders */}
      {activeTab === 'PICKUPS' && <OrchardPickupJobs />}

      {/* Driver sign-in */}
      {activeTab === 'SIGN_IN' && (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* 1. Sign-in / registration with PIN */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900">Driver / vehicle owner: sign in or register</h2>
              <p className="mt-1 text-sm text-slate-600">Already registered: your mobile number and PIN. New: fill in everything below; your mobile number is confirmed with a one-time code before the account is made.</p>
              <form onSubmit={handleDriverLoginOrRegister} className="mt-4 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="driver-phone" className="block text-xs font-semibold text-slate-700">Mobile number (10 digits) *</label>
                    <input
                      id="driver-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      required
                      value={driverPhone}
                      onChange={(e) => { setDriverPhone(e.target.value); setDriverOtpProof(''); setNeedsOtp(false); }}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="driver-pin" className="block text-xs font-semibold text-slate-700">
                      PIN * <span className="font-normal text-slate-600">(4 to 8 digits you choose; keep it secret)</span>
                    </label>
                    <input
                      id="driver-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="current-password"
                      required
                      minLength={4}
                      maxLength={8}
                      pattern="[0-9]{4,8}"
                      value={driverPin}
                      onChange={(e) => setDriverPin(e.target.value.replace(/\D/g, ''))}
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="driver-name" className="block text-xs font-semibold text-slate-700">Full name (new drivers)</label>
                    <input
                      id="driver-name"
                      type="text"
                      autoComplete="name"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="As on your driving licence"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="driver-licence" className="block text-xs font-semibold text-slate-700">Driving licence number (new drivers)</label>
                    <input
                      id="driver-licence"
                      type="text"
                      value={driverLicense}
                      onChange={(e) => setDriverLicense(e.target.value)}
                      placeholder="As printed on the licence"
                      className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="driver-class" className="block text-xs font-semibold text-slate-700">Licence class (new drivers)</label>
                    <select id="driver-class" value={driverLicenseCategory} onChange={(e) => setDriverLicenseCategory(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                      <option value="">Choose the class on your licence</option>
                      <option value="LMV">LMV: light motor vehicle</option>
                      <option value="HGV">HGV: heavy goods vehicle</option>
                      <option value="HPMV">HPMV: heavy passenger motor vehicle</option>
                      <option value="OTHER">Other class</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="driver-emergency" className="block text-xs font-semibold text-slate-700">Emergency contact mobile (optional)</label>
                    <input id="driver-emergency" type="tel" inputMode="numeric" value={driverEmergency} onChange={(e) => setDriverEmergency(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="driver-district" className="block text-xs font-semibold text-slate-700">Home district (new drivers)</label>
                    <input id="driver-district" type="text" value={driverDistrict} onChange={(e) => setDriverDistrict(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="driver-state" className="block text-xs font-semibold text-slate-700">Home state (new drivers)</label>
                    <input id="driver-state" type="text" value={driverState} onChange={(e) => setDriverState(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  </div>
                </div>

                <button type="submit" className="min-h-11 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
                  {driverProfile ? 'Switch / Refresh Driver Account' : 'Sign In / Register Driver'}
                </button>
              </form>

              {needsOtp && (
                <div className="mt-4">
                  <ContactOtp
                    channel="sms"
                    value={driverPhone}
                    onChange={setDriverPhone}
                    verified={Boolean(driverOtpProof)}
                    required
                    label="Confirm your mobile number"
                    hint="A one-time code is sent by SMS. Once it is confirmed, the account is made."
                    onVerified={(proof) => {
                      setDriverOtpProof(proof);
                      void submitDriverAuth(proof);
                    }}
                  />
                </div>
              )}

              {driverProfile && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
                  <p className="text-slate-800">Signed in as <strong>{driverProfile.full_name}</strong> · {driverProfile.phone}</p>
                  <button type="button" onClick={signOutDriver} className="min-h-11 cursor-pointer rounded-lg px-3 font-semibold text-rose-800 underline">Sign out</button>
                </div>
              )}

              {driverAuthMsg && (
                <div className="mt-3 rounded-xl border border-forest-line bg-forest-soft px-3.5 py-2 text-xs font-semibold text-forest-deep">
                  {driverAuthMsg}
                </div>
              )}
            </div>

        </div>
      )}

      {/* My vehicles */}
      {activeTab === 'VEHICLES' && (
        <div className="mx-auto max-w-3xl space-y-6">
          {!driverProfile ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="text-sm text-slate-800">Sign in as a driver first: this screen needs your account.</p>
              <button type="button" onClick={() => setActiveTab('SIGN_IN')} className="mt-3 min-h-11 cursor-pointer rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800">Go to Driver sign-in</button>
            </div>
          ) : (
            <>
            {/* 2. Vehicle registration with honest status */}
            {driverProfile && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900">Register a vehicle</h2>
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
                        placeholder="As on the number plate"
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
                        placeholder="As on the registration certificate"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">Payload capacity (kg) *</label>
                      <input
                        type="number"
                        required
                        min={100}
                        max={100000}
                        value={newPayloadKg}
                        onChange={(e) => setNewPayloadKg(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="veh-owner" className="block text-xs font-semibold text-slate-700">Owner of the vehicle *</label>
                      <input id="veh-owner" type="text" required value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)} placeholder="As on the registration certificate" className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="veh-owner-phone" className="block text-xs font-semibold text-slate-700">Owner’s mobile (optional)</label>
                      <input id="veh-owner-phone" type="tel" inputMode="numeric" value={newOwnerPhone} onChange={(e) => setNewOwnerPhone(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                    </div>
                  </div>

                  <label className="flex min-h-11 items-start gap-2 text-sm text-slate-800">
                    <input type="checkbox" required checked={newOwnerAuthorized} onChange={(e) => setNewOwnerAuthorized(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
                    <span>The owner has authorised this vehicle to be tracked by KashRoot while I drive it. *</span>
                  </label>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Supporting Document Reference (Permit / Fitness Note)
                    </label>
                    <input
                      type="text"
                      value={newDocNotes}
                      onChange={(e) => setNewDocNotes(e.target.value)}
                      placeholder="Permit or fitness certificate number"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <button type="submit" className="w-full rounded-xl bg-forest py-2.5 text-sm font-bold text-white hover:bg-forest">
                    + Register &amp; Link Vehicle to My Driver Profile
                  </button>
                </form>
              </div>
            )}
            {driverVehicles.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-extrabold text-slate-900">My registered vehicles</h2>
                <ul className="mt-2 divide-y divide-slate-100">
                  {driverVehicles.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <span>
                        <span className="font-mono text-sm font-bold text-slate-900">{v.registration_number}</span>
                        <span className="block text-sm text-slate-700">{v.make_and_model} · {Number(v.payload_capacity_kg).toLocaleString('en-IN')} kg</span>
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-900 ring-1 ring-slate-300">{v.verification_status.replace(/_/g, ' ').toLowerCase()}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setActiveTab('VERIFY')} className="mt-2 min-h-11 cursor-pointer text-sm font-semibold text-indigo-800 underline">What each status means</button>
              </div>
            )}
            </>
          )}
        </div>
      )}

      {/* Start a trip */}
      {activeTab === 'TRIP' && (
        <div className="mx-auto max-w-3xl space-y-6">
          {!driverProfile ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="text-sm text-slate-800">Sign in as a driver first: this screen needs your account.</p>
              <button type="button" onClick={() => setActiveTab('SIGN_IN')} className="mt-3 min-h-11 cursor-pointer rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800">Go to Driver sign-in</button>
            </div>
          ) : (
            <>
            {/* 3. Vehicle + shipment selection */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-900">Start a trip: choose the vehicle and the shipment</h2>

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

                {(() => {
                  const chosen = assignments.find((a) => a.shipment_id === selectedShipmentId)?.gps_shipments;
                  const shown = createdTrip && chosen?.shipment_tracking_id === createdTrip.id ? { id: createdTrip.id, pin: createdTrip.pin } : chosen ? { id: chosen.shipment_tracking_id, pin: chosen.buyer_access_pin ?? '' } : createdTrip;
                  return shown?.pin ? (
                    <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950 ring-1 ring-emerald-200">
                      <p className="font-semibold">Give the buyer and the farmer:</p>
                      <p className="mt-1">Tracking ID <span className="font-mono font-bold">{shown.id}</span> · PIN <span className="font-mono font-bold">{shown.pin}</span></p>
                      <p className="mt-1 text-xs text-emerald-900">They open the Live shipment map and enter both. Anyone without the PIN cannot see this trip.</p>
                    </div>
                  ) : null;
                })()}

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
                  <button type="submit" className="w-full rounded-xl bg-forest py-2 text-xs font-bold text-white hover:bg-forest">
                    Create &amp; Assign Shipment Tracking ID
                  </button>
                </form>
              </div>
            </div>

            </>
          )}
        </div>
      )}

      {/* Live GPS */}
      {activeTab === 'GPS' && (
        <div className="mx-auto max-w-3xl space-y-6">
          {!driverProfile ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="text-sm text-slate-800">Sign in as a driver first: this screen needs your account.</p>
              <button type="button" onClick={() => setActiveTab('SIGN_IN')} className="mt-3 min-h-11 cursor-pointer rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800">Go to Driver sign-in</button>
            </div>
          ) : (
            <>
            {/* 4. START / STOP controls */}
            <div className="rounded-2xl border border-forest-line bg-white p-6 text-slate-900 shadow-sm">
              <h2 className="text-base font-extrabold text-forest">4. Live GPS Broadcast Controls (Explicit Consent)</h2>
              <p className="mt-1 text-xs text-slate-600">
                Location sharing runs ONLY while an authorized trip is active. Pressing <strong>STOP TRACKING</strong> immediately
                terminates the device location watcher.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                {!isBroadcastingGps ? (
                  <button
                    type="button"
                    onClick={() => void handleStartLiveGpsTracking()}
                    className="flex-1 rounded-xl bg-forest px-5 py-3.5 text-sm font-extrabold text-white shadow-lg"
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
                <div role="status" className="mt-4 rounded-xl border border-forest-line bg-forest-soft px-4 py-3 font-mono text-xs text-forest">
                  {gpsStatusMessage}
                </div>
              )}

              {liveDriverCoords && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-forest-line bg-[#F6F7FF] p-2">
                    <div className="text-slate-600">Latitude</div>
                    <div className="font-mono font-bold">{liveDriverCoords.lat.toFixed(5)}°</div>
                  </div>
                  <div className="rounded-lg border border-forest-line bg-[#F6F7FF] p-2">
                    <div className="text-slate-600">Longitude</div>
                    <div className="font-mono font-bold">{liveDriverCoords.lng.toFixed(5)}°</div>
                  </div>
                  <div className="rounded-lg border border-forest-line bg-[#F6F7FF] p-2">
                    <div className="text-slate-600">Accuracy</div>
                    <div className="font-mono font-bold">±{Math.round(liveDriverCoords.accuracy)} m</div>
                  </div>
                  <div className="rounded-lg border border-forest-line bg-[#F6F7FF] p-2">
                    <div className="text-slate-600">Speed</div>
                    <div className="font-mono font-bold">
                      {liveDriverCoords.speedKmh !== null ? `${liveDriverCoords.speedKmh} km/h` : 'not reported'}
                    </div>
                  </div>
                </div>
              )}
            </div>
            </>
          )}
        </div>
      )}

      {/* Verification */}
      {activeTab === 'VERIFY' && <VerificationPanel driver={driverProfile} vehicles={driverVehicles} onGo={setActiveTab} />}

      {/* GPS devices: AIS-140 & telematics ingestion */}
      {activeTab === 'DEVICES' && (
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
          <p className="max-w-3xl rounded-xl bg-forest-soft px-4 py-3 text-xs text-forest ring-1 ring-forest-line">
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
              <button type="submit" className="w-full rounded-xl bg-forest py-2.5 text-xs font-bold text-white hover:bg-forest-mid">
                🔗 Pair Device to Vehicle
              </button>
            </div>
          </form>

          {deviceMsg && (
            <div className="rounded-xl border border-forest-line bg-forest-soft px-4 py-2.5 text-xs font-semibold text-forest">{deviceMsg}</div>
          )}
          {webhookSecretOnce && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 font-mono text-xs text-amber-900">
              Webhook secret (shown once, store it now): <strong>{webhookSecretOnce}</strong> — the device/gateway sends it in the
              payload field <code className="font-mono">apiSecretToken</code>; KashRoot stores only its SHA-256 hash.
            </div>
          )}

          <pre className="overflow-x-auto rounded-xl bg-forest-deep p-4 font-mono text-xs text-forest-soft">{`POST ${INGEST_URL}
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
    </div>
    </div>
  );
}

/** Also by name: either import style works. */
export { UnifiedLiveTrackingPortal };
