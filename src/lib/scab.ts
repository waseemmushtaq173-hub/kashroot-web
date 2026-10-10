/**
 * Apple scab infection periods from hourly weather (shared by the server
 * route and the page). A "wet" hour is one with rain or relative humidity of
 * 90 % or more — the usual stand-in when there is no leaf-wetness sensor.
 * Wet spells interrupted by up to two dry hours count as one.
 *
 * Hours of leaf wetness needed for infection at a mean temperature follow
 * the Mills table (light infection); moderate needs about a third more,
 * severe about twice as long.
 */
export interface Hour {
  time: string;
  temp: number;
  rh: number;
  rain: number;
}

export interface WetSpell {
  start: string;
  end: string;
  /** Wet hours in the spell. */
  hours: number;
  meanTemp: number;
  rainMm: number;
  /** Already happened (true) or forecast (false). */
  past: boolean;
}

export type ScabLevel = 'none' | 'watch' | 'light' | 'moderate' | 'severe';

/** Leaf-wetness hours for a light scab infection at a mean temperature (°C). */
export function millsHours(t: number): number {
  if (t < 1) return 48;
  if (t < 4) return 30;
  if (t < 6) return 20;
  if (t < 8) return 15;
  if (t < 10) return 13;
  if (t < 12) return 11;
  if (t < 16) return 9;
  if (t < 24) return 9 + (t - 16) * 0.35;
  return 14;
}

export const isWet = (h: Hour) => h.rain >= 0.1 || h.rh >= 90;

export function wetSpells(hours: Hour[], now: string): WetSpell[] {
  const spells: WetSpell[] = [];
  let cur: Hour[] = [];
  let gap = 0;
  const close = () => {
    const wet = cur.filter(isWet);
    if (wet.length >= 2) {
      spells.push({
        start: wet[0].time,
        end: wet[wet.length - 1].time,
        hours: wet.length,
        meanTemp: Math.round((wet.reduce((s, h) => s + h.temp, 0) / wet.length) * 10) / 10,
        rainMm: Math.round(cur.reduce((s, h) => s + h.rain, 0) * 10) / 10,
        past: wet[0].time <= now,
      });
    }
    cur = [];
    gap = 0;
  };
  for (const h of hours) {
    if (isWet(h)) {
      cur.push(h);
      gap = 0;
    } else if (cur.length) {
      gap++;
      if (gap > 2) close();
      else cur.push(h);
    }
  }
  close();
  return spells;
}

export function scabLevel(hours: number, meanTemp: number): ScabLevel {
  const need = millsHours(meanTemp);
  if (meanTemp < 1 || hours < need * 0.75) return 'none';
  if (hours < need) return 'watch';
  if (hours < need * 1.33) return 'light';
  if (hours < need * 2) return 'moderate';
  return 'severe';
}

export const LEVEL_RANK: Record<ScabLevel, number> = { none: 0, watch: 1, light: 2, moderate: 3, severe: 4 };
