'use client';

/**
 * "Are you a person?" — Cloudflare Turnstile, to keep bots and scripts from
 * signing in by the thousand, making accounts, sending codes or flooding the
 * help desk. The token it gives is checked by Supabase (sign-in, sign-up,
 * password reset — CAPTCHA switched on in Supabase with the same keys) or by
 * KashRoot's server (lib/server/humanCheck). Each token works once: forms
 * change `resetKey` after using one, and an expired one is refreshed.
 *
 * Always visible while it is on, so a form never says "complete the check"
 * with no check in sight: Cloudflare's box shows "Verifying…" then
 * "Success!", or asks for a tick. When it cannot load (Brave Shields, an ad
 * blocker, no network) or fails, it says so in words, with a Retry button.
 *
 * Off — renders nothing, and forms work as before — until
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set (with TURNSTILE_SECRET_KEY on the
 * server). The widget is registered for the live address only, so anywhere
 * else (Vercel preview copies, this computer) Cloudflare's always-passing
 * test key is used: the form works, but a Supabase with CAPTCHA on refuses
 * its token (testKeyHere()).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, ShieldAlert } from 'lucide-react';

import { SITE_URL } from '@/lib/site';

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';
/** Is the check switched on (forms wait for its token)? */
export const humanCheckOn = Boolean(TURNSTILE_SITE_KEY);
/** Cloudflare's test site key: always passes, on any address. */
const TEST_SITE_KEY = '1x00000000000000000000AA';

/** True on an address the real widget is not registered for (a preview copy, localhost). */
export function testKeyHere(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.host !== new URL(SITE_URL).host;
}

interface Turnstile {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<Turnstile | null> | null = null;
/** Cloudflare's script, once; null when it is blocked or does not arrive within 15 s. */
function loadTurnstile(): Promise<Turnstile | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve) => {
    const give = (t: Turnstile | null) => {
      if (!t) loading = null; // a later Retry tries again
      resolve(t);
    };
    document.querySelectorAll(`script[src="${SCRIPT}"]`).forEach((old) => old.remove());
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => give(window.turnstile ?? null);
    s.onerror = () => give(null);
    window.setTimeout(() => give(window.turnstile ?? null), 15_000);
    document.head.appendChild(s);
  });
  return loading;
}

type State = 'loading' | 'shown' | 'passed' | 'blocked' | 'failed';

/**
 * The check itself. `onToken` gets a fresh token (or null when it expired or
 * failed). Change `resetKey` after a token was used: tokens work once.
 */
export function HumanCheck({ onToken, resetKey = 0, action }: { onToken: (token: string | null) => void; resetKey?: number; action?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const tokenTo = useRef(onToken);
  const [state, setState] = useState<State>('loading');
  const [code, setCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    tokenTo.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!humanCheckOn) return;
    let gone = false;
    void loadTurnstile().then((t) => {
      if (gone || !box.current) return;
      if (!t) {
        setState('blocked');
        return;
      }
      setState('shown');
      id.current = t.render(box.current, {
        sitekey: testKeyHere() ? TEST_SITE_KEY : TURNSTILE_SITE_KEY,
        action,
        appearance: 'always',
        size: 'flexible',
        retry: 'auto',
        'refresh-expired': 'auto',
        'refresh-timeout': 'auto',
        callback: (token: string) => {
          setState('passed');
          setCode(null);
          tokenTo.current(token);
        },
        'expired-callback': () => {
          setState('shown');
          tokenTo.current(null);
        },
        'timeout-callback': () => tokenTo.current(null),
        'error-callback': (errorCode: string) => {
          setState('failed');
          setCode(String(errorCode ?? ''));
          tokenTo.current(null);
          return true; // handled here: shown in words below
        },
      });
    });
    return () => {
      gone = true;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, [action, attempt]);

  // A used token: ask for a fresh one.
  useEffect(() => {
    if (resetKey && id.current) {
      tokenTo.current(null);
      setState('shown');
      window.turnstile?.reset(id.current);
    }
  }, [resetKey]);

  const retry = useCallback(() => {
    tokenTo.current(null);
    setCode(null);
    if (id.current && window.turnstile) {
      setState('shown');
      window.turnstile.reset(id.current);
    } else {
      setState('loading');
      setAttempt((n) => n + 1);
    }
  }, []);

  if (!humanCheckOn) return null;
  const problem =
    state === 'blocked'
      ? 'The “I am human” check couldn’t load. Turn off Shields or ad-block for this site, or try Chrome — then press Retry.'
      : state === 'failed'
        ? code?.startsWith('1102')
          ? 'The “I am human” check is not allowed on this address. Use the official KashRoot website, then press Retry.'
          : `The “I am human” check could not finish${code ? ` (error ${code})` : ''}. Check your connection, then press Retry.`
        : null;
  return (
    <div className="w-full" data-human-check={state}>
      <div ref={box} className={state === 'blocked' ? 'hidden' : 'min-h-[65px] w-full'} />
      {state === 'loading' && (
        <p className="-mt-[65px] flex min-h-[65px] items-center gap-2 text-sm text-slate-600" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading the “I am human” check…
        </p>
      )}
      {problem && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{problem}</span>
          <button type="button" onClick={retry} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 font-semibold text-amber-950 ring-1 ring-amber-300 hover:bg-amber-100">
            <RotateCcw className="h-4 w-4" aria-hidden /> Retry
          </button>
        </div>
      )}
    </div>
  );
}

/** What to say when a token was refused (by Supabase or KashRoot's server) — the check is on screen, refreshed. */
export function humanRefusedText(): string {
  if (testKeyHere()) return `Signing in is switched off on this test copy of the site by the “I am human” check. Please use ${SITE_URL}.`;
  return 'The “I am human” check was not accepted — it may have run out. It has been refreshed: wait for its tick, then try again.';
}
