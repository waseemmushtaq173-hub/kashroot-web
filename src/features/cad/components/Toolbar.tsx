'use client';

import {
  ArrowLeft,
  ArrowUpFromLine,
  Axis3d,
  Box,
  Cylinder,
  Download,
  FilePlus,
  FolderOpen,
  Grid3x3,
  Maximize,
  MousePointer2,
  PanelLeft,
  PanelRight,
  PenLine,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  Settings,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

import { useCad, useCadStoreApi } from '@/features/cad/state/CadStoreProvider';
import type { PanelName } from '@/features/cad/state/store';
import { TOOLS, TOOL_GROUP_LABELS, isToolAvailable, type ToolDef, type ToolGroup, type ToolId } from '@/features/cad/tools';
import { cx } from '@/features/cad/utils/cx';

const ICONS: Record<ToolId, LucideIcon> = {
  new: FilePlus,
  open: FolderOpen,
  save: Save,
  export: Download,
  undo: Undo2,
  redo: Redo2,
  select: MousePointer2,
  sketch: PenLine,
  extrude: ArrowUpFromLine,
  revolve: RotateCw,
  box: Box,
  cylinder: Cylinder,
  union: SquaresUnite,
  cut: SquaresSubtract,
  intersect: SquaresIntersect,
  measure: Ruler,
  fit: Maximize,
  grid: Grid3x3,
  axes: Axis3d,
  settings: Settings,
};

const GROUP_ORDER: ToolGroup[] = ['file', 'edit', 'create', 'combine', 'inspect', 'view'];

function ToolButton({ tool, pressed, onRun }: { tool: ToolDef; pressed: boolean | undefined; onRun: () => void }) {
  const Icon = ICONS[tool.id];
  const available = isToolAvailable(tool);
  const title = available
    ? `${tool.label}: ${tool.hint}${tool.shortcut ? ` (${tool.shortcut})` : ''}`
    : `${tool.label}: ${tool.hint} Arrives in phase ${tool.phase}.`;
  return (
    <button
      type="button"
      data-tool={tool.id}
      disabled={!available}
      aria-pressed={pressed}
      aria-label={available ? tool.label : `${tool.label}, arrives in phase ${tool.phase}`}
      title={title}
      onClick={onRun}
      className={cx(
        // Labels need about 1440 px for all twenty tools; narrower screens get icons with tooltips, so nothing scrolls off at 1280.
        'relative my-1 flex min-w-[2.5rem] flex-col items-center justify-center gap-1 rounded-md px-1.5 transition-colors min-[1440px]:min-w-[3.25rem]',
        available ? 'text-ink hover:bg-forest-soft' : 'cursor-not-allowed text-ink-soft/40',
        pressed && 'bg-forest-soft text-forest ring-1 ring-inset ring-forest/25',
      )}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      <span className="hidden text-[11px] leading-none min-[1440px]:block">{tool.label}</span>
      {!available && (
        <span className="absolute right-0.5 top-0.5 rounded bg-kr-neutral-100 px-1 font-mono text-[9px] leading-[14px] text-ink-soft" aria-hidden>
          P{tool.phase}
        </span>
      )}
    </button>
  );
}

function PanelToggle({ panel, label, icon: Icon }: { panel: PanelName; label: string; icon: LucideIcon }) {
  const api = useCadStoreApi();
  const open = useCad((s) => s.panels[panel]);
  return (
    <button
      type="button"
      aria-pressed={open}
      aria-label={label}
      title={open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      onClick={() => api.getState().setPanel(panel, !open)}
      className={cx('rounded-md p-2 transition-colors hover:bg-forest-soft', open ? 'text-forest' : 'text-ink-soft')}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

export function Toolbar() {
  const api = useCadStoreApi();
  const activeTool = useCad((s) => s.activeTool);
  const showGrid = useCad((s) => s.showGrid);
  const showAxes = useCad((s) => s.showAxes);
  const settingsOpen = useCad((s) => s.settingsOpen);

  const pressedOf = (id: ToolId): boolean | undefined => {
    if (id === 'select') return activeTool === 'select';
    if (id === 'grid') return showGrid;
    if (id === 'axes') return showAxes;
    if (id === 'settings') return settingsOpen;
    return undefined;
  };

  // Only phase 1 tools reach here: the rest are disabled buttons.
  const run = (id: ToolId) => {
    const s = api.getState();
    if (id === 'fit') s.requestView({ kind: 'fit' });
    else if (id === 'grid') s.toggleGrid();
    else if (id === 'axes') s.toggleAxes();
    else if (id === 'settings') s.setSettingsOpen(!s.settingsOpen);
  };

  return (
    <header className="flex h-14 shrink-0 items-stretch border-b border-forest-line bg-white">
      <div className="flex shrink-0 items-center gap-2 border-r border-forest-line pl-2 pr-3">
        <Link href="/" aria-label="Back to Kashroot" title="Back to Kashroot" className="rounded-md p-1.5 text-ink-soft hover:bg-forest-soft hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        {/* Hidden on tablets so every tool fits; the browser tab still names the page. */}
        <div className="hidden leading-tight min-[1180px]:block">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            Design Studio
            <span className="rounded bg-forest-soft px-1 py-px text-[9px] tracking-normal text-forest">Beta</span>
          </p>
          <h1 className="text-sm font-semibold text-ink">Untitled project</h1>
        </div>
      </div>

      <div role="toolbar" aria-label="Modelling tools" className="flex min-w-0 flex-1 items-stretch overflow-x-auto px-0.5">
        {GROUP_ORDER.map((group, i) => (
          <div key={group} role="group" aria-label={TOOL_GROUP_LABELS[group]} className={cx('flex shrink-0 items-stretch gap-0.5 px-1', i > 0 && 'border-l border-forest-line/70')}>
            {TOOLS.filter((t) => t.group === group).map((tool) => (
              <ToolButton key={tool.id} tool={tool} pressed={pressedOf(tool.id)} onRun={() => run(tool.id)} />
            ))}
          </div>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 border-l border-forest-line px-2">
        <PanelToggle panel="tree" label="Model tree" icon={PanelLeft} />
        <PanelToggle panel="inspector" label="Properties" icon={PanelRight} />
      </div>
    </header>
  );
}
