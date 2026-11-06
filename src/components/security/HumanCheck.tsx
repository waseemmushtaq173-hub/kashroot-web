'use client';

/**
 * "Are you a person?" — hCaptcha, run quietly (its invisible mode), so
 * sign-in works with Supabase's CAPTCHA on and nobody has to do anything
 * unless hCaptcha really needs a tap.
 *
 *   const human = useHumanCheck('signin');
 *   …{human.element}…                      // where a problem (or the simpler checkbox) shows
 *   const captchaToken = await human.token(); // undefined when the check is off
 *   …send it… then human.used();             // tokens work once: the next token() fetches a fresh one
 *
 * The security gate (visible) asks hCaptcha as the page opens; a form asks
 * at the moment it is sent (token(), which reads the widget's own answer —
 * hcaptcha.getResponse — or runs hcaptcha.execute and waits up to 8 s; the
 * button says "Checking you're human…"). When hCaptcha wants a tap it opens
 * its puzzle over the page ("open-callback"): a small line says so and the
 * wait lasts until the person answers — no error meanwhile. Closing the
 * puzzle is not an error either: it says how to bring it back. A network or
 * script error is retried 3 times (2, 5 and 10 s apart) and logged on the
 * server (the code only) — the security gate says "trying again (1 of 3)",
 * without a spinner; then a plain message, what to try in this browser
 * (Shields, VPN, extensions, "Open in Chrome"…) and a Retry button that draws
 * a brand-new widget. After 2 failures, a simpler way: hCaptcha's own
 * "I am human" checkbox. Tokens last 120 s and work once: after use or
 * expiry the widget is reset, and the next token() runs it again. Submit
 * buttons never wait on the check: they stay pressable and say what is
 * happening.
 *
 * Which key (checkMode()):
 *   - the real site: the address is kashroot-web.vercel.app, the site's own
 *     address (NEXT_PUBLIC_SITE_URL), or one listed in NEXT_PUBLIC_SITE_HOSTS
 *     (comma-separated, for custom domains) — or Vercel says this is the
 *     production deployment (NEXT_PUBLIC_VERCEL_ENV, the browser's copy of
 *     VERCEL_ENV). It always uses NEXT_PUBLIC_HCAPTCHA_SITE_KEY, never the
 *     test key; if that key is missing from the build, sign-in says it is
 *     unavailable and Admin → Setup check says why.
 *   - anywhere else (Vercel preview copies, this computer): hCaptcha's
 *     always-passing test key; Supabase with CAPTCHA on refuses its tokens,
 *     and the form says this is a test copy.
 *   - no site key and not the real site: no check at all.
 * The choice and its reason are written to the browser console once.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';

import { SITE_URL } from '@/lib/site';


export const HCAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim() || '';
/** Is the check switched on? */
export const humanCheckOn = Boolean(HCAPTCHA_SITE_KEY);
/** hCaptcha's public test site key: always passes, on any address. Never used on the real site. */
export const TEST_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001';
const WAIT_MS = 8_000;
/** Seconds between the automatic tries after a failure. */
const BACKOFF_MS = [2_000, 5_000, 10_000];

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
  const mode: CheckMode = humanCheckOn ? (realSite ? 'real' : 'test') : 'off';
  if (!told) {
    told = true;
    console.info(`[KashRoot] security check (hCaptcha): ${mode === 'real' ? 'real key' : mode === 'test' ? 'hCaptcha test key' : 'off'} — ${why}.`);
  }
  return { mode, why };
}

/** True on a test copy (a preview, this computer), which uses hCaptcha's test key. */
export const testKeyHere = () => checkMode().mode === 'test';

/** The real site without its site key: sign-in cannot pass Supabase's CAPTCHA. */
const UNAVAILABLE = 'Sign-in is temporarily unavailable — please tell KashRoot through Help & support (at the top of the page).';

interface HCaptcha {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  execute: (id: string) => void;
  getResponse: (id: string) => string | undefined;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    hcaptcha?: HCaptcha;
  }
}

