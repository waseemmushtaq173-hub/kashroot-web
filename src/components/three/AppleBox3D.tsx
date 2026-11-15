'use client';

/**
 * AppleBox3D — the 3D wooden/cardboard apple box layer visualizer, shared by
 * the Farmer portal (Sell Produce form, next to the packing-layer buttons)
 * and the Buyer portal (product details, Box specifications).
 *
 * Shows `layers` (2–5) as stacked trays of apples inside a slatted box:
 * fewer layers = larger fruit, fewer per tray; 5 layers = standard packing.
 * Built on the Portal3DScene engine (lazy ssr:false canvas, error boundary,
 * low-power 2D SVG fallback with the same information).
 */
import { Html, OrbitControls } from '@react-three/drei';

import { Portal3DScene } from './Portal3DScene';

const WOOD = '#c99a5b';
const WOOD_DARK = '#a97b42';
const APPLE_A = '#d64545';
const APPLE_B = '#c92a2a';
const APPLE_C = '#e8590c';

/** Apples per tray row/col per layer count: fewer layers hold bigger fruit. */
function trayGrid(layers: number): { rows: number; cols: number; r: number } {
  switch (layers) {
    case 2: return { rows: 2, cols: 3, r: 0.26 };
    case 3: return { rows: 3, cols: 3, r: 0.21 };
    case 4: return { rows: 3, cols: 4, r: 0.175 };
    default: return { rows: 3, cols: 4, r: 0.16 }; // 5 layers: standard
  }
}

const TRAY_H = 0.3;
const BOX_W = 2.2;
const BOX_D = 2.2;

function Tray({ y, rows, cols, r }: { y: number; rows: number; cols: number; r: number }) {
  const colour = y % 2 === 0 ? APPLE_A : y % 3 === 0 ? APPLE_C : APPLE_B;
  const apples: { x: number; z: number }[] = [];
  const gapX = BOX_W / (cols + 1);
  const gapZ = BOX_D / (rows + 1);
  // Apples sit in a simple grid; each tray holds one flat layer of fruit.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      apples.push({ x: -BOX_W / 2 + gapX * (col + 1), z: -BOX_D / 2 + gapZ * (row + 1) });
    }
  }
  return (
    <group position={[0, y * TRAY_H, 0]}>
      {/* Tray / divider */}
      <mesh>
        <boxGeometry args={[BOX_W - 0.08, 0.035, BOX_D - 0.08]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.85} />
      </mesh>
      {apples.map((a, i) => (
        <mesh key={i} position={[a.x, 0.035 + r, a.z]} castShadow>
          <sphereGeometry args={[r, 14, 10]} />
          <meshStandardMaterial color={colour} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function BoxContents({ layers }: { layers: number }) {
  const { rows, cols, r } = trayGrid(layers);
  const height = layers * TRAY_H;
  return (
    <group position={[0, 0.18, 0]}>
      {/* Bottom */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[BOX_W, 0.08, BOX_D]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
      {/* Corner posts */}
      {[
        [-BOX_W / 2 + 0.06, -BOX_D / 2 + 0.06],
        [BOX_W / 2 - 0.06, -BOX_D / 2 + 0.06],
        [-BOX_W / 2 + 0.06, BOX_D / 2 - 0.06],
        [BOX_W / 2 - 0.06, BOX_D / 2 - 0.06],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, height / 2, z]}>
          <boxGeometry args={[0.12, height, 0.12]} />
          <meshStandardMaterial color={WOOD} roughness={0.85} />
        </mesh>
      ))}
      {/* Slatted sides (air gaps between the boards) */}
      {Array.from({ length: layers + 1 }, (_, i) => i * (height / (layers + 1))).map((y, i) => (
        <group key={i} position={[0, y + 0.1, 0]}>
          <mesh position={[0, 0, BOX_D / 2 - 0.02]}>
            <boxGeometry args={[BOX_W, 0.09, 0.05]} />
            <meshStandardMaterial color={WOOD} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0, -BOX_D / 2 + 0.02]}>
            <boxGeometry args={[BOX_W, 0.09, 0.05]} />
            <meshStandardMaterial color={WOOD} roughness={0.85} />
          </mesh>
          <mesh position={[BOX_W / 2 - 0.02, 0, 0]}>
            <boxGeometry args={[0.05, 0.09, BOX_D]} />
            <meshStandardMaterial color={WOOD} roughness={0.85} />
          </mesh>
          <mesh position={[-BOX_W / 2 + 0.02, 0, 0]}>
            <boxGeometry args={[0.05, 0.09, BOX_D]} />
            <meshStandardMaterial color={WOOD} roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* Forklift skids under the box */}
      {[-0.7, 0.7].map((x, i) => (
        <mesh key={i} position={[x, -0.09, 0]}>
          <boxGeometry args={[0.25, 0.12, BOX_D]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
        </mesh>
      ))}
      {/* The fruit, layer by layer */}
      {Array.from({ length: layers }, (_, i) => (
        <Tray key={i} y={i + 1} rows={rows} cols={cols} r={r} />
      ))}
      <Html position={[0, height + 0.55, 0]} center distanceFactor={7}>
        <span className="whitespace-nowrap rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow ring-1 ring-slate-900/10">
          {layers} layer{layers === 1 ? '' : 's'} · ≈18 kg box
        </span>
      </Html>
    </group>
  );
}

function SceneContents({ layers }: { layers: number }) {
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 7, 5]} intensity={1.5} color="#fff2dd" />
      <pointLight position={[-4, 2, -4]} intensity={8} color="#ffe0b8" distance={12} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 32]} />
        <meshStandardMaterial color="#8a6b45" roughness={1} />
      </mesh>
      <group position={[0, 0.1, 0]}>
        <BoxContents layers={layers} />
      </group>
      <OrbitControls autoRotate autoRotateSpeed={0.9} enablePan={false} minDistance={4} maxDistance={12} maxPolarAngle={1.4} target={[0, 0.9, 0]} />
    </>
  );
}

