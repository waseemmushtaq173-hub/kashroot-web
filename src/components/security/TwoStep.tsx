'use client';

/**
 * Two-step sign-in with an authenticator app (Google Authenticator,
 * Microsoft Authenticator, Authy — Supabase Auth MFA, TOTP; free on every
 * Supabase plan). Required for admins (20261111000000_admin_mfa.sql: the
 * database treats an admin session that has not passed it as no admin),
 * optional for everyone else.
 *
 *   <TwoStepSetup onDone>   scan the QR code (or type the key), then the 6-digit code
 *   <TwoStepVerify onDone>  the 6-digit code from the app, at sign-in
 *
 * Passing either raises this session to "aal2". SMS is never a second
 * factor here. A second phone can be added as a backup (Supabase keeps up
 * to 10 per account); a lost phone is removed from a session that passed
 * the check, or by the owner in Supabase.
 */
import { useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, Smartphone } from 'lucide-react';

import { supabase } from '@/lib/supabase';

const INPUT = 'min-h-12 w-full rounded-xl border-0 bg-white px-4 text-center font-mono text-2xl tracking-[0.4em] text-slate-900 ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-700';
const BUTTON = 'inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-chinar px-5 font-semibold text-white hover:bg-chinar-hover disabled:cursor-not-allowed disabled:opacity-60';

/** Plain words for Supabase's MFA errors. */
function said(err: { message?: string } | null | undefined): string {
  const m = (err?.message ?? '').toLowerCase();
  if (m.includes('invalid') && m.includes('code')) return 'That code is not right. Type the 6 digits your app shows now (they change every 30 seconds).';
  if (m.includes('expired')) return 'That code ran out. Type the new 6 digits your app shows.';
  if (m.includes('rate') || m.includes('too many')) return 'Too many tries. Please wait a minute.';
  if (m.includes('mfa') && m.includes('disabled')) return 'Two-step sign-in is switched off for this site in Supabase (Authentication → Multi-Factor → TOTP).';
  return err?.message || 'Something went wrong. Please try again.';
}

function CodeField({ value, onChange, label = '6-digit code from your app' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-slate-800">
      {label}
      <input className={INPUT} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
    </label>
  );
}

/** Set up an authenticator app: QR code (or the key typed in), then its first 6-digit code. */
export function TwoStepSetup({ onDone, name = 'KashRoot' }: { onDone: () => void; name?: string }) {
  const [factor, setFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      // A half-finished setup from before is removed first (allowed without the second step).
      const listed = await supabase.auth.mfa.listFactors();
      for (const f of listed.data?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `${name} ${new Date().toISOString().slice(0, 16)}` });
      if (!live) return;
      if (err || !data) return setError(said(err));
      setFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => {
      live = false;
    };
  }, [name]);

  const verify = async () => {
    if (!factor || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (err) {
      setCode('');
      return setError(said(err));
    }
    onDone();
  };

  return (
    <div className="grid gap-4" data-two-step="setup">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>
          Install an authenticator app on your phone: <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> or <strong>Authy</strong>.
        </li>
        <li>In the app, add an account and scan this code — or type the key under it.</li>
        <li>Type the 6 digits the app shows.</li>
      </ol>
      {factor ? (
        <div className="grid justify-items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase gives the QR code as an SVG data address */}
          <img src={factor.qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded-xl bg-white p-2 ring-1 ring-slate-200" />
          <p className="text-xs text-slate-600">
            Key: <code className="select-all break-all font-mono text-slate-900">{factor.secret}</code>
          </p>
        </div>
      ) : (
        !error && (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparing your code…
          </p>
        )
      )}
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <CodeField value={code} onChange={setCode} />
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>}
        <button type="submit" className={BUTTON} disabled={busy || !factor || code.length !== 6}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ShieldCheck className="h-5 w-5" aria-hidden />} Turn on two-step sign-in
        </button>
      </form>
      <p className="text-xs text-slate-500">Keep the app on your phone. You will type a new 6-digit code from it when you sign in. Never tell anyone these codes — KashRoot will never ask for them.</p>
    </div>
  );
}

/** Use the authenticator app: its current 6-digit code. */
export function TwoStepVerify({ onDone }: { onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void supabase.auth.mfa.listFactors().then(({ data, error: err }) => {
      if (!live) return;
      const first = data?.totp?.[0];
      if (err || !first) return setError(err ? said(err) : 'No authenticator app is set up for this account.');
      setFactorId(first.id);
    });
    return () => {
      live = false;
    };
  }, []);

  const verify = async () => {
    if (!factorId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (err) {
      setCode('');
      return setError(said(err));
    }
    onDone();
  };

  return (
    <form
      className="grid gap-3"
      data-two-step="verify"
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
    >
      <p className="flex items-start gap-2 text-sm text-slate-700">
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden /> Open your authenticator app and type the 6 digits it shows for KashRoot.
      </p>
      <CodeField value={code} onChange={setCode} />
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">{error}</p>}
      <button type="submit" className={BUTTON} disabled={busy || !factorId || code.length !== 6}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <KeyRound className="h-5 w-5" aria-hidden />} Continue
      </button>
    </form>
  );
}

/** Does this account use two-step sign-in, and has this session passed it? */
export async function twoStepState(): Promise<{ hasFactor: boolean; passed: boolean }> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { hasFactor: data?.nextLevel === 'aal2', passed: data?.currentLevel === 'aal2' };
}