/** Is hCaptcha's script in? (Its file may arrive before the API inside it is ready.) */
const ready = () => (window.hcaptcha && typeof window.hcaptcha.render === 'function' ? window.hcaptcha : null);
let loading: Promise<HCaptcha | null> | null = null;
/** hCaptcha's script, once for the page (in the person's language); null when it is blocked or does not arrive in time. */
function loadHCaptcha(): Promise<HCaptcha | null> {
  const now = ready();
  if (now) return Promise.resolve(now);
  loading ??= new Promise((resolve) => {
    let done = false;
    const give = (h: HCaptcha | null) => {
      if (done) return;
      done = true;
      if (!h) loading = null; // the next try loads it again
      resolve(h);
    };
    const src = `https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off&hl=${widgetLanguage()}`;
    document.querySelectorAll('script[data-kr-hcaptcha]').forEach((old) => old.remove());
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.krHcaptcha = '';
    s.onload = () => {
      // The API can take a moment after the file has run.
      const poll = (left: number) => (ready() ? give(ready()) : left > 0 ? window.setTimeout(() => poll(left - 1), 50) : give(null));
      poll(40);
    };
    s.onerror = () => give(null);
    window.setTimeout(() => give(ready()), WAIT_MS);
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

const IN_APP = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)|Snapchat/i;

/** What to try in this very browser, most likely first (what most often stops the check there), then Retry. */
export function browserSteps(): string[] {
  if (typeof navigator === 'undefined') return [];
  const ua = navigator.userAgent;
  const iphone = /iPhone|iPad|iPod/i.test(ua);
  const chrome = /CriOS|Chrome\//i.test(ua) && !isBrave() && !/Edg\/|OPR\/|SamsungBrowser/i.test(ua);
  const steps: string[] = [];
  if (IN_APP.test(ua)) steps.push('You are in an app’s own browser (WhatsApp, Facebook, Instagram…): tap ⋮ or ··· and choose “Open in Chrome” (or Safari on iPhone).');
  else if (isBrave()) steps.push('Brave: tap the lion icon in the address bar and turn Shields off for this site.');
  else if (/Firefox|FxiOS/i.test(ua)) steps.push('Firefox: tap the shield in the address bar and turn off Enhanced Tracking Protection for this site.');
  else if (iphone) steps.push('iPhone: tap aA in the address bar → Website Settings, turn off content blockers; and turn off iCloud Private Relay for this site.');
  steps.push('Turn off any VPN, and any ad-blocking “Private DNS” (Android: Settings → Network → Private DNS → Automatic).');
  steps.push('Turn off ad-block or privacy extensions for this site, or open it in a private / incognito window.');
  steps.push(chrome ? 'Still failing: switch between Wi-Fi and mobile data, or try another browser.' : 'Still failing: open https://kashroot-web.vercel.app in Chrome.');
  return steps;
}

export interface Problem {
  /** What went wrong, in one line. */
  text: string;
  /** What to try, for this browser (none when the reason is not the browser's). */
  steps: string[];
}

/** The reason, in words, for a check that could not finish (hCaptcha's error codes and ours), and what to try. */
function problemFor(code: string): Problem {
  if (code === 'challenge-closed') return { text: 'The puzzle was closed before it was answered. Tap Retry to show it again.', steps: [] };
  if (code === 'challenge-expired') return { text: 'The puzzle ran out of time before it was answered. Tap Retry for a new one.', steps: [] };
  if (code === 'rate-limited') return { text: 'Too many checks from this network just now. Please wait a minute, then tap Retry.', steps: [] };
  if (code === 'script-blocked' || code === 'script-error') return { text: 'The security check couldn’t load — tap Retry, or turn off Brave Shields / ad-block for kashroot-web.vercel.app, or open it in Chrome.', steps: browserSteps() };
  if (code === 'network-error') return { text: 'The security check lost its connection. Check your internet, then tap Retry.', steps: browserSteps() };
  if (code === 'no-answer') return { text: 'Couldn’t confirm you’re human — hCaptcha did not answer.', steps: browserSteps() };
  if (code === 'invalid-data' || code === 'missing-captcha' || code === 'invalid-captcha-id') return { text: `The security check went wrong on this page (${code}). Please reload the page.`, steps: [] };
  return { text: `Couldn’t confirm you’re human (${code.slice(0, 30)}).`, steps: browserSteps() };
}
/** The reason and the steps in one line (an error a form shows by itself). */
const problemText = (code: string) => {
  const p = problemFor(code);
  return [p.text, ...p.steps].join(' ');
};
/** Worth trying again by itself: the network, the script, hCaptcha's own hiccups. Never what the person did. */
const RETRIED = /^(network-error|internal-error|challenge-error|script-error|script-blocked|invalid-data|no-answer|error)$/;

/** hCaptcha's puzzle in the person's language, where it has one. */
function widgetLanguage(): string {
  try {
    const l = localStorage.getItem('kr_lang') ?? document.documentElement.lang ?? '';
    return l.startsWith('hi') ? 'hi' : l.startsWith('ur') || l.startsWith('ks') ? 'ur' : 'en';
  } catch {
    return 'en';
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
  /** Where a problem (or the simpler checkbox) shows. */
  element: ReactNode;
  /** A fresh token: waits up to 8 s (longer while a puzzle is open). Undefined when the check is off. Throws with the reason when it cannot get one. */
  token: () => Promise<string | undefined>;
  /** The token was sent: the widget is reset (tokens work once); the next token() runs it again. */
  used: () => void;
  /** Load the check now (a `lazy` check: e.g. a form's own check, once the security gate has passed). */
  start: () => void;
  /** token() is waiting: the button says "Checking you're human…". */
  waiting: boolean;
  /** Seconds the first token took (Admin → Setup check). */
  took: number | null;
  /** Did hCaptcha ask for a tap (open its puzzle) before this token? */
  wasTapped: () => boolean;
  /** 'interactive': hCaptcha's puzzle is open, waiting for the person — nothing is timed out meanwhile. */
  status: Status;
  /** Start again from a fresh widget (the gate's Retry). */
  retry: () => void;
  /** Which automatic try is under way after a failure (1–3), or 0: the gate shows it, without a spinner. */
  autoTry: number;
}

/**
 * One widget for one form. `visible` (the security gate): runs as soon as it
 * is drawn. Otherwise it runs when token() is asked. `lazy`: not even loaded
 * until then (for forms shown several times on a page, e.g. a code for the
 * mobile and one for the email).
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
  /** hCaptcha opened its puzzle for this person before the current token. */
  const tapped = useRef(false);
  const failure = useRef<string | null>(null);
  /** Run the widget now (when it is drawn and not already running). */
  const run = useRef<() => void>(() => undefined);
  const renew = useRef<() => void>(() => undefined);
  const [started, setStarted] = useState(!lazy);
  const [status, setStatus] = useState<Status>('working');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [autoTry, setAutoTry] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [took, setTook] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  // Checks that ended in failure on this page; after 2, a simpler way is offered.
  const [failures, setFailures] = useState(0);
  const [simple, setSimple] = useState(false);
  // Told of every fresh token at once (the security gate sends it the moment hCaptcha passes).
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
      setProblem({ text: UNAVAILABLE, steps: [] });
      setStatus('failed');
      return;
    }
    if (mode === 'off') return;
    let gone = false;
    let tries = 0;
    let running = false;
    let timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    let begun = performance.now();

    const fail = (code: string) => {
      if (gone) return;
      clear();
      running = false;
      current.current = null;
      const afterTap = interactive.current;
      interactive.current = false;
      if (code !== 'challenge-closed') report(code, action);
      if (tries < BACKOFF_MS.length && !afterTap && RETRIED.test(code)) {
        later(again, BACKOFF_MS[tries]);
        tries += 1;
        setAutoTry(tries);
        return;
      }
      setAutoTry(0);
      failure.current = problemText(code);
      setProblem(problemFor(code));
      setStatus('failed');
      if (code !== 'challenge-closed') setFailures((n) => n + 1);
      waiters.current.splice(0).forEach((w) => w.reject(new HumanCheckError(failure.current ?? '')));
    };
    // No token and no puzzle within 8 s (20 s for the gate): counts as a failure (e.g. Shields blocking hCaptcha's frame).
    const watch = () => later(() => !current.current && !interactive.current && fail('no-answer'), visible ? 20_000 : WAIT_MS);
    const again = () => {
      if (gone) return;
      if (widget.current && window.hcaptcha) {
        try {
          window.hcaptcha.reset(widget.current);
        } catch {
          return void fail('reset-failed');
        }
        running = false;
        run.current();
      } else void start();
    };
    run.current = () => {
      if (gone || running || simple || !widget.current || !window.hcaptcha || current.current) return;
      running = true;
      begun = performance.now();
      try {
        window.hcaptcha.execute(widget.current);
      } catch {
        return void fail('error');
      }
      watch();
    };
    renew.current = () => {
      if (gone || !widget.current || !window.hcaptcha) return;
      clear();
      running = false;
      current.current = null;
      tapped.current = false;
      try {
        window.hcaptcha.reset(widget.current);
      } catch {
        /* the form (and its widget) is gone */
      }
    };

    const start = async () => {
      const h = await loadHCaptcha();
      if (gone) return;
      if (!h || !box.current) return fail('script-blocked');
      // A fresh start: nothing left over from an earlier widget in the box.
      box.current.replaceChildren();
      const holder = document.createElement('div');
      box.current.appendChild(holder);
      widget.current = h.render(holder, {
        sitekey: mode === 'test' ? TEST_SITE_KEY : HCAPTCHA_SITE_KEY,
        // Quietly, opening a puzzle only when hCaptcha needs one. The simpler way (offered after 2 failures):
        // hCaptcha's own "I am human" checkbox, tapped by the person.
        size: simple ? 'normal' : 'invisible',
        callback: (token: string) => {
          if (gone) return;
          clear();
          running = false;
          current.current = token;
          interactive.current = false;
          failure.current = null;
          tries = 0;
          setAutoTry(0);
          setProblem(null);
          setStatus('ready');
          setTook((s) => s ?? Math.round((performance.now() - begun) / 100) / 10);
          waiters.current.splice(0).forEach((w) => w.resolve(token));
          tokenListener.current?.(token);
        },
        // A token unused for 120 s: gone; the next token() runs the widget again (the gate's at once).
        'expired-callback': () => {
          current.current = null;
          running = false;
          if (visible) run.current();
        },
        'chalexpired-callback': () => fail('challenge-expired'),
        'open-callback': () => {
          // The puzzle is open, waiting for the person: no error, no Retry, nothing timed out meanwhile.
          tapped.current = true;
          interactive.current = true;
          clear();
          failure.current = null;
          setAutoTry(0);
          setProblem(null);
          setStatus('interactive');
        },
        'close-callback': () => {
          // Closed without an answer.
          if (!current.current) fail('challenge-closed');
        },
        'error-callback': (code: unknown) => fail(String(code ?? 'error')),
      });
      if (simple) {
        // The checkbox waits for the person's tap: nothing is timed out meanwhile.
        interactive.current = true;
        setStatus('interactive');
        return;
      }
      if (visible || waiters.current.length) run.current();
    };
    void start();

    return () => {
      gone = true;
      clear();
      run.current = () => undefined;
      try {
        if (widget.current) window.hcaptcha?.remove(widget.current);
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
    const live = widget.current ? window.hcaptcha?.getResponse(widget.current) : undefined;
    if (live) return live;
    if (current.current) return current.current;
    if (failure.current) throw new HumanCheckError(failure.current);
    setStarted(true);
    setWaiting(true);
    try {
      return await new Promise<string>((resolve, reject) => {
        const w: Waiter = { resolve, reject };
        waiters.current.push(w);
        run.current();
        const wait = () =>
          window.setTimeout(() => {
            if (!waiters.current.includes(w)) return;
            if (interactive.current) return void wait(); // the puzzle is open: wait for the person
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
    setAutoTry(0);
    setStatus('working');
    setRound((n) => n + 1);
  }, []);

  const element = (humanCheckOn || problem) ? (
    <div className="w-full" data-human-check={started ? status : 'idle'}>
      {status === 'interactive' && (
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          {simple ? 'Tap the “I am human” box below.' : 'One quick check: answer the hCaptcha puzzle that has opened.'}
        </p>
      )}
      {/* hCaptcha's widget lives here: empty in its quiet mode (the puzzle opens over the page), the checkbox in the simpler way. */}
      <div ref={box} className="w-full" />
      {visible && autoTry > 0 && !problem && (
        <p className="mt-2 text-sm text-slate-700" data-check-auto-try={autoTry}>
          The check didn’t finish — trying again by itself ({autoTry} of {BACKOFF_MS.length})…
        </p>
      )}
      {problem && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{problem.text}</span>
          <button type="button" onClick={retry} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 font-semibold text-amber-950 ring-1 ring-amber-300 hover:bg-amber-100">
            <RotateCcw className="h-4 w-4" aria-hidden /> Retry
          </button>
          {problem.steps.length > 0 && (
            <div className="w-full" data-check-help>
              <p className="font-semibold">What to try, then tap Retry:</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                {problem.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}
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

  return { element, token, used, start, waiting, took, wasTapped, status, retry, autoTry };
}

/** The words on a submit button while token() waits. */
export const CHECKING_HUMAN = 'Checking you’re human…';

/**
 * Supabase refused a token: its reason (e.g. "captcha protection: request
 * disallowed (invalid-input-response)") is logged for Admin → Security as
 * "browser: supabase-invalid-input-response" — the reason only, never the token.
 */
export function reportRefusal(message: string, action: string): void {
  if (typeof window === 'undefined') return;
  const reason = message.match(/\(([\w-]+)\)/)?.[1] ?? 'captcha';
  report(`supabase-${reason}`, action);
}

/** What to say when a token was refused (by Supabase or KashRoot's server) — the next try fetches a fresh one. */
export function humanRefusedText(): string {
  if (testKeyHere()) return `Signing in is switched off on this test copy of the site by the security check. Please use ${SITE_URL}.`;
  return 'The security check was not accepted — it may have run out. Please try again: a fresh check runs when you do.';
}
