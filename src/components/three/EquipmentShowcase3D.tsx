'use client';

/**
 * EquipmentShowcase3D — the Kissan Tools portal's interactive 3D Agricultural
 * Equipment Showroom. Five switchable, rotatable procedural models:
 * orchard tractor (4WD compact), air-blast orchard sprayer, automated apple
 * grading & harvesting platform, drip & micro-sprinkler irrigation rig, and
 * power tiller & pruning rig. Switching shows the model and its real spec
 * sheet (HP, tank capacity, nozzle flow, subsidy eligibility, dealer price).
 * 2D fallback = the spec sheet (always visible in HTML) + a labelled SVG.
 */
import { useState } from 'react';
import { Html, OrbitControls } from '@react-three/drei';

import { Portal3DScene } from './Portal3DScene';

interface EquipmentSpec {
  id: string;
  name: string;
  hp: string;
  tank: string;
  flow: string;
  subsidy: string;
  price: string;
  note: string;
}

export const EQUIPMENT_SPECS: EquipmentSpec[] = [
  {
    id: 'tractor',
    name: 'Orchard Tractor (4WD Compact)',
    hp: '35–45 HP diesel',
    tank: '—',
    flow: '—',
    subsidy: 'SMAM: 40–50% subsidy eligible',
    price: '≈ ₹5.5–7.5 lakh (dealer)',
    note: 'Narrow orchard profile — fits 12 ft apple rows; 4WD for soft Karewa soil.',
  },
  {
    id: 'sprayer',
    name: 'Air-Blast Orchard Sprayer',
    hp: 'PTO-driven (tractor)',
    tank: '400–600 L tank',
    flow: 'Nozzle flow 8–12 L/min',
    subsidy: 'SMAM: ~40% subsidy eligible',
    price: '≈ ₹1.2–2.2 lakh (dealer)',
    note: 'Air-blast canopy coverage for scab and San Jose scale sprays.',
  },
  {
    id: 'grading',
    name: 'Automated Apple Grading & Harvesting Platform',
    hp: '2–3 kW electric / PTO',
    tank: '—',
    flow: '≈ 1.5–2.5 t/hr graded',
    subsidy: 'Horticulture dept. scheme support',
    price: '≈ ₹8–18 lakh (line)',
    note: 'Size + colour grading with a harvest platform for picker crews.',
  },
  {
    id: 'drip',
    name: 'Drip & Micro-Sprinkler Irrigation Rig',
    hp: '1–2 HP pump',
    tank: 'Fertigation tank 200 L',
    flow: '4–8 L/hr per emitter',
    subsidy: 'PMKSY: 45–55% subsidy eligible',
    price: '≈ ₹0.8–1.5 lakh / kanal set',
    note: 'Anti-clog emitters for Karewa orchards; fertigation-ready.',
  },
  {
    id: 'tiller',
    name: 'Power Tiller & Pruning Equipment',
    hp: '6–9 HP petrol/diesel',
    tank: '—',
    flow: '—',
    subsidy: 'SMAM: ~40% subsidy eligible',
    price: '≈ ₹0.9–1.6 lakh (dealer)',
    note: 'Inter-row tillage plus pruning saw/secateur kit for dormant season.',
  },
];

const STEEL = '#9aa3ad';
const RED = '#c92a2a';
const GREEN = '#2f7d4f';
const RUBBER = '#22262b';
const TRUNK_BROWN = '#7c4a21';

function Tractor() {
  return (
    <group>
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[2.6, 0.8, 1.4]} />
        <meshStandardMaterial color={RED} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Hood */}
      <mesh position={[1.05, 1.05, 0]} castShadow>
        <boxGeometry args={[0.9, 0.5, 1.2]} />
        <meshStandardMaterial color={RED} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Cabin */}
      <mesh position={[-0.55, 1.75, 0]} castShadow>
        <boxGeometry args={[1.1, 1.1, 1.3]} />
        <meshStandardMaterial color="#dbe4ec" roughness={0.3} metalness={0.4} transparent opacity={0.85} />
      </mesh>
      {/* Wheels: big rear, small front */}
      {[[-0.9, 0.62, 0.82], [-0.9, 0.62, -0.82], [1.05, 0.44, 0.72], [1.05, 0.44, -0.72]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={i < 2 ? [0.62, 0.62, 0.3, 16] : [0.44, 0.44, 0.26, 16]} />
          <meshStandardMaterial color={RUBBER} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[1.35, 1.55, -0.45]}>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 8]} />
        <meshStandardMaterial color="#333" metalness={0.6} roughness={0.4} />
      </mesh>
      <Html position={[0, 2.8, 0]} center distanceFactor={9}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">🚜 4WD compact — 35–45 HP</span>
      </Html>
    </group>
  );
}