/** The 2D twin: side-view diagram with the same layer count. */
function Box2DFallback({ layers }: { layers: number }) {
  const { rows, cols } = trayGrid(layers);
  return (
    <div className="flex h-full w-full flex-col justify-between gap-2 bg-gradient-to-b from-amber-50 to-white p-4">
      <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-900">2D view — {layers} layers</span>
      <svg viewBox="0 0 300 190" className="w-full flex-1" role="img" aria-label={`Diagram of a ${layers} layer apple box`}>
        <rect x="30" y="16" width="240" height="160" rx="8" fill="none" stroke="#a97b42" strokeWidth="6" />
        {Array.from({ length: layers }, (_, i) => {
          const y = 176 - (i + 1) * (160 / layers);
          return (
            <g key={i}>
              <rect x="34" y={y} width="232" height="4" fill="#c99a5b" />
              {Array.from({ length: rows }, (_, row) =>
                Array.from({ length: cols }, (_, col) => (
                  <circle key={`${row}-${col}`} cx={34 + ((col + 1) * 232) / (cols + 1)} cy={y - 10} r={Math.min(13, 130 / (cols * 9))} fill={i % 2 ? '#c92a2a' : '#d64545'} />
                )),
              )}
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-slate-600">Fewer layers = larger fruit, fewer per box. 5 Layer is the standard export packing.</p>
    </div>
  );
}

export function AppleBox3D({ layers, className = '' }: { layers: number | string; className?: string }) {
  // Values can be "4 Layer", "2 Layer (Half Box)" — or "Loose / Crate Packed",
  // which has no layer count: the 3D box simply does not render then.
  const n = parseInt(String(layers).trim(), 10);
  const safe = Number.isFinite(n) ? Math.min(5, Math.max(2, n)) : 0;
  if (!safe) return null;
  return (
    <Portal3DScene
      label={`${safe} layer box`}
      height="h-[240px] sm:h-[280px]"
      className={className}
      background="#f5ead8"
      cameraPosition={[4.2, 3.4, 5.4]}
      fallback={<Box2DFallback layers={safe} />}
    >
      <SceneContents layers={safe} />
    </Portal3DScene>
  );
}
