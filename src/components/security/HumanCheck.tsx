'use client';

/**
 * "Are you a person?" — Cloudflare Turnstile, fetched quietly in the
 * background, so sign-in works with Supabase's CAPTCHA on and nobody has to
 * do anything unless Cloudflare really needs a tap.
 *
 *   const human = useHumanCheck('signin');
 *   …{human.element}…                      // where a tap box would appear
 *   const captchaToken = await human.token(); // undefined when the check is off
 *   …send it… then human.used();             // tokens work once: a fresh one is fetched
 *
 * The widget (appearance "interaction-only") starts as the page opens and
 * keeps a fresh token ready: a used or expired token is replaced, and one is
 * renewed before Cloudflare's 5-minute limit. token() reads it from the
 * widget itself at submit time (turnstile.getResponse) and waits up to 8 s
 * for it (the form shows "Checking you're human…"); if Cloudflare asks for a
 * tap, a small panel says so and the wait lasts until the tap. An error code
 * (110xxx, 300xxx, 600xxx…) or no answer within 8 s is retried 3 times
 * (2, 5 and 10 s apart) and logged on the server (the code only); then
 * Cloudflare's box stays on screen to tap, with a plain message and a Retry
 * button. Our own retries replace Cloudflare's ("retry: never"), so a failure
 * is never retried twice over. Submit buttons never wait on the check: they
 * stay pressable and say what is happening.
 *
 * Which key (checkMode()):
 *   - the real site: the address is kashroot-web.vercel.app, the site's own
 *     address (NEXT_PUBLIC_SITE_URL), or one listed in NEXT_PUBLIC_SITE_HOSTS
 *     (comma-separated, for custom domains) — or Vercel says this is the
 *     production deployment (NEXT_PUBLIC_VERCEL_ENV, the browser's copy of
 *     VERCEL_ENV). It always uses NEXT_PUBLIC_TURNSTILE_SITE_KEY, never the
 *     test key; if that key is missing from the build, sign-in says it is
 *     unavailable and Admin → Setup check says why.
 *   - anywhere else (Vercel preview copies, this computer): Cloudflare's
 *     always-passing test key; Supabase with CAPTCHA on refuses its tokens,
 *     and the form says this is a test copy.
 *   - no site key and not the real site: no check at all.
 * The choice and its reason are written to the browser console once.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';

import { SITE_URL } from '@/lib/site';


export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';
/** Is the check switched on? */
export const humanCheckOn = Boolean(TURNSTILE_SITE_KEY);
/** Cloudflare's test site key: always passes, on any address. Never used on the real site. */
export const TEST_SITE_KEY = '1x00000000000000000000AA';
const WAIT_MS = 8_000;
/** Seconds between the automatic tries after a failure. */
const BACKOFF_MS = [2_000, 5_000, 10_000];
/** Tokens last 300 s; a fresh one is fetched before that. */
const RENEW_MS = 240_000;

/** The real site's addresses: the live one, the site's own, and any custom domains listed. */
export const REAL_HOSTS = [
  'kashroot-web.vercel.app',
  new URL(SITE_URL).host,
  ...(process.env.NEXT_PUBLIC_SITE_HOSTS ?? '').split(','),
]
  .map((h) => h.trim().toLowerCase())
  .filter((h, i, all) => h && all.indexOf(h) === i);

export type CheckMode = 'real' | 'test' | 'missing' | 'off';
let told = false;
/** Which key this page uses, and why (see above). */
export function checkMode(): { mode: CheckMode; why: string } {
  if (typeof window === 'undefined') return { mode: humanCheckOn ? 'real' : 'off', why: 'server render' };
  const host = window.location.host.toLowerCase();
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV ?? '';
  const realSite = REAL_HOSTS.includes(host) || vercelEnv === 'production';
  const why = REAL_HOSTS.includes(host) ? `${host} is the real site` : vercelEnv === 'production' ? 'Vercel says this is the production deployment' : `${host} is not the real site (${REAL_HOSTS.join(', ')}; Vercel: ${vercelEnv || 'not on Vercel'})`;
  const mode: CheckMode = realSite ? (humanCheckOn ? 'real' : 'missing') : humanCheckOn ? 'test' : 'off';
  if (!told) {
    told = true;
    console.info(`[KashRoot] security check: ${mode === 'real' ? 'real key' : mode === 'test' ? 'Cloudflare test key' : mode === 'missing' ? 'REAL KEY MISSING from this build' : 'off'} — ${why}.`);
  }
  return { mode, why };
}

/** True on a test copy (a preview, this computer), which uses Cloudflare's test key. */
export const testKeyHere = () => checkMode().mode === 'test';

/** The real site without its site key: sign-in cannot pass Supabase's CAPTCHA. */
const UNAVAILABLE = 'Sign-in is temporarily unavailable — please tell KashRoot through Help & support (at the top of the page).';

