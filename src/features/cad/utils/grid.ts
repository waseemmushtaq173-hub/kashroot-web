/**
 * The workspace grid: spacing limits and snapping, in millimetres.
 */
import { roundMm, type Millimetres } from '@/features/cad/types/units';

/** 100 mm minor lines and 1 m major lines suit a chamber or a warehouse bay. */
export const DEFAULT_GRID_MM: Millimetres = 100;

/** Below 1 mm the lines merge into a grey sheet; above 10 m the grid stops being useful. */
export const GRID_LIMITS = { minMm: 1, maxMm: 10_000 } as const;

/** Every tenth line is drawn heavier. */
export const MAJOR_LINE_EVERY = 10;

export function majorSpacing(minorMm: Millimetres): Millimetres {
  return minorMm * MAJOR_LINE_EVERY;
}

export function isValidGridSpacing(mm: number): boolean {
  return Number.isFinite(mm) && mm >= GRID_LIMITS.minMm && mm <= GRID_LIMITS.maxMm;
}

/** Snap one coordinate to the nearest grid line. Leaves the value alone if the step is not usable. */
export function snap(value: Millimetres, stepMm: Millimetres): Millimetres {
  if (!Number.isFinite(value)) return value;
  if (!(stepMm > 0) || !Number.isFinite(stepMm)) return roundMm(value);
  return roundMm(Math.round(value / stepMm) * stepMm);
}

export interface Point2 {
  x: Millimetres;
  y: Millimetres;
}

export function snapPoint(p: Point2, stepMm: Millimetres): Point2 {
  return { x: snap(p.x, stepMm), y: snap(p.y, stepMm) };
}
