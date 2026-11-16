/**
 * Where the time of a slow sign-in went, in words, from what the browser itself measured for the calls the sign-in made to
 * this site's /api/supabase (the Resource Timing entries) and from the Server-Timing the sign-in proxy answers with
 * (how long its own checks and Supabase took). Shown to the person only when sign-in is slow, so they can tell KashRoot which
 * step it was. It holds no account, address or password. Pure: tested without a browser.
 */

export interface TimingEntry {
  name: string;
  /** Start to end, ms. */
  duration: number;
  /** Request sent to first byte, ms (the wait for the server). */
  waiting: number;
  /** Connection set-up (DNS, connect, TLS), ms. */
  connecting: number;
  serverTiming: { name: string; duration: number }[];
}

/** The calls of one sign-in, as a person names them. */
const STEP_NAME: [RegExp, string][] = [
  [/\/api\/supabase\/auth\/v1\/token\?grant_type=password/, 'password check'],
  [/\/api\/supabase\/rest\/v1\/staff_roles/, 'account lookup'],
  [/\/api\/supabase\/auth\/v1\/user/, 'account check'],
  [/\/api\/supabase\/auth\/v1\/factors|\/api\/supabase\/auth\/v1\/token\?grant_type=refresh_token/, 'session check'],
  [/\/api\/otp\/send/, 'sending the code'],
];
export const stepNameOf = (url: string): string | null => STEP_NAME.find(([re]) => re.test(url))?.[1] ?? null;

const secs = (ms: number) => (ms < 950 ? `${Math.max(0, Math.round(ms / 100) / 10)} s` : `${Math.round(ms / 100) / 10} s`);

/** Reads the entries into TimingEntry rows (only this site's calls that the sign-in makes). */
export function timingEntries(entries: PerformanceEntryList): TimingEntry[] {
  const out: TimingEntry[] = [];
  for (const e of entries) {
    const r = e as PerformanceResourceTiming;
    if (r.entryType !== 'resource' || !stepNameOf(r.name)) continue;
    out.push({
      name: r.name,
      duration: r.duration,
      waiting: r.responseStart > 0 && r.requestStart > 0 ? r.responseStart - r.requestStart : 0,
      connecting: r.connectEnd > 0 && r.connectStart > 0 ? r.connectEnd - r.connectStart : 0,
      serverTiming: (r.serverTiming ?? []).map((s) => ({ name: s.name, duration: s.duration })),
    });
  }
  return out;
}

/**
 * One line per step: "password check 6.1 s (connecting 0.4 s, waiting for KashRoot 5.6 s: its checks 0.2 s, Supabase 5.3 s)".
 * Empty when nothing was measured.
 */
export function describeTimings(rows: TimingEntry[]): string[] {
  return rows.map((r) => {
    const bits: string[] = [];
    if (r.connecting >= 100) bits.push(`connecting ${secs(r.connecting)}`);
    if (r.waiting >= 100) {
      const guard = r.serverTiming.find((s) => s.name === 'guard')?.duration;
      const db = r.serverTiming.find((s) => s.name === 'upstream')?.duration;
      const inner = [guard !== undefined ? `its checks ${secs(guard)}` : null, db !== undefined ? `Supabase ${secs(db)}` : null].filter(Boolean).join(', ');
      bits.push(`waiting for KashRoot ${secs(r.waiting)}${inner ? `: ${inner}` : ''}`);
    }
    const rest = r.duration - r.waiting - r.connecting;
    if (rest >= 1500) bits.push(`downloading ${secs(rest)}`);
    return `${stepNameOf(r.name)} ${secs(r.duration)}${bits.length ? ` (${bits.join(', ')})` : ''}`;
  });
}

/** What to say when the step that is running now has been running a while. */
export const STEP_NOW: Record<'password' | 'account', string> = {
  password: 'Still checking your password…',
  account: 'Still loading your account…',
};
