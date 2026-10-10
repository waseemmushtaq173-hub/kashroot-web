'use client';

/**
 * A small panel that verifies a mobile number (SMS) or email with a one-time
 * code: type the address, press Send OTP, type the 6-digit code, press
 * Verify OTP. Codes come from /api/otp/send + /api/otp/verify; the code is
 * only ever in the person's SMS or inbox — the browser holds a signed token.
 */
import { useEffect, useId, useState } from 'react';
import { CheckCircle2, Loader2, Mail, Send, ShieldCheck, Smartphone } from 'lucide-react';

/** Full class strings for the panel's accent colour. */
export interface OtpAccent {
  /** Filled button, including text colour. */
  button: string;
  /** Input focus ring, e.g. "focus:ring-emerald-500". */
  ring: string;
  /** Link-style text colour. */
  text: string;
  /** Icon tile, including text colour. */
  tile: string;
}

const EMERALD: OtpAccent = {
  button: 'bg-emerald-700 text-white hover:bg-emerald-800',
  ring: 'focus:ring-emerald-600',
  text: 'text-emerald-800',
  tile: 'bg-gradient-to-br from-emerald-400 to-green-600 text-white',
};

export interface ContactOtpProps {
  channel: 'sms' | 'email';
  value: string;
  onChange: (value: string) => void;
  /** Called once the code is confirmed; `proof` is a server-signed receipt. */
  onVerified: (proof: string, to: string) => void;
  verified: boolean;
  onReset?: () => void;
  label?: string;
  accent?: OtpAccent;
  /** Shown as a "Required" / "Optional" chip when set. */
  required?: boolean;
  /** One line under the title. */
  hint?: string;
}

const INPUT = 'block w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500';
const BUTTON = 'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50';

export function ContactOtp({ channel, value, onChange, onVerified, verified, onReset, label, accent = EMERALD, required, hint }: ContactOtpProps) {
  const id = useId();
  const [token, setToken] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const sms = channel === 'sms';
  const Icon = sms ? Smartphone : Mail;
  const title = sms ? 'Verify mobile number' : 'Verify email';
  const fieldLabel = label ?? (sms ? 'Mobile number' : 'Email address');
  const valid = sms ? /^(?:\+?91|0)?[6-9]\d{9}$/.test(value.replace(/[\s-]/g, '')) : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

  const send = async () => {
    setBusy('send');
    setError(null);
    try {
      const res = await fetch('/api/otp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, to: value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not send the OTP.');
      setToken(data.token);
      setSentTo(data.to);
      setCode('');
      setWait(30);
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Could not send the OTP. Check your connection.');
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    if (!token || code.length !== 6) return;
    setBusy('verify');
    setError(null);
    try {
      const res = await fetch('/api/otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, code }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'That OTP is not correct.');
      setToken(null);
      onVerified(data.proof, data.to);
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Could not check the OTP. Check your connection.');
      setCode('');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} className={`rounded-2xl p-4 ring-1 transition ${verified ? 'bg-emerald-50/80 ring-emerald-200' : 'bg-slate-50/80 ring-slate-200'}`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl shadow-sm ${verified ? 'bg-emerald-600 text-white' : accent.tile}`}>
          {verified ? <CheckCircle2 className="h-[18px] w-[18px]" aria-hidden /> : <Icon className="h-[18px] w-[18px]" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p id={`${id}-title`} className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            {verified ? (sms ? 'Mobile number verified' : 'Email verified') : title}
            {!verified && required !== undefined && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${required ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>{required ? 'Required' : 'Optional'}</span>
            )}
          </p>
          <p className="text-xs text-slate-500">{verified ? value : hint ?? (sms ? 'We’ll text a 6-digit OTP to this number.' : 'We’ll email a 6-digit OTP to this address.')}</p>
        </div>
        {verified && onReset && (
          <button type="button" onClick={onReset} className="cursor-pointer text-sm font-semibold text-emerald-800 hover:underline">
            Change
          </button>
        )}
      </div>

      {!verified && (
        <div className="mt-3 space-y-2.5">
          <div className="flex gap-2">
            <label htmlFor={id} className="sr-only">{fieldLabel}</label>
            <span className="relative flex-1">
              <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id={id}
                type={sms ? 'tel' : 'email'}
                inputMode={sms ? 'numeric' : 'email'}
                autoComplete={sms ? 'tel-national' : 'email'}
                value={value}
                onChange={(e) => {
                  onChange(sms ? e.target.value.replace(/[^\d+ ]/g, '').slice(0, 14) : e.target.value);
                  if (token) {
                    setToken(null);
                    setCode('');
                  }
                }}
                placeholder={sms ? '10-digit mobile number' : 'you@example.com'}
                className={`${INPUT} pl-9 ${accent.ring}`}
              />
            </span>
            <button type="button" onClick={() => void send()} disabled={busy !== null || !valid || wait > 0} className={`${BUTTON} ${accent.button}`}>
              {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {wait > 0 ? `Resend ${wait}s` : token ? 'Resend OTP' : 'Send OTP'}
            </button>
          </div>

          <div className="flex gap-2">
            <label htmlFor={`${id}-code`} className="sr-only">6-digit OTP</label>
            <input
              id={`${id}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              maxLength={6}
              disabled={!token}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void verify();
                }
              }}
              placeholder={token ? 'Enter 6-digit OTP' : 'OTP'}
              className={`${INPUT} flex-1 text-center font-mono tracking-[0.3em] ${accent.ring}`}
            />
            <button type="button" onClick={() => void verify()} disabled={!token || code.length !== 6 || busy !== null} className={`${BUTTON} bg-white text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`}>
              {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
              Verify OTP
            </button>
          </div>

          {token && !error && <p className="text-xs text-slate-600">OTP sent to <span className="font-semibold">{sentTo}</span>. It expires in 10 minutes.</p>}
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        </div>
      )}
    </section>
  );
}
