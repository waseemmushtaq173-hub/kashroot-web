'use client';

/**
 * LeafPathology3D — the Advisory portal's interactive 3D Plant & Leaf
 * Pathology Stage Viewer. A large apple leaf (a shaped, flattened mesh with
 * veins) with switchable disease stages: healthy, apple scab (olive-black
 * velvety lesions), advanced scab (cracked, yellowing margins), and San Jose
 * scale (dark crusty caps on the underside). The stage badge names each one
 * in plain language; every recommendation shown beside it carries either the
 * 🤖 AI suggestion badge or the ✅ verified-expert badge.
 */
import { useState } from 'react';
import { Html, OrbitControls } from '@react-three/drei';

import { Portal3DScene } from './Portal3DScene';

type Stage = 'healthy' | 'scab' | 'advanced' | 'scale';

const STAGES: { id: Stage; label: string; note: string }[] = [
  { id: 'healthy', label: 'Healthy leaf', note: 'Even green, no spots. Keep the spray calendar and scab windows in view.' },
  { id: 'scab', label: 'Apple scab — early', note: 'Olive-green velvety spots on the upper surface after wet weather. Prune for airflow; cover sprays in infection windows.' },
  { id: 'advanced', label: 'Apple scab — advanced', note: 'Lesions darken, crack and curl the leaf; fruit gets corky blotches. Remove fallen leaves; verify doses with an agronomist.' },
  { id: 'scale', label: 'San Jose scale', note: 'Dark, crusty caps on bark and fruit; red halo under each. Dormant oil spray timing matters.' },
];

const GREEN = '#3d8a4d';
const OLIVE = '#5d6b23';
const DARK = '#2f2413';
const YELLOW = '#c9a227';

function Lesion({ position, size, colour }: { position: [number, number, number]; size: number; colour: string }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 12, 8]} />
      <meshStandardMaterial color={colour} roughness={0.7} />
    </mesh>
  );
}

function Leaf({ stage }: { stage: Stage }) {
  // The blade: a squashed sphere reads as a leaf from every camera angle.
  const blade = (
    <mesh scale={[1.6, 0.06, 1.05]} castShadow>
      <sphereGeometry args={[1, 24, 16]} />
      <meshStandardMaterial color={stage === 'advanced' ? YELLOW : GREEN} roughness={0.6} side={2} />
    </mesh>
  );
  const vein = (z: number, rot: number, len: number) => (
    <mesh position={[0, 0.06, z]} rotation={[0, 0, rot]}>
      <boxGeometry args={[len, 0.01, 0.025]} />
      <meshStandardMaterial color="#e9f5ec" roughness={0.6} />
    </mesh>
  );
  return (
    <group rotation={[0.15, 0.35, 0.1]}>
      {blade}
      {/* Midrib and side veins */}
      {vein(0, Math.PI / 2, 3)}
      {[-0.55, -0.25, 0.05, 0.35].map((x, i) => (
        <group key={i}>
          {vein(i * 0.001 + 0.12 + i * 0.18, Math.PI / 2 + 0.5, 0.8)}
          {vein(0.12 + i * 0.18, Math.PI / 2 - 0.5, 0.8)}
        </group>
      ))}
      {/* Petiole */}
      <mesh position={[-1.55, 0.02, 0]} rotation={[0, 0, Math.PI / 2 + 0.08]}>
        <cylinderGeometry args={[0.045, 0.055, 0.6, 8]} />
        <meshStandardMaterial color="#6b4423" roughness={0.8} />
      </mesh>

      {/* Lesions per stage */}
      {stage === 'scab' && (
        <>
          <Lesion position={[0.5, 0.08, 0.35]} size={0.16} colour={OLIVE} />
          <Lesion position={[-0.3, 0.08, -0.25]} size={0.13} colour={OLIVE} />
          <Lesion position={[0.05, 0.08, 0.05]} size={0.1} colour={OLIVE} />
        </>
      )}
      {stage === 'advanced' && (
        <>
          {[
            [0.55, 0.35], [0.2, -0.3], [-0.4, 0.25], [-0.1, -0.45], [0.75, -0.15], [-0.65, -0.1],
          ].map(([x, z], i) => (
            <Lesion key={i} position={[x, 0.09, z]} size={0.17} colour={DARK} />
          ))}
        </>
      )}
      {stage === 'scale' && (
        <>
          {[0.4, 0.0, -0.4].map((x, i) => (
            <group key={i}>
              <Lesion position={[x, -0.09, 0.2 - i * 0.18]} size={0.11} colour="#3a2a1a" />
              <Lesion position={[x, -0.1, 0.2 - i * 0.18]} size={0.06} colour="#6b4a30" />
            </group>
          ))}
        </>
      )}

      <Html position={[0, 0.75, 0]} center distanceFactor={7}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">
          {stage === 'healthy' ? '✅ Healthy' : stage === 'scab' ? '🟤 Apple scab — early' : stage === 'advanced' ? '⚫ Scab — advanced' : '⚫ San Jose scale'}
        </span>
      </Html>
    </group>
  );
}

