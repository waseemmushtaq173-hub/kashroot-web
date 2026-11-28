'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import { FeatureTree } from '@/features/cad/components/FeatureTree';
import { PropertiesPanel } from '@/features/cad/components/PropertiesPanel';
import { SettingsPopover } from '@/features/cad/components/SettingsPopover';
import { StatusBar } from '@/features/cad/components/StatusBar';
import { Toolbar } from '@/features/cad/components/Toolbar';
import { ViewButtons } from '@/features/cad/components/ViewButtons';
import { CadStoreProvider, useCad, useCadStoreApi } from '@/features/cad/state/CadStoreProvider';

// three.js, React Three Fiber and Drei arrive in their own chunk, after the panels are already usable.
const Viewport = dynamic(() => import('@/features/cad/viewport/Viewport'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#F3F4F8]" role="status">
      <p className="text-sm text-ink-soft">Loading the 3D view…</p>
    </div>
  ),
});

/** Below this width the side panels start closed and open over the view. */
const COMPACT_QUERY = '(max-width: 1023px)';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

function useShortcuts() {
  const api = useCadStoreApi();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const s = api.getState();
      switch (e.key) {
        case 'Escape':
          if (s.settingsOpen) s.setSettingsOpen(false);
          else s.select(null);
          break;
        case 'f':
        case 'F':
          s.requestView({ kind: 'fit' });
          break;
        case 'i':
        case 'I':
          s.requestView({ kind: 'preset', preset: 'iso' });
          break;
        case 't':
        case 'T':
          s.requestView({ kind: 'preset', preset: 'top' });
          break;
        case 'g':
        case 'G':
          s.toggleGrid();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [api]);
}

function WorkspaceLayout() {
  useShortcuts();
  const treeOpen = useCad((s) => s.panels.tree);
  const inspectorOpen = useCad((s) => s.panels.inspector);
  const settingsOpen = useCad((s) => s.settingsOpen);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-kr-neutral-50 text-ink">
      <Toolbar />
      <div className="relative flex min-h-0 flex-1">
        {treeOpen && (
          <div className="absolute inset-y-0 left-0 z-20 w-64 border-r border-forest-line shadow-xl lg:static lg:z-auto lg:shrink-0 lg:shadow-none">
            <FeatureTree />
          </div>
        )}
        <main className="relative min-w-0 flex-1" aria-label="3D view">
          <Viewport />
          <ViewButtons />
        </main>
        {inspectorOpen && (
          <div className="absolute inset-y-0 right-0 z-20 w-72 border-l border-forest-line shadow-xl lg:static lg:z-auto lg:shrink-0 lg:shadow-none">
            <PropertiesPanel />
          </div>
        )}
        {settingsOpen && <SettingsPopover />}
      </div>
      <StatusBar />
    </div>
  );
}

/** The CAD editing screen. Client-only: it is loaded with ssr: false, so window is available here. */
export function CadWorkspace() {
  const [compact] = useState(() => window.matchMedia(COMPACT_QUERY).matches);
  return (
    <CadStoreProvider options={{ compact }}>
      <WorkspaceLayout />
    </CadStoreProvider>
  );
}
