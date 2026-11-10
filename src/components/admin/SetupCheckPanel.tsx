'use client';

/**
 * Admin → Setup check: one row per database setup file (kr_setup_status),
 * "Done" or "Not run". When an owner or farmer sees "This part of KashRoot is
 * still being set up", this says which file is missing and how to run it.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, DatabaseZap, Info, Loader2, Mail, XCircle } from 'lucide-react';

import { RefreshBtn } from '@/components/admin/RefreshBtn';
import { PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { checkMode, humanCheckOn, useHumanCheck } from '@/components/security/HumanCheck';
import { authFetch } from '@/lib/auth-fetch';
import { setupStatus, type SetupStep } from '@/lib/db/setup';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

const HOW_TO_RUN = 'In Supabase open SQL Editor → New query, paste the whole file supabase/RUN_THIS_ONCE.sql from the KashRoot code, and press Run. It is safe to run again: it only adds what is missing. Then press Refresh here.';

export function SetupCheckPanel() {
  const [steps, setSteps] = useState<SetupStep[] | 'not-installed' | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSteps(await setupStatus());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check the database setup.');
    }
  }, []);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  const missing = Array.isArray(steps) ? steps.filter((s) => !s.done) : [];

  return (
    <Panel theme={theme} title="Setup check" icon={DatabaseZap} className="lg:col-span-2" action={<RefreshBtn onRefresh={load} />}>
      {error ? (
        <p role="alert" className="text-sm text-rose-800">{error}</p>
      ) : steps === undefined ? (
        <p className="text-sm text-slate-600">Checking…</p>
      ) : steps === 'not-installed' ? (
        <div role="alert" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <p className="font-semibold">The database has not had the latest setup yet, so this check cannot run.</p>
          <p>{HOW_TO_RUN}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {missing.length ? (
            <div role="alert" className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
              <p className="font-semibold">
                {missing.length === 1 ? '1 setup step has' : `${missing.length} setup steps have`} not been run: {missing.map((s) => s.part).join(', ')}.
              </p>
              <p>Until then people see “This part of KashRoot is still being set up” there. {HOW_TO_RUN}</p>
            </div>
          ) : (
            <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
              Everything is set up. If the site still says a part is being set up, wait a minute (Supabase reloads its list of tables) and try again.
            </p>
          )}
          <ol className="divide-y divide-slate-200 rounded-xl text-sm ring-1 ring-slate-200">
            {steps.map((s) => (
              <li key={s.step} className={`grid grid-cols-[1.5rem_1fr] items-start gap-2 px-3 py-2 ${s.done ? '' : 'bg-amber-50'}`}>
                {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" aria-label="Done" /> : <XCircle className="mt-0.5 h-4 w-4 text-amber-700" aria-label="Not run" />}
                <span className="min-w-0">
                  <span className={`font-semibold ${s.done ? 'text-slate-900' : 'text-amber-900'}`}>{s.part}</span>
                  <span className="text-slate-600"> — {s.done ? 'done' : 'not run'}</span>
                  <span className="block break-all text-xs text-slate-500">{s.file}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <OptionalServices />
    </Panel>
  );
}

/**
 * Services outside the database, read from the server (no secrets returned):
 * what is on, and what is an optional upgrade — never shown as a failure.
 */
function OptionalServices() {
  const [state, setState] = useState<{ voice: boolean; human: boolean; server: boolean; mail: boolean; mailFrom: string | null; inbox: string } | null>(null);
  useEffect(() => {
    let live = true;
    const get = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));
    void Promise.all([get('/api/speak'), get('/api/human'), get('/api/kyc/config'), get('/api/email')]).then(([speak, human, kyc, mail]) => {
      if (live) setState({ voice: Boolean(speak.configured), human: Boolean(human.on), server: Boolean(kyc.recording), mail: Boolean(mail.configured), mailFrom: mail.from ?? null, inbox: String(mail.inbox ?? '') });
    });
    return () => {
      live = false;
    };
  }, []);
  if (!state) return null;
  const rows: { name: string; on: boolean; onText: string; offText: string; optional?: boolean }[] = [
    { name: 'Server secret (KYC_DB_SECRET)', on: state.server, onText: 'set — identity checks, shared limits, the security log and help requests work', offText: 'not set — add it in Vercel (see SECURITY.md)' },
    // The site key is built into the pages (NEXT_PUBLIC_, at deploy time); the secret is read by the server now.
    state.human === humanCheckOn
      ? { name: '“I am human” check (Google reCAPTCHA)', on: state.human, onText: 'on — both keys set; Supabase CAPTCHA may be on', offText: 'off — optional. While it is off, Supabase CAPTCHA must stay OFF too, or nobody can sign in', optional: true }
      : {
          name: '“I am human” check (Google reCAPTCHA)',
          on: false,
          onText: '',
          offText: state.human
            ? 'half set up — HCAPTCHA_SECRET_KEY is set, but NEXT_PUBLIC_HCAPTCHA_SITE_KEY is not in this deployment, so forms show no check. Keep Supabase CAPTCHA OFF; add the site key in Vercel and redeploy'
            : 'half set up — the site key is in the pages, but HCAPTCHA_SECRET_KEY is missing on the server, so codes, help requests and the assistant are not checked. Add it in Vercel and redeploy',
        },
    { name: 'Support email', on: state.mail, onText: `set — emails are sent from ${state.mailFrom}; help requests go to ${state.inbox}`, offText: 'not set — the site works, but sends no emails: add SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in Vercel and redeploy' },
    { name: 'Voice', on: state.voice, onText: 'KashRoot voice (Google neural voices)', offText: 'browser voice (optional upgrade) — answers are read by the phone’s own voice; adding GOOGLE_TTS_API_KEY in Vercel switches to KashRoot’s voice', optional: true },
  ];
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-semibold text-slate-800">Services outside the database</p>
      <ul className="divide-y divide-slate-200 rounded-xl text-sm ring-1 ring-slate-200" data-optional-services>
        {rows.map((r) => (
          <li key={r.name} className="grid grid-cols-[1.5rem_1fr] items-start gap-2 px-3 py-2">
            {r.on ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" aria-label="On" /> : r.optional ? <Info className="mt-0.5 h-4 w-4 text-sky-700" aria-label="Optional" /> : <XCircle className="mt-0.5 h-4 w-4 text-amber-700" aria-label="Missing" />}
            <span>
              <span className="font-semibold text-slate-900">{r.name}</span>
              <span className="text-slate-600"> — {r.on ? r.onText : r.offText}</span>
            </span>
          </li>
        ))}
      </ul>
      <TestEmail />
      <BotCheckTiming />
    </div>
  );
}

