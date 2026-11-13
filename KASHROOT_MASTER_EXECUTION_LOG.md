# KashRoot — Master Execution Log (Correction · Online-First · 8-Portal 3D · Verification)

Started: 2026-11-12 · Dir: `kashroot-web` · Supabase project: `wmkjkdfigdlpdvvsqcig`
Baseline: `main` @ `6ccc9b8` (previous round shipped Phases 0–11 of the earlier directive; checkpoint tag `kashroot-checkpoint-pre-phases-0-11` @ `fe52b40`).
Rule kept from before: `.github/skills/gstack` is never staged or modified.

---

## PHASE 0 — AUDIT & REAL ROUTE MAP (✅ done this round)

Every finding below was verified against the actual files rendered by active routes (`src/app/**/page.tsx`), not against previous reports.

| # | Symptom the directive targets | Actual file(s) that render it | Real state found |
|---|---|---|---|
| 1 | False offline banner ("No internet — showing saved data from …") | `src/components/pwa/PwaRoot.tsx` (banner block ~L239-265) fed by `src/components/pwa/connectivity.ts` (probes `/api/health` every 30 s / 10 s, HEAD, 3 s timeout) + `public/sw.js` (Serwist) registered in `PwaRoot.registerWorker()` | Banner exists and is health-check driven, but (a) `/api/health` returns the old `{status, services}` shape, not the directive's `{ok, online, supabaseConnected}`, and it probes Supabase **auth** health, not real table connectivity; (b) the banner claims "showing saved data" even when the app is online-first; (c) there is no automatic cleanup of stale offline flags / broken SW unregister. → Phase 1.1 fixes all four root causes. |
| 2 | Admin/setup controls in `/farmer/dashboard` | `src/app/(dashboards)/farmer/dashboard/page.tsx` | **No leakage found.** `Setup check`, `kr_setup_status`, seeding and DB-update panels exist ONLY in `src/app/(dashboards)/admin/dashboard/page.tsx` (`SetupCheckPanel`, `SuperAdminPanel`, gated by admin role). Nothing to remove; will re-verify at Phase 11. |
| 3 | Cold store 3D error ("The 3D view could not open just now.") | `src/components/rental/ColdStore3D.tsx` + `src/components/rental/three/SceneGuard.tsx` + `src/components/rental/owner/Preview3D.tsx` + `src/lib/sharedFacilityEngine.ts` | Guard text lives in `SceneGuard.tsx` L74. Safety cap already in `buildStore.ts` (`SLOT_CAP_TRIGGER=2000`, `SLOT_CAP_SHOWN=1000` ≤ 1800) with honest badge; GLB→procedural fallback in `three/coldKit.ts`. Preview3D + shared engine exist. Phase 4 verifies Al Noor path and tightens anything missing. |
| 4 | Packing layers buttons | `src/components/market/ProductForm.tsx` (L332-352: green active class `bg-emerald-600 text-white border-emerald-600 shadow-sm`, `✓` prefix + banner `✓ Selected packing`) → used by `SellerDesk` (SellerDesk renders ProductForm; no duplicate implementation found) | Already permanently stateful + saves `packing_layers` to Supabase (migration 20261121 shipped, remote column verified "yes"). Buyer-side 3D layer visualizer to be ADDED in Phase 3 (AppleBox3D). |
| 5 | Buyer checkout false red GPS error + blocked map iframe | `src/components/market/shop/OrderModal.tsx` (L139 error text, L243 LiveInteractiveMap), `src/components/market/shop/ListingDetailModal.tsx` (L157/L39) | Error clears the instant `Lock Live Buyer GPS` resolves; maps are `LiveInteractiveMap` (native OSM `<img>` tiles — **zero iframes**; repo-wide iframe search found none). Google Maps satellite/hybrid layer option to be ADDED in Phase 5.2 (`LiveLogisticsMap`). |
| 6 | TrueScan "Starting camera…" hang | `src/components/fertilizer/QRCodeScanner.tsx` (L88-96, 2.5 s race guard, plain-webcam fallback, jsQR/ZXing-wasm fallbacks, video stays mounted) + `src/lib/client/speech.ts` (Web Speech) | Fixed mechanism already shipped (commit `fe52b40`). Guard is 2.5 s — will tighten to 1.5 s in Phase 1.2 to match the directive exactly. |
| 7 | 8 portals + nav | `src/lib/auth/roles.ts` `PORTALS` (8 entries), `src/components/layout/SiteHeader.tsx` dropdown, dashboards: `farmer`, `buyer`, `kissan-tools`, `rental`, `tracking`, `dealer`, `advisory` (trader/expert), `trader`/`mandi`, `admin` | All 8 present and reachable. Phase 2 adds the colored 3D-badged dropdown + Phase 3 the per-portal 3D modules. |
| 8 | Guest tools on homepage | `src/app/page.tsx` (TrueScan section etc.), `/compare-prices`, `/mandi-weather` | All open to guests (no sign-in wall). Phase 2 upgrades their presentation. |
| 9 | Supabase / env keys | `.env` `DATABASE_URL` only; `.env.local` (Vercel-pulled) has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` NOT present, `SUPABASE_SERVICE_ROLE_KEY` NOT present | App keys referenced by name only, never hardcoded. Google Maps features must degrade to OSM + Esri tiles (Phase 5.2). |

Phase 0 checkpoint: commit `audit-map + log` (see git log).

---

## PHASE 1 — ONLINE-FIRST RESTORATION (✅ done this round)

- `src/app/api/health/route.ts` — rewritten to the directive's contract: real **table** connectivity probe (`rental_listings` select id limit 1) through the Supabase REST client, returns `{ ok, online, supabaseConnected, timestamp }` (+ `status`/`services` kept for the `/status` page), `Cache-Control: no-store`, 503/502 on failure, per-IP limit kept.
- `src/lib/connectivity.ts` — NEW genuine online-first connectivity manager (module singleton + `useOnlineFirst()` hook):
  - Online = `navigator.onLine !== false` **AND** a live `/api/health` GET probe succeeds (3 s timeout); server snapshot always online (no SSR fake-offline).
  - On probe success: clears stale offline flags and queued-action banners from `localStorage`/`sessionStorage` (`kr_offline_*`, `kr_saved_banner_*`, `kr_sw_reload` guards), and unregisters service workers that served a stale cached page over a live connection (`x-kr-saved-at` on the document / non-`/sw.js` controllers), one guarded reload per session.
  - Exposes `describeFailure(service)` so callers show accurate service-specific errors — the global banner is never shown while the probe succeeds.
- `src/components/pwa/PwaRoot.tsx` — rewired to `useOnlineFirst()`; the offline banner renders ONLY when both the browser says offline AND the live probe fails, its copy never claims "showing saved data" unless a saved copy with a real timestamp is actually on screen, and it never claims a failed write succeeded. A second, distinct notice ("KashRoot is not responding just now — your internet looks fine") appears when the browser is online but the probe fails — accurate and service-specific, never a fake "No Internet Connection". Outbox ("Waiting to send") behaviour preserved and still never fakes success (items keep their real state). Old `./connectivity` module kept: `dataPackSync.ts` still uses its `checkConnectivity`.
- `src/components/fertilizer/QRCodeScanner.tsx` — camera race guard tightened 2.5 s → 1.5 s with the same fallback chain.
- Packing layers / buyer GPS-clear / iframe checks — verified already correct (audit #2/#4/#5); no code change needed; regression-tested via build + live DOM at Phase 11.

---

## PHASE 2 — HOMEPAGE, NAV & 3D VISUAL IDENTITY (✅ done this round)

- **Reusable 3D engine** — NEW `src/components/three/Portal3DScene.tsx` + `src/components/three/Portal3DCanvas.tsx`: lazy R3F canvas (`next/dynamic` `ssr:false`, so three.js never delays first paint or lands in the initial bundle), hard error boundary (a throwing scene silently falls back to 2D — no scary error text), automatic 2D start on low-power devices (prefers-reduced-motion, data saver, ≤4 cores, ≤2 GB RAM, no WebGL), and a manual 3D/2D toggle remembered in `localStorage`. Every scene must ship a real 2D twin — this engine is the base for all Phase 3 portal scenes and satisfies the Phase 10 lazy-load rule at the source.
- **Homepage 3D Orchard & Cold-Chain Showcase** — NEW `src/components/three/OrchardShowcase.tsx`: interactive rotatable/zoomable scene (auto-rotate OrbitControls, clickable labels) with a low-poly apple orchard (fruiting trees), 2/3/4/5-layer packing stacks (5-layer highlighted saffron), and a cold-store chamber (PUF shell, gabled roof, arctic-cyan insulated door, steel racks with blue HDPE crates). Its 2D fallback is a real labelled SVG diagram. Placed as the first section of the homepage's lower band.
- **Colourful Kashmiri identity** — deep emerald `#0A3D2E` showcase panel; emerald/crimson/saffron/sky colour-identity strip added to the hero panel. (Framer Motion is NOT installed — the repo has no motion dependency and the lockfile lives outside the git repo, so transitions stay on the existing CSS/`prefers-reduced-motion` transition system, which is also lighter on low-end phones.)
- **Portals dropdown, 3D-badged** — `src/lib/auth/roles.ts`: every portal gained a `theme` (badge gradient, wash, ring, text) and the directive's 1-line descriptions (Farmer emerald, Buyer royal amber, Kissan terracotta, Cold Storage arctic cyan, Tracking indigo, Agro-dealer lime teal, Advisory forest green, Mandi saffron purple). `src/components/layout/SiteHeader.tsx`: desktop `PortalMenu` rows and mobile menu rows now show each portal's own 3D-styled gradient badge tile (perspective-tilted, lifts on hover) with its own lucide icon (Sprout/ShoppingBag/Tractor/Snowflake/MapPinned/Pill/Leaf/Scale).
- **Dynamic active-portal button** — already shipped previously (`useMyPortal()` renders "My {label} portal" in the header); verified intact.
- **Help & Support drawer** — `src/components/layout/HelpButton.tsx` rebuilt from a plain link into a drawer (native `<dialog>` via portal kit Modal): Kisan Call Centre helpline `1800-180-1551` (tel link, real Government of India number already used in-app), "Ask KashRoot" → `/support`, the multilingual voice guide (floating mic on every page), and the standing anti-fraud rule (`NEVER_ASKS`).
- **Admin separation** — re-verified: setup/seed panels exist only in `/admin/dashboard` (Phase 0 audit #2); no change needed.
- **Guest tools** — Price Comparison, Mandi rates & weather, TrueScan all remain sign-in-free; hero tool cards unchanged apart from the identity strip.

## PHASE 3 — PER-PORTAL 3D TRANSFORMATION (✅ done this round)

All scenes run through the shared `Portal3DScene` engine (lazy `ssr:false` canvas, error boundary → 2D fallback, low-power detection, manual toggle). Six new 3D modules, seven integration points:

- **3.1 Farmer** — NEW `src/components/three/OrchardInspector3D.tsx`: interactive orchard & crop-health inspector (apple rows with healthy/watch/alert canopy zones, walnut trees, soil-moisture cutaway strata with sensor stakes, labelled callouts), embedded on `/farmer/dashboard` Overview after the action tiles. NEW `src/components/three/AppleBox3D.tsx`: slatted wooden box with per-layer apple trays (2–5 layers; fewer layers = larger fruit), corner posts + forklift skids + air-gap slats; wired into `ProductForm.tsx` directly under the packing-layer buttons + green confirmation bar (renders for "2/3/4/5 Layer", hidden for "Loose / Crate Packed").
- **3.2 Buyer** — `ListingDetailModal.tsx` Box-specifications panel now includes the same `AppleBox3D` ("turn the box to see how the fruit is packed"), with grade/box-capacity/apples-per-box/rate-per-kg text beside it and the origin district under it.
- **3.3 Kissan Tools** — NEW `src/components/three/EquipmentShowcase3D.tsx` on top of the Shop tab: 5 switchable rotatable procedural models (4WD compact tractor, air-blast sprayer, apple grading & harvesting line, drip/micro-sprinkler rig, power tiller) each with a real spec sheet in HTML (HP, tank, flow, SMAM/PMKSY subsidy, dealer price, Kashmir-specific note); spec sheet stays readable in 2D and to screen readers.
- **3.6 Agro-Dealer** — NEW `src/components/three/InputPack3D.tsx` on the Inventory tab: switchable 3D urea/DAP bag with FCO 1985 label callout, pesticide canister with CIB&RC toxicity colour band, machinery crate — each with its compliance rule spelled out in HTML below.
- **3.7 Advisory** — NEW `src/components/three/LeafPathology3D.tsx` on the Library tab: 3D leaf with 4 switchable stages (healthy / early apple scab lesions / advanced scab with yellowing / San Jose scale caps), plain-language note per stage, and the standing `🤖 AI Agronomic Suggestion — verify doses with an agronomist` badge. `RequestThread.tsx` message labels upgraded to the directive's exact wording: `🤖 AI Agronomic Suggestion — verify doses with an agronomist` vs `✅ Verified expert advisory · <name>`.
- **3.8 Mandi Helpers** — NEW `src/components/three/MandiBars3D.tsx`: 3D volume bars, one per mandi, height = latest modal price (per-kg when the unit allows), labelled callouts + 2D bar-chart twin; wired into `PostedRates.tsx` above the per-mandi tables (shows on both `/trader/dashboard` and `/mandi-weather`, and inherits all their existing filters).
- **3.4 / 3.5 Cold Storage & Tracking** — covered by Phase 4 and Phase 5 respectively.

## PHASE 4 — COLD-STORAGE DIGITAL TWIN — VERIFIED, NO CODE CHANGES NEEDED (✅ done this round)

Verified against the real source files (grep on every claim; directive says verify, not trust):

- **Instancing cap** — `src/components/rental/three/buildStore.ts` L795–833: `SLOT_CAP_TRIGGER = 2000`, `SLOT_CAP_SHOWN = 1000` (stride-sampled). Shown instances stay well under the 1800 budget; all rack posts/beams/plates also go through `InstancedMesh` (L883–966).
- **GLB → procedural fallback** — `three/coldKit.ts`: loads `coldstore_kit.glb` (Kit_Crate_HDPE, Kit_Pallet_Bin, apple crown, Kit_Rack_Post, Kit_Rack_Beam, Kit_Evaporator), normalises to unit cube, and returns `null` on any failure or timeout (5 s budget enforced at the call site, `ColdStore3D.tsx` L601–604) — the 3D views then keep their procedural kit exactly as before. No CDN, no broken scene.
- **Work zones with real equipment** — `buildStore.ts` L521–590: each `storeScene` work zone paints a tinted floor slab + sign, and builds zone-sized procedural equipment: washing trough with brush roller, grading conveyor, two packing tables, plant skid blocks, dock leveller. `fixtures.ts` adds evaporators, condensers, trusses, high-bay lights.
- **Storage Unit Inspector + tap-to-book + walk mode** — `ColdStore3D.tsx`: inspector fields Facility/Chamber/Level/Row/Stack/Type/Max Capacity/Stored Quantity/Occupancy (L250–263), tap a place to choose it for booking or see whose it is; walk mode (W A S D / arrow keys) via `walk/walker.ts` with floor arrows (`walk/route.ts`) and minimap (`walk/miniMap.ts`).
- **Al Noor scale** — `buildStore.ts` L790 comment + `IndustrialColdStoreTwin3D.tsx` batching tier for massive facilities; `Preview3D.tsx` lazy-loads (`ssr:false`) either `ColdStore3D` or the instanced twin based on `twinPlanOf(chambers)` size.
- **Shared geometry source confirmed** — `three/storeScene.ts` `buildScene()` feeds 9 consumers: `buildStore.ts`, `fixtures.ts`, `StoreTopView.tsx`, `walk/{walker,route,miniMap}.ts`, `ColdStore3D.tsx`, `ColdStoreMap.tsx`, `owner/StoreDrawing.tsx` — the 3D view, top view, walk mode, minimap and owner drawing are all the same scene, so an owner's numbers can never disagree between views. `Preview3D`/`IndustrialColdStoreTwin3D` map the same real chambers through `twinMap.twinPlanOf` (slot keys map back to real "3B" place codes); `ChamberDiagram.tsx` draws per-chamber plans from `lib/coldLayout.planOf` on the same owner inputs.
- **Honest finding (kept, not deleted)** — `src/lib/sharedFacilityEngine.ts` defines slot math (`UnitSpec`, `ChamberInput`, `ComputedStorageSlot`, FCO wooden-bin / HDPE-crate defaults) but currently has **no consumers** in the tree; the twin's slot grid comes from `twinMap.ts` instead. Left untouched and documented here.
- **Test page** — `/test-pages/cold-store` renders the twin against sample chamber data (route exists in the build output).


## PHASE 5 — LIVE GPS LOGISTICS — SCHEMA v2, TRACKING API, LIVE MAP, DRIVER CONSOLE (✅ done this round)

**Schema** — `supabase/migrations/20261112000002_kashroot_master_upgrade.sql`, applied to the remote project (apply.mjs, 2.3 s) and mirrored into `supabase/RUN_THIS_ONCE.sql` (applied remotely, 4.6 s) with registry row 46. The directive's CREATE TABLEs were re-declared tables that already exist from the ecosystem migration with a different column set, so the outcomes arrive as idempotent ALTERs (documented honestly in the migration header; nothing existing is dropped or narrowed):
- `shipment_tracking_trips` += `driver_id`, `driver_consent_granted` / `driver_consent_timestamp`, `rto_metadata` (JSONB), `route_deviation_alert`, `geofence_status`, `route_history` (JSONB, capped at 500 points), `distance_travelled_km`; trip_status CHECK extended with **ARRIVED** (drop/re-add guarded by `pg_get_constraintdef LIKE '%ARRIVED%'`).
- `shipment_telemetry_events` event_type CHECK extended with **SIGNAL_STALE**.
- New `authorized_fleet` — the RTO fleet registry (`vehicle_registration_no` unique, vehicle/owner/RTO/fitness/permit/insurance/fuel, source `MANUAL` | `RTO_CSV_IMPORT` | `VAHAN_LOOKUP`), RLS + open policy + grants (server-mediated model, no service-role key on Vercel).
- Remote probe verified: trips v2 cols 8/8, ARRIVED ✓, SIGNAL_STALE ✓, `authorized_fleet` ✓, fleet INSERT grants (2), photo v2 cols 8/8, price v2 cols 6/6, OTHER_INPUTS ✓, registry row 46 in `kr_setup_rows` ✓, NO rows: 0.
- `node scripts/check-sql.mjs` → **375 passed, 0 failed** (baseline 373 + the new `authorized_fleet` table).

**Tracking API** — `src/app/api/logistics/track/route.ts` rewritten (v2, writes BOTH column sets so old readers keep working):
- `GET ?code=` / default → trips with effective status (SIGNAL_STALE when the last ping is >10 min old) and minutes-since-ping.
- `GET ?fleet=1` → the registry (500, A→Z). `GET ?fleetCheck=REGNO` → one RTO record.
- `POST CREATE_TRIP` — verifies the registration against `authorized_fleet`, sets `rto_verified_status` = `VERIFIED_RTO_RECORD` | `UNVERIFIED` and fills `rto_metadata` (checked_at stamped); seeds route_history with the origin.
- `POST DRIVER_CONSENT` — the explicit consent moment (both column sets + CONSENT_GRANTED event).
- `POST DRIVER_GPS_PING` — Haversine km-step accumulation into `distance_travelled_km`, `route_history` append (cap 500), geofence status (ARRIVED ≤ 0.15 km, INSIDE_GEOFENCE ≤ 0.5, APPROACHING ≤ 5), deviation alert when > 15 km off the origin→destination segment, ARRIVED trip status, and events: GPS_PING, GEOFENCE_ARRIVAL (newly entered), SIGNAL_STALE (ping reviving a stale trip), ROUTE_DEVIATION (first firing).
- `POST FLEET_IMPORT` — RTO CSV upsert on the registration number, ≤ 500 rows per call, `source='RTO_CSV_IMPORT'`.

**Live map** — `src/components/tracking/LiveLogisticsMap.tsx` (new): draggable slippy map, plain `<img>` raster tiles (zero iframes), street / satellite / hybrid basemaps (OSM + Esri World Imagery + labels), a fourth **Google** basemap drawn from the Maps Static API only when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` exists (never loads Google JS; hidden without the key), truck marker + accuracy circle, driven-route polyline from route_history, dashed origin→destination line, 0.5 km geofence circles at both ends, route-deviation alert strip, follow mode, live coordinate/geofence badges. CSP `img-src` extended with `https://server.arcgisonline.com https://maps.googleapis.com https://maps.gstatic.com` (next.config.ts).

**Portal UI** — `LiveGpsTrips.tsx` extended with the v2 fields (Trip interface), ARRIVED status label/tone, RTO-verified badge + registry details line, driven-path stat (`distance_travelled_km`), and the old `LiveInteractiveMap` panel replaced by `LiveLogisticsMap`.

**Driver console** — new tab in the Tracking dashboard (`tracking/dashboard?tab=driver`, sign-in required): `src/components/tracking/DriverConsole.tsx` — fleet CSV import (file picker or paste, browser-side CSV parse honouring quoted commas, flexible header aliases, template shown), rows upserted through `FLEET_IMPORT` (500/batch); per-vehicle registry check (`?fleetCheck=`) with the full RTO record; registered-vehicles table.

**Build** — `npm run build` clean, all 83 routes (one pre-existing three.js "Material undefined" warning from static generation, not an error).


## PHASE 6 — PHOTO-VERIFICATION PRIVACY (✅ done this round)

**New route** — `src/app/api/products/verify-photo/route.ts` (v2 of the audit; the v1 `/api/photos/geo-verify` stays untouched for compatibility):
- The server — never the client — computes the image's **SHA-256** with `crypto.subtle.digest` over the real bytes (data URL base64-decoded, or an https photo URL fetched, both capped at 8 MB), and stores it in `image_sha256` beside the v1 `photo_hash_sha256`.
- **5-state verification lifecycle** in `verification_state`: `GPS_VERIFIED_ORCHARD` (fix ≤ 500 m AND within 2 km of the listing's stored farm location), `DEVICE_GPS_RECORDED` (default), `GPS_ACCURACY_LOW` (> 1 km fix, flagged), `DUPLICATE_SUSPECTED` (same SHA-256 already verified for a different farmer/listing), `PRIVACY_MASKED` (farmer opted out of the private raw copy). The v1 `verification_status` is always also written with the closest of its three values so older readers keep working.
- **Privacy**: raw coordinates go to `private_raw_lat/lng` only (dropped entirely when the farmer ticks the privacy box); the public twin `public_masked_lat/lng` is `Math.round(v * 100) / 100` (≈ 1.1 km) — and **no response of this API ever includes the raw coordinates** (GET selects only the public columns; the legacy v1 GET is the only reader that still returns device coords).
- `gps_accuracy_m` mirrors the fix accuracy; `original_photo_url` accepts an optional reference (external/mobile flows) or `ATTACH_PHOTO` fills it afterwards (in-app live captures store photos inline in the listing row, so the reference stays null until a caller has a real URL — documented honestly).
- Rows written with BOTH column sets; rate-limited (20/min POST, 30/min GET).

**ProductForm wiring** — `src/components/market/ProductForm.tsx`: every live capture now reports to the audit fire-and-forget (`reportVerification` — data URL, live GPS fix, locality label, privacy choice, `market_listings:{id}` reference when editing); a duplicate-suspect result surfaces as an advisory toast. New optional props `farmerId` / `listingId` passed from `SellerDesk.tsx` (`account.id`, `editing.id`). A "Privacy" checkbox in the GPS & Camera box opts the raw copy out of the audit; masking is applied publicly regardless.

**Build** — `npm run build` clean, all 83 routes + the new one.


## PHASE 7 — UNIVERSAL PRICE ENGINE UPGRADE (✅ done this round)

**API v2** — `src/app/api/price-comparison/route.ts`:
- 14th category **OTHER_INPUTS** added (the CHECK union already admits it); **OTHER_INPUTS ↔ EQUIPMENT alias** — filtering either returns both pools (marketplace "supplies" rows classify as EQUIPMENT), applied to the SQL `in()` filter and the merged-row filter alike.
- New GET filters: `variety` (ilike), `grade` (ilike), `sellerType` (exact on universal rows; matched against `seller_type`/`seller_role` on mapped marketplace rows).
- Transport cost per unit: universal rows carry `transport_cost_per_unit_inr`; the mapped marketplace rows expose it as null (the listing has no per-unit transport field — documented in the code). New sort `landed_asc` = price + transport per unit, cheapest landed first.
- Sparklines: `price_history` passes through from the DB (`[{p, t}]`); `last_updated_at` drives the "newest" sort.
- POST writes BOTH column sets: v1 (`seller_role`, `market_or_village`, `delivery_cost_inr`, `source_label`) and v2 (`seller_type`, `location_label`, `transport_cost_per_unit_inr`, `source_name`, `price_history` seeded with the first price point, `last_updated_at`). `sellerType` is accepted and drives both role fields.

**Board UI v2** — `src/components/market/UniversalPriceBoard.tsx`:
- Pictorial chips: an emoji mark per category (🍎 🌰 🥜 🌺 🍑 🥕 🍇 🌻 🧪 🐛 🚜 💦 🧰 📦) + 🌐 for All.
- Variety / grade / seller-type filter controls under the search row.
- **Landed price**: "+ ₹X transport per unit → landed ₹Y" line when a row carries transport; "Cheapest landed first" sort option.
- **Sparklines**: `Sparkline` renders the row's own `price_history` (last 12 points) as a tiny SVG line with an up/down % badge; hidden when fewer than 2 points.
- **Escrow order link**: marketplace rows get "🛒 Order with escrow protection ↗" → `/buyer/dashboard?tab=shop` (where the escrow-protected OrderModal lives); non-marketplace rows are labelled price references.
- OfferSubmit: seller-type select + transport-cost-per-unit input; category select gains "Other inputs".

**Build** — `npm run build` clean, all 83 routes.


## PHASE 8/9/10 — VALIDATION, RBAC RE-CHECK, LAZY-LOAD CHECK (✅ done this round)

**Phase 8 — zod validation** on every route created or rewritten this round (schema-style follows the existing `/api/cold-storage/book-units` pattern: `safeParse` → 400 with `issues: error.flatten()`):
- `/api/logistics/track` — `CreateTripSchema`, `DriverConsentSchema`, `DriverPingSchema`, `FleetRowSchema` + `FleetImportSchema` (rows ≤ 500). Coordinates accept numbers or numeric strings (`z.coerce.number()` with range bounds); manual per-field checks replaced by the schemas, business rules (consent required, closed trips, RTO lookup) stay.
- `/api/products/verify-photo` — `RecordSchema` (uuid farmer/listing, coordinate/accuracy bounds, data URL ≤ 1.2 M chars, https photo URL, ≤ 500-char photo reference) and `AttachSchema`.
- `/api/price-comparison` — `OfferSchema` with `category: z.enum(CATEGORIES)` (declared after the const to avoid TDZ) and positive `priceInr`.

**Phase 9 — RBAC / privacy re-verification** (greps + gate):
- `node scripts/check-sql.mjs` → **375 passed, 0 failed** — every table including the five this round touches is RLS-on with policy; security-definer functions keep `set search_path = public`.
- Secret scan of all API routes: no keys, no JWTs, no provider URLs hardcoded — Google basemap reads `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` only (name, not value).
- Data-leak check on the new endpoints: `/api/products/verify-photo` GET selects a fixed PUBLIC column list — raw device coordinates (`device_lat/lng`, `private_raw_lat/lng`) are never returned; `/api/price-comparison` market select excludes the seller's phone; `/api/logistics/track` returns trip rows whose driver phone is the trip link's shareable content (v1 design, unchanged).

**Phase 10 — lazy-load check**:
- New components verified: `LiveLogisticsMap` loads via `next/dynamic` + `ssr:false` in `LiveGpsTrips`; `DriverConsole` pulls only the portal kit; zero `three` imports in the tracking components — all 3D still runs exclusively through the shared lazy `Portal3DScene` engine from Phase 2/3 (with the 2D fallback and the `kr_portal_3d_off` toggle).
- `npm run build` clean — all 83 routes.


## PHASE 11 — FINAL DELIVERABLE REPORT — (filled at the end)
