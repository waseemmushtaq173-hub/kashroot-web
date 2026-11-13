# KASHROOT CA COLD STORAGE DIRECTIVE - PHASE 0 AUDIT (2026-11-13)

Scope: CA cold-storage engineering engine (Leaflet 427 adaptation), shared
multi-farmer bin allocation, booking workflow, inventory traceability ledger,
CA telemetry, portal integration, and the supplementary 3D architecture
directive. Baseline commit: c759617 (GPS directive shipped, production live).

## 1. Remote database facts (probe_ca.mjs against project wmkjkdfigdlpdvvsqcig)

- `rental_listings`: EXISTS, 2 rows. Relevant columns: owner_id, kind, title,
  owner_name, phone, district, state, area, building (jsonb), photos, org_id,
  facility_code, corridor_layout (LEFT_SIDE|RIGHT_SIDE|BOTH_SIDES|CUSTOM),
  cleaning_zone_sqft, grading_sorting_zone_sqft, packing_zone_sqft,
  machinery_room_sqft, loading_bay_sqft, owner_payout_upi,
  owner_bank_account_name/no/ifsc, manager_name/phone.
- `cold_chambers`: EXISTS, 2 rows. Columns: id, listing_id, name, position,
  rows, cols, boxes_per_slot, blocked, note, size (jsonb), chamber_no, floor,
  storage, unit_kg, capacity_mt, rate, chamber_code, side_position
  (LEFT|RIGHT|CENTER|CUSTOM), storage_unit_type (WOODEN_BIN|PLASTIC_CRATE),
  unit_default_capacity_kg, unit_length_m/width_m/height_m, unit_spacing_m,
  levels_count, offset_from_front_ft, offset_from_side_ft, door_wall_side,
  door_position_align, door_width_ft, door_height_ft, aisle_width_ft.
- NONE of the seven new tables exist yet: cold_storage_floors,
  cold_storage_bins, cold_storage_bookings, shared_bin_allocations,
  apple_inventory_movements, ca_chamber_environment_readings,
  cold_storage_notifications. Migration 20261113000006 therefore applies
  cleanly with zero name collisions.
- No FK constraints are declared between the new tables and auth/profile
  tables; all cross references are plain UUID columns, so test data with
  arbitrary UUIDs is insertable (needed for the e2e probe).

## 2. Existing cold-storage architecture (explore report)

Two 3D pipelines, already bridged; one true orphan:

- Pipeline A (wizard/live): `src/lib/coldStore.ts` StoreModel -> RPC
  `kr_save_cold_chambers` -> `cold_chambers` (size jsonb). Farmer books
  places named "3B" (row number + stack letter) via RPC
  `kr_book_cold_places` (24h hold, shared-place box counts). Renderers:
  `ChamberDiagram.tsx` (SVG 2D, mode book|owner|view) and `ColdStore3D.tsx`
  (raw three.js, orbit + walk, imperative Api ref, 1,786 lines).
- Pipeline B (twin): `src/components/rental/twinMap.ts` bridges every
  cold_chambers row onto `IndustrialColdStoreTwin3D.tsx` (react-three-fiber
  + drei, orbit only). Slot keys `CODE:LEVEL-01:BIN-###`; allocations written
  by POST /api/cold-storage/book-units into `cold_storage_unit_allocations`.
  After each "3B" booking, ColdBooking.bookUnits() mirrors chosen places into
  the allocations table (L553-601), so both identities describe the same
  physical place. `twinMap.keyOf` / `placeOf` convert between them.
- Orphan: `src/lib/sharedFacilityEngine.ts` (436 lines) has ZERO importers
  anywhere in src. It only supports side LEFT|RIGHT|CENTER. Safe to rewrite
  completely for the supplementary directive (slot-key grammar preserved:
  `CH-CODE:LEVEL-NN:BIN-0001`).
- Wall support asymmetry: `src/lib/coldLayout.ts` knows all four walls
  (Wall = front|back|left|right, used by doorWall, windows, cooling.wall,
  WallPicker UI, storeScene.INWARD). The twin's `Chamber3DConfig.side` only
  allows LEFT|RIGHT - choke point for the supplementary L-bank layout.
- Performance contract: InstancedMesh caps SLOT_CAP_TRIGGER = 1500 /
  SLOT_CAP_SHOWN = 1000 exist in BOTH renderers (three/buildStore.ts L797,
  twin L65). Must be preserved in any new mesh code.
- `three/fixtures.ts` renders LED battens + high-bay lights and evaporator
  fan discs on the owner-named cooler wall (wall/over-aisle mounted).
  `three/coldKit.ts` returns null on GLB load failure -> procedural fallback;
  blender-sync is 503 on Vercel (local only), blender-generate returns static
  /models/coldstore_kit.glb URLs.
- Owner wizard: 5 steps in `OwnerWizard.tsx` (Store, Building, Chambers,
  Payment, Review). ChambersStep.tsx (398 lines) configures chamber no,
  bins/crates, rack levels 1-10, count, kg, floors, dims, door wall + size,
  stackHigh, gaps, rate, spot, coolerWall/coolant/ca/temperature/humidity.
  Draft persisted in localStorage `kr_cold_wizard:<owner>:<listing>`.
