/**
 * Datum planes: the fixed construction planes every model starts with.
 *
 * Each one matches the Replicad named plane of the same name (normal and
 * X axis copied from replicad 1.2.1), so a sketch placed on "XZ plane" in a
 * later phase lands exactly where the viewport draws it. The plane's own
 * Y axis is normal × X, the right-handed convention OpenCASCADE uses.
 */
import { cross, type Vec3 } from '@/features/cad/utils/camera';

export type DatumId = 'plane-xy' | 'plane-xz' | 'plane-yz';

export interface DatumPlane {
  id: DatumId;
  name: string;
  /** What the plane usually stands for in a building. */
  role: string;
  /** Replicad's name for the same plane. */
  replicadName: 'XY' | 'XZ' | 'YZ';
  normal: Vec3;
  xAxis: Vec3;
}

export const DATUM_PLANES: readonly DatumPlane[] = [
  { id: 'plane-xy', name: 'XY plane', role: 'Floor', replicadName: 'XY', normal: [0, 0, 1], xAxis: [1, 0, 0] },
  { id: 'plane-xz', name: 'XZ plane', role: 'Front', replicadName: 'XZ', normal: [0, -1, 0], xAxis: [1, 0, 0] },
  { id: 'plane-yz', name: 'YZ plane', role: 'Side', replicadName: 'YZ', normal: [1, 0, 0], xAxis: [0, 1, 0] },
];

/** Datum planes are drawn as 2 m squares centred on the origin. */
export const DATUM_PLANE_SIZE_MM = 2000;

export function datumById(id: DatumId): DatumPlane {
  const d = DATUM_PLANES.find((p) => p.id === id);
  if (!d) throw new Error(`Unknown datum plane: ${id}`);
  return d;
}

/** The plane's in-plane Y axis: normal × X. */
export function planeYAxis(plane: Pick<DatumPlane, 'normal' | 'xAxis'>): Vec3 {
  return cross(plane.normal, plane.xAxis);
}

/** "+Z", "−Y": the axis a unit vector points along, for the properties panel. */
export function axisName(v: Vec3): string {
  const names = ['X', 'Y', 'Z'];
  const i = v.findIndex((c) => Math.abs(c) > 0.5);
  if (i === -1) return v.join(', ');
  return `${v[i] > 0 ? '+' : '−'}${names[i]}`;
}
