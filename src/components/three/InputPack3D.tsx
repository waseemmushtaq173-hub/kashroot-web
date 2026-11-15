'use client';

/**
 * InputPack3D — the Agro-Dealer portal's interactive 3D Input Packaging &
 * FCO / CIB&RC Compliance Label Viewer. Three switchable pack types:
 * a fertilizer bag (urea/DAP under the Fertiliser Control Order), a
 * pesticide canister with the colour-coded toxicity band (CIB&RC), and a
 * machinery crate. The compliance label rides the 3D pack as a callout and
 * is also spelled out in HTML (screen readers + the 2D fallback).
 */
import { useState } from 'react';
import { Html, OrbitControls } from '@react-three/drei';

import { Portal3DScene } from './Portal3DScene';

type PackId = 'bag' | 'canister' | 'crate';

const PACKS: { id: PackId; label: string; reg: string; rule: string }[] = [
  { id: 'bag', label: 'Fertilizer bag (FCO)', reg: 'FCO 1985 — reg. no. on bag', rule: 'N-P-K %, moisture, batch & expiry must be printed on every bag.' },
  { id: 'canister', label: 'Pesticide canister (CIB&RC)', reg: 'Insecticides Act 1968 — CIB&RC reg. no.', rule: 'Toxicity colour band: blue (moderately toxic) / yellow (slightly) / red (highly) / green (low).' },
  { id: 'crate', label: 'Machinery crate', reg: 'Legal Metrology — net weight on pack', rule: 'Serial number, warranty card and dealer stamp travel with the crate.' },
];

function Bag() {
  return (
    <group>
      {/* Sack body */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[1.7, 1.8, 0.9]} />
        <meshStandardMaterial color="#e6d6a8" roughness={0.9} />
      </mesh>
      {/* Crimped top */}
      <mesh position={[0, 1.85, 0]}>
        <boxGeometry args={[1.75, 0.18, 0.95]} />
        <meshStandardMaterial color="#d4c28e" roughness={0.9} />
      </mesh>
      {/* Printed brand band */}
      <mesh position={[0, 1.1, 0.452]}>
        <planeGeometry args={[1.5, 0.7]} />
        <meshStandardMaterial color="#25643f" roughness={0.6} />
      </mesh>
      <Html position={[0, 0.35, 0.55]} center distanceFactor={8}>
        <span className="whitespace-nowrap rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">
          🏷️ FCO 1985 · Urea 46% N · batch 2026-K
        </span>
      </Html>
    </group>
  );
}

function Canister() {
  return (
    <group>
      <mesh position={[0, 0.75, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 1.5, 20]} />
        <meshStandardMaterial color="#f4f6f8" roughness={0.35} metalness={0.1} />
      </mesh>
      {/* Cap + handle */}
      <mesh position={[0, 1.62, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.28, 12]} />
        <meshStandardMaterial color="#22b8cf" roughness={0.4} />
      </mesh>
      <mesh position={[0.45, 1.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.16, 0.03, 8, 16]} />
        <meshStandardMaterial color="#22b8cf" roughness={0.4} />
      </mesh>
      {/* Toxicity colour band (blue = moderately toxic) */}
      <mesh position={[0, 0.95, 0.501]}>
        <planeGeometry args={[0.9, 0.35]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.5} />
      </mesh>
      <Html position={[0, 0.3, 0.55]} center distanceFactor={8}>
        <span className="whitespace-nowrap rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">
          ⚠️ CIB&RC reg. no. · blue band = moderately toxic
        </span>
      </Html>
    </group>
  );
}

function Crate() {
  return (
    <group>
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[1.9, 1.3, 1.3]} />
        <meshStandardMaterial color="#c99a5b" roughness={0.9} />
      </mesh>
      {/* Slats */}
      {[0.25, 0.7, 1.15].map((y, i) => (
        <mesh key={i} position={[0, y, 0.652]}>
          <boxGeometry args={[1.8, 0.18, 0.03]} />
          <meshStandardMaterial color="#a97b42" roughness={0.9} />
        </mesh>
      ))}
      <Html position={[0, 1.55, 0]} center distanceFactor={8}>
        <span className="whitespace-nowrap rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">
          ⚙️ Machinery · serial + warranty inside
        </span>
      </Html>
    </group>
  );
}

const MODELS: Record<PackId, () => React.ReactElement> = { bag: Bag, canister: Canister, crate: Crate };

function SceneContents({ id }: { id: PackId }) {
  const Model = MODELS[id];
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 8, 6]} intensity={1.5} color="#fff2dd" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[7, 30]} />
        <meshStandardMaterial color="#9aa08c" roughness={1} />
      </mesh>
      <group position={[0, 0.1, 0]}>
        <Model />
      </group>
      <OrbitControls autoRotate autoRotateSpeed={1} enablePan={false} minDistance={3.5} maxDistance={11} maxPolarAngle={1.45} target={[0, 0.8, 0]} />
    </>
  );
}

function Pack2DFallback({ id }: { id: PackId }) {
  const pack = PACKS.find((p) => p.id === id) ?? PACKS[0];
  return (
    <div className="flex h-full w-full flex-col justify-center gap-2 bg-gradient-to-b from-teal-50 to-white p-5">
      <span className="w-fit rounded-full bg-teal-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-900">2D view — {pack.label}</span>
      <p className="text-sm text-slate-700">{pack.rule}</p>
      <p className="text-xs text-slate-500">{pack.reg}</p>
    </div>
  );
}

export function InputPack3D({ className = '' }: { className?: string }) {
  const [id, setId] = useState<PackId>('bag');
  const pack = PACKS.find((p) => p.id === id) ?? PACKS[0];

  return (
    <section className={`space-y-3 ${className}`} aria-label="3D packaging & compliance viewer">
      <div role="group" aria-label="Choose a pack type" className="flex flex-wrap gap-1.5">
        {PACKS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={id === p.id}
            onClick={() => setId(p.id)}
            className={`min-h-10 cursor-pointer rounded-xl px-3 text-xs font-bold ring-1 transition ${id === p.id ? 'bg-teal-700 text-white ring-teal-700 shadow-md' : 'bg-white text-slate-700 ring-slate-200 hover:bg-teal-50'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Portal3DScene
        label="Pack & label"
        height="h-[260px] sm:h-[320px]"
        className={className}
        background="#eef4f1"
        cameraPosition={[3.6, 2.6, 5]}
        fallback={<Pack2DFallback id={id} />}
      >
        <SceneContents id={id} />
      </Portal3DScene>

      <div className="rounded-2xl bg-white/85 p-4 text-sm ring-1 ring-slate-900/5">
        <p className="font-semibold text-slate-900">{pack.label}</p>
        <p className="mt-1 text-slate-700">{pack.rule}</p>
        <p className="mt-1 text-xs font-semibold text-teal-800">{pack.reg}</p>
      </div>
    </section>
  );
}