- Dashboards: rental dashboard tabs farmer ['cold','bookings'] / owner
  ['stores','requests','payments'] (TABS record). Farmer dashboard Tab union
  is 'overview'|'lots'|'orders'|'payouts' with no cold tab yet; new cold tab
  mounts in the PortalShell tabs array (L114-119) + render block (L201-215).

## 3. Auth and rate-limit model (verified by reading the code)

- Identity is client-asserted platform-wide: `loadAccount()` in
  `src/lib/db/client.ts` reads the Supabase auth session on the client and
  returns an `Account {id, email, name, phone, ...}`. Dashboard pages pass
  `account.id` into components; rental_listings.owner_id matches account.id.
- ZERO routes in src/app/api verify sessions (grep for getUser/getClaims/
  createServerClient/cookies(): no matches). The existing
  /api/cold-storage/book-units POST therefore trusts body.farmerId.
- Server-side guard convention: `ipLimited(request, name, n)` + `tooMany()`
  from `src/lib/server/sign`, used by bhashini, weather, vehicle,
  cold-stores, blender-sync, products, cron routes.

## 4. Next.js version caution (AGENTS.md)

Checked node_modules/next/dist/docs/01-app/01-getting-started/
15-route-handlers.md: route files export plain `GET/POST(request: Request)`
handlers plus `export const dynamic`; standard Request/Response APIs.
The existing book-units route compiles on this version and is the template.
Shared helpers live in src/lib/, not in route files.

## 5. Planned deviations from the directive text (D1..D7)

- D1 Auth hardening on the NEW operations API only: `ipLimited` rate limits
  on GET and POST; when an `Authorization: Bearer <jwt>` header is present,
  the route verifies it via Supabase auth and enforces farmer actions
  (SUBMIT_BOOKING, REQUEST_RELEASE) use farmerId == verified user id, and
  owner actions (OWNER_DECIDE, ALLOCATE, CONFIRM_DISPATCH) are made by the
  listing owner. Header-less calls stay allowed and rate-limited, matching
  the platform-wide client-asserted identity model. The new desk component
  always sends the Bearer header. The existing book-units route is left
  untouched (ColdBooking depends on it; changing it risks the live booking
  mirror) - its gap is documented here instead.
- D2 `cold_chambers.side_position` CHECK allows only LEFT|RIGHT|CENTER|CUSTOM.
  To let the owner place chambers on the Back/Top and Front walls explicitly,
  a small follow-up migration will extend the CHECK to add BACK and FRONT
  (and re-create `kr_save_cold_chambers` only if its body validates the
  column). The sharedFacilityEngine accepts the full wall set in code either
  way.
- D3 Single consolidated deploy: both prescribed ship commits are made and
  pushed, then ONE `npx vercel --prod --yes` runs (Vercel deploys the
  working directory; deploying between the commits would race the commit-2
  file edits).
- D4 sharedFacilityEngine.ts is rewritten wholesale (dead code, zero
  importers) keeping the slot-key grammar `CH-CODE:LEVEL-NN:BIN-0001`.
- D5 Visualization exclusions resolved against both directives: NO rotating
  fan or ceiling blower fan meshes inside CA chambers in any view; unit
  cooler housings stay mounted over the aisle / on the cooler wall per
  Leaflet 427; machinery room, CA/CS gas room, electrical room, office and
  laboratory are hidden from farmer-facing 2D/3D; ceiling LED strip
  luminaires are rendered in every chamber and the grading/packaging hall.
- D6 Commit discipline follows the GPS-directive pattern (verified in git
  history): one ASCII checkpoint commit per phase, all preserved; the two
  prescribed ship commits capture the final build-verified slices; separate
  `git add` and `git commit` calls; `.github/skills/gstack` untouched.
- D8 Directive SQL bug fixed before apply: cold_chambers.defrost_method
  DEFAULT 'WATER_OR_HOT_GAS_AUTOMATIC' was not in its own CHECK value list,
  so Postgres rejected the column on the 2 existing chamber rows. The CHECK
  now also allows 'WATER_OR_HOT_GAS_AUTOMATIC' (the intended automatic
  water/hot-gas defrost default from Leaflet 427); every other statement is
  applied verbatim.
- D7 Apple-vs-fish engineering rule is enforced in the engine: no frozen
  parameters (0..-40F rooms, latent fusion L = 115 Btu/lb) ever apply to
  apples; apples are cooled above freezing (31-36F, 90-95% RH, controlled
  O2/CO2) using c = 0.87 Btu/(lb)(F) plus respiration vital heat; every CA
  setpoint is labelled as requiring cultivar-specific agronomic validation.

## 6. Phase plan

Phase 0 this audit. Phase 1 migration 20261113000006 + verify script +
checkpoint commit. Phase 2 engine (already written verbatim from the
directive). Phase 3 operations API + hardening + e2e probe against a local
production server. Phase 4 owner/farmer portal integration. Supplementary
steps 1-3 (engine rewrite, 2D/3D sync with exclusions, wizard upgrade).
Then: npm run build green -> prescribed ship commit 1 -> prescribed ship
commit 2 -> push origin HEAD:main -> single Vercel production deploy ->
production probes -> consolidated report.
