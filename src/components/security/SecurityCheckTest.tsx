'use client';

/**
 * "Test the security check", on /status — for when nobody can sign in, so
 * Admin → Setup check is out of reach. In this browser, three fresh tokens
 * (each used once, never shown):
 *   1. KashRoot's server asks Cloudflare about one with TURNSTILE_SECRET_KEY:
 *      does Vercel's secret belong to the same widget as the site key?
 *   2. the same, claiming another visitor address: does Cloudflare hold a
 *      token to the visitor's own address? (Supabase checks from its servers.)
 *   3. Supabase gets one with a sign-in for a made-up email (no account):
 *      "Invalid login credentials" means its CAPTCHA passed; a CAPTCHA error
 *      gives Cloudflare's reason (e.g. a secret from another widget).
 * Then one plain verdict, with the raw codes for whoever fixes it.
 */
import { useState } from 'react';
import { Loader2, ShieldQuestion } from 'lucide-react';

import { checkMode, useHumanCheck } from '@/components/security/HumanCheck';
import { supabase } from '@/lib/supabase';

interface ServerVerdict {
  configured: boolean;
  answered: boolean;
  success?: boolean;
  codes?: string[];
  hostname?: string;
  hostnameOk?: boolean;
}
interface Result {
  took: number;
  mode: string;
  server: ServerVerdict | null;
  otherAddress: ServerVerdict | null;
  supabase: string;
  verdict: string;
  ok: boolean;
}

async function askServer(token: string, otherAddress: boolean): Promise<ServerVerdict | null> {
  const res = await fetch('/api/human', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ diagnose: token, otherAddress }) });
  return res.ok ? ((await res.json()) as ServerVerdict) : null;
}

function verdictOf(server: ServerVerdict | null, other: ServerVerdict | null, supa: string): { text: string; ok: boolean } {
  const supaPassed = /invalid login credentials/i.test(supa);
  const supaReason = supa.match(/\(([\w-]+)\)/)?.[1] ?? '';
  if (server && !server.configured) return { ok: false, text: 'TURNSTILE_SECRET_KEY is missing in Vercel: add it (Settings → Environment Variables), then redeploy.' };
  if (server?.codes?.includes('invalid-input-secret')) return { ok: false, text: 'Vercel’s TURNSTILE_SECRET_KEY is not a valid Turnstile secret. Copy the Secret Key from Cloudflare → Turnstile → KashRoot → Settings into Vercel, then redeploy.' };
  if (server && server.success === false && server.codes?.includes('invalid-input-response'))
    return { ok: false, text: 'Cloudflare does not accept this widget’s tokens with Vercel’s secret: the site key (NEXT_PUBLIC_TURNSTILE_SITE_KEY) and TURNSTILE_SECRET_KEY come from different widgets. Copy BOTH from the same widget in Cloudflare → Turnstile → KashRoot → Settings into Vercel, then redeploy.' };
  if (server?.success && server.hostnameOk === false) return { ok: false, text: `The token was made on ${server.hostname}, which is not KashRoot’s address. Open https://kashroot-web.vercel.app and test again.` };
  if (supaPassed && server?.success) return { ok: true, text: 'All good: the site key, Vercel’s secret and Supabase’s secret all belong to the same widget. Sign-in with the security check works.' };
  if (server?.success && supaReason === 'invalid-input-response')
    return {
      ok: false,
      text: `Vercel’s secret is right, but Supabase’s CAPTCHA secret belongs to a different widget${other?.success ? ' (and the visitor’s address is not the reason)' : ''}. In Supabase → Authentication → Attack Protection, paste the Secret Key from Cloudflare → Turnstile → KashRoot → Settings — the same one as Vercel’s TURNSTILE_SECRET_KEY — and Save.`,
    };
  if (supaReason === 'invalid-input-secret') return { ok: false, text: 'Supabase’s CAPTCHA secret is not a valid Turnstile secret. Paste the Secret Key from Cloudflare → Turnstile → KashRoot → Settings into Supabase → Authentication → Attack Protection, and Save.' };
  if (supaReason === 'timeout-or-duplicate') return { ok: false, text: 'Supabase saw this token as already used or too old. That points to KashRoot sending a token twice — report this result.' };
  if (/no captcha_token/i.test(supa)) return { ok: false, text: 'Supabase got no token: the site key is missing from this build. Add NEXT_PUBLIC_TURNSTILE_SITE_KEY in Vercel (tick Production) and redeploy.' };
  if (supaPassed && !server?.success) return { ok: false, text: 'Supabase accepts the security check, but KashRoot’s server does not: Vercel’s TURNSTILE_SECRET_KEY is from a different widget. Copy the Secret Key from Cloudflare → Turnstile → KashRoot → Settings into Vercel, then redeploy.' };
  if (!/captcha/i.test(supa) && !supaPassed) return { ok: false, text: `Supabase answered something else: “${supa}”. Is CAPTCHA switched on in Supabase → Authentication → Attack Protection?` };
  return { ok: false, text: 'The parts do not agree; the codes below say how.' };
}