interface Turnstile {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  getResponse: (id: string) => string | undefined;
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
/** Cloudflare's script, once for the page; null when it is blocked or does not arrive in time. */
function loadTurnstile(): Promise<Turnstile | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve) => {
    const give = (t: Turnstile | null) => {
      if (!t) loading = null; // the next try loads it again
      resolve(t);
    };
    document.querySelectorAll(`script[src="${SCRIPT}"]`).forEach((old) => old.remove());
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => give(window.turnstile ?? null);
    s.onerror = () => give(null);
    window.setTimeout(() => give(window.turnstile ?? null), WAIT_MS);
    document.head.appendChild(s);
  });
  return loading;
}

/** How many times the person pressed Retry on this page (Admin → Security counts first tries and retries apart). */
let userRetries = 0;
export const noteRetry = () => {
  userRetries += 1;
};
export const retriesSoFar = () => userRetries;

/** Brave looks exactly like Chrome to the server; only the page can tell. */
export const isBrave = () => typeof navigator !== 'undefined' && 'brave' in navigator;

/** Advice for this very browser, after the reason (what most often stops Cloudflare there). */
export function browserHelp(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)|Snapchat/i.test(ua)) return ' You are in an app’s own browser: tap ⋮ or ··· and choose “Open in Chrome” (or Safari on iPhone).';
  if (isBrave()) return ' In Brave: tap the lion icon in the address bar and turn Shields off for this site, then Retry.';
  if (/Firefox|FxiOS/i.test(ua)) return ' In Firefox: tap the shield in the address bar and turn off Enhanced Tracking Protection for this site, then Retry.';
  if (/iPhone|iPad|iPod/i.test(ua)) return ' On iPhone: turn off content blockers and iCloud Private Relay for this site (aA in the address bar → Website Settings), or open it in Chrome.';
  return ' An ad-blocker or privacy extension, or a VPN, often causes this: turn it off for this site, or open KashRoot in Chrome.';
}

/** The reason, in words, for a check that could not finish. */
function problemText(code: string): string {
  if (code.startsWith('1102')) return 'The security check is not allowed on this address. Please open https://kashroot-web.vercel.app and try again.';
  if (code === 'unsupported') return 'This browser is too old for the security check. Please open KashRoot in Chrome.';
  if (code === 'script-blocked') return 'The security check couldn’t load — tap Retry, or turn off Brave Shields / ad-block for kashroot-web.vercel.app, or open it in Chrome.';
  if (code.startsWith('300')) return `The security check failed in this browser (code ${code}).${browserHelp()}`;
  if (code.startsWith('600')) return `Cloudflare couldn’t confirm you’re human (code ${code}).${browserHelp()}`;
  if (code === 'no-answer') return `Couldn’t confirm you’re human — Cloudflare did not answer.${browserHelp()}`;
  return `Couldn’t confirm you’re human (code ${code.slice(0, 20)}).${browserHelp()}`;
}

/** Cloudflare's box in the person's language, where it has one. */
function widgetLanguage(fixed = false): string {
  // `fixed`: the simpler way names the language rather than letting Cloudflare guess.
  try {
    const l = localStorage.getItem('kr_lang') ?? document.documentElement.lang ?? '';
    return l.startsWith('hi') ? 'hi' : l.startsWith('ur') ? 'ur' : fixed ? 'en' : 'auto';
  } catch {
    return fixed ? 'en' : 'auto';
  }
}

/** The failure, logged on the server for Admin → Security: the code and the site address it happened on (nothing personal). */
function report(code: string, action: string) {
  const host = typeof window === 'undefined' ? '' : window.location.hostname;
  void fetch('/api/human', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ report: code.slice(0, 40), action, host, brave: isBrave(), retries: userRetries }), keepalive: true }).catch(() => undefined);
}

type Status = 'working' | 'ready' | 'interactive' | 'failed';

/** token() could not get a token; the check already shows why, with Retry — forms need not repeat it. */
export class HumanCheckError extends Error {}
interface Waiter {
  resolve: (token: string) => void;
  reject: (err: Error) => void;
}

export interface HumanCheck {
  /** Where Cloudflare's tap box (when needed) and any problem show. */
  element: ReactNode;
  /** A fresh token: waits up to 8 s (longer while a tap is asked for). Undefined when the check is off. Throws with the reason when it cannot get one. */
  token: () => Promise<string | undefined>;
  /** The token was sent: fetch a fresh one (tokens work once). */
  used: () => void;
  /** Start now (a `lazy` check: e.g. a form's own check, once the security gate has passed). */
  start: () => void;
  /** token() is waiting: the button says "Checking you're human…". */
  waiting: boolean;
  /** Seconds the first token took (Admin → Setup check). */
  took: number | null;
  /** Did Cloudflare ask for a tap before this token (as the browser saw it)? */
  wasTapped: () => boolean;
  /** 'interactive': Cloudflare is waiting for the person's tap — nothing is timed out meanwhile. */
  status: 'working' | 'ready' | 'interactive' | 'failed';
  /** Start again from a fresh widget (the gate's Retry). */
  retry: () => void;
}

