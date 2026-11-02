'use client';

/**
 * Two cheap traps for form-filling bots, on sign-in, sign-up, password reset
 * and help requests:
 *   - a honeypot: a field people never see or reach (off-screen, out of the
 *     tab order, hidden from screen readers) that bots fill in;
 *   - a minimum fill time: a person needs a moment between the page opening
 *     and pressing the button (short on sign-in, where a password manager
 *     fills everything at once).
 * check() says 'ok', 'trap' or 'fast'. A trap is reported (the code only,
 * Admin → Security) and gets a plain "could not send"; "fast" asks to check
 * and press again — the next press passes. Help requests are checked again
 * on the server (app/api/support); sign-in, sign-up and reset go straight to
 * Supabase, where Turnstile and the sign-in limits stand behind this.
 */
import { useCallback, useEffect, useRef } from 'react';

export type GuardResult = 'ok' | 'trap' | 'fast';

export function useFormGuard(minMs: number, action: string) {
  const opened = useRef(0);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    opened.current = Date.now();
  }, []);

  /** Milliseconds since the form opened (sent with help requests, for the server's own check). */
  const elapsed = useCallback(() => (opened.current ? Date.now() - opened.current : 0), []);
  /** What the trap's field holds (sent with help requests). */
  const trapValue = useCallback(() => field.current?.value ?? '', []);

  const check = useCallback((): GuardResult => {
    const result: GuardResult = trapValue() ? 'trap' : elapsed() < minMs ? 'fast' : 'ok';
    if (result === 'trap') {
      void fetch('/api/human', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: 'honeypot', action, host: window.location.hostname }), keepalive: true }).catch(() => undefined);
    }
    return result;
  }, [action, elapsed, minMs, trapValue]);

  const trap = (
    <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
      <label>
        Leave this empty
        <input ref={field} type="text" name="kr_website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );

  return { trap, check, elapsed, trapValue };
}

/** The words for each result. */
export const GUARD_TEXT: Record<Exclude<GuardResult, 'ok'>, string> = {
  trap: 'Could not send this. Please reload the page and try again.',
  fast: 'That was very quick — please check the details, then press the button again.',
};
