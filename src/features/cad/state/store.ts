/**
 * Workspace state: what is selected, what the view shows, and requests to
 * move the camera.
 *
 * Phase 1 holds view state only. The feature document and its command
 * history join this store in phase 3; meshes never live here.
 *
 * A vanilla Zustand store (no React import), created once per workspace by
 * CadStoreProvider, so tests can drive it directly.
 */
import { createStore } from 'zustand/vanilla';

import { DATUM_PLANES, type DatumId } from '@/features/cad/datums';
import type { ToolId } from '@/features/cad/tools';
import type { ViewPreset } from '@/features/cad/utils/camera';
import { DEFAULT_GRID_MM, isValidGridSpacing, type Point2 } from '@/features/cad/utils/grid';

export type Selection = { kind: 'datum'; id: DatumId } | null;

export type ViewCommand = { kind: 'fit' } | { kind: 'preset'; preset: ViewPreset };

export type PanelName = 'tree' | 'inspector';

export interface CadState {
  activeTool: ToolId;
  selection: Selection;
  hover: Selection;
  showGrid: boolean;
  showAxes: boolean;
  gridMm: number;
  snap: boolean;
  datumVisible: Record<DatumId, boolean>;
  originExpanded: boolean;
  /** Where the pointer meets the floor plane (z = 0), snapped when snapping is on; null when off the canvas. */
  cursorMm: Point2 | null;
  /** The latest camera request. `seq` changes on every request, so asking for the same view twice still runs. */
  viewCommand: (ViewCommand & { seq: number }) | null;
  panels: Record<PanelName, boolean>;
  settingsOpen: boolean;

  select: (selection: Selection) => void;
  setHover: (selection: Selection) => void;
  toggleGrid: () => void;
  toggleAxes: () => void;
  setGridMm: (mm: number) => boolean;
  setSnap: (on: boolean) => void;
  setDatumVisible: (id: DatumId, visible: boolean) => void;
  setAllDatumsVisible: (visible: boolean) => void;
  setOriginExpanded: (expanded: boolean) => void;
  setCursor: (point: Point2 | null) => void;
  requestView: (command: ViewCommand) => void;
  setPanel: (panel: PanelName, open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

const allDatums = (visible: boolean) =>
  Object.fromEntries(DATUM_PLANES.map((d) => [d.id, visible])) as Record<DatumId, boolean>;

export interface CadStoreOptions {
  /** Start with the side panels closed (small screens). */
  compact?: boolean;
}

export function createCadStore(options: CadStoreOptions = {}) {
  let seq = 0;
  return createStore<CadState>()((set, get) => ({
    activeTool: 'select',
    selection: null,
    hover: null,
    showGrid: true,
    showAxes: true,
    gridMm: DEFAULT_GRID_MM,
    snap: true,
    datumVisible: allDatums(true),
    originExpanded: true,
    cursorMm: null,
    viewCommand: null,
    panels: { tree: !options.compact, inspector: !options.compact },
    settingsOpen: false,

    select: (selection) => {
      // A hidden plane cannot be picked in the view, so it cannot stay selected either.
      if (selection?.kind === 'datum' && !get().datumVisible[selection.id]) return;
      if (!sameSelection(get().selection, selection)) set({ selection });
    },
    setHover: (hover) => {
      if (!sameSelection(get().hover, hover)) set({ hover });
    },
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleAxes: () => set((s) => ({ showAxes: !s.showAxes })),
    setGridMm: (mm) => {
      if (!isValidGridSpacing(mm)) return false;
      set({ gridMm: mm });
      return true;
    },
    setSnap: (snap) => set({ snap }),
    setDatumVisible: (id, visible) =>
      set((s) => ({
        datumVisible: { ...s.datumVisible, [id]: visible },
        selection: !visible && s.selection?.id === id ? null : s.selection,
        hover: !visible && s.hover?.id === id ? null : s.hover,
      })),
    setAllDatumsVisible: (visible) =>
      set((s) => ({
        datumVisible: allDatums(visible),
        selection: visible ? s.selection : null,
        hover: visible ? s.hover : null,
      })),
    setOriginExpanded: (originExpanded) => set({ originExpanded }),
    setCursor: (cursorMm) => {
      const prev = get().cursorMm;
      if (prev === cursorMm) return;
      if (prev && cursorMm && prev.x === cursorMm.x && prev.y === cursorMm.y) return;
      set({ cursorMm });
    },
    requestView: (command) => {
      seq += 1;
      set({ viewCommand: { ...command, seq } });
    },
    setPanel: (panel, open) => set((s) => ({ panels: { ...s.panels, [panel]: open } })),
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  }));
}

export type CadStore = ReturnType<typeof createCadStore>;
