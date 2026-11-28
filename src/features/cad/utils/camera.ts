/**
 * Camera maths for the viewport, kept free of three.js so it can be tested
 * on its own.
 *
 * The world is Z-up, like OpenCASCADE: the XY plane is the floor and +Z
 * points at the roof. Lengths are millimetres, so one scene unit is 1 mm.
 */

export type Vec3 = readonly [number, number, number];

export type ViewPreset = 'iso' | 'top' | 'front' | 'right';

export const WORLD_UP: Vec3 = [0, 0, 1];

export function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function normalize(v: Vec3): Vec3 {
  const l = length(v);
  if (l === 0) throw new Error('Cannot normalise a zero-length vector.');
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Unit vector from the target towards the camera for each standard view.
 * Top is tipped 0.001 towards -Y: it keeps +Y pointing up the screen and keeps
 * the orbit controls off the pole, where their rotation is undefined.
 */
export const VIEW_DIRECTIONS: Record<ViewPreset, Vec3> = {
  iso: normalize([1, -1, 1]),
  top: normalize([0, -1e-3, 1]),
  front: [0, -1, 0],
  right: [1, 0, 0],
};

export const VIEW_LABELS: Record<ViewPreset, string> = {
  iso: 'Isometric',
  top: 'Top',
  front: 'Front',
  right: 'Right',
};

export interface BoundingSphere {
  center: Vec3;
  radius: number;
}

/** What "fit" frames when the model is empty: a 3 m area round the origin. */
export const EMPTY_SCENE_BOUNDS: BoundingSphere = { center: [0, 0, 0], radius: 1500 };

/**
 * How far the camera must stand from a sphere's centre so the whole sphere
 * fits in view, whichever of the vertical or horizontal field of view is
 * narrower. `margin` leaves a little room round the edges.
 */
export function fitDistance(radius: number, verticalFovDeg: number, aspect: number, margin = 1.15): number {
  const r = Math.max(radius, 1);
  const vertical = (verticalFovDeg * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 1e-3));
  const half = Math.min(vertical, horizontal) / 2;
  return (r * margin) / Math.sin(half);
}

export interface CameraPlacement {
  position: Vec3;
  target: Vec3;
}

export function fitView(bounds: BoundingSphere, direction: Vec3, verticalFovDeg: number, aspect: number): CameraPlacement {
  const d = normalize(direction);
  const distance = fitDistance(bounds.radius, verticalFovDeg, aspect);
  const [cx, cy, cz] = bounds.center;
  return { position: [cx + d[0] * distance, cy + d[1] * distance, cz + d[2] * distance], target: bounds.center };
}

/**
 * Near and far clipping planes for a camera this far from its target. They
 * follow the zoom, so close-up work is not clipped and distant views keep
 * enough depth precision to avoid flicker.
 */
export function clippingPlanes(distance: number): { near: number; far: number } {
  const d = Math.max(distance, 1);
  const near = Math.min(Math.max(d / 2000, 0.05), 50);
  const far = Math.max(d * 40, 200_000);
  return { near, far };
}
