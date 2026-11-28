# Kashroot Design Studio: architecture

Kashroot Design Studio is a browser CAD workspace for agricultural engineering, starting with apple cold stores. It lives at `/studio/cad`, beside the older `/studio` designer, which it does not change.

## Three rules

1. **The feature document is the model.** Everything on screen can be rebuilt from it: features, their parameters and the features they build on. Meshes are display caches and are never saved as the model.
2. **OpenCASCADE runs only in a Web Worker.** Heavy geometry never freezes the screen, and a worker crash loses no work: a new worker rebuilds from the document.
3. **Three.js only draws.** Volumes, areas and exports come from the exact solids, never from triangles.

## Where code runs

| Place | Holds |
| --- | --- |
| Browser main thread | Workspace UI, Zustand store, commands and undo (phase 3), feature document (phase 3), Three.js viewport |
| Geometry worker (phase 2) | Feature evaluator, Replicad, OpenCASCADE WASM, validation and measurement, tessellation |
| Supabase | Existing sign-in; `cad_projects` and `cad_versions` tables (phase 6); later a private `cad-exports` bucket |

`kashroot-api` is not in the CAD path. kashroot-web does not call it, and it has its own sign-in and database.

## Conventions

- **Units:** every length is a number of millimetres (`Millimetres` in `types/units.ts`). Metres appear only in results people read, such as room volume in m³.
- **Axes:** Z is up, as in OpenCASCADE. The XY plane is the floor. One scene unit is 1 mm.
- **Datum planes:** XY, XZ and YZ match Replicad's named planes exactly (normal and X axis). A plane's Y axis is normal × X. `tests/cad-model.spec.ts` checks this.
- **Honest tools:** `tools.ts` gives each toolbar tool the phase that makes it work. Tools from later phases render disabled with their phase number. Raise `CURRENT_PHASE` only when that phase's tools are built and tested.
- **State:** one vanilla Zustand store per open workspace (`state/store.ts`), provided by `CadStoreProvider`. Pure logic stays out of React so it can be tested without a browser.
- **Loading:** the route loads the workspace client-only on demand. three.js arrives in a separate chunk after the panels are usable. Rendering runs on demand (`frameloop="demand"`).

## Folder layout (`src/features/cad/`)

| Folder | Contents | Since |
| --- | --- | --- |
| `components/` | Workspace shell, toolbar, model tree, properties, status bar, settings, `LengthInput` | Phase 1 |
| `viewport/` | Canvas, grid, axes, datum planes, camera rig, cursor tracker, WebGL guard | Phase 1 |
| `state/` | Workspace store and provider | Phase 1 |
| `types/`, `utils/` | Units and length parsing; grid snapping; camera maths | Phase 1 |
| `documents/`, `operations/` | Feature document schema and migrations; typed commands | Phase 3 |
| `workers/`, `engine/`, `geometry/` | Geometry worker, evaluator, validation, tessellation | Phase 2 |
| `modules/coldstore/` | Cold-store chamber generator | Phase 5 |
| `exporters/` | STEP, STL, GLB and native JSON | Phase 6 |

## Phases

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Audit and plan | Done |
| 1 | Workspace, viewport, datum planes, grid and snapping | Done |
| 2 | OpenCASCADE in a worker; box and cylinder as real solids | Next |
| 3 | Feature document, model tree of features, undo and redo | Planned |
| 4 | Sketches, extrude, revolve, Booleans, measuring | Planned |
| 5 | Cold-store designer | Planned |
| 6 | Save, autosave, versions, exports | Planned |
| 7 | Hardening, performance, beta | Planned |

## Decisions approved by the owner

- Add `'wasm-unsafe-eval'` to the site-wide CSP in `next.config.ts` (phase 2). Without it, production browsers refuse to compile WebAssembly.
- Two tables, `cad_projects` and `cad_versions`, instead of one per feature. Features live inside the saved document, so there is one source of truth. A revision number prevents silent overwrites between tabs.
- CAD persists through Supabase like the rest of the site, not through kashroot-api.

## Before OpenCASCADE ships (phase 2)

- replicad-opencascadejs is LGPL-2.1 and kashroot-web is proprietary. The workspace must show a notice with the licence text and a link to the exact OCCT sources, and serve the WASM as a separate, replaceable file. Get a legal review.
- The single-threaded WASM is 22.9 MB (7.2 MB gzipped). Load it only on `/studio/cad`, show progress, and check how `public/sw.js` caches and trims files that large.
- Open-source OpenCASCADE has no DXF writer and no sketch-constraint or assembly-mate solver. Those need Kashroot's own code later.

## Tests

| File | Covers | Needs |
| --- | --- | --- |
| `tests/cad-units.spec.ts` | Length parsing and formatting | Nothing |
| `tests/cad-model.spec.ts` | Grid, datums, camera maths, tool phases, store | Nothing |
| `tests/cad-workspace.spec.ts` | The workspace in a browser, plus a check that `/studio` still opens | A running site (`KR_BASE_URL`) |
