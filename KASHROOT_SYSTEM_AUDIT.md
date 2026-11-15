# KashRoot system audit (Phase 0)

Date: 2026-11-15. Baseline commit: `9e51389` on `main`, in sync with `origin/main`
(`github.com/waseemmushtaq173-hub/kashroot-web`). Written before any application code was changed.

How to read the status column. Each row was classified from reading the live source files that
`src/app/**/page.tsx` imports. A row says `WORKING AND VERIFIED` only where a check was actually
run in this audit or an existing automated test covers it. Everything read but not exercised is
`NOT TESTED`, even when the code looks complete. The post-fix verification matrix is in
`KASHROOT_IMPLEMENTATION_REPORT.md`.

## 0.1 Repository and stack

- Next.js 16.4.3 App Router, React 19.2.8, TypeScript 5, Tailwind 3.4, three 0.187 (raw three.js
  in `ColdStore3D`, react-three-fiber in `IndustrialColdStoreTwin3D`), Supabase JS 2.117,
  Leaflet 1.9, nodemailer 10, zod 4, Playwright 1.64.
- `AGENTS.md` warns that this Next.js version differs from older ones; route handlers are plain
  `GET/POST(request: Request)` exports.
- 48 pages (`src/app/**/page.tsx`), 60 API route handlers (`src/app/api/**/route.ts`),
  55 migrations, 21 Playwright spec files.
- CI (`.github/workflows/ci.yml`): `npm audit`, `tsc --noEmit`, `eslint src tests`, `next build`,
  model tests (`tests/email.spec.ts`, `tests/coldstore-model.spec.ts`), gitleaks, and the database
  job (`scripts/check-sql.mjs` + `supabase/tests/run.sh`), which requires every migration to be in
  `supabase/RUN_THIS_ONCE.sql` with a `kr_setup_rows()` entry.
- Baseline check run in this audit: `npx tsc --noEmit` exit 0.
- Working tree before this work: `KASHROOT_CA_COLDSTORE_AUDIT.md` modified (an uncommitted build
  record from an earlier session), `.github/skills/gstack` modified (left alone, as earlier
  sessions did), `_tw-check.css` and `bun.lock` untracked.

Route naming differs from the directive text. The portals live under the `(dashboards)` route
group, so the real URLs are `/farmer/dashboard`, `/buyer/dashboard`, `/kissan-tools/dashboard`,
`/rental/dashboard`, `/tracking/dashboard`, `/dealer/dashboard`, `/expert` (Advisory),
`/trader/dashboard` (Mandi Helpers), `/admin/dashboard`. There is no `/rental` page, `/dealer`,
`/advisory` or `/mandi` page of their own; cold store exploring and booking is the farmer side of
`/rental/dashboard`.

## 0.2 Portal by portal

| # | Portal or module | Live files | Status | Notes |
|---|---|---|---|---|
| 1 | Homepage | `src/app/page.tsx` (242 lines) | NOT TESTED | Portal cards, TrueScan, Pay After Delivery, mandi prices, price comparison entries. Covered signed-out by `tests/portal-audit.spec.ts` (not run in Phase 0). |
| 2 | Farmer portal | `(dashboards)/farmer/dashboard/page.tsx`, `farmer/orchard-health`, `farmer/season-planner`, `farmer/assistant`, `farmer/ask-expert` | NOT TESTED | Tabs overview, coldstore (`FarmerStoredApplesDesk`), lots, orders, payouts. |
| 3 | Buyer portal | `(dashboards)/buyer/dashboard/page.tsx` | NOT TESTED | Uses `common/LiveInteractiveMap.tsx` (native tiles, no iframe). |
| 4 | Kisan Tools | `(dashboards)/kissan-tools/dashboard/page.tsx` | NOT TESTED | |
| 5 | Cold store explorer and booking | `rental/dashboard/page.tsx` → `ColdBooking.tsx` → `ColdStoreMap.tsx` (`ColdStoreExplorer`) → `StoreTopView`, `ChamberDiagram`, `ColdStore3D` | BROKEN (one crash), otherwise PARTIALLY IMPLEMENTED | Crash: see 0.7. Booking, shared places, 24 hour hold and pay-the-owner flow are wired to the database. The place card exists only in the 3D views; the 2D drawing has no card and no per-bin price. Bin colours do not follow the directive palette. |
| 6 | Owner admin dashboard | `rental/dashboard/page.tsx` → `OwnerAdminConsole.tsx`, `OwnerWizard`, `SharedBinAndEngineeringDesk`, `ColdMapEditor`, `TwinPeek` | NOT TESTED | Same 3D crash path as row 5 through `ColdMapEditor` and `Preview3D`. |
| 7 | Live GPS tracking | `tracking/page.tsx`, `(dashboards)/tracking/dashboard/page.tsx`, `components/tracking/*` | NOT TESTED | `/api/logistics/track`, `/api/tracking/ingest`, `/api/tracking/portal`. |
| 8 | Agro dealer | `(dashboards)/dealer/dashboard/page.tsx` | NOT TESTED | |
| 9 | Advisory | `(dashboards)/expert/page.tsx`, `farmer/ask-expert` | NOT TESTED | `/api/advisory/ai`. |
| 10 | Mandi helpers | `(dashboards)/trader/dashboard/page.tsx` | NOT TESTED | |
| 11 | TrueScan | homepage section, `/api/truescan/*`, `supplies/tester` | NOT TESTED | |
| 12 | Pay After Delivery | `escrow/page.tsx`, `escrow/auth` | NOT TESTED | |
| 13 | Universal price comparison | `compare-prices/page.tsx` → `UniversalPriceBoard.tsx`, `/api/price-comparison` | NOT TESTED | 13 categories in the API. |
| 14 | Mandi prices and weather | `mandi-weather/page.tsx`, `/api/mandi`, `/api/weather` | NOT TESTED | |
| 15 | Platform superadmin | `(dashboards)/admin/dashboard/page.tsx`, `OwnerHierarchyPanel.tsx`, `/api/admin/hierarchy` | NOT TESTED | `tests/admin-flow.local.spec.ts` needs local test accounts. |
| 16 | Auth and OTP | `RoleLoginForm.tsx`, `ContactOtp.tsx`, `ui/OtpBoxes.tsx`, `/api/otp/{send,verify,status}` | WORKING (by code reading), NOT TESTED live | The three OTP fixes the directive asks for are already in `9e51389`. See 0.9. |

