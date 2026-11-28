'use client';

import { datumById } from '@/features/cad/datums';
import { useCad } from '@/features/cad/state/CadStoreProvider';
import { formatMm, formatNumber } from '@/features/cad/types/units';

export function StatusBar() {
  const cursor = useCad((s) => s.cursorMm);
  const gridMm = useCad((s) => s.gridMm);
  const snap = useCad((s) => s.snap);
  const selection = useCad((s) => s.selection);
  const selectedName = selection?.kind === 'datum' ? datumById(selection.id).name : 'nothing';

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 overflow-hidden whitespace-nowrap border-t border-forest-line bg-white px-3 text-xs text-ink-soft">
      <span data-testid="cad-cursor" className="font-mono tabular-nums text-ink" title="Pointer position on the floor (XY) plane">
        {cursor ? `X ${formatNumber(cursor.x)}  Y ${formatNumber(cursor.y)} mm` : 'X –  Y – mm'}
      </span>
      <span data-testid="cad-grid-status">
        Grid {formatMm(gridMm)} · Snap {snap ? 'on' : 'off'}
      </span>
      <span className="hidden md:inline">Selected: {selectedName}</span>
      <span className="ml-auto hidden sm:inline" title="OpenCASCADE geometry arrives in phase 2. Nothing here computes solids yet.">
        Geometry kernel: not loaded (phase 2)
      </span>
      <span>Units: mm</span>
    </footer>
  );
}
