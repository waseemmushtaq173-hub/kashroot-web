'use client';

import { Line } from '@react-three/drei';

import { useCad } from '@/features/cad/state/CadStoreProvider';
import { VIEWPORT_COLORS } from '@/features/cad/viewport/theme';

const AXIS_LENGTH_MM = 1200;

/** X, Y and Z axes drawn from the origin. */
export function OriginAxes() {
  const show = useCad((s) => s.showAxes);
  if (!show) return null;
  return (
    <group>
      <Line points={[[0, 0, 0], [AXIS_LENGTH_MM, 0, 0]]} color={VIEWPORT_COLORS.axisX} lineWidth={2} />
      <Line points={[[0, 0, 0], [0, AXIS_LENGTH_MM, 0]]} color={VIEWPORT_COLORS.axisY} lineWidth={2} />
      <Line points={[[0, 0, 0], [0, 0, AXIS_LENGTH_MM]]} color={VIEWPORT_COLORS.axisZ} lineWidth={2} />
    </group>
  );
}