## 0.3 to 0.5 Database and API map

Deployment contract: `supabase/RUN_THIS_ONCE.sql` is the whole schema as one re-runnable bundle.
A new migration must be appended to it and registered in `kr_setup_rows()` or CI fails. No new
migration is needed for this work.

Cold storage tables in use: `rental_listings` (facility, `building` jsonb, payout details),
`cold_chambers` (rows, cols, `boxes_per_slot`, `size` jsonb, `rate`, `unit_kg`, wall side, door,
`crates_per_bin`), `cold_slot_bookings` and `rental_bookings` (place bookings and the 24 hour
hold), `cold_storage_unit_allocations` (exact 3D units), `cold_storage_bins`,
`cold_storage_bookings`, `shared_bin_allocations`, `apple_inventory_movements`,
`ca_chamber_environment_readings`, `cold_storage_notifications`, `cold_storage_organizations`,
`owner_staff_members`, `facility_financial_transactions`, `platform_audit_logs`.

Cold storage data flow:

| Step | Frontend | API or RPC | Table | UI update |
|---|---|---|---|---|
| Read free places | `ColdBooking.load()` | `takenPlaces()` in `lib/db/coldMap` | `cold_slot_bookings` | `stateOf`/`roomOf` repaint the drawing and 3D |
| Book | `ColdBooking.book()` | RPC `kr_book_cold_places` (capacity checked in the database; a clash raises "taken") | `rental_bookings`, `cold_slot_bookings` | step moves to pay; on "taken" the map reloads |
| Mirror 3D units | `ColdBooking.bookUnits()` | `POST /api/cold-storage/book-units` (zod, per-unit capacity limit, 409 on conflict) | `cold_storage_unit_allocations` | twin shows exact units |
| Pay | `receipt/PayOwner` | farmer writes the payment reference | `rental_bookings` | "We told the owner you paid"; the owner confirms |
| Shared bins | `SharedBinAndEngineeringDesk` | `POST /api/cold-storage/operations` (SUBMIT_BOOKING, OWNER_DECIDE_BOOKING, ALLOCATE_TO_SHARED_BIN with 409 on over-allocation, RELEASE_OR_DISPATCH_FROM_BIN, LOG_CA_ENVIRONMENT) | `cold_storage_bookings`, `shared_bin_allocations`, `apple_inventory_movements`, `ca_chamber_environment_readings` | owner and farmer desks reload |
| Telemetry | owner desk, superadmin | `GET /api/cold-storage/operations`, `/api/admin/hierarchy` | `ca_chamber_environment_readings` | readings listed; 3D door plaque says "Sensor not connected" without a row |

Payment honesty: a booking is never marked paid from a client flag. The farmer's step records a
payment reference and the owner confirms it against their bank or UPI app.

Known auth gap (carried from `KASHROOT_CA_COLDSTORE_AUDIT.md`, not changed here): API routes do
not verify a session by default. `/api/cold-storage/book-units` trusts `body.farmerId`;
`/api/cold-storage/operations` verifies a Bearer token only when one is sent. All are rate limited.

Other API groups: `otp/*`, `kyc/*`, `mandi/*`, `weather`, `v1/weather`, `price-comparison`,
`truescan/*`, `tracking/*`, `logistics/track`, `vehicle/*`, `advisory/ai`, `ai`, `diagnose`,
`orchard/scab`, `photos/geo-verify`, `products/verify-photo`, `lab-test/book`, `support`,
`email`, `admin/hierarchy`, `team/session`, `gate`, `human`, `security/me`, `health`, `cron/*`,
`supabase/[...path]` (proxy), `bhashini/*`, `speak`, `label`, `place`, `geo/reverse`, `ifsc`,
`turn`, `cold-stores`, `cold-storage/*`.

