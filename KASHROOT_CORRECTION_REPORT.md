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

**Git checkpoint:** `docs(correction): phase 0 audit with exact file and line root cause map`