function SceneContents({ stage }: { stage: Stage }) {
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 7, 5]} intensity={1.5} color="#fff2dd" />
      <pointLight position={[-4, 3, -3]} intensity={7} color="#d9f2e0" distance={12} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[7, 30]} />
        <meshStandardMaterial color="#7da184" roughness={1} />
      </mesh>
      <Leaf stage={stage} />
      <OrbitControls autoRotate autoRotateSpeed={0.9} enablePan={false} minDistance={3} maxDistance={10} maxPolarAngle={1.5} target={[0, 0, 0]} />
    </>
  );
}

function Leaf2DFallback({ stage }: { stage: Stage }) {
  const info = STAGES.find((s) => s.id === stage) ?? STAGES[0];
  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 bg-gradient-to-b from-green-50 to-white p-5">
      <span className="w-fit rounded-full bg-green-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-green-900">2D view — {info.label}</span>
      <svg viewBox="0 0 300 160" className="w-full flex-1" role="img" aria-label={`Diagram of a leaf: ${info.label}`}>
        <ellipse cx="150" cy="80" rx="110" ry="52" fill={stage === 'advanced' ? '#c9a227' : '#3d8a4d'} />
        <line x1="45" y1="80" x2="255" y2="80" stroke="#e9f5ec" strokeWidth="3" />
        {[70, 100, 130, 160, 190, 220].map((x, i) => (
          <g key={i}>
            <line x1={x} y1="80" x2={x - 12} y2="52" stroke="#e9f5ec" strokeWidth="1.5" />
            <line x1={x} y1="80" x2={x - 12} y2="108" stroke="#e9f5ec" strokeWidth="1.5" />
          </g>
        ))}
        {stage === 'scab' && [
          [170, 60], [130, 95], [200, 95],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="9" fill="#5d6b23" />
        ))}
        {stage === 'advanced' && [
          [170, 60], [130, 95], [200, 95], [110, 65], [215, 70], [165, 110],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="10" fill="#2f2413" />
        ))}
        {stage === 'scale' && [
          [140, 70], [180, 90], [150, 105],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="8" fill="#3a2a1a" />
            <circle cx={x} cy={y} r="4" fill="#6b4a30" />
          </g>
        ))}
      </svg>
      <p className="text-sm text-slate-700">{info.note}</p>
    </div>
  );
}

export function LeafPathology3D({ className = '' }: { className?: string }) {
  const [stage, setStage] = useState<Stage>('scab');
  const info = STAGES.find((s) => s.id === stage) ?? STAGES[0];

  return (
    <section className={`space-y-3 ${className}`} aria-label="3D plant pathology viewer">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-green-700">3D pathology stage viewer — turn the leaf</p>
          <h2 className="font-display mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">See the disease before it spreads</h2>
        </div>
        <div role="group" aria-label="Choose a stage" className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={stage === s.id}
              onClick={() => setStage(s.id)}
              className={`min-h-10 cursor-pointer rounded-xl px-3 text-xs font-bold ring-1 transition ${stage === s.id ? 'bg-green-800 text-white ring-green-800 shadow-md' : 'bg-white text-slate-700 ring-slate-200 hover:bg-green-50'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Portal3DScene
        label="Leaf pathology"
        height="h-[280px] sm:h-[340px]"
        className={className}
        background="#eaf3ec"
        cameraPosition={[3.4, 2.6, 4.6]}
        fallback={<Leaf2DFallback stage={stage} />}
      >
        <SceneContents stage={stage} />
      </Portal3DScene>

      <div className="rounded-2xl bg-white/85 p-4 text-sm ring-1 ring-slate-900/5">
        <p className="font-semibold text-slate-900">{info.label}</p>
        <p className="mt-1 text-slate-700">{info.note}</p>
        <p className="mt-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900 ring-1 ring-amber-200">🤖 AI Agronomic Suggestion — verify doses with an agronomist</p>
      </div>
    </section>
  );
}
