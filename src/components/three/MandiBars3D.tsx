'use client';

/**
 * MandiBars3D — the Mandi Helpers portal's interactive 3D volume bars:
 * one column per mandi, height = that mandi's modal price, with labelled
 * callouts (mandi + ₹modal). Turn/zoom with OrbitControls; the 2D fallback
 * is the same chart as a labelled horizontal bar diagram. Runs on the shared
 * Portal3DScene engine (lazy, low-power safe, error boundary).
 */
import { Html, OrbitControls } from '@react-three/drei';

import { Portal3DScene } from './Portal3DScene';

export interface MandiBar {
  mandi: string;
  /** Modal price in ₹ (already normalised per kg by the caller when possible). */
  modal: number;
  /** Short label under the callout, e.g. "Delicious · per kg". */
  detail?: string;
}

const BAR_COLOURS = ['#2f9e44', '#e8590c', '#1d4ed8', '#9c36b5', '#0c8599', '#c92a2a', '#5f3dc4', '#e8a317'];

function SceneContents({ bars }: { bars: MandiBar[] }) {
  const shown = bars.slice(0, 8);
  const max = Math.max(...shown.map((b) => b.modal), 1);
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[6, 10, 5]} intensity={1.6} color="#fff2dd" />
      <pointLight position={[-6, 4, 6]} intensity={10} color="#ffe2b8" distance={18} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[12, 36]} />
        <meshStandardMaterial color="#8a6b45" roughness={1} />
      </mesh>
      {shown.map((b, i) => {
        const h = Math.max(0.25, (b.modal / max) * 4.2);
        const x = (i - (shown.length - 1) / 2) * 1.6;
        return (
          <group key={b.mandi + i} position={[x, 0, 0]}>
            <mesh position={[0, h / 2, 0]} castShadow>
              <boxGeometry args={[0.9, h, 0.9]} />
              <meshStandardMaterial color={BAR_COLOURS[i % BAR_COLOURS.length]} roughness={0.55} metalness={0.1} />
            </mesh>
            <Html position={[0, h + 0.45, 0]} center distanceFactor={10}>
              <span className="whitespace-nowrap rounded-lg bg-white/95 px-2 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">
                {b.mandi} · ₹{Math.round(b.modal).toLocaleString('en-IN')}
              </span>
            </Html>
          </group>
        );
      })}
      <OrbitControls autoRotate autoRotateSpeed={0.45} enablePan={false} minDistance={6} maxDistance={18} maxPolarAngle={1.4} target={[0, 1.6, 0]} />
    </>
  );
}

function Bars2DFallback({ bars }: { bars: MandiBar[] }) {
  const shown = bars.slice(0, 8);
  const max = Math.max(...shown.map((b) => b.modal), 1);
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5 bg-gradient-to-b from-purple-50 to-white p-4">
      {shown.map((b, i) => (
        <div key={b.mandi + i} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-right font-semibold text-slate-700">{b.mandi}</span>
          <span className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full" style={{ width: `${(b.modal / max) * 100}%`, backgroundColor: BAR_COLOURS[i % BAR_COLOURS.length] }} />
          </span>
          <span className="w-20 shrink-0 text-right font-bold tabular-nums text-slate-900">₹{Math.round(b.modal).toLocaleString('en-IN')}</span>
        </div>
      ))}
    </div>
  );
}

export function MandiBars3D({ bars, className = '' }: { bars: MandiBar[]; className?: string }) {
  if (bars.length === 0) return null;
  return (
    <Portal3DScene
      label="Mandi price bars"
      height="h-[260px] sm:h-[320px]"
      className={className}
      background="#f4f0fa"
      cameraPosition={[6, 4.5, 9]}
      fallback={<Bars2DFallback bars={bars} />}
    >
      <SceneContents bars={bars} />
    </Portal3DScene>
  );
}
