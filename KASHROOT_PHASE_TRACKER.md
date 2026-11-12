# KashRoot — Phase 0 → Phase 11 Master Tracker

Started: 2026-11-12 · Working dir: `kashroot-web` · Git checkpoint tag before work: `kashroot-checkpoint-pre-phases-0-11` (commit `fe52b40` on `main`)
Supabase project: `wmkjkdfigdlpdvvsqcig` (connection via `.env` `DATABASE_URL` — never hardcoded)

| Phase | Scope | Status | Evidence / notes |
|---|---|---|---|
| 0 | Full repo audit + git checkpoint + this tracker | ✅ DONE | Audit below; tag created; tracker written before any code change |
| 1.1 | Schema + RLS migration `20261112000001_kashroot_ecosystem_phases.sql` + apply to remote DB | ✅ DONE | Migration written; bundled in `RUN_THIS_ONCE.sql` (sections 20261121/22 + new, registry rows 43–45); `check-sql.mjs` 373 passed / 0 failed; applied to remote DB — all 45 setup rows "yes" |
| 1.2.1 | Packing layers permanent green selection | ✅ ALREADY SHIPPED | `market/ProductForm.tsx` — solid-green active class + `✓ Selected packing` banner (shipped commit `c475172`) |
| 1.2.2 | Native OSM tile map + buyer GPS error clear | ✅ ALREADY SHIPPED | `common/LiveInteractiveMap.tsx` (no iframe, CSP-safe) wired in `OrderModal`, `ListingDetailModal`, `ProductForm` |
| 1.2.3 | 3D cold store open fix | ✅ ALREADY SHIPPED | `ColdStore3D.tsx`: instanced safety cap (SLOT_CAP_SHOWN=1000 ≤ 1800), Guard3D 3× auto-retry, GLB → procedural fallback |
| 1.2.4 | TrueScan camera hang + Web Speech fallback | ✅ ALREADY SHIPPED | Commit `fe52b40`, deployed + verified 2026-11-11 |
| 2 | Top nav: logo, Help & Support, dynamic My-portal, 8-portal dropdown | ✅ ALREADY SHIPPED | `SiteHeader.tsx` + `lib/auth/roles.ts` PORTALS (farmer, buyer, kissan, rental, tracking, dealer, expert/Advisory, trader/Mandi Helpers) |
| 3 | Guest no-sign-in tools preserved (TrueScan, mandi rates & weather, price comparison) | ✅ ALREADY SHIPPED | Homepage TrueScan section + `TOOL_ITEMS` in header menu |
| 3.4 | Owner architectural & leisure-zone configuration | ✅ ALREADY SHIPPED (UI) + 🔄 (this migration adds the directive's exact column set) | Previous round shipped owner chamber/door/work-space config; Phase 1.1 adds `main_door_*`, `main_passage_width_ft`, `leisure_zones_config`, chamber door/offset/aisle columns |
| 4 | Procedural 3D engine (instancing, Guard3D, GLB fallback) | ✅ ALREADY SHIPPED | `rental/three/*`, cap verified above |
| 5.1 | `/api/logistics/track` (consent GPS pings, Haversine, ETA, SIGNAL_STALE) | ✅ DONE | `src/app/api/logistics/track/route.ts` — GET ?code= (effective status + minutes since ping), POST CREATE_TRIP / DRIVER_GPS_PING with consent enforcement, telemetry events, Haversine covered/remaining/ETA, `ipLimited` guards |
| 6 | GPS-verified product photo audit (`product_photo_verifications`) | ✅ DONE | Table live in remote DB; `src/app/api/photos/geo-verify/route.ts` POST (validated audit insert) + GET (by listingId/farmerId), rate-limited; listings already carry live-capture GPS metadata (20261121 migration) |
| 7.1 | `/api/price-comparison` (13 categories, filters, submit) | ✅ DONE | `src/app/api/price-comparison/route.ts` — merges `market_listings` (real listings table; keyword classifier → 13 categories, English + Hindi/Urdu/Kashmiri) with `universal_price_listings`; category/district/q filters, 3 sorts, POST verified-offer submit; rate-limited |
| 8 | Wire logistics API + LiveInteractiveMap into Tracking Portal | ✅ DONE | New "Live GPS trips" tab in `(dashboards)/tracking/dashboard/page.tsx` → `components/tracking/LiveGpsTrips.tsx`: trip create w/ consent (PlaceInput origins/destinations), driver geolocation watch → 15 s pings, telemetry grid (covered/remaining/speed/ETA/stale), LiveInteractiveMap with new `destLat`/`destLng`/`destLabel` props (route link, destination pin, straight-line km). Existing consignments untouched |
| 9 | Wire price-comparison API into Price Comparison tool | ✅ DONE | New "Universal board" tab on `/compare-prices` → `components/market/UniversalPriceBoard.tsx`: 13-category chips, search + district filter, cheapest/dearest/newest sort, merged listing cards, verified-offer submit form. `?tab=universal` deep link works |
| 10 | Security + mobile pass (rate limits on new public APIs, env-only keys) | ✅ DONE | `ipLimited` + `tooMany()` on all three new routes (logistics-track 30/min, logistics-track-post 60/min, price-comparison 60/min + post 20/min, photos-geo-verify 20/min + get 30/min); tables revoked from anon/authenticated (server-mediated); no keys hardcoded — only `process.env` names |
| 11 | Build → commit → push `main` → Vercel prod → verify 5 URLs | ⏳ PENDING | Exact commit message per directive |

## Phase 0 audit findings

- Architecture: Next.js 16.4.3 App Router, `src/app` (routes), `src/components` (portals), `src/lib` (db/auth/maps), `src/app/api/*` (route handlers), `supabase/migrations/*` (49 files, oldest first).
- DB deployment contract: `supabase/RUN_THIS_ONCE.sql` is the concatenated bundle used for the Supabase SQL editor; CI (`check-sql.mjs` + `supabase/tests/run.sh` in Docker) enforces RLS + `search_path` on every bundled table/function and re-runnability. **Every new migration must be appended to the bundle + get a `kr_setup_rows()` entry** (row 43+ added this round).
- Gap found and FIXED this round: migrations `20261121` (packing layers/live-capture) and `20261122` (order live GPS + escrow) existed as files but were never appended to `RUN_THIS_ONCE.sql` — bundled now with registry rows 43/44; remote DB verified to already have their columns/functions. `20261120` (trip lock) was in the bundle but **had never been applied to the remote DB** — the whole updated bundle was applied (all-or-nothing, 5.5 s), bringing remote fully in sync: all 45 setup rows now report "yes", 0 "NO".
- Env keys referenced only by name (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`); nothing hardcoded.
- `.github/skills/gstack` stays unstaged/untouched (pre-existing working-tree change).

## Final ship record (filled at Phase 11)

- Commit: TBD
- Deployment: TBD
- Prod URL checks: TBD