export function SecurityCheckTest() {
  const human = useHumanCheck('diagnose');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const started = performance.now();
    try {
      const t1 = await human.token();
      const took = Math.round((performance.now() - started) / 100) / 10;
      if (!t1) throw new Error('The security check is switched off on this site (no site key), so there is nothing to test.');
      human.used();
      const server = await askServer(t1, false);
      const t2 = await human.token();
      human.used();
      const otherAddress = t2 ? await askServer(t2, true) : null;
      const t3 = await human.token();
      human.used();
      const { error: err } = await supabase.auth.signInWithPassword({ email: 'kr-security-check@example.invalid', password: `check-${Date.now()}-x`, options: { captchaToken: t3 } });
      const supa = err ? `${err.status ?? ''} ${err.message}`.trim() : 'signed in (unexpected)';
      const v = verdictOf(server, otherAddress, supa);
      setResult({ took, mode: checkMode().why, server, otherAddress, supabase: supa, verdict: v.text, ok: v.ok });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The test could not finish.');
    } finally {
      setBusy(false);
    }
  };

  const fmt = (v: ServerVerdict | null) => (!v ? 'no answer' : !v.configured ? 'no secret on the server' : !v.answered ? 'Cloudflare did not answer' : `${v.success ? 'success' : 'refused'}${v.codes?.length ? ` (${v.codes.join(', ')})` : ''}${v.hostname ? `, made on ${v.hostname}` : ''}`);

  return (
    <section aria-labelledby="sct-title" className="mt-10 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10">
      <h2 id="sct-title" className="flex items-center gap-2 text-xl font-bold">
        <ShieldQuestion className="h-5 w-5" aria-hidden /> Test the security check
      </h2>
      <p className="mt-2 text-sm text-white/70">If nobody can sign in because of the “I am human” check, this finds out why — in this browser, with fresh checks that are used once and never shown. It makes no account.</p>
      <div className="mt-3 rounded-xl bg-white p-2 empty:hidden">{human.element}</div>
      <button type="button" onClick={() => void run()} disabled={busy} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {busy ? (human.waiting ? 'Checking you’re human…' : 'Testing…') : 'Run the test'}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
      {result && (
        <div className="mt-4 space-y-2 text-sm" data-security-check-result={result.ok ? 'ok' : 'problem'}>
          <p className={`rounded-xl p-3 font-semibold ${result.ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-100'}`}>{result.verdict}</p>
          <ul className="space-y-1 text-white/80">
            <li>Token received in {result.took} s — {result.mode}</li>
            <li>KashRoot’s server (Vercel secret): {fmt(result.server)}</li>
            <li>Same, from another address: {fmt(result.otherAddress)}</li>
            <li>Supabase: {result.supabase}</li>
          </ul>
        </div>
      )}
    </section>
  );
}
