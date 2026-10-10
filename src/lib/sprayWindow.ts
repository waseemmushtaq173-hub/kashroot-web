/**
 * Dry daylight hours left today for spraying (rain chance under 30%), from
 * an hourly forecast in local time ("2026-10-10T14:00"). Shared by the
 * Farmer portal and the assistant. Returns e.g. "13:00–17:00", or null.
 */
export function dryHours(nowIso: string, hourly: { time: string; precipitationProbability: number }[]): string | null {
  const today = nowIso.slice(0, 10);
  const nowHour = Number(nowIso.slice(11, 13));
  const hours = hourly.filter((h) => h.time.startsWith(today)).map((h) => ({ hour: Number(h.time.slice(11, 13)), p: h.precipitationProbability }));
  let best: [number, number] | null = null;
  let start: number | null = null;
  for (const { hour, p } of hours) {
    const ok = hour >= Math.max(nowHour, 6) && hour <= 19 && p < 30;
    if (ok && start === null) start = hour;
    if ((!ok || hour === 19) && start !== null) {
      const end = ok ? hour + 1 : hour;
      if (end - start >= 2 && (!best || end - start > best[1] - best[0])) best = [start, end];
      start = null;
    }
  }
  return best ? `${String(best[0]).padStart(2, '0')}:00–${String(best[1]).padStart(2, '0')}:00` : null;
}
