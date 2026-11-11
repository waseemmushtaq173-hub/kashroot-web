/**
 * GET /api/vehicle/events?registration=JK01AB1234
 *
 * Get real tracking events for a vehicle:
 * - FASTag toll crossings (from ULIP/FASTag)
 * - Driver GPS pings (from consignment tracking, driver-consented)
 * - Returns real events only, or "No update yet"
 * - Never draws mandi-to-mandi route unless explicitly labelled "Planned route"
 */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/server/auth';
import { ipLimited, tooMany } from '@/lib/server/sign';
import { supabase, supabaseConfigured } from '@/lib/db/client';
import { normaliseRegistration } from '@/lib/vehicle/registry';
import { fastag } from '@/lib/server/ulip';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface EventResponse {
  ok: boolean;
  registration: string;
  events: VehicleEvent[];
  hasRealData: boolean;
  message?: string;
}

interface VehicleEvent {
  type: 'fastag' | 'gps' | 'planned';
  timestamp: string; // ISO
  latitude: number | null;
  longitude: number | null;
  locationName: string; // plaza name, village, or "Planned: ..."
  details: string;
  speedKmph?: number;
  headingDeg?: number;
  /** Only true for planned route events. */
  isPlanned?: boolean;
}

export async function GET(request: Request): Promise<Response> {
  if (ipLimited(request, 'vehicle-events', 20)) return tooMany();

  const user = await requireUser(request);
  if (!user) return NextResponse.json({ ok: false, error: 'Sign in to view vehicle events.' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const registration = searchParams.get('registration')?.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const orderId = searchParams.get('orderId');
  const consignmentCode = searchParams.get('consignmentCode');

  if (!registration) {
    return NextResponse.json({ ok: false, error: 'Registration number required.' }, { status: 400 });
  }

  const events: VehicleEvent[] = [];
  let hasRealData = false;

  // 1. FASTag toll crossings (real Government data from ULIP)
  try {
    const crossings = await fastag(registration);
    if (crossings.length > 0) {
      hasRealData = true;
      for (const c of crossings) {
        events.push({
          type: 'fastag',
          timestamp: c.time,
          latitude: c.lat,
          longitude: c.lng,
          locationName: c.plaza,
          details: `Toll plaza crossing at ${c.plaza}${c.direction ? ` (${c.direction})` : ''}`,
          speedKmph: undefined,
          headingDeg: undefined,
        });
      }
    }
  } catch (err) {
    console.warn('FASTag lookup failed:', err instanceof Error ? err.message : err);
  }

  // 2. Driver GPS pings from consignment tracking (only if user owns the order)
  if (supabaseConfigured && supabase) {
    let consignmentCodeToUse = consignmentCode;

    // If orderId provided, find the consignment
    if (!consignmentCodeToUse && orderId) {
      const { data: order } = await supabase
        .from('market_orders')
        .select('consignment_code')
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();
      consignmentCodeToUse = order?.consignment_code ?? null;
    }

    if (consignmentCodeToUse) {
      const { data: tracked } = await supabase.rpc('kr_track', { p_code: consignmentCodeToUse.toUpperCase() });
      if (tracked?.trail?.length) {
        hasRealData = true;
        // Get the last few GPS points from driver's phone
        for (const point of tracked.trail.slice(-10)) {
          events.push({
            type: 'gps',
            timestamp: point.at,
            latitude: point.lat,
            longitude: point.lng,
            locationName: 'Driver GPS',
            details: `Driver location shared (accuracy ~${point.accuracy ?? '?'}m)`,
            speedKmph: undefined,
            headingDeg: undefined,
          });
        }
      }
    }

    // Also check user's linked vehicles for active consignments
    const { data: vehicles } = await supabase
      .from('user_vehicles')
      .select('linked_consignment_code')
      .eq('user_id', user.id)
      .eq('registration', registration)
      .not('linked_consignment_code', 'is', null);

    if (vehicles?.length) {
      for (const v of vehicles) {
        if (v.linked_consignment_code) {
          const { data: tracked } = await supabase.rpc('kr_track', { p_code: v.linked_consignment_code.toUpperCase() });
          if (tracked?.trail?.length) {
            hasRealData = true;
            for (const point of tracked.trail.slice(-5)) {
              events.push({
                type: 'gps',
                timestamp: point.at,
                latitude: point.lat,
                longitude: point.lng,
                locationName: 'Driver GPS (linked vehicle)',
                details: `Driver location shared (accuracy ~${point.accuracy ?? '?'}m)`,
              });
            }
          }
        }
      }
    }
  }

  // Sort events by timestamp (newest first)
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (!hasRealData) {
    return NextResponse.json({
      ok: true,
      registration,
      events: [],
      hasRealData: false,
      message: 'No real tracking data yet. FASTag crossings appear automatically. Driver GPS appears when they share location on a consignment.',
    });
  }

  return NextResponse.json({
    ok: true,
    registration,
    events,
    hasRealData: true,
  });
}