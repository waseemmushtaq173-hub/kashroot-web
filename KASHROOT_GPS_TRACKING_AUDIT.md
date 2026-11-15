# KASHROOT GPS TRACKING AUDIT - PHASE 0 (Live GPS Vehicle Tracking Master Directive)

Date: 2026-11-13
Repo: `kashroot-web` (main at `b5bc964`, previous directive fully shipped and verified in production)
Scope: unified live GPS vehicle tracking inside `/tracking` plus a Super Admin oversight tab in `/admin/dashboard`.

## 1. Existing /tracking route

- `src/app/tracking/page.tsx` is a 5-line stub: `redirect('/tracking/dashboard')` (the redirect lives
  in the page component, NOT in next.config). Replacing its content with the UnifiedLiveTrackingPortal
  is safe and touches no other route.
- `src/app/(dashboards)/tracking/dashboard/page.tsx` is the existing consignment tracking portal
  (track by code, my consignments, VAHAN/ULIP vehicle lookup, Live GPS trips, driver console).
  It MUST stay fully intact; the new portal is a separate, additional experience at `/tracking`.
- Existing tracking components (all preserved, none deleted):
  `DriverConsole.tsx`, `DriverShare.tsx`, `LiveGpsTrips.tsx`, `LiveLogisticsMap.tsx`, `LiveTrack.tsx`,
  `PlaceInput.tsx`, `RouteMap.tsx`.
- `next.config.ts` redirects (lines ~93-143) send legacy paths (`/provider/*`, `/logistics`, `/track`,
  `/track/:code`, `/traceability`) to `/tracking/dashboard`. None of them source or target bare
  `/tracking`, so they coexist with the new `/tracking` page unchanged.

## 2. Remote database probe (project wmkjkdfigdlpdvvsqcig, executed via krsqlexec/apply.mjs tooling)

Directive asks for 9 new tables. Probe results:

| Directive table name | Already exists? | Verdict |
|---|---|---|
| `drivers` | no | create per directive |
| `vehicles` | no | create per directive |
| `driver_vehicles` | no | create per directive |
| `gps_devices` | no | create per directive |
| `shipments` | **YES - collision** | see deviation D1 below |
| `shipment_vehicles` | no | create per directive |
| `tracking_sessions` | no | create per directive |
| `gps_location_updates` | no | create per directive |
| `tracking_events` | no | create per directive |

Tracking-adjacent tables found: `authorized_fleet` (0 rows), `market_order_drivers`,
`org_drivers`, `shipment_telemetry_events` (0 rows), `shipment_tracking_trips` (0 rows),
`shipments` (0 rows), `consignments` (1 row).

**D1 (deviation): the legacy `public.shipments` table occupies the directive's name.**
Schema: `id TEXT NOT NULL` (PK, not UUID), `order_id TEXT NOT NULL` (FK to orders),
`status` enum NOT NULL, `tracking_ref`, `provider_name`, `proof_of_delivery_key`,
`last_updated_at`. It is part of the order-fulfillment flow, has 0 rows, nothing in
`src/` queries it (grep confirmed), and no other table references it - but it must not be
dropped or reshaped. Running the directive's `CREATE TABLE IF NOT EXISTS public.shipments`
would silently skip creation and every subsequent insert would fail on missing columns.
Decision: the live-GPS system uses `public.gps_shipments` (exact directive schema, UUID PK)
and `shipment_vehicles`, `tracking_sessions`, `gps_location_updates`, `tracking_events` all
reference it. The other 8 table names are exactly as prescribed. Documented here and in the
final report.

**Realtime publication:** `supabase_realtime` exists but has ZERO member tables, so
`postgres_changes` events would never fire. The migration adds
`ALTER PUBLICATION supabase_realtime ADD TABLE public.tracking_sessions;` (guarded so re-runs
are safe).

## 3. Admin dashboard structure (Phase 8 target)

- `src/app/(dashboards)/admin/dashboard/page.tsx`:
  - `type Tab = 'super' | 'orders' | ...` union at line 51 - add the new tab id there.
  - Tabs are `{ id, label, icon, section }` in `allTabs`; `can(section)` filters them by the
    team member's ticked sections (`kr_team_sections` RPC); `'*'` means Super Admin.
  - Panels render conditionally: `{tab === 'x' && can('x') && <XPanel />}`.
  - The `super` tab is added to PortalShell only when `superAdmin` - the same strict pattern
    will gate the new "Live Fleet, Driver & GPS Session Oversight" tab so ordinary team
    members never see it.
  - Page is wrapped in `AdminLock`; team pass is renewed every 5 min via `POST /api/team/session`.
