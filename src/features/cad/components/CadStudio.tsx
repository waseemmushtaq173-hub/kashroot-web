'use client';

import dynamic from 'next/dynamic';

/**
 * Entry point for /studio/cad. The workspace is client-only and loaded on
 * demand, so the rest of Kashroot never downloads any CAD code.
 */
const CadWorkspace = dynamic(() => import('@/features/cad/components/CadWorkspace').then((m) => m.CadWorkspace), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] items-center justify-center bg-kr-neutral-50" role="status">
      <p className="text-sm text-ink-soft">Opening Design Studio…</p>
    </div>
  ),
});

export function CadStudio() {
  return <CadWorkspace />;
}
