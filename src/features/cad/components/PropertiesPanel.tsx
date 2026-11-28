'use client';

import type { ReactNode } from 'react';

import { PanelHeader } from '@/features/cad/components/PanelHeader';
import { axisName, datumById, planeYAxis, type DatumId } from '@/features/cad/datums';
import { useCad, useCadStoreApi } from '@/features/cad/state/CadStoreProvider';
import { formatMm } from '@/features/cad/types/units';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="text-right font-mono text-xs tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function DatumProperties({ id }: { id: DatumId }) {
  const api = useCadStoreApi();
  const plane = datumById(id);
  const shown = useCad((s) => s.datumVisible[id]);
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-ink">{plane.name}</h3>
        <p className="text-xs text-ink-soft">Datum plane · construction geometry · {plane.role.toLowerCase()}</p>
      </div>
      <dl className="divide-y divide-forest-line/60 border-y border-forest-line/60">
        <Row label="Origin">0, 0, 0 mm</Row>
        <Row label="Normal">{axisName(plane.normal)}</Row>
        <Row label="Plane X axis">{axisName(plane.xAxis)}</Row>
        <Row label="Plane Y axis">{axisName(planeYAxis(plane))}</Row>
      </dl>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={shown}
          onChange={(e) => api.getState().setDatumVisible(id, e.target.checked)}
          className="rounded border-forest-line text-forest focus:ring-forest/30"
        />
        Show in the view
      </label>
      <p className="text-xs text-ink-soft">Datum planes are fixed. Sketches are placed on them from phase 4.</p>
    </div>
  );
}

function WorkspaceProperties() {
  const gridMm = useCad((s) => s.gridMm);
  const snap = useCad((s) => s.snap);
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-ink">Untitled project</h3>
        <p className="text-xs text-ink-soft">Nothing selected. Pick a plane in the model tree or in the view.</p>
      </div>
      <dl className="divide-y divide-forest-line/60 border-y border-forest-line/60">
        <Row label="Units">millimetres</Row>
        <Row label="Up axis">+Z</Row>
        <Row label="Features">0</Row>
        <Row label="Grid">{formatMm(gridMm)}</Row>
        <Row label="Snapping">{snap ? 'on' : 'off'}</Row>
      </dl>
      <p className="text-xs text-ink-soft">Change the grid and snapping in Settings.</p>
    </div>
  );
}

export function PropertiesPanel() {
  const api = useCadStoreApi();
  const selection = useCad((s) => s.selection);
  return (
    <aside aria-label="Properties" className="flex h-full flex-col bg-white">
      <PanelHeader title="Properties" closeLabel="Hide properties" onClose={() => api.getState().setPanel('inspector', false)} />
      <div className="flex-1 overflow-y-auto p-3">{selection?.kind === 'datum' ? <DatumProperties id={selection.id} /> : <WorkspaceProperties />}</div>
    </aside>
  );
}
