'use client';

/**
 * "Are you a person?" — Cloudflare Turnstile, to keep bots and scripts from
 * signing in by the thousand, making accounts, sending codes or flooding the
 * help desk. Usually invisible: Cloudflare decides from the browser, and only
 * a doubtful one is asked to tick a box. The token it gives is checked by
 * Supabase (sign-in, sign-up, password reset — CAPTCHA switched on in Supabase
 * with the same keys) or by KashRoot's server (lib/server/humanCheck).
 *
 * Off — renders nothing, and forms work as before — until
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set (with TURNSTILE_SECRET_KEY on the server).
 */
import { useEffect, useRef } from 'react';

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || '';
/** Is the check switched on (forms wait for its token)? */
export const humanCheckOn = Boolean(TURNSTILE_SITE_KEY);

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

let loading: Promise<Turnstile | null> | null = null;
function loadTurnstile(): Promise<Turnstile | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve(window.turnstile ?? null);
    s.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * The check itself. `onToken` gets a fresh token (or null when it expired or
 * failed). Change `resetKey` after a token was used: tokens work once.
 */
export function HumanCheck({ onToken, resetKey = 0, action }: { onToken: (token: string | null) => void; resetKey?: number; action?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const tokenTo = useRef(onToken);
  useEffect(() => {
    tokenTo.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!humanCheckOn) return;
    let gone = false;
    void loadTurnstile().then((t) => {
      if (gone || !t || !box.current) return;
      id.current = t.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        appearance: 'interaction-only',
        size: 'flexible',
        callback: (token: string) => tokenTo.current(token),
        'expired-callback': () => tokenTo.current(null),
        'error-callback': () => tokenTo.current(null),
      });
    });
    return () => {
      gone = true;
      if (id.current) window.turnstile?.remove(id.current);
      id.current = null;
    };
  }, [action]);

  // A used token: ask for a fresh one.
  useEffect(() => {
    if (resetKey && id.current) {
      tokenTo.current(null);
      window.turnstile?.reset(id.current);
    }
  }, [resetKey]);

  if (!humanCheckOn) return null;
  return <div ref={box} className="min-h-0 w-full" data-human-check />;
}
