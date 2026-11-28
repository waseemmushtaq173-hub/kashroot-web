'use client';

import { ChevronDown, ChevronRight, Eye, EyeOff, Square } from 'lucide-react';

import { PanelHeader } from '@/features/cad/components/PanelHeader';
import { DATUM_PLANES } from '@/features/cad/datums';
import { useCad, useCadStoreApi } from '@/features/cad/state/CadStoreProvider';
import { cx } from '@/features/cad/utils/cx';

function VisibilityButton({ visible, name, onToggle }: { visible: boolean; name: string; onToggle: () => void }) {
  const label = visible ? `Hide ${name}` : `Show ${name}`;
  return (
    <button type="button" onClick={onToggle} aria-label={label} title={label} className="rounded p-1 text-ink-soft hover:bg-forest-soft hover:text-ink">
      {visible ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

/** The model tree: the origin's datum planes now, and every feature from phase 2 on. */
export function FeatureTree() {
  const api = useCadStoreApi();
  const visible = useCad((s) => s.datumVisible);
  const selection = useCad((s) => s.selection);
  const hover = useCad((s) => s.hover);
  const expanded = useCad((s) => s.originExpanded);
  const allVisible = DATUM_PLANES.every((p) => visible[p.id]);

  return (
    <nav aria-label="Model tree" className="flex h-full flex-col bg-white">
      <PanelHeader title="Model" closeLabel="Hide model tree" onClose={() => api.getState().setPanel('tree', false)} />
      <div className="flex-1 space-y-4 overflow-y-auto p-2 text-sm">
        <section aria-label="Origin">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => api.getState().setOriginExpanded(!expanded)}
              className="flex flex-1 items-center gap-1 rounded px-1 py-1 text-left font-medium text-ink hover:bg-forest-soft"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5 text-ink-soft" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 text-ink-soft" aria-hidden />}
              Origin
            </button>
            <VisibilityButton visible={allVisible} name="all origin planes" onToggle={() => api.getState().setAllDatumsVisible(!allVisible)} />
          </div>
          {expanded && (
            <ul className="mt-0.5 space-y-px pl-4">
              {DATUM_PLANES.map((plane) => {
                const shown = visible[plane.id];
                const selected = selection?.kind === 'datum' && selection.id === plane.id;
                const hovered = hover?.kind === 'datum' && hover.id === plane.id;
                return (
                  <li key={plane.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      data-datum={plane.id}
                      aria-current={selected ? 'true' : undefined}
                      disabled={!shown}
                      title={shown ? `Select the ${plane.name}` : `${plane.name} is hidden. Show it to select it.`}
                      onClick={() => api.getState().select({ kind: 'datum', id: plane.id })}
                      onMouseEnter={() => shown && api.getState().setHover({ kind: 'datum', id: plane.id })}
                      onMouseLeave={() => {
                        const { hover: h, setHover } = api.getState();
                        if (h?.kind === 'datum' && h.id === plane.id) setHover(null);
                      }}
                      className={cx(
                        'flex flex-1 items-center gap-2 rounded px-1.5 py-1 text-left',
                        selected ? 'bg-forest text-white' : hovered ? 'bg-forest-soft text-ink' : 'text-ink hover:bg-forest-soft',
                        !shown && 'cursor-default text-ink-soft/60 hover:bg-transparent',
                      )}
                    >
                      <Square className={cx('h-3.5 w-3.5', selected ? 'text-white' : 'text-ink-soft')} aria-hidden />
                      <span className="flex-1">{plane.name}</span>
                      <span className={cx('text-xs', selected ? 'text-white/80' : 'text-ink-soft')}>{plane.role}</span>
                    </button>
                    <VisibilityButton visible={shown} name={plane.name} onToggle={() => api.getState().setDatumVisible(plane.id, !shown)} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="cad-features-heading">
          <h3 id="cad-features-heading" className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            Features
          </h3>
          <div className="rounded-md border border-dashed border-forest-line px-3 py-3 text-xs text-ink-soft">
            <p className="font-medium text-ink">No features yet.</p>
            <p className="mt-1">Box and cylinder arrive in phase 2. Sketch, extrude and revolve arrive in phase 4.</p>
          </div>
        </section>
      </div>
    </nav>
  );
}