function Sprayer() {
  return (
    <group>
      {/* Tank */}
      <mesh position={[0, 1.15, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.55, 0.55, 1.8, 18]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.4} metalness={0.15} />
      </mesh>
      {/* Air-blast fan housing */}
      <mesh position={[1.15, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.45, 0.5, 16]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
      </mesh>
      {/* Boom + nozzles */}
      <mesh position={[-0.4, 1.6, 0]}>
        <boxGeometry args={[2.2, 0.06, 0.06]} />
        <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.4} />
      </mesh>
      {[-1.4, -0.7, 0, 0.7, 1.4].map((x, i) => (
        <mesh key={i} position={[-1.45 + i * 0.35, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.06, 0.22, 8]} />
          <meshStandardMaterial color="#22b8cf" />
        </mesh>
      ))}
      {/* Frame + wheels */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.2, 0.12, 1.1]} />
        <meshStandardMaterial color={GREEN} roughness={0.6} />
      </mesh>
      {[[0.95, 0.35, 0.65], [0.95, 0.35, -0.65]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 0.2, 14]} />
          <meshStandardMaterial color={RUBBER} roughness={0.95} />
        </mesh>
      ))}
      <Html position={[0, 2.5, 0]} center distanceFactor={9}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">💨 400–600 L air-blast</span>
      </Html>
    </group>
  );
}

function GradingLine() {
  const apples = [-0.7, 0.1, 0.9];
  return (
    <group>
      {/* Table */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[4.4, 0.12, 1.3]} />
        <meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Rollers */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-1.8 + i * 0.45, 1.09, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 1.15, 8]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.25} />
        </mesh>
      ))}
      {/* Apples riding the line */}
      {apples.map((x, i) => (
        <mesh key={i} position={[x, 1.25, i % 2 ? 0.2 : -0.2]}>
          <sphereGeometry args={[0.17, 14, 10]} />
          <meshStandardMaterial color={i === 2 ? '#e8590c' : RED} roughness={0.3} />
        </mesh>
      ))}
      {/* Legs + collection crates */}
      {[[-1.8], [1.8]].map(([x], i) => (
        <group key={i}>
          <mesh position={[x, 0.5, 0.5]}>
            <boxGeometry args={[0.1, 1.0, 0.1]} />
            <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[x, 0.5, -0.5]}>
            <boxGeometry args={[0.1, 1.0, 0.1]} />
            <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
      <mesh position={[2.6, 0.35, 0]}>
        <boxGeometry args={[0.6, 0.55, 0.8]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.5} />
      </mesh>
      <Html position={[0, 2.0, 0]} center distanceFactor={9}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">🍎 Grading line — 1.5–2.5 t/hr</span>
      </Html>
    </group>
  );
}

function DripRig() {
  return (
    <group>
      {/* Pump + fertigation tank */}
      <mesh position={[-1.7, 0.55, 0]} castShadow>
        <boxGeometry args={[0.7, 0.7, 0.6]} />
        <meshStandardMaterial color={GREEN} roughness={0.6} />
      </mesh>
      <mesh position={[-1.0, 0.75, 0.55]}>
        <cylinderGeometry args={[0.28, 0.28, 0.7, 14]} />
        <meshStandardMaterial color="#22b8cf" roughness={0.4} />
      </mesh>
      {/* Main line */}
      <mesh position={[0.6, 0.85, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 4.4, 8]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>
      {/* Dripper laterals */}
      {[-1.2, 0, 1.2, 2.4].map((x, i) => (
        <mesh key={i} position={[x, 0.55, 0]} rotation={[Math.PI / 2.6, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 1.5, 6]} />
          <meshStandardMaterial color="#0f172a" roughness={0.6} />
        </mesh>
      ))}
      {/* Beds */}
      {[-0.6, 0.6].map((z, i) => (
        <mesh key={i} position={[0.6, 0.08, z]} receiveShadow>
          <boxGeometry args={[4.6, 0.16, 0.5]} />
          <meshStandardMaterial color="#5b3a29" roughness={1} />
        </mesh>
      ))}
      {/* Young trees */}
      {[-0.4, 0.8, 2.0].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.05, 0.07, 0.9, 6]} />
            <meshStandardMaterial color={TRUNK_BROWN} roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.05, 0]}>
            <sphereGeometry args={[0.32, 12, 10]} />
            <meshStandardMaterial color={GREEN} roughness={0.8} />
          </mesh>
        </group>
      ))}
      <Html position={[0.6, 2.0, 0]} center distanceFactor={9}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">💧 Drip + micro-sprinkler — 4–8 L/hr</span>
      </Html>
    </group>
  );
}