/**
 * "Bot check: hCaptcha OK" — a real check in this browser, timed, and its
 * token checked once by KashRoot's server with hCaptcha (/api/human
 * diagnose: success, the address it was made on — never the token).
 */
function BotCheckTiming() {
  const human = useHumanCheck('setup');
  const { token } = human;
  const [state, setState] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    const started = performance.now();
    void token()
      .then(async (t) => {
        if (!live) return;
        const secs = Math.round((performance.now() - started) / 100) / 10;
        const { mode, why } = checkMode();
        if (!t) return setState({ ok: false, text: 'Bot check: off — no site key in this deployment. Keep Supabase CAPTCHA OFF, or add NEXT_PUBLIC_HCAPTCHA_SITE_KEY in Vercel (tick Production) and redeploy.' });
        const v = (await fetch('/api/human', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ diagnose: t }) })
          .then((r) => r.json())
          .catch(() => null)) as { configured?: boolean; answered?: boolean; success?: boolean; codes?: string[]; hostname?: string; hostnameOk?: boolean } | null;
        if (!live) return;
        const key = mode === 'real' ? 'real key' : 'hCaptcha test key';
        if (v?.success && v.hostnameOk && mode === 'real') return setState({ ok: true, text: `Bot check: hCaptcha OK — token in ${secs} s, accepted by KashRoot’s server (made on ${v.hostname}). Supabase’s side: /status → Test the security check.` });
        setState({
          ok: false,
          text: !v
            ? `Bot check: token in ${secs} s (${key}), but KashRoot’s server did not answer. Reload this page.`
            : !v.configured
              ? 'Bot check: HCAPTCHA_SECRET_KEY is missing in Vercel — add it (all environments) and redeploy.'
              : !v.answered
                ? 'Bot check: hCaptcha did not answer KashRoot’s server. Reload this page.'
                : v.success
                  ? `Bot check: token accepted, ${v.hostnameOk ? `but this is a test copy (${key}; ${why})` : `but it was made on ${v.hostname || 'an unknown address'}, not KashRoot’s address`}.`
                  : `Bot check: hCaptcha refused the token (${(v.codes ?? []).join(', ') || 'no reason'}) — ${(v.codes ?? []).some((c) => /secret|sitekey/.test(c)) ? 'NEXT_PUBLIC_HCAPTCHA_SITE_KEY and HCAPTCHA_SECRET_KEY in Vercel are not from the same hCaptcha account/site' : key}.`,
        });
      })
      .catch((e: Error) => live && setState({ ok: false, text: `Bot check: no token — ${e.message}` }));
    return () => {
      live = false;
    };
  }, [token]);
  return (
    <div className="mt-3 text-sm" data-bot-check-timing>
      {human.element}
      <p className={state ? (state.ok ? 'text-emerald-800' : 'text-amber-800') : 'text-slate-600'}>{state?.text ?? 'Bot check: waiting for a token…'}</p>
    </div>
  );
}

/** "Send test email": a real email to the support inbox now, and whether it went (never the password). */
function TestEmail() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await authFetch('/api/email', { method: 'POST', body: JSON.stringify({ action: 'test' }) });
      const body = (await res.json().catch(() => ({}))) as { sent?: boolean; to?: string; reason?: string; error?: string; queue?: { waiting?: number; failed_24h?: number; sent_24h?: number } };
      const q = body.queue ? ` Queue: ${body.queue.sent_24h ?? 0} sent in 24 hours, ${body.queue.waiting ?? 0} waiting, ${body.queue.failed_24h ?? 0} given up.` : '';
      setResult(body.sent ? { ok: true, text: `Sent to ${body.to}. Check that inbox (and its spam folder).${q}` } : { ok: false, text: `Not sent: ${body.reason ?? body.error ?? 'the server did not answer'}.${q}` });
    } catch {
      setResult({ ok: false, text: 'Not sent: the server did not answer.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void send()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-chinar px-4 text-sm font-semibold text-white hover:bg-chinar-hover disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />} Send test email
      </button>
      {result && (
        <p role="status" className={`text-sm ${result.ok ? 'text-emerald-800' : 'text-amber-800'}`} data-test-email={result.ok ? 'sent' : 'failed'}>
          {result.text}
        </p>
      )}
    </div>
  );
}
