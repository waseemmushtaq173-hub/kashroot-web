'use client';

/**
 * Portal3DCanvas — the raw React Three Fiber <Canvas>, loaded only on the
 * client (`next/dynamic` with `ssr: false` inside Portal3DScene), so three.js
 * never delays the first paint, never runs on the server and never lands in
 * the initial bundle. Scene content arrives as children.
 */
import { Canvas } from '@react-three/fiber';

export default function Portal3DCanvas({
  children,
  className = '',
  cameraPosition = [7, 5, 9],
  fov = 42,
  background,
  fog,
}: {
  children: React.ReactNode;
  className?: string;
  cameraPosition?: [number, number, number];
  fov?: number;
  /** Scene background colour (also softens load-in). */
  background?: string;
  fog?: [string, number, number];
}) {
  return (
    <Canvas
      className={className}
      camera={{ position: cameraPosition, fov }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      style={{ touchAction: 'none' }}
    >
      {background ? <color attach="background" args={[background]} /> : null}
      {fog ? <fog attach="fog" args={fog} /> : null}
      {children}
    </Canvas>
  );
}
