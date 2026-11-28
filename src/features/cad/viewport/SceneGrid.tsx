'use client';

import { Grid } from '@react-three/drei';
import { DoubleSide } from 'three';

import { useCad } from '@/features/cad/state/CadStoreProvider';
import { majorSpacing } from '@/features/cad/utils/grid';
import { VIEWPORT_COLORS } from '@/features/cad/viewport/theme';

/**
 * The floor grid on the XY plane. Drei's grid draws in its local XZ plane,
 * so it is turned a quarter round X to lie on the Z-up floor, and set 0.5 mm
 * below it so it never flickers against the XY datum plane.
 */
export function SceneGrid() {
  const show = useCad((s) => s.showGrid);
  const cellMm = useCad((s) => s.gridMm);
  if (!show) return null;
  const sectionMm = majorSpacing(cellMm);
  return (
    <Grid
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0, -0.5]}
      cellSize={cellMm}
      sectionSize={sectionMm}
      cellThickness={0.6}
      sectionThickness={1.1}
      cellColor={VIEWPORT_COLORS.gridCell}
      sectionColor={VIEWPORT_COLORS.gridSection}
      infiniteGrid
      fadeDistance={Math.max(sectionMm * 60, 60_000)}
      fadeStrength={1.5}
      side={DoubleSide}
    />
  );
}
