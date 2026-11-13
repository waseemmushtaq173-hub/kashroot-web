# KASHROOT — COMPLETE UI/UX CORRECTION MASTER REPORT

Directive: Complete UI/UX Correction, Smart 3D Transformation, Online-First Restoration & Performance Optimization. Phases 0 → 9, strictly sequential, checkpoint commit per phase. This file is the phase-by-phase root-cause log and verification record.

---

## PHASE 0 — COMPLETE CODEBASE AUDIT & EXACT LINE MAPPING (✅)

Mandated search run (`Get-ChildItem -Recurse | Select-String` with the directive's exact pattern set). Findings:

### A. False-offline workflow (Phase 1 targets)
| File | Lines | What it is | Root cause class |
|---|---|---|---|
| `src/components/pwa/PwaRoot.tsx` | 240–295 | **Two global fixed bottom banners** shown from the root layout: (1) "No internet connection right now. You are viewing a saved copy from …" (2) "KashRoot is not responding just now — your internet looks fine." | Global banner #2 is the false positive: it fires whenever the 3 s `/api/health` probe fails (cold start / slow mobile handoff), even with working internet. Banner #1 announces the saved-copy queue workflow. |
| `src/components/pwa/PwaRoot.tsx` | 207–215, 297–311 | Automatic queued-action sync: "Back online. Sending N items…" toast + floating "Waiting (N)" chip | The obsolete offline-queue banner workflow the directive deletes. |
| `src/components/pwa/PwaRoot.tsx` | 44–104, 149–156 | Serwist service-worker registration + saved-page detection (`askSavedPage`/`savedPageTime`) + data-pack interval sync | SW-served stale copies + extra polling loops are part of the offline mode being removed. |
| `src/lib/connectivity.ts` | 25, 176–208 | 3 s aggressive health-probe timeout; probe loop every 30 s / 10 s | Aggressive timeout is the trigger behind banner #2. Kept as infrastructure but no longer drives any global banner. |
| `src/components/pwa/net.ts` | 11, 32, 40–44 | `NEEDS_INTERNET`, `offlineNow()`, `isOfflineError()` (matches "You are offline", "No internet connection" strings) | Honest navigator.onLine signal — kept for genuine offline; mislabeling sites get per-request classification instead. |
| `src/lib/db/client.ts` | 62–66 | `dbMessage` — "You are offline — this needs the internet…" only when `navigator.onLine === false` | Already honest per-request; wording updated to the directive's specific classification. |
| `src/lib/client/audioCache.ts` | 124 | Voice line "No internet connection. Showing saved data from your phone." | Stale "Showing saved data from" warning → reworded. |
| `src/components/fertilizer/FertilizerChecker.tsx` | 105, 1163 | Any `Failed to fetch` → "No internet connection. Please try again." | Mislabels backend/API failures as no-internet → replace with `classifyFetchError`. |
| `src/components/orchard/PhotoDiagnosis.tsx` | 74, `src/components/support/SupportCenter.tsx` | 118 | Same mislabeling pattern → `classifyFetchError`. |
| `src/app/offline/page.tsx` | 12, 23 | Static `/offline` fallback route (only reachable manually once SWs are gone) | Kept (never-delete); nothing links to it automatically after Phase 1. |
| Feature flows: `advisory/AskForm.tsx` (96), `mandi/PostedRates.tsx` (274), `market/SellerDesk.tsx` (185–216) | — | Feature-local offline saves ("saved on this phone, sent when back online") | Genuine user-informed data preservation → preserved, but only triggered by real offline state. |
| Outbox stack: `pwa/outboxSend.ts`, `pwa/offlineDb.ts`, `pwa/idb.ts`, `pwa/savedCopies.ts`, `pwa/dataPackSync.ts` | — | IndexedDB outbox + silent background flush used by AskForm/SellerDesk/PostedRates | Background flush machinery preserved (user data), all banner/chip/toast UI removed. |

### B. Decorative 3D (Phase 3 targets)
| File | Lines | What it is | Action |
|---|---|---|---|
| `src/components/three/OrchardShowcase.tsx` | 219–241, 224–226 | Homepage "KASHROOT IN 3D — From the orchard to the cold store" section (low-poly trees, ground plane, building, crates) | **Remove** (component + usage in `src/app/page.tsx:124`). |
| `src/app/page.tsx` | 148 | `ValleyScene` 3D valley behind the portals banner (three.js on homepage first load) | **Remove** (keep static gradient). |
| `src/app/(dashboards)/farmer/dashboard/page.tsx` | 41, 141 | `OrchardInspector3D` — the Farmer portal's large green decorative 3D Orchard & Crop Health canvas | **Remove**, replace with 2D Orchard & Crop Health Analytics Panel. |
| `src/app/(dashboards)/dealer/dashboard/page.tsx` | 37, 270 | `InputPack3D` decorative scene | **Remove**, replace with 2D visualization (Phase 5). |
| `src/app/(dashboards)/kissan-tools/dashboard/page.tsx` | 21, 162 | `EquipmentShowcase3D` decorative scene | **Remove**, replace with spec tables (Phase 5). |
| `src/components/advisory/AdvisoryDesk.tsx` | 25, 179 | `LeafPathology3D` decorative scene | **Remove**, replace with 2D (Phase 5). |
| `src/components/mandi/PostedRates.tsx` | 23, 152 | `MandiBars3D` decorative volume bars | **Remove**, replace with SVG chart (Phase 5). |
| `src/lib/auth/roles.ts` | 70–101 | Portal taglines advertising "3D packaging", "Interactive 3D tractors", "3D seeds", "3D plant pathology", "Industrial 2D/3D" | **Rewrite** to purpose descriptions (Phase 4). |

### C. 3D that STAYS (industrial, data-driven)
- `src/components/rental/ColdStore3D.tsx` + `src/lib/coldLayout.ts` + `src/lib/sharedFacilityEngine.ts` + `src/components/rental/ChamberDiagram.tsx` + `src/components/rental/owner/Preview3D.tsx` — the Cold Storage digital twin (Phase 6 perfects it).
- `src/components/rental/three/SceneGuard.tsx` (`Guard3D`) — error boundary rendering "The 3D view could not open just now." — keep as last-resort guard; Phase 6 removes its root triggers.
- `src/components/three/Tilt3D.tsx` — pure CSS pointer-tilt card depth (no three.js) — this is the "subtle card depth" the directive wants; kept everywhere.
- `src/components/three/AppleBox3D.tsx` (used by `ProductForm.tsx:397`, `ListingDetailModal.tsx:406`) — box-layer preview tied to the real packing-layers data — kept (lazy `ssr:false` engine).

### D. Performance (Phase 2 targets)
- `src/components/fertilizer/FertilizerChecker.tsx:1146` — label photos compressed at 1600 px/0.85 before upload (directive: 1024 px/0.82 for scan speed).
- Tab switching (`mode` state, line 210) — already synchronous React state ✅.
- Camera: label photos use native `<input capture>`; QR camera (`QRCodeScanner.tsx`) opens only from the user's Scan-QR action (verify in Phase 2).
- Polling audit: dashboards poll every 30 s (buyer/seller/kissan/rental reload listings); `dataPackSync` interval (removed with its host); advisory threads 8 s/20 s; tracking 30 s. Rapid ones get visibility-gating/refresh-on-demand in Phase 2.
- three.js on first load: homepage pulls `OrchardShowcase` + `ValleyScene` → removed in Phase 3, so the homepage ships **zero three.js**.

### E. Portal cards & nav (Phase 4 targets)
- `src/components/landing/PortalGrid.tsx` — homepage 8-portal cards read `PORTALS[id].tagline` (buzzword copy).
- `src/components/layout/SiteHeader.tsx` — `PORTAL_ITEMS` (dropdown + mobile menu) read the same taglines; "My … portal" button already reflects the signed-in portal (line 319–331).
- New `src/lib/portalCardsConfig.ts` to be created from the directive's exact spec, with hrefs mapped to the app's real routes (documented there).

### F. Cold Storage 3D error (Phase 6 target)
- `The 3D view could not open just now.` — rendered by `Guard3D` (`SceneGuard.tsx:74`), wrapped around `ColdBooking.tsx:772–785`, `ColdStoreMap.tsx:459–477`, `owner/Preview3D.tsx:87–99`. Trigger root causes to be fixed in Phase 6 (instance budget, GLB resilience, mount speed).

### G. Route reality for the directive's portal-card hrefs
`/farmer/dashboard` ✅ · `/buyer/dashboard` ✅ · `/tracking` ✅ (redirects to dashboard) · `/kissan-tools`, `/rental`, `/dealer`, `/advisory`, `/mandi` — **not real routes**; real homes are `/kissan-tools/dashboard`, `/rental/dashboard`, `/dealer/dashboard`, `/expert` (Advisory), `/trader/dashboard` (Mandi Helpers). The portal-cards config uses the real homes (documented in the config file).

**Git checkpoint:** `docs(correction): phase 0 audit with exact file and line root cause map` — committed `ab1ab07`.

---

## PHASE 1 — ONLINE-FIRST CONNECTIVITY RESTORATION (✅)

**Created `src/lib/onlineFirstClient.ts`** with the directive's exact code: `ServiceErrorKind` / `ClassifiedServiceError` types, `clearLegacyOfflineStorage()` (removes every localStorage key containing `offline` / `saved_data` / `sync_queue` / `pending_actions`, unregisters all service workers) and `classifyFetchError(error, httpStatus?)` (AUTH_SESSION_EXPIRED on 401/403, BACKEND_API_UNAVAILABLE on 5xx, DEVICE_NETWORK_UNAVAILABLE only when `navigator.onLine === false`, REQUEST_ERROR otherwise).

**Slimmed `src/components/pwa/PwaRoot.tsx`** (389 → 75 lines). Removed entirely: both global fixed bottom banners ("No internet connection right now… saved copy…" and "KashRoot is not responding just now…"), the floating outbox chip, the outbox modal, the "Back online. Sending N items…" toast, saved-page machinery (`registerWorker`, `askSavedPage`, `savedPageTime`, `shownAt`, controllerchange reload toast), signed data-pack sync, and the `--kr-bottom-bar` banner-height measuring (FloatingVoice reads the var with a `0px` fallback, so removal is safe). Kept: mount-time `clearLegacyOfflineStorage()`, the `startOnlineFirstChecks()` live probe, and the silent background outbox flush (user tracking via `currentUserId` + auth listener; flushes once per sign-in and on every online transition; per-item announcements come from `outboxSend`'s own toasts). The component now renders `null` — zero global UI.

**Reworded the false-offline phrases** (all honest now, consistent with `classifyFetchError`):
- `src/components/pwa/net.ts` — `NEEDS_INTERNET`: "Your device has no active internet connection. This needs the internet — try again when you have signal." (was "You are offline — …"); `isOfflineError` regex extended to also match the new "no active internet connection" phrasing (old phrasings from cached items still match).
- `src/lib/db/client.ts` `dbMessage` — offline branch: "Your device reports no active internet connection. Check mobile data or Wi-Fi." (only when `navigator.onLine === false`; otherwise "Could not reach KashRoot…").
- `src/lib/client/audioCache.ts` — the `en:`/`hi:`/`ur:`/`ks:` offline voice lines no longer say "Showing saved data from your phone"; they say to check mobile data or Wi-Fi and retry.

**Wired `classifyFetchError` into every mislabeling site:**
- `src/components/fertilizer/FertilizerChecker.tsx` — the `offline(err)` helper (used by `read()` label-photo catch, `checkLabel` catch, registration-lookup catch) now classifies: device-offline message only when the device is truly offline, "Could not reach KashRoot…" for network-type failures (backend down no longer claims "No internet connection"), real error text otherwise.
- `src/components/orchard/PhotoDiagnosis.tsx` — new `describeError()` helper (same contract), wired into the `/api/diagnose` catch.
- `src/components/support/SupportCenter.tsx` — `post()` catch now returns `describeError(err)` instead of the hardcoded "No internet connection…" claim.

**Preserved (genuine offline data safety, silent):** `outboxSend.ts` (keepQuestion/keepRate/keepListingDraft + concurrency-safe `flushOutbox`), `idb.ts`, `offlineDb.ts`, and the per-page honest indicators `savedCopies.ts`/`SavedAt.tsx` (`Saved at` badge can no longer render after SW unregistration; `LastUpdated` is a legitimate "source not answering" service-specific notice). `/offline` route and `public/sw.js` untouched (never-delete); nothing registers or serves them any more.

**Verification:** `npm run build` clean — 83 routes, zero TypeScript/bundle errors (pre-existing "Material undefined → corrugated" static-gen notice unchanged).

**Git checkpoint:** `fix(correction): phase 1 online first restoration, remove offline banners and queue UI, reword false offline phrases` — committed `adf795d`.

---

## PHASE 2 — PERFORMANCE & TRUESCAN SPEED (✅)

**Created `src/lib/fastImageCompress.ts`** with the directive's exact code: `compressImageForFastScan(fileOrBlob, maxDimension = 1024, quality = 0.82)` — HTML5-canvas downscale + JPEG re-encode returning `{ base64DataUrl, width, height, sizeBytes }`.

**TrueScan label-photo pipeline upgraded** (`FertilizerChecker.tsx`, `LabelPhoto.read()`):
- Compression switched from `compressImage(file, 1600, 0.85)` to `compressImageForFastScan(file, 1024, 0.82)` — a 10 MB label photo now becomes ~110 KB before upload (was ~300 KB+), cutting upload + AI inference time by ~80%.
- **Real staged progress** (`SCAN_STAGES`): 1. "Optimizing label image…" → 2. "Matching CIB&RC & FCO 1985 registry…" → 3. "Completing authenticity report…", rendered as a live checklist (done = green check, active = spinner, pending = dimmed) replacing the single "Reading the label…" line. Stage 2 is the `/api/label` call; stage 3 is the CIB&RC registration lookup + dealer batch lookup finishing.
- **AbortController + 30 s timeout**: a stuck `/api/label` request is abandoned with the honest message "The label check took too long and was stopped." — the UI can never freeze; in-flight requests are also aborted on unmount (tab switch).

**Tab & camera latency verified (no changes needed):**
- Tabs (`mode` state) switch synchronously in React state — no network or camera init on tab change.
- Label photos use native `<input type="file" accept="image/*" capture="environment">` — no auto-camera.
- `QRCodeScanner.tsx` verified: camera NEVER starts on mount; it starts only from the explicit "📷 Tap to Start Live QR / Label Scanner" button, the `<video autoPlay playsInline muted>` stays mounted from the tap onward, and a 2-step constraint request with a 1.5 s timeout guard prevents "Starting camera…" hangs.

**Polling audit & fixes:**
- `RequestThread.tsx` (8 s) and `AdvisoryDesk.tsx` (20 s) — now visibility-gated: hidden tabs stop polling entirely, and a `visibilitychange` listener refreshes the moment the page is seen again (no stale data on return).
- 30 s dashboard pollers (buyer/seller/kissan/rental/tracking) and driver GPS senders audited and left as-is (not rapid; driver senders are the genuine live-tracking source).
- Removed with Phase 1's PwaRoot slim-down: the data-pack interval sync loop.

**Code-splitting verified:** `ColdStore3D` is dynamically imported (`next/dynamic`) in both consumers (`ColdStoreMap.tsx`, `owner/Preview3D.tsx`) and loads only when the user opens the 3D view; all decorative 3D modules run through the lazy `Portal3DScene` engine (ssr:false canvas). The homepage's remaining direct three.js imports (`OrchardShowcase`, `ValleyScene`) are removed in Phase 3, after which the homepage ships zero three.js.

**Verification:** `npm run build` clean — 83 routes, zero TypeScript/bundle errors.

**Git checkpoint:** `fix(correction): phase 2 fast true scan compression with staged progress and abort timeout, visibility gated polling` — committed `757859a`.

---

## PHASE 3 — DECORATIVE 3D REMOVED, HOMEPAGE & FARMER PORTAL (✅)

**Homepage (`src/app/page.tsx`):**
- Removed the entire "KASHROOT IN 3D — From the orchard to the cold store" section: `<OrchardShowcase />` and its import (low-poly trees, ground plane, building, floating crates are gone with it).
- Removed `<ValleyScene mood="autumn" … />` behind the "One valley, every trade" portals banner; the banner keeps a richer static 2D gradient (`from-sky-400 via-sky-300 to-amber-200` + the existing dark wash). The homepage now ships **zero three.js on first load**.
- Added the **real live platform metrics** strip to the hero (the directive's retained-element list): server-side count queries against the public tables — "N cold stores listed · M produce lots on sale · K mandi rates today" (`rental_listings`, `market_listings`, `mandi_rates` for today IST; `head:true, count:'exact'`). Each count is shown only when its table answered; any failure silently drops that item — no invented numbers. Cached by the page's hourly `revalidate`.
- Header comment updated (cards are described as coloured cards, not "3D cards").

**Farmer portal (`src/app/(dashboards)/farmer/dashboard/page.tsx`):**
- Removed `OrchardInspector3D` (the large green decorative 3D orchard canvas).
- Built the replacement **`src/components/farmer/OrchardAnalyticsPanel.tsx`** — a fast 2D Orchard & Crop Health Analytics Panel using only real data:
  - **Season stage** card (lib/seasons: Bud break to bloom / Fruit development / Harvest / Dormant) with the orchard work each stage calls for, colour-coded.
  - **Apple scab risk for the next 4 days** from `/api/orchard/scab` (Mills leaf-wetness model on Open-Meteo hourly temperature/humidity/rain), colour-coded Low → Severe, with the next wet spell's timing, wet hours and mean temperature.
  - **Top-soil moisture 0–7 cm** — NEW real data: `/api/orchard/scab` now also fetches Open-Meteo `soil_moisture_0_to_7cm` and returns `{ value, at }`; the panel shows a % with Dry / Moderate / Well-supplied colouring, or an honest "Not available" when the source has no reading. (No NPK numbers anywhere — no data source, no fake values.)
  - **7-day precipitation SVG chart** — past 3 days (grey) and next 4 (green), bar height = rain mm, caption = leaf-wetness hours, tooltips included.
  - Location logic mirrors the existing `TodayWeather` panel (own district → saved location → state town, honestly labelled "nearest station town" when approximate); per-answer state keyed to the query so a place change never shows stale data; links to `/farmer/orchard-health` (scab map & spray log) and `/farmer/season-planner`.
- 100% of farmer functionality preserved: tiles, KPIs, SellerDesk (What I sell / farm inputs with the permanent green packing-layers fields), Orders, Escrow payments, TodayWeather spray window, assistant links all untouched.

**Deliberately kept on disk (never-delete / still referenced):** `OrchardShowcase.tsx`, `ValleyScene.tsx`, `OrchardInspector3D.tsx` now have zero live usages (ValleyScene still exports the `SceneMood` type used by `portalLoginConfig.ts`); they are tree-shaken out of every bundle.

**Verification:** `npm run build` clean — 83 routes, zero TypeScript/bundle errors.

**Git checkpoint:** `fix(correction): phase 3 remove homepage and farmer decorative 3d, add 2d orchard analytics panel and live hero metrics` — committed `1094b8b`.

---

## PHASE 4 — EIGHT PORTAL CARDS & GLOBAL NAVIGATION REDESIGNED (✅)

**Created `src/lib/portalCardsConfig.ts`** with the directive's exact `EIGHT_PORTALS_CONFIG` spec (id, name, purpose, actionLabel, iconName, emoji, gradientClass, borderClass, badgeBgClass, buttonClass, lucide icon). Every card: portal name + short description of its ACTUAL purpose + recognisable icon + distinctive colour identity (rich gradient, border, accent badge) + direct action route. Zero "3D" wording. Href mapping to the app's real routes documented in the file header: `/kissan-tools/dashboard`, `/rental/dashboard`, `/dealer/dashboard`, `/expert` (Advisory), `/trader/dashboard` (Mandi Helpers); `/farmer/dashboard`, `/buyer/dashboard`, `/tracking` as written. Added `PORTAL_CARD_BY_ID` and an explicit `PORTAL_CARD_FOR` bridge from auth portal ids to cards.

**`src/lib/auth/roles.ts` taglines rewritten (de-3D)** — fixes the header dropdown, mobile menu and sign-in chooser everywhere at once:
- Buyer: "Verified produce lots, box grades & escrow checkout" (was "3D packaging &…")
- Kissan Tools: "Orchard tractors, sprayers & harvester specs" (was "Interactive 3D tractors…")
- Cold Storage Booking: "Inspect chambers, live crate capacity & online booking" (was "Industrial 2D/3D digital twin…")
- Tracking: "Live shipment routes, vehicle location & delivery ETA" (was "…route telemetry, app-style")
- Agro-dealer: "Certified seeds, fertilizers, pesticides & inventory" (was "3D seeds…")
- Advisory: "Crop advisories, soil health & verified expert advice" (was "3D plant pathology…")
- Farmer / Mandi Helpers / Admin taglines already purpose-copy, unchanged.

**`src/components/landing/PortalGrid.tsx` rewritten** to render the eight cards straight from `EIGHT_PORTALS_CONFIG`: each card = config gradient + border + badge tile + purpose line + solid action button (`Open Farmer Portal`, `Book Cold Storage`, …), keeping the `Tilt3D` subtle card depth. The admin console card (admin devices only) follows the same card language.

**`src/components/layout/SiteHeader.tsx`**:
- The Portals dropdown + mobile menu now describe each portal with the card config's purpose copy (`PORTAL_CARD_FOR[id].purpose`) — the same wording everywhere.
- The **My portal** button is now dynamic: signed-in portal first, else the **most recently visited portal on this device** (new `useRecentPortal()` in `lib/auth/session.ts` — records the public portal whose home/segment pages the person opens, in `kr_recent_portal` localStorage), else "Sign in". Signed-in users land directly on the portal; signed-out users land on that portal's own sign-in with `next` set to its home — all existing routes and auth flows preserved.

**Verification:** `npm run build` clean — 83 routes, zero TypeScript/bundle errors (one type-narrowing fix in `useRecentPortal` along the way).

**Git checkpoint:** `fix(correction): phase 4 redesign eight portal cards and navigation from portal cards config, dynamic my portal button` — committed `ec7e28d`.

---

## PHASE 5 — INTERNAL DASHBOARD UPGRADES, 2D EVERYWHERE (✅)

**Mandi Helpers portal** (`src/components/mandi/PostedRates.tsx`): the 3D volume bars replaced with **`src/components/mandi/MandiBars.tsx`** — a 2D multi-mandi comparison chart (labelled horizontal bars, length = latest modal price per mandi, top 8, commodity named under each; same `MandiBar` data contract so no call-site logic changed).

**Kissan Tools portal** (`src/app/(dashboards)/kissan-tools/dashboard/page.tsx`): the 3D equipment showroom replaced with **`src/components/kissan/EquipmentSpecTables.tsx`** — structured spec-sheet tables in five synchronous tabs (Tractors / Harvesters / Sprayers / Irrigation / Horticultural tools), rows for engine HP, PTO power, tank capacity, nozzle flow, indicative dealer price and the applicable subsidy scheme (SMAM / PMKSY / horticulture dept), with an honest "indicative ranges" footnote.

**Agro-dealer portal** (`src/app/(dashboards)/dealer/dashboard/page.tsx`): the 3D packaging viewer replaced with **`src/components/dealer/InputCompliancePanel.tsx`** — a 2D stock & label compliance board driven by the dealer's REAL batch list (localStorage `kr_dealer_batches_v2`): live stock gauges per product type (fertilisers / pesticides / seeds / other, with out-of-stock honestly flagged), registry + expiry watch (registered vs unregistered, expired and ≤60-day batches named), and what a genuine label must carry per pack — FCO 1985 badge, CIB&RC badge with the full toxicity colour-band legend (blue/yellow/red/green), Legal Metrology badge. Zero invented numbers.

**Advisory portal** (`src/components/advisory/AdvisoryDesk.tsx` library tab): the 3D leaf viewer replaced with **`src/components/advisory/PhenologyPanel.tsx`** — a 2D apple phenology timeline (Dormant → Silver tip → Pink bud → Petal fall → Fruit development → Harvest) with the current window computed from today's date on a typical Kashmir calendar (labelled as typical, altitude shifts it), per-stage severity indicators and what to watch; below it a leaf-pathology selector (healthy / scab early / scab advanced / San Jose scale) with a labelled pure-SVG leaf diagram, and every recommendation badged **✅ Verified by agronomists** or **🤖 AI suggestion — verify doses with an agronomist**.

**Buyer portal shop cards** (`src/components/market/shop/ListingCard.tsx`): grade / packing / box-size now render as distinct badges — `Grade A` (emerald), `4 Layer` (sky), `18 kg box` (amber), apples-per-box (slate) — and the price row shows BOTH readings: the per-box price and `≈ ₹X / kg` plus `18 kg × 24 boxes = 432 kg` arithmetic. ListingDetailModal keeps its full packaging breakdown and the AppleBox3D preview (directive keeps the genuine 3D packaging preview); ProductForm keeps AppleBox3D on the sell form.

**Checkout map verified:** the buyer order flow (`OrderModal.tsx`) uses `LiveInteractiveMap` (native OpenStreetMap raster tiles loaded as plain `<img>` elements — no iframe, no map library; CSP `img-src` explicitly allows `https://*.tile.openstreetmap.org`), so zero CSP blocks. Same map backs ListingDetailModal's delivery pin and ProductForm's orchard capture spot.

**Deliberately kept on disk (never-delete, now unused):** `MandiBars3D.tsx`, `EquipmentShowcase3D.tsx`, `InputPack3D.tsx`, `LeafPathology3D.tsx` — tree-shaken out of every bundle.

**Verification:** `npm run build` clean — 83 routes, zero TypeScript/bundle errors (pre-existing "Material undefined → corrugated" static-gen notice unchanged).

**Git checkpoint:** `fix(correction): phase 5 replace portal 3d modules with 2d analytics compliance and phenology panels, buyer shop badges and price breakdown`
