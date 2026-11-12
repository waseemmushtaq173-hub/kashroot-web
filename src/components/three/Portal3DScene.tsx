'use client';

/**
 * Portal3DScene — the reusable interactive 3D engine for every portal.
 *
 * Wraps a lazy React Three Fiber canvas (`ssr: false`, so three.js is fetched
 * only when a scene is actually shown) with:
 *
 *  - an automatic 2D fallback for low-power devices: prefers-reduced-motion,
 *    data saver, ≤4 CPU cores, ≤2 GB RAM or no WebGL opens the caller's 2D
 *    panel instead — one tap on "Try 3D" overrides it;
 *  - a hard error boundary: a scene that throws (GLB loader, WebGL crash)
 *    silently falls back to the 2D panel, which never shows a scary error;
 *  - a manual 3D/2D toggle the user always controls (remembered per site in
 *    localStorage `kr_portal_3d_off`).
 *
 * The 2D fallback is a required prop: every scene ships with a real,
 * informative 2D twin, never an empty hole.
 */
import { Component, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Box, Image as ImageIcon } from 'lucide-react';

const Portal3DCanvas = dynamic(() => import('./Portal3DCanvas'), {
  ssr: false,
  loading: () => <SceneSkeleton />,
});

const OFF_KEY = 'kr_portal_3d_off';

interface Portal3DSceneProps {
  /** Shown in the corner chip, e.g. "Orchard & cold-chain". */
  label: string;
  /** Scene contents (R3F elements). Rendered inside the lazy Canvas. */
  children: ReactNode;
  /** The instant 2D panel: same information, zero WebGL. */
  fallback: ReactNode;
  className?: string;
  /** Tailwind height classes for the canvas box. */
  height?: string;
  cameraPosition?: [number, number, number];
  fov?: number;
  background?: string;
  fog?: [string, number, number];
}

function SceneSkeleton() {
  return (
    <div className="grid h-full w-full place-items-center bg-emerald-950/60" aria-hidden>
      <div className="flex flex-col items-center gap-3 text-emerald-100/80">
        <Box className="h-8 w-8 animate-pulse" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-[0.18em]">Opening the 3D scene…</p>
      </div>
    </div>
  );
}

/** Silent boundary: a broken scene falls back to 2D, never an error page. */
class SceneBoundary extends Component<{ children?: ReactNode; fallback: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Should this device start in 2D? (The user can always override with one tap.) */
function autoStarts2D(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    if (nav.connection?.saveData) return true;
    if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return true;
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 2) return true;
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) return true;
  } catch {
    return true;
  }
  return false;
}

export function Portal3DScene({
  label,
  children,
  fallback,
  className = '',
  height = 'h-[360px] sm:h-[440px]',
  cameraPosition,
  fov,
  background,
  fog,
}: Portal3DSceneProps) {
  const [started2D, setStarted2D] = useState(true); // SSR and first paint agree: no hydration flash
  const [lowPower, setLowPower] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  useEffect(() => {
    let rememberedOff = false;
    try {
      rememberedOff = localStorage.getItem(OFF_KEY) === '1';
    } catch {
      /* storage blocked */
    }
    const low = autoStarts2D();
    setLowPower(low);
    setStarted2D(low || rememberedOff);
  }, []);

  const toggle = () => {
    const next2D = !started2D;
    setStarted2D(next2D);
    setCanvasKey((k) => k + 1); // fresh boundary + canvas on every switch
    try {
      localStorage.setItem(OFF_KEY, next2D ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-3xl ring-1 ring-white/15 ${className}`}>
      <div className={started2D ? 'hidden' : 'block'}>
        <div className={height}>
          <SceneBoundary
            key={canvasKey}
            fallback={fallback}
            onFail={() => {
              setStarted2D(true);
              try {
                localStorage.setItem(OFF_KEY, '1');
              } catch {
                /* storage blocked */
              }
            }}
          >
            <Portal3DCanvas cameraPosition={cameraPosition} fov={fov} background={background} fog={fog}>
              {children}
            </Portal3DCanvas>
          </SceneBoundary>
        </div>
      </div>

      {started2D && <div className={height}>{fallback}</div>}

      {/* Corner chip: the scene's name + the 3D/2D toggle the user always owns. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
        <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-950/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100 ring-1 ring-emerald-400/30 backdrop-blur">
          <Box className="h-3.5 w-3.5" aria-hidden /> {label}
        </span>
        <button
          type="button"
          onClick={toggle}
          className="pointer-events-auto inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/90 px-3 text-xs font-bold text-slate-800 shadow-sm ring-1 ring-slate-900/10 backdrop-blur transition hover:bg-white"
        >
          {started2D ? <Box className="h-3.5 w-3.5" aria-hidden /> : <ImageIcon className="h-3.5 w-3.5" aria-hidden />}
          {started2D ? (lowPower ? 'Try 3D anyway' : 'View in 3D') : '2D view'}
        </button>
      </div>
    </div>
  );
}