/**
 * One widget for one form. `lazy`: start only when token() is first asked
 * (for forms shown several times on a page, e.g. a code for the mobile and
 * one for the email).
 */
export function useHumanCheck(
  action: string,
  { lazy = false, visible = false, onToken }: { lazy?: boolean; visible?: boolean; onToken?: (token: string) => void } = {},
): HumanCheck {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const current = useRef<string | null>(null);
  const waiters = useRef<Waiter[]>([]);
  const interactive = useRef(false);
  /** Cloudflare asked this person to tap (an interactive check) before the current token. */
  const tapped = useRef(false);
  const failure = useRef<string | null>(null);
  const renew = useRef<() => void>(() => undefined);
  const [started, setStarted] = useState(!lazy);
  const [status, setStatus] = useState<Status>('working');
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [took, setTook] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  // Checks that ended in failure on this page; after 2, a simpler way is offered.
  const [failures, setFailures] = useState(0);
  const [simple, setSimple] = useState(false);
  // Told of every fresh token at once (the security gate sends it the moment Cloudflare says "Success!").
  const tokenListener = useRef(onToken);
  useEffect(() => {
    tokenListener.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!started) return;
    const { mode } = checkMode();
    if (mode === 'missing') {
      failure.current = UNAVAILABLE;
      // The address is only known in the browser, so this cannot be decided while rendering.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProblem(UNAVAILABLE);
      setStatus('failed');
      return;
    }
    if (mode === 'off') return;
    let gone = false;
    let tries = 0;
    let timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    const begun = performance.now();

    const fail = (code: string) => {
      if (gone) return;
      clear();
      current.current = null;
      report(code, action);
      const afterTap = interactive.current || tapped.current;
      interactive.current = false;
      if (tries < BACKOFF_MS.length && !afterTap) {
        later(again, BACKOFF_MS[tries]);
        tries += 1;
        return;
      }
      // An address Cloudflare does not allow: the same page on the real site (never on a test copy).
      if (code.startsWith('1102') && checkMode().mode === 'real' && !REAL_HOSTS.includes(window.location.host.toLowerCase())) {
        window.location.replace(`${SITE_URL}${window.location.pathname}${window.location.search}`);
        return;
      }
      const text = problemText(code);
      failure.current = text;
      setProblem(text);
      setStatus('failed');
      setFailures((n) => n + 1);
      waiters.current.splice(0).forEach((w) => w.reject(new HumanCheckError(text)));
    };
    // No token and no tap asked for within 8 s: counts as a failure (e.g. Shields blocking Cloudflare's frame).
    // (The gate's visible box gets longer — it offers Retry itself after 8 s, without stopping Cloudflare mid-check.)
    const watch = () => later(() => !current.current && !interactive.current && fail('no-answer'), visible ? 20_000 : WAIT_MS);
    const again = () => {
      if (gone) return;
      if (widget.current && window.turnstile) {
        try {
          window.turnstile.reset(widget.current);
        } catch {
          return void fail('reset-failed');
        }
        watch();
      } else void start();
    };
    renew.current = () => {
      if (gone || !widget.current || !window.turnstile) return;
      clear();
      current.current = null;
      tapped.current = false;
      try {
        window.turnstile.reset(widget.current);
      } catch {
        return; // the form (and its widget) is gone
      }
      watch();
    };

    const start = async () => {
      const t = await loadTurnstile();
      if (gone) return;
      if (!t || !box.current) return fail('script-blocked');
      widget.current = t.render(box.current, {
        sitekey: mode === 'test' ? TEST_SITE_KEY : TURNSTILE_SITE_KEY,
        action,
        // The security gate shows Cloudflare's box ("Verifying…" → "Success!"); a form's own check stays invisible.
        // The simpler way (offered after 2 failures): always shown, normal size, its language named.
        appearance: visible || simple ? 'always' : 'interaction-only',
        size: simple ? 'normal' : 'flexible',
        language: widgetLanguage(simple),
        retry: 'never', // retried here (2, 5, 10 s), counted and logged — never twice over
        'refresh-expired': 'auto',
        'refresh-timeout': 'auto',
        callback: (token: string) => {
          if (gone) return;
          clear();
          current.current = token;
          interactive.current = false;
          failure.current = null;
          tries = 0;
          setProblem(null);
          setStatus('ready');
          setTook((s) => s ?? Math.round((performance.now() - begun) / 100) / 10);
          waiters.current.splice(0).forEach((w) => w.resolve(token));
          tokenListener.current?.(token);
          later(() => renew.current(), RENEW_MS);
        },
        'expired-callback': () => {
          current.current = null;
          watch();
        },
        'timeout-callback': () => {
          current.current = null;
          interactive.current = false;
          watch();
        },
        'before-interactive-callback': () => {
          // Waiting for the person: no error, no Retry, nothing timed out meanwhile.
          tapped.current = true;
          interactive.current = true;
          clear();
          failure.current = null;
          setProblem(null);
          setStatus('interactive');
        },
        'after-interactive-callback': () => {
          interactive.current = false;
          setStatus('working');
        },
        'unsupported-callback': () => fail('unsupported'),
        'error-callback': (code: unknown) => {
          fail(String(code ?? 'error'));
          return true; // handled here
        },
      });
      watch();
    };
    void start();

    return () => {
      gone = true;
      clear();
      try {
        if (widget.current) window.turnstile?.remove(widget.current);
      } catch {
        /* already gone with the page */
      }
      widget.current = null;
      current.current = null;
    };
  }, [action, started, round, visible, simple]);

  const token = useCallback(async (): Promise<string | undefined> => {
    if (checkMode().mode === 'off') return undefined;
    // The widget's own answer now, when it has one (never a copy from an older render).
    const live = widget.current ? window.turnstile?.getResponse(widget.current) : undefined;
    if (live) return live;
    if (current.current) return current.current;
    if (failure.current) throw new HumanCheckError(failure.current);
    setStarted(true);
    setWaiting(true);
    try {
      return await new Promise<string>((resolve, reject) => {
        const w: Waiter = { resolve, reject };
        waiters.current.push(w);
        const wait = () =>
          window.setTimeout(() => {
            if (!waiters.current.includes(w)) return;
            if (interactive.current) return void wait(); // a tap is asked for: wait for it
            waiters.current = waiters.current.filter((x) => x !== w);
            reject(failure.current ? new HumanCheckError(failure.current) : new Error(problemText('no-answer')));
          }, WAIT_MS);
        wait();
      });
    } finally {
      setWaiting(false);
    }
  }, []);

  const used = useCallback(() => renew.current(), []);
  const start = useCallback(() => setStarted(true), []);
  const wasTapped = useCallback(() => tapped.current, []);

  // A full fresh start: the old widget is removed and a new one drawn (the effect runs again).
  const retry = useCallback(() => {
    noteRetry();
    failure.current = null;
    current.current = null;
    interactive.current = false;
    tapped.current = false;
    setProblem(null);
    setStatus('working');
    setRound((n) => n + 1);
  }, []);

  const element = (humanCheckOn || problem) ? (
    <div className="w-full" data-human-check={started ? status : 'idle'}>
      {status === 'interactive' && (
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden /> One quick check: tap the box below to show you’re human.
        </p>
      )}
      {/* Cloudflare draws here; it stays empty unless a tap is needed. Never display:none — it must be able to render. */}
      <div ref={box} className="w-full" />
      {problem && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{problem}</span>
          <button type="button" onClick={retry} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 font-semibold text-amber-950 ring-1 ring-amber-300 hover:bg-amber-100">
            <RotateCcw className="h-4 w-4" aria-hidden /> Retry
          </button>
          {failures >= 2 && !simple && (
            <button
              type="button"
              onClick={() => {
                setSimple(true);
                retry();
              }}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 font-semibold text-amber-950 ring-1 ring-amber-300 hover:bg-amber-100"
              data-check-simple
            >
              Try the check again in a simpler way
            </button>
          )}
        </div>
      )}
    </div>
  ) : null;

  return { element, token, used, start, waiting, took, wasTapped, status, retry };
}

/** The words on a submit button while token() waits. */
export const CHECKING_HUMAN = 'Checking you’re human…';

/**
 * Supabase refused a token: its reason (e.g. "captcha protection: request
 * disallowed (timeout-or-duplicate)") is logged for Admin → Security as
 * "browser: supabase-timeout-or-duplicate" — the reason only, never the token.
 */
export function reportRefusal(message: string, action: string): void {
  if (typeof window === 'undefined') return;
  const reason = message.match(/\(([\w-]+)\)/)?.[1] ?? 'captcha';
  report(`supabase-${reason}`, action);
}

/** What to say when a token was refused (by Supabase or KashRoot's server) — a fresh one is being fetched. */
export function humanRefusedText(): string {
  if (testKeyHere()) return `Signing in is switched off on this test copy of the site by the security check. Please use ${SITE_URL}.`;
  return 'The security check was not accepted — it may have run out. A fresh one is ready: please try again.';
}
