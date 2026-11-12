'use client';

/**
 * OrchardInspector3D — the Farmer portal's interactive 3D Kashmiri Orchard &
 * Crop Health Inspector: apple rows and walnut trees, canopy health zones
 * (green healthy, amber watch, red problem), and a soil-moisture cutaway
 * (top soil moist, mid layer drying, deep layer cool) with labelled callouts.
 * Rotatable/zoomable through the shared Portal3DScene engine, with a real 2D
 * diagram as the low-power fallback.
 */
import { Html, OrbitControls } from '@react-three/drei';

import { Portal3DScene } from './Portal3DScene';

const CANOPY_HEALTHY = '#2f7d4f';
const CANOPY_WATCH = '#d99a1b';
const CANOPY_ALERT = '#c92a2a';
const TRUNK = '#7c4a21';
const WALNUT = '#4b6b3a';

function AppleTree({ position, health = 'healthy', scale = 1 }: { position: [number, number, number]; health?: 'healthy' | 'watch' | 'alert'; scale?: number }) {
  const main = health === 'healthy' ? CANOPY_HEALTHY : health === 'watch' ? CANOPY_WATCH : CANOPY_ALERT;
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.19, 1.7, 8]} />
        <meshStandardMaterial color={TRUNK} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2, 0]} castShadow>
        <sphereGeometry args={[0.9, 18, 14]} />
        <meshStandardMaterial color={main} roughness={0.8} />
      </mesh>
      {/* A second crown sphere marks the health zone of one branch. */}
      {health !== 'healthy' && (
        <mesh position={[0.55, 1.6, 0.3]}>
          <sphereGeometry args={[0.42, 14, 10]} />
          <meshStandardMaterial color={health === 'watch' ? CANOPY_WATCH : CANOPY_ALERT} roughness={0.8} />
        </mesh>
      )}
    </group>
  );
}

function WalnutTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.4, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.3, 2.8, 8]} />
        <meshStandardMaterial color="#6b4423" roughness={0.95} />
      </mesh>
      <mesh position={[0, 3.2, 0]} castShadow>
        <sphereGeometry args={[1.5, 18, 14]} />
        <meshStandardMaterial color={WALNUT} roughness={0.85} />
      </mesh>
      <mesh position={[1, 2.7, 0.4]} castShadow>
        <sphereGeometry args={[0.85, 16, 12]} />
        <meshStandardMaterial color={WALNUT} roughness={0.85} />
      </mesh>
      <mesh position={[-0.9, 2.9, -0.3]} castShadow>
        <sphereGeometry args={[0.8, 16, 12]} />
        <meshStandardMaterial color="#557a44" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Soil cutaway: layered slabs at the front of the plot. */
function SoilStrata() {
  const layers = [
    { y: -0.15, h: 0.5, colour: '#5b3a29', label: 'Top soil — moist' },
    { y: -0.65, h: 0.5, colour: '#8a6b45', label: 'Mid layer — drying' },
    { y: -1.15, h: 0.5, colour: '#b09a72', label: 'Deep layer — cool' },
  ];
  return (
    <group position={[-5.5, 0, 3.2]}>
      {layers.map((l, i) => (
        <mesh key={i} position={[0, l.y + l.h / 2, 0]}>
          <boxGeometry args={[3.4, l.h, 1.4]} />
          <meshStandardMaterial color={l.colour} roughness={1} />
        </mesh>
      ))}
      {/* Moisture sensors as tiny stakes */}
      {layers.map((l, i) => (
        <mesh key={`s${i}`} position={[1.85, l.y + l.h / 2, 0]}>
          <capsuleGeometry args={[0.05, 0.25, 4, 8]} />
          <meshStandardMaterial color="#22b8cf" metalness={0.4} roughness={0.3} />
        </mesh>
      ))}
      <Html position={[0, 0.7, 0]} center distanceFactor={10}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">🌱 Soil moisture strata</span>
      </Html>
    </group>
  );
}