function Tiller() {
  return (
    <group>
      {/* Engine */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[0.9, 0.65, 0.7]} />
        <meshStandardMaterial color={RED} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Handles */}
      {[-0.28, 0.28].map((z, i) => (
        <mesh key={i} position={[-0.85, 1.0, z]} rotation={[0, 0, -0.5]}>
          <cylinderGeometry args={[0.035, 0.035, 1.5, 8]} />
          <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
      {/* Tine wheels with blades */}
      {[[-0.55], [0.35]].map(([x], i) => (
        <group key={i} position={[x, 0.45, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.42, 0.42, 0.28, 14]} />
            <meshStandardMaterial color="#444b52" metalness={0.6} roughness={0.35} />
          </mesh>
          {Array.from({ length: 6 }, (_, b) => (
            <mesh key={b} position={[0, Math.cos((b / 6) * Math.PI * 2) * 0.46, Math.sin((b / 6) * Math.PI * 2) * 0.46]} rotation={[0, 0, Math.PI / 2]}>
              <boxGeometry args={[0.3, 0.04, 0.1]} />
              <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Tilled soil */}
      <mesh position={[0.4, 0.06, 0]} receiveShadow>
        <boxGeometry args={[2.4, 0.12, 1.2]} />
        <meshStandardMaterial color="#6b4a30" roughness={1} />
      </mesh>
      <Html position={[0, 2.0, 0]} center distanceFactor={9}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">🔧 Power tiller — 6–9 HP</span>
      </Html>
    </group>
  );
}

const MODELS: Record<string, () => React.ReactElement> = {
  tractor: Tractor,
  sprayer: Sprayer,
  grading: GradingLine,
  drip: DripRig,
  tiller: Tiller,
};

function SceneContents({ id }: { id: string }) {
  const Model = MODELS[id] ?? Tractor;
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[5, 9, 6]} intensity={1.6} color="#fff2dd" />
      <pointLight position={[-5, 3, -4]} intensity={9} color="#ffd9a0" distance={14} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 36]} />
        <meshStandardMaterial color="#9aa08c" roughness={1} />
      </mesh>
      <group position={[0, 0.05, 0]} scale={1.15}>
        <Model />
      </group>
      <OrbitControls autoRotate autoRotateSpeed={0.8} enablePan={false} minDistance={4.5} maxDistance={14} maxPolarAngle={1.42} target={[0, 1, 0]} />
    </>
  );
}

function Showroom2DFallback({ id }: { id: string }) {
  const spec = EQUIPMENT_SPECS.find((e) => e.id === id) ?? EQUIPMENT_SPECS[0];
  return (
    <div className="flex h-full w-full flex-col justify-center gap-3 bg-gradient-to-b from-orange-50 to-white p-5">
      <span className="w-fit rounded-full bg-orange-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-900">2D view — {spec.name}</span>
      <p className="text-sm text-slate-700">{spec.note}</p>
      <p className="text-xs text-slate-500">The rotatable 3D model needs a bit more memory — the full spec sheet is below.</p>
    </div>
  );
}

export function EquipmentShowcase3D({ className = '' }: { className?: string }) {
  const [id, setId] = useState('tractor');
  const spec = EQUIPMENT_SPECS.find((e) => e.id === id) ?? EQUIPMENT_SPECS[0];

  return (
    <section className={`space-y-3 ${className}`} aria-label="3D equipment showroom">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">3D showroom — turn it, zoom it, read the spec</p>
          <h2 className="font-display mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Equipment, up close</h2>
        </div>
        <div role="group" aria-label="Choose equipment" className="flex flex-wrap gap-1.5">
          {EQUIPMENT_SPECS.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={id === e.id}
              onClick={() => setId(e.id)}
              className={`min-h-10 cursor-pointer rounded-xl px-3 text-xs font-bold ring-1 transition ${id === e.id ? 'bg-orange-700 text-white ring-orange-700 shadow-md' : 'bg-white text-slate-700 ring-slate-200 hover:bg-orange-50'}`}
            >
              {e.name.split('(')[0].trim()}
            </button>
          ))}
        </div>
      </div>

      <Portal3DScene
        label={spec.name.split('(')[0].trim()}
        height="h-[300px] sm:h-[380px]"
        className={className}
        background="#f3ede2"
        cameraPosition={[5.5, 3.6, 7]}
        fallback={<Showroom2DFallback id={id} />}
      >
        <SceneContents id={id} />
      </Portal3DScene>

      {/* Real spec sheet (always in HTML — readable in 2D and by screen readers) */}
      <dl className="grid gap-2 rounded-2xl bg-white/85 p-4 text-sm ring-1 ring-slate-900/5 sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Engine</dt><dd className="font-semibold text-slate-900">{spec.hp}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tank</dt><dd className="font-semibold text-slate-900">{spec.tank}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Flow / output</dt><dd className="font-semibold text-slate-900">{spec.flow}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subsidy</dt><dd className="font-semibold text-emerald-800">{spec.subsidy}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dealer price</dt><dd className="font-semibold text-slate-900">{spec.price}</dd></div>
        <div className="sm:col-span-2 lg:col-span-3"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why it fits Kashmir orchards</dt><dd className="text-slate-700">{spec.note}</dd></div>
      </dl>
    </section>
  );
}
