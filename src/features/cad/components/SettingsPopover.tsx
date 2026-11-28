'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { LengthInput } from '@/features/cad/components/LengthInput';
import { DATUM_PLANES } from '@/features/cad/datums';
import { useCad, useCadStoreApi } from '@/features/cad/state/CadStoreProvider';
import { GRID_LIMITS } from '@/features/cad/utils/grid';

function Check({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-ink">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-forest-line text-forest focus:ring-forest/30" />
      {children}
    </label>
  );
}

const SHORTCUTS: [string, string][] = [
  ['F', 'Fit view'],
  ['I', 'Isometric view'],
  ['T', 'Top view'],
  ['G', 'Grid on or off'],
  ['Esc', 'Clear selection'],
];

/** Grid, snapping and display settings for this workspace. */
export function SettingsPopover() {
  const api = useCadStoreApi();
  const ref = useRef<HTMLDivElement>(null);
  const gridMm = useCad((s) => s.gridMm);
  const snap = useCad((s) => s.snap);
  const showGrid = useCad((s) => s.showGrid);
  const showAxes = useCad((s) => s.showAxes);
  const allPlanes = useCad((s) => DATUM_PLANES.every((p) => s.datumVisible[p.id]));

  // A press anywhere outside closes it (the Settings button toggles it itself).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node) || ref.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-tool="settings"]')) return;
      api.getState().setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [api]);

  return (
    <div ref={ref} role="dialog" aria-label="Workspace settings" className="absolute right-3 top-2 z-30 w-80 space-y-4 rounded-lg border border-forest-line bg-white p-4 shadow-xl">
      <h2 className="text-sm font-semibold text-ink">Workspace settings</h2>

      <div className="space-y-2">
        <LengthInput
          id="cad-grid-spacing"
          label="Grid spacing"
          valueMm={gridMm}
          rules={GRID_LIMITS}
          hint="Every tenth line is drawn heavier. You can type 100, 0.5 m or 25 cm."
          onCommit={(mm) => api.getState().setGridMm(mm)}
        />
        <Check id="cad-snap" checked={snap} onChange={(v) => api.getState().setSnap(v)}>
          Snap the pointer to the grid
        </Check>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-ink">Show in the view</legend>
        <Check id="cad-show-grid" checked={showGrid} onChange={() => api.getState().toggleGrid()}>
          Grid
        </Check>
        <Check id="cad-show-axes" checked={showAxes} onChange={() => api.getState().toggleAxes()}>
          Axes at the origin
        </Check>
        <Check id="cad-show-planes" checked={allPlanes} onChange={(v) => api.getState().setAllDatumsVisible(v)}>
          Origin planes
        </Check>
      </fieldset>

      <div className="space-y-1 border-t border-forest-line pt-3 text-xs text-ink-soft">
        <p>
          <span className="font-medium text-ink">Units:</span> millimetres. Every length is stored in mm; Z points up.
        </p>
      </div>

      <div className="border-t border-forest-line pt-3">
        <p className="mb-1.5 text-xs font-medium text-ink">Keyboard shortcuts</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {SHORTCUTS.map(([key, what]) => (
            <div key={key} className="contents">
              <dt>
                <kbd className="rounded border border-forest-line bg-kr-neutral-50 px-1.5 font-mono text-[11px] text-ink">{key}</kbd>
              </dt>
              <dd className="text-ink-soft">{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
