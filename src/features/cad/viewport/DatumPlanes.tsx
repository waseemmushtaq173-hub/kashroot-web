'use client';

import { Line, useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';
import { DoubleSide, Matrix4, Quaternion, Vector3 } from 'three';

import { DATUM_PLANES, DATUM_PLANE_SIZE_MM, planeYAxis, type DatumPlane } from '@/features/cad/datums';
import { useCad, useCadStoreApi } from '@/features/cad/state/CadStoreProvider';
import { CLICK_TOLERANCE_PX, VIEWPORT_COLORS } from '@/features/cad/viewport/theme';

const HALF = DATUM_PLANE_SIZE_MM / 2;
const OUTLINE: [number, number, number][] = [
  [-HALF, -HALF, 0],
  [HALF, -HALF, 0],
  [HALF, HALF, 0],
  [-HALF, HALF, 0],
  [-HALF, -HALF, 0],
];

/** Turns a plane drawn in local XY (normal +Z) to the datum's X axis, Y axis and normal. */
function planeQuaternion(plane: DatumPlane): Quaternion {
  const basis = new Matrix4().makeBasis(
    new Vector3(...plane.xAxis),
    new Vector3(...planeYAxis(plane)),
    new Vector3(...plane.normal),
  );
  return new Quaternion().setFromRotationMatrix(basis);
}

function DatumPlaneMesh({ plane }: { plane: DatumPlane }) {
  const api = useCadStoreApi();
  const selected = useCad((s) => s.selection?.kind === 'datum' && s.selection.id === plane.id);
  const hovered = useCad((s) => s.hover?.kind === 'datum' && s.hover.id === plane.id);
  const quaternion = useMemo(() => planeQuaternion(plane), [plane]);

  const color = selected ? VIEWPORT_COLORS.datumSelected : hovered ? VIEWPORT_COLORS.datumHover : VIEWPORT_COLORS.datum;
  const fillOpacity = selected ? 0.2 : hovered ? 0.14 : 0.05;
  const lineOpacity = selected || hovered ? 1 : 0.55;

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    api.getState().setHover({ kind: 'datum', id: plane.id });
  };
  const onOut = () => {
    const { hover, setHover } = api.getState();
    if (hover?.kind === 'datum' && hover.id === plane.id) setHover(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_TOLERANCE_PX) return;
    api.getState().select({ kind: 'datum', id: plane.id });
  };

  return (
    <group quaternion={quaternion} name={plane.id}>
      <mesh onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} renderOrder={1}>
        <planeGeometry args={[DATUM_PLANE_SIZE_MM, DATUM_PLANE_SIZE_MM]} />
        <meshBasicMaterial color={color} transparent opacity={fillOpacity} side={DoubleSide} depthWrite={false} />
      </mesh>
      <Line points={OUTLINE} color={color} lineWidth={selected ? 2.2 : 1.2} transparent opacity={lineOpacity} />
    </group>
  );
}

/** The XY, XZ and YZ construction planes. Hidden planes are not drawn, so they cannot be picked. */
export function DatumPlanes() {
  const visible = useCad((s) => s.datumVisible);
  const anyHovered = useCad((s) => s.hover !== null);
  useCursor(anyHovered, 'pointer', 'auto');
  return (
    <group>
      {DATUM_PLANES.filter((p) => visible[p.id]).map((p) => (
        <DatumPlaneMesh key={p.id} plane={p} />
      ))}
    </group>
  );
}
