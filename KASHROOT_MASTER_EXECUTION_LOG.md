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

## PHASE 4 — (filled below when complete)

## PHASE 5 — (filled below when complete)

## PHASE 6 — (filled below when complete)

## PHASE 7 — (filled below when complete)

## PHASE 8/9/10 — (filled below when complete)

## PHASE 11 — FINAL DELIVERABLE REPORT — (filled at the end)