## 0.6 Cold storage 3D pipeline

- `src/lib/coldStore.ts` (1,865 lines): the owner's store model, counts and words.
- `three/storeScene.ts` (1,093): `buildScene(chambers, building)` turns the owner's saved numbers
  into one scene used by the drawing, the 3D view and the walk. `zonesForViewer` hides the
  machinery bay from farmers.
- `three/buildStore.ts` (1,415): meshes. `makeKit` owns shared materials and geometries;
  `disposeGroup` frees what one group made.
- `three/fixtures.ts` (312): unit coolers, lights, pipes. `three/StoreTopView.tsx` (331): the 2D
  top view. `ColdStore3D.tsx` (1,945): renderer, orbit and walk, place card.
- `IndustrialColdStoreTwin3D.tsx` + `lib/sharedFacilityEngine.ts` + `twinMap.ts`: the second,
  react-three-fiber twin, bridged to the same places.
- Chamber count, floors, sizes, doors and walls already come from the owner's saved rows. Nothing
  hardcodes seven chambers. InstancedMesh caps 1500/1000 are in place.

## 0.7 Root cause of `t.material.map?.dispose is not a function`

Location: `src/components/rental/three/buildStore.ts`, `disposeGroup`, lines 309 to 312:

```ts
if (m.material && !shared.has(m.material)) {
  m.material.map?.dispose();
  m.material.dispose();
}
```

Trigger: `src/components/rental/three/fixtures.ts` line 156 builds the unit cooler with an
array of materials:

```ts
const m = new T.Mesh(evapProto, [mats.cooler, mats.guard, mats.guard]);
```

What happens on cleanup:

1. `m.material` is a `Material[]`. The array itself is not in the `shared` set (only the
   individual kit materials are), so the guard passes.
2. On an array, `.map` is `Array.prototype.map`, a function. It is not null or undefined, so the
   optional chain does not stop.
3. `Array.prototype.map.dispose` is undefined, and calling it throws
   `TypeError: m.material.map?.dispose is not a function` (minified: `t.material.map?.dispose`).
4. The throw happens inside the React effect cleanup in `ColdStore3D.tsx` (lines 1626 to 1628),
   before `kit.dispose()`, `renderer.dispose()` and `renderer.forceContextLoss()`. So every
   unmount or view switch with a cooler in the scene also leaks the WebGL context.

Second defect in the same block: had the call not thrown, the array elements are kit-shared
materials, and a per-element dispose must still skip them.

Other dispose sites checked: `ColdStoreTwin.tsx` 236 and 381 (single typed materials, safe; but
the cleanup at 382 frees geometries only, never mesh materials or textures),
`buildStore.ts` 783 (`plaqueMat.map`, a single material, safe), `ValleyScene.tsx` (typed
disposables, safe), `fixtures.ts` 239 (geometry, safe).

## 0.8 Gaps against the directive

| Area | State at baseline | Classification |
|---|---|---|
| Array-material dispose crash | present | BROKEN |
| OTP bypass button removed | done in `9e51389` | WORKING (code read) |
| OTP six boxes inside the card | `OtpBoxes` uses `flex-1 basis-0 min-w-0` boxes in a `max-w-[374px]` row | WORKING (code read), NOT TESTED at 320 px |
| Gmail App Password spaces | stripped in `lib/server/otp.ts` and `lib/server/mail.ts` | WORKING (code read) |
| Design tokens in `globals.css` | all ten directive tokens exist as `--kr-*` variables with primary and secondary button styles | PARTIALLY IMPLEMENTED (cold store explorer still uses sky blue and violet) |
| Dimension-driven twin | from owner rows | WORKING (existing model tests), NOT TESTED here |
| Bin state palette | sky, amber, slate, violet | MISSING (directive palette) |
| Bin card with capacity, price, quantity | 3D only, no price, no quantity field | PARTIALLY IMPLEMENTED |
| Server-side capacity check | RPC and both API routes | WORKING (code read) |
| Honest telemetry | plaque says "Sensor not connected"; no generated readings found (`Math.random` is used only for reference codes) | WORKING (code read) |
| Farmer privacy on shared bins | farmer sees own units and free room only | WORKING (code read) |

## 0.9 What this round will change

1. Fix the dispose crash with one type-safe helper used by every cleanup path, plus a model test.
2. Free materials and textures in the `ColdStoreTwin` cleanup.
3. Move the place colours to the directive palette in one file (`placeLook.ts`) and its two
   hardcoded copies (`ChamberDiagram.tsx`, `buildStore.ts`).
4. Add a selected-bin panel to the booking window that works for the drawing, the 3D view and the
   walk: bin identity, capacity, occupied, remaining, rate, a quantity field and a live price.
5. Run the build and the Playwright suites and record real results.

No database migration is planned.
