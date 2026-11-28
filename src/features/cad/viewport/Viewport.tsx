'use client';

import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';

import { useCadStoreApi } from '@/features/cad/state/CadStoreProvider';
import { CameraRig } from '@/features/cad/viewport/CameraRig';
import { CursorTracker } from '@/features/cad/viewport/CursorTracker';
import { DatumPlanes } from '@/features/cad/viewport/DatumPlanes';
import { OriginAxes } from '@/features/cad/viewport/OriginAxes';
import { SceneGrid } from '@/features/cad/viewport/SceneGrid';
import { CLICK_TOLERANCE_PX, FIT_ROOT_NAME, VIEWPORT_COLORS } from '@/features/cad/viewport/theme';
import { ViewportGuard } from '@/features/cad/viewport/ViewportGuard';

/**
 * The 3D view. It draws what it is given and moves the camera; it never
 * computes model geometry.
 *
 * Z is up and one unit is one millimetre. Rendering runs on demand: a frame is
 * drawn only when something changes, which keeps laptops cool and phones
 * running longer.
 */
export default function Viewport() {
  const api = useCadStoreApi();
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  return (
    <ViewportGuard>
      <div
        className="absolute inset-0"
        data-testid="cad-viewport"
        onPointerDown={(e) => {
          pressedAt.current = { x: e.clientX, y: e.clientY };
        }}
      >
        <Canvas
          camera={{ position: [3000, -3000, 3000], up: [0, 0, 1], fov: 40, near: 1, far: 200_000 }}
          dpr={[1, 2]}
          frameloop="demand"
          gl={{ antialias: true }}
          onPointerMissed={(e) => {
            // A click on empty space clears the selection; the end of an orbit or pan does not.
            const p = pressedAt.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_TOLERANCE_PX) return;
            api.getState().select(null);
          }}
        >
          <color attach="background" args={[VIEWPORT_COLORS.background]} />
          <SceneGrid />
          <OriginAxes />
          <group name={FIT_ROOT_NAME}>
            <DatumPlanes />
          </group>
          <OrbitControls makeDefault enableDamping={false} zoomToCursor screenSpacePanning />
          <CameraRig />
          <CursorTracker />
          <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
            <GizmoViewport axisColors={[VIEWPORT_COLORS.axisX, VIEWPORT_COLORS.axisY, VIEWPORT_COLORS.axisZ]} labelColor="#ffffff" />
          </GizmoHelper>
        </Canvas>
      </div>
    </ViewportGuard>
  );
}
