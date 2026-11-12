'use client';

/**
 * OrchardShowcase — the homepage's interactive 3D Orchard & Cold-Chain
 * showcase: a low-poly Kashmiri orchard (apple trees with fruit), the
 * 2–5 layer apple-box packing stacks, and a cold-store chamber with racks
 * and crates, all rotatable/zoomable, with labelled callouts.
 *
 * Runs through the shared Portal3DScene engine (lazy ssr:false canvas,
 * error boundary, low-power 2D fallback, manual 3D/2D toggle). The 2D
 * fallback is a real labelled diagram, not a placeholder.
 */
import { Html, OrbitControls } from '@react-three/drei';

import { Portal3DScene } from './Portal3DScene';

const TRUNK = '#7c4a21';
const CANOPY = ['#2f7d4f', '#3f9a5f', '#276b44'];
const APPLE = '#c92a2a';
const CRIMSON = '#e03131';
const SAFFRON = '#f5b942';

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const canopy = CANOPY[(Math.abs(position[0] * 7 + position[2] * 13) | 0) % CANOPY.length];
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.2, 1.8, 8]} />
        <meshStandardMaterial color={TRUNK} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.1, 0]} castShadow>
        <sphereGeometry args={[0.95, 18, 14]} />
        <meshStandardMaterial color={canopy} roughness={0.8} />
      </mesh>
      <mesh position={[0.55, 1.7, 0.25]} castShadow>
        <sphereGeometry args={[0.6, 16, 12]} />
        <meshStandardMaterial color={canopy} roughness={0.8} />
      </mesh>
      <mesh position={[-0.5, 1.8, -0.2]} castShadow>
        <sphereGeometry args={[0.55, 16, 12]} />
        <meshStandardMaterial color={CANOPY[2]} roughness={0.8} />
      </mesh>
      {/* A few ripe apples catch the eye without multiplying meshes. */}
      <mesh position={[0.45, 1.55, 0.7]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color={APPLE} roughness={0.35} />
      </mesh>
      <mesh position={[-0.35, 2.5, 0.5]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color={CRIMSON} roughness={0.35} />
      </mesh>
      <mesh position={[0.75, 2.2, -0.3]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color={APPLE} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** One slatted apple box; `layers` stacks them with visible air gaps. */
function AppleBox({ position, layers, highlight = false }: { position: [number, number, number]; layers: number; highlight?: boolean }) {
  return (
    <group position={position}>
      {Array.from({ length: layers }, (_, i) => (
        <mesh key={i} position={[0, 0.16 + i * 0.24, 0]} castShadow>
          <boxGeometry args={[1.15, 0.2, 1.15]} />
          <meshStandardMaterial color={highlight && i === layers - 1 ? SAFFRON : '#b98a4e'} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function ColdStore() {
  return (
    <group position={[5.5, 0, -2.5]}>
      {/* PUF-insulated shell */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[3.2, 2.8, 2.6]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.4} metalness={0.1} />
      </mesh>
      {/* Gabled roof */}
      <mesh position={[0, 3.05, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[2.4, 0.7, 4]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Insulated sliding door (arctic cyan) */}
      <mesh position={[-1.62, 1.0, 0.35]} castShadow>
        <boxGeometry args={[0.08, 1.9, 1.15]} />
        <meshStandardMaterial color="#22b8cf" roughness={0.35} metalness={0.2} />
      </mesh>
      {/* Inside racks (visible through the open side) */}
      <mesh position={[0.9, 0.9, -0.4]}>
        <boxGeometry args={[1.2, 0.07, 1.8]} />
        <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0.9, 1.8, -0.4]}>
        <boxGeometry args={[1.2, 0.07, 1.8]} />
        <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Blue HDPE crates on the racks */}
      {[-0.6, 0, 0.6].map((z, i) => (
        <mesh key={i} position={[0.9, 1.02 + (i === 1 ? 0.9 : 0), z]}>
          <boxGeometry args={[0.5, 0.32, 0.5]} />
          <meshStandardMaterial color="#3b82f6" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0.9, 1.92, -0.3]}>
        <boxGeometry args={[0.5, 0.32, 0.5]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.5} />
      </mesh>
    </group>
  );
}

function Callout({ position, children }: { position: [number, number, number]; children: string }) {
  return (
    <Html position={position} center distanceFactor={9} zIndexRange={[5, 0]}>
      <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">{children}</span>
    </Html>
  );
}

function SceneContents() {
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 10, 4]} intensity={1.6} color="#fff3df" />
      <pointLight position={[-4, 3, 6]} intensity={12} color="#ffd9a0" distance={14} />

      {/* Orchard floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[16, 40]} />
        <meshStandardMaterial color="#1d4d33" roughness={1} />
      </mesh>
      {/* Grass strip paths */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[8.5, 10.5, 40]} />
        <meshStandardMaterial color="#245a3c" roughness={1} />
      </mesh>

      {/* Two orchard rows */}
      {[-3.5, 3.5].map((z) =>
        [-6, -2, 2, 6].map((x) => <Tree key={`${x}:${z}`} position={[x, 0, z]} scale={0.9 + (Math.abs(x) % 3) * 0.08} />),
      )}

      {/* Packing stacks: 2, 3, 4 and 5 layers */}
      <AppleBox position={[-1.2, 0, 1.4]} layers={2} />
      <AppleBox position={[0.3, 0, 1.4]} layers={3} />
      <AppleBox position={[1.8, 0, 1.4]} layers={4} />
      <AppleBox position={[3.3, 0, 1.4]} layers={5} highlight />

      <ColdStore />

      <Callout position={[-3.5, 3.4, -3.5]}>🍎 Apple orchard — Grade A lots</Callout>
      <Callout position={[1.0, 1.7, 1.4]}>📦 2–5 layer packing</Callout>
      <Callout position={[5.5, 3.9, -2.5]}>❄️ Cold store — book your crates</Callout>

      <OrbitControls
        autoRotate
        autoRotateSpeed={0.5}
        enablePan={false}
        minDistance={6}
        maxDistance={20}
        maxPolarAngle={1.35}
        target={[1, 1.2, 0]}
      />
    </>
  );
}

/** The 2D twin: a labelled orchard → packing → cold-store diagram. */
function Orchard2DFallback() {
  return (
    <div className="flex h-full w-full flex-col justify-between gap-3 bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-800 p-5 text-white">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100">2D view — orchard to cold store</span>
      </div>
      <svg viewBox="0 0 640 190" className="w-full flex-1" role="img" aria-label="Diagram: apple orchard, 2–5 layer packing boxes and a cold store">
        {/* trees */}
        {[
          [60, 120],
          [130, 95],
          [200, 125],
          [270, 100],
        ].map(([x, y], i) => (
          <g key={i}>
            <line x1={x} y1={y + 38} x2={x} y2={y} stroke="#a97b4f" strokeWidth="5" strokeLinecap="round" />
            <circle cx={x} cy={y - 12} r="26" fill={i % 2 ? '#3f9a5f' : '#2f7d4f'} />
            <circle cx={x + 14} cy={y - 2} r="4" fill="#c92a2a" />
            <circle cx={x - 12} cy={y - 6} r="4" fill="#e03131" />
          </g>
        ))}
        {/* box stacks 2–5 layers */}
        {[2, 3, 4, 5].map((layers, i) =>
          Array.from({ length: layers }, (_, l) => (
            <rect key={`${i}-${l}`} x={330 + i * 46} y={142 - l * 16} width="34" height="12" rx="2" fill={layers === 5 && l === layers - 1 ? '#f5b942' : '#b98a4e'} />
          )),
        )}
        {/* cold store */}
        <rect x="530" y="70" width="90" height="80" rx="6" fill="#f1f5f9" />
        <rect x="530" y="70" width="90" height="80" rx="6" fill="none" stroke="#94a3b8" strokeWidth="3" />
        <rect x="536" y="105" width="18" height="45" fill="#22b8cf" />
        <rect x="566" y="88" width="44" height="8" fill="#64748b" />
        <rect x="566" y="110" width="44" height="8" fill="#64748b" />
        <rect x="572" y="96" width="12" height="10" fill="#3b82f6" />
        <rect x="592" y="96" width="12" height="10" fill="#3b82f6" />
        <rect x="572" y="118" width="12" height="10" fill="#3b82f6" />
      </svg>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p className="rounded-xl bg-white/10 px-3 py-2">🍎 Apple orchard — Grade A lots</p>
        <p className="rounded-xl bg-white/10 px-3 py-2">📦 2–5 layer packing</p>
        <p className="rounded-xl bg-white/10 px-3 py-2">❄️ Cold store — book your crates</p>
      </div>
    </div>
  );
}

export function OrchardShowcase() {
  return (
    <section aria-labelledby="showcase-heading" className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0A3D2E] via-emerald-900 to-emerald-950 p-5 shadow-[0_24px_60px_rgba(10,61,46,0.35)] sm:p-7">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">KashRoot in 3D</p>
          <h2 id="showcase-heading" className="font-display mt-1.5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            From the orchard to the cold store
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-emerald-100/90">
            Turn the valley: see the orchard your fruit grows in, how the 2–5 layer boxes are packed, and where your crates rest in the cold store.
          </p>
        </div>
      </div>
      <Portal3DScene
        label="Orchard & cold chain"
        background="#0A3D2E"
        fog={['#0A3D2E', 14, 42]}
        cameraPosition={[9, 5.5, 11]}
        fallback={<Orchard2DFallback />}
      >
        <SceneContents />
      </Portal3DScene>
    </section>
  );
}