function SceneContents() {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[7, 11, 5]} intensity={1.7} color="#fff3df" />
      <pointLight position={[-5, 4, 6]} intensity={10} color="#ffd9a0" distance={16} />

      {/* Orchard floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[15, 40]} />
        <meshStandardMaterial color="#2c6a45" roughness={1} />
      </mesh>

      {/* Apple rows — one tree in the second row is the "watch" zone */}
      {[-4.5, -1.5, 1.5, 4.5].map((x, i) => (
        <AppleTree key={`a${i}`} position={[x, 0, -3]} scale={0.95} />
      ))}
      {[-4.5, -1.5, 1.5, 4.5].map((x, i) => (
        <AppleTree key={`b${i}`} position={[x, 0, 0.5]} scale={1} health={i === 2 ? 'watch' : 'healthy'} />
      ))}
      <AppleTree position={[1.5, 0, 4]} scale={0.9} health="alert" />

      {/* Walnut trees along the back edge */}
      <WalnutTree position={[-7.5, 0, -6]} scale={0.9} />
      <WalnutTree position={[7.5, 0, -6]} scale={1} />

      <SoilStrata />

      <Html position={[-1.5, 3.2, 0.5]} center distanceFactor={11}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">🍏 Apple rows — Grade A</span>
      </Html>
      <Html position={[7.5, 4.4, -6]} center distanceFactor={11}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">🌰 Walnut trees</span>
      </Html>
      <Html position={[1.5, 3.1, 4]} center distanceFactor={11}>
        <span className="whitespace-nowrap rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-900 shadow ring-1 ring-rose-300">🔴 Canopy alert — check this tree</span>
      </Html>
      <Html position={[-4.5, 3.2, -3]} center distanceFactor={11}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">✅ Healthy canopy</span>
      </Html>

      <OrbitControls autoRotate autoRotateSpeed={0.4} enablePan={false} minDistance={7} maxDistance={22} maxPolarAngle={1.4} target={[0, 1.2, 0]} />
    </>
  );
}

function Inspector2DFallback() {
  return (
    <div className="flex h-full w-full flex-col gap-2 bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-800 p-4 text-white">
      <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100">2D view — orchard health</span>
      <svg viewBox="0 0 640 200" className="w-full flex-1" role="img" aria-label="Diagram of the orchard: apple rows, walnut trees and soil layers">
        {[
          [70, 60],
          [170, 55],
          [270, 62],
          [370, 55],
        ].map(([x, y], i) => (
          <g key={i}>
            <line x1={x} y1={y + 30} x2={x} y2={y} stroke="#a97b4f" strokeWidth="4" />
            <circle cx={x} cy={y - 10} r="18" fill={i === 2 ? '#d99a1b' : '#2f7d4f'} />
          </g>
        ))}
        <circle cx="470" cy="45" r="16" fill="#c92a2a" />
        <line x1="470" y1="80" x2="470" y2="52" stroke="#a97b4f" strokeWidth="4" />
        {/* walnut trees */}
        <circle cx="590" cy="40" r="24" fill="#4b6b3a" />
        <line x1="590" y1="90" x2="590" y2="60" stroke="#6b4423" strokeWidth="6" />
        {/* soil strata */}
        <rect x="40" y="130" width="180" height="22" fill="#5b3a29" />
        <rect x="40" y="152" width="180" height="22" fill="#8a6b45" />
        <rect x="40" y="174" width="180" height="22" fill="#b09a72" />
        <text x="230" y="146" fill="#e2f5e9" fontSize="13">Top soil — moist</text>
        <text x="230" y="168" fill="#e2f5e9" fontSize="13">Mid layer — drying</text>
        <text x="230" y="190" fill="#e2f5e9" fontSize="13">Deep layer — cool</text>
      </svg>
      <div className="grid gap-1.5 text-xs sm:grid-cols-2">
        <p className="rounded-lg bg-white/10 px-2.5 py-1.5">🍏 Apple rows — Grade A · ✅ healthy · 🟠 watch · 🔴 alert</p>
        <p className="rounded-lg bg-white/10 px-2.5 py-1.5">🌰 Walnut trees along the back edge · 🌱 soil moisture stakes</p>
      </div>
    </div>
  );
}

export function OrchardInspector3D({ className = '' }: { className?: string }) {
  return (
    <Portal3DScene
      label="Orchard & crop health"
      height="h-[340px] sm:h-[420px]"
      className={className}
      background="#123b2b"
      fog={['#123b2b', 16, 40]}
      cameraPosition={[10, 6, 12]}
      fallback={<Inspector2DFallback />}
    >
      <SceneContents />
    </Portal3DScene>
  );
}
