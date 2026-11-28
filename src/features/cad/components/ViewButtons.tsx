'use client';

import { useCadStoreApi } from '@/features/cad/state/CadStoreProvider';
import { VIEW_LABELS, type ViewPreset } from '@/features/cad/utils/camera';

const PRESETS: { preset: ViewPreset; short: string; key?: string }[] = [
  { preset: 'iso', short: 'Iso', key: 'I' },
  { preset: 'top', short: 'Top', key: 'T' },
  { preset: 'front', short: 'Front' },
  { preset: 'right', short: 'Right' },
];

/** Standard views, over the top-left corner of the 3D view. */
export function ViewButtons() {
  const api = useCadStoreApi();
  return (
    <div role="group" aria-label="Standard views" className="absolute left-3 top-3 z-10 flex overflow-hidden rounded-md border border-forest-line bg-white/95 shadow-sm">
      {PRESETS.map(({ preset, short, key }) => (
        <button
          key={preset}
          type="button"
          data-view={preset}
          title={`${VIEW_LABELS[preset]} view${key ? ` (${key})` : ''}`}
          onClick={() => api.getState().requestView({ kind: 'preset', preset })}
          className="border-l border-forest-line px-2.5 py-1 text-xs font-medium text-ink first:border-l-0 hover:bg-forest-soft"
        >
          {short}
        </button>
      ))}
    </div>
  );
}
