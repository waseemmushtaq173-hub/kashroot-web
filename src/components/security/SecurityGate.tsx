'use client';

/**
 * The security gate: the "I am human" check runs FIRST, and the form inside
 * shows only once it has passed (lib/server/gate). Cloudflare's box is shown
 * (appearance "always"): people see it go "Verifying…" → "Success!", or ask
 * for a tap when Cloudflare is unsure. With the Super Admin's switch "Ask
 * everyone to tap the box" on (20261114000000_gate_tap.sql), everyone also
 * presses "Tap to confirm you're human" before the token is sent. The gate's token goes to KashRoot's server
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
import { Hand, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';

import { HumanCheckError, useHumanCheck } from '@/components/security/HumanCheck';
import { rememberedLang } from '@/lib/langDetect';

/** "Checking you're human…" in the person's language (Kashmiri readers get the Urdu wording). */
const TEXT = {
  en: { title: 'Checking you’re human…', why: 'One moment — this keeps bots and fake accounts out of KashRoot.', tap: 'Tap to confirm you’re human', dir: undefined },
  hi: { title: 'जाँच हो रही है कि आप इंसान हैं…', why: 'बस एक पल — इससे बॉट और नकली खाते KashRoot से दूर रहते हैं।', tap: 'पुष्टि करने के लिए टैप करें कि आप इंसान हैं', dir: undefined },
  ur: { title: 'تصدیق ہو رہی ہے کہ آپ انسان ہیں…', why: 'بس ایک لمحہ — اس سے بوٹ اور جعلی اکاؤنٹ KashRoot سے دور رہتے ہیں۔', tap: 'تصدیق کے لیے ٹیپ کریں کہ آپ انسان ہیں', dir: 'rtl' as const },
};

type State = 'asking' | 'gate' | 'passed';

export function SecurityGate({ place, onPass, children }: { place: string; onPass?: () => void; children: ReactNode }) {
  const [state, setState] = useState<State>('asking');
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const passedOnce = useRef(false);
  const human = useHumanCheck(`gate-${place}`, { lazy: true, visible: true });
  const { token, used, wasTapped } = human;
  // The Super Admin's switch: everyone presses "Tap to confirm" too.
  const [tapNeeded, setTapNeeded] = useState(false);
  const confirmed = useRef<(() => void) | null>(null);
  const [awaitingTap, setAwaitingTap] = useState(false);
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
      .then((g: { on?: boolean; passed?: boolean; tap?: boolean }) => {
        if (!live) return;
        setTapNeeded(Boolean(g.tap));
        setState(g.passed || g.on === false ? 'passed' : 'gate');
      })
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
        if (tapNeeded) {
          // The switch is on: wait for the person's own tap before the token is sent.
          setAwaitingTap(true);
          await new Promise<void>((done) => {
            confirmed.current = done;
          });
          if (!live) return;
          setAwaitingTap(false);
        }
        const res = await fetch('/api/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok, place, tapped: wasTapped(), confirmed: tapNeeded }) });
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
  }, [state, place, round, token, used, wasTapped, tapNeeded]);

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
      {awaitingTap && (
        <button
          type="button"
          onClick={() => confirmed.current?.()}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800"
          data-gate-confirm
        >
          <Hand className="h-5 w-5" aria-hidden /> <span dir={t.dir}>{t.tap}</span>
        </button>
      )}
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