- Server-side gate for the admin API: `src/lib/server/teamPass.ts` exports
  `hasTeamPass(cookieHeader, userAgent)` - verified signed, unexpired, user-agent-bound
  `kr_team` cookie. The tracking portal API will accept `mode=SUPER_ADMIN_OVERVIEW&admin=1`
  only when this passes (plus the SUPER_ADMIN checks the database already does).
  `ADMIN_APPROVE_VEHICLE` and `REGISTER_GPS_DEVICE` get the same gate.

## 4. Server helper inventory (reused, not reinvented)

- `src/lib/server/sign.ts`: `rateLimited`, `recentCount`, `countHit`, `clientIp`,
  `ipLimited(request, name, max, windowMs)`, `tooMany(seconds)`, `sign`/`verifySignature`,
  `hasSigningSecret`.
- `src/lib/server/sharedLimit.ts`: `sharedIpLimited` (used by `/api/team/session`).
- `src/lib/server/teamPass.ts`: `teamCookie`, `clearTeamCookie`, `hasTeamPass` (above).
- Supabase server clients in existing API routes use exactly the prescribed pattern:
  `createClient(url, key, { auth: { persistSession: false } })` with service-role key falling
  back to the publishable/anon key (`.env.local` has a new-style `sb_publishable_` anon key and
  NO service role key - the directive's permissive `USING (true)` policy is what makes local
  testing possible; security notes in section 6).
- Probe quirk noted: `pg_policy` queries casting `polroles::regrole` fail on `oid[]` - the
  migration/verification SQL avoids that cast.

## 5. Content Security Policy facts (next.config.ts)

- `img-src` ALREADY allows `https://*.tile.openstreetmap.org`, `https://tile.openstreetmap.org`,
  `https://server.arcgisonline.com`, `https://maps.googleapis.com`, `https://maps.gstatic.com`
  (line 33) - the zero-key tile/satellite fallback map renders with NO CSP change.
- `script-src` (line 31) does NOT include the Google Maps JS SDK hosts - when
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set the SDK script would be blocked. Phase 4 adds
  `https://maps.googleapis.com https://maps.gstatic.com` to script-src, connect-src and
  font-src (fonts.gstatic.com), keeping the fallback working when the key is unset.
- Deviation D2: the hybrid layer uses Esri `World_Boundaries_and_Places` label tiles over
  Esri World Imagery instead of a low-opacity OSM overlay - cleaner labels, same whitelisted
  host, no CSP delta.

## 6. Planned hardening / deviations over the prescribed code

- D3 `haversineDistanceKm` moves to `src/lib/tracking/haversine.ts`: route.ts files may only
  export HTTP handlers/config (Next route.md reference), and the ingest route imports it.
- D4 existing-driver login verifies the stored PIN hash (prescribed code logs in on phone
  match alone); the driver form gains a PIN field; default PIN '1234' still honoured for
  first-time registration per directive.
- D5 ingest validates lat/lng numeric ranges (-90..90 / -180..180) and confirms the
  shipment/vehicle pair in `shipment_vehicles` before accepting telemetry; per-IP rate
  limiting via the existing `ipLimited`/`tooMany` helpers.
- D6 admin/device-registration actions (`SUPER_ADMIN_OVERVIEW`, `ADMIN_APPROVE_VEHICLE`,
  `REGISTER_GPS_DEVICE`) are gated behind the team pass (D2 of section 3).
- D7 `LOCATION_STALE_DETECTED` audit events are logged once per staleness period (guarded),
  not once per 6s poll.
- D8 the browser subscribes to realtime via a dedicated Supabase client (the shared
  `src/lib/db/client` is a browser-proxy client without realtime channels), with graceful
  degradation to the 6s freshness poll.
- D9 the driver's shipment dropdown lists actual assignments from DRIVER_DASHBOARD
  (prescribed code used the public availableShipments list, which would let a driver select
  shipments not assigned to them).
- D10 map geometry: single fixed 1280x480 inner canvas anchored center so tiles and the SVG
  overlay share one coordinate space (removes the prescribed code's scale drift between the
  tile plane and the overlay).

## 7. Phase plan

- P1+P3 migration `supabase/migrations/20261113000004_complete_live_gps_tracking_system.sql`
  (9 tables - shipments renamed gps_shipments per D1, indexes, RLS policy loop, realtime
  publication guard), applied to the remote DB via the apply.mjs executor.
- P2 `src/app/api/tracking/portal/route.ts` + `src/app/api/tracking/ingest/route.ts` with
  D3-D9 hardening.
- P4 `src/components/tracking/GoogleOrTileLiveMap.tsx` + CSP additions.
- P5-P7 `src/components/tracking/UnifiedLiveTrackingPortal.tsx` wired into
  `src/app/tracking/page.tsx`.
- P8 admin-only oversight tab + panel in the admin dashboard.
- P9 `npm run build`, end-to-end API verification, ship commit, push, `npx vercel --prod --yes`,
  Final 14-Point Report.
