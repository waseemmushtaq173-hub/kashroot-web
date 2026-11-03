'use client';

/**
 * The security gate: the "I am human" check runs FIRST, and the form inside
 * shows only once it has passed (lib/server/gate). Most people see a short
 * "Checking you're human…" and pass in a second or two; if Cloudflare is
 * unsure, its tap box shows here. The gate's token goes to KashRoot's server
 * (/api/gate), which checks it with Cloudflare and gives this browser the
 * kr_gate cookie for 30 minutes — the Supabase proxy refuses sign-in,
 * sign-up, reset and code emails without it. The form then gets its OWN
 * fresh token for Supabase: `onPass` is where it starts its check.
 *
 * Already passed in this browser (cookie still valid) or the check is off:
 * the form shows at once. Failures retry by themselves (components/security/
 * HumanCheck), then explain the reason with a Retry button — never a dead
 * page. When it passes, the first field gets the focus.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, RotateCcw, ShieldCheck } from 'lucide-react';

import { HumanCheckError, useHumanCheck } from '@/components/security/HumanCheck';
import { rememberedLang } from '@/lib/langDetect';

/** "Checking you're human…" in the person's language (Kashmiri readers get the Urdu wording). */
const TEXT = {
  en: { title: 'Checking you’re human…', why: 'One moment — this keeps bots and fake accounts out of KashRoot.', dir: undefined },
  hi: { title: 'जाँच हो रही है कि आप इंसान हैं…', why: 'बस एक पल — इससे बॉट और नकली खाते KashRoot से दूर रहते हैं।', dir: undefined },
  ur: { title: 'تصدیق ہو رہی ہے کہ آپ انسان ہیں…', why: 'بس ایک لمحہ — اس سے بوٹ اور جعلی اکاؤنٹ KashRoot سے دور رہتے ہیں۔', dir: 'rtl' as const },
};

type State = 'asking' | 'gate' | 'passed';

export function SecurityGate({ place, onPass, children }: { place: string; onPass?: () => void; children: ReactNode }) {
  const [state, setState] = useState<State>('asking');
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const passedOnce = useRef(false);
  const human = useHumanCheck(`gate-${place}`, { lazy: true });
  const { token, used } = human;
  const [lang] = useState<'en' | 'hi' | 'ur'>(() => {
    const l = rememberedLang();
    return l === 'hi' ? 'hi' : l === 'ur' || l === 'ks' ? 'ur' : 'en';
  });
  const t = TEXT[lang];

  // Already passed in this browser in the last 30 minutes, or the check is off: straight to the form.
  useEffect(() => {
    let live = true;
    void fetch('/api/gate', { cache: 'no-store' })
      .then((r) => r.json())
      .then((g: { on?: boolean; passed?: boolean }) => live && setState(g.passed || g.on === false ? 'passed' : 'gate'))
      .catch(() => live && setState('gate'));
    return () => {
      live = false;
    };
  }, []);

  // The gate: a token, checked by KashRoot's server, which sets the gate cookie.
  useEffect(() => {
    if (state !== 'gate') return;
    let live = true;
    void (async () => {
      try {
        const tok = await token();
        const res = await fetch('/api/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok, place }) });
        used();
        if (!live) return;
        if (res.ok) return setState('passed');
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'The security check was not accepted. Please tap Retry.');
      } catch (e) {
        // The check shows its own reason and Retry; other failures say so here.
        if (live && !(e instanceof HumanCheckError)) setError(e instanceof Error ? e.message : 'The security check could not finish. Please tap Retry.');
      }
    })();
    return () => {
      live = false;
    };
  }, [state, place, round, token, used]);

  // Passed: the form starts its own check, and the first field gets the focus.
  useEffect(() => {
    if (state !== 'passed' || passedOnce.current) return;
    passedOnce.current = true;
    onPass?.();
    window.setTimeout(() => box.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([tabindex="-1"]), textarea, select')?.focus(), 50);
  }, [state, onPass]);

  if (state === 'passed') return <div ref={box}>{children}</div>;
  return (
    <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" data-security-gate={state} role="status" aria-live="polite">
      <p dir={t.dir} className="flex items-center gap-2 text-base font-semibold text-slate-900">
        {error ? <ShieldCheck className="h-5 w-5 shrink-0 text-amber-700" aria-hidden /> : <Loader2 className="h-5 w-5 shrink-0 animate-spin text-emerald-700" aria-hidden />}
        {t.title}
      </p>
      <p dir={t.dir} className="mt-1 text-sm text-slate-600">{t.why}</p>
      <div className="mt-3">{human.element}</div>
      {error && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRound((n) => n + 1);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 font-semibold ring-1 ring-amber-300 hover:bg-amber-100"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Retry
          </button>
        </div>
      )}
    </div>
  );
}
