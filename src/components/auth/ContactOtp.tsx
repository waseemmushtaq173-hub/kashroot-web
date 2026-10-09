'use client';

/**
 * Verify a mobile number (SMS) or email with a one-time code from
 * /api/otp/send + /api/otp/verify. The code is only ever in the user's SMS or
 * inbox — the browser holds a signed token, never the code.
 */
import { useEffect, useId, useState } from 'react';
import { CheckCircle2, Loader2, Mail, Smartphone } from 'lucide-react';

export interface ContactOtpProps {
  channel: 'sms' | 'email';
  value: string;
  onChange: (value: string) => void;
  /** Called once the code is confirmed; `proof` is a server-signed receipt. */
  onVerified: (proof: string, to: string) => void;
  verified: boolean;
  onReset?: () => void;
  label?: string;
}

const INPUT = 'block w-full rounded-xl border-0 bg-white px-4 py-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-50 disabled:text-slate-500';

export function ContactOtp({ channel, value, onChange, onVerified, verified, onReset, label }: ContactOtpProps) {
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

  const Icon = channel === 'sms' ? Smartphone : Mail;

  const send = async () => {
    setBusy('send');
    setError(null);
    try {
      const res = await fetch('/api/otp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, to: value }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not send the code.');
      setToken(data.token);
      setSentTo(data.to);
      setCode('');
      setWait(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(null);
    }
  };

  const verify = async (c: string) => {
    if (!token || c.length !== 6) return;
    setBusy('verify');
    setError(null);
    try {
      const res = await fetch('/api/otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, code: c }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'That code is not correct.');
      setToken(null);
      onVerified(data.proof, data.to);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code is not correct.');
      setCode('');
    } finally {
      setBusy(null);
    }
  };

  if (verified) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
        <p className="flex-1 text-sm"><span className="font-semibold text-slate-900">{label ?? (channel === 'sms' ? 'Mobile' : 'Email')} verified</span> <span className="text-slate-600">{value}</span></p>
        {onReset && <button type="button" onClick={onReset} className="cursor-pointer text-sm font-semibold text-emerald-800 hover:underline">Change</button>}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{label ?? (channel === 'sms' ? 'Mobile number' : 'Email address')}</label>
      <div className="mt-1.5 flex gap-2">
        <span className="relative flex-1">
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id={id}
            type={channel === 'sms' ? 'tel' : 'email'}
            inputMode={channel === 'sms' ? 'numeric' : 'email'}
            autoComplete={channel === 'sms' ? 'tel-national' : 'email'}
            value={value}
            disabled={token !== null}
            onChange={(e) => onChange(channel === 'sms' ? e.target.value.replace(/[^\d+ ]/g, '').slice(0, 14) : e.target.value)}
            placeholder={channel === 'sms' ? '10-digit mobile number' : 'you@example.com'}
            className={`${INPUT} pl-9`}
          />
        </span>
        <button
          type="button"
          onClick={() => (token ? (setToken(null), setCode('')) : void send())}
          disabled={busy !== null || (!token && value.trim().length < 6)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === 'send' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {token ? 'Change' : 'Send code'}
        </button>
      </div>
      {token && (
        <div className="mt-3 rounded-2xl bg-emerald-50/70 p-3 ring-1 ring-emerald-200">
          <label htmlFor={`${id}-code`} className="text-sm text-slate-700">
            Enter the 6-digit code sent to <span className="font-semibold">{sentTo}</span>
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={`${id}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              maxLength={6}
              onChange={(e) => {
                const c = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(c);
                if (c.length === 6) void verify(c);
              }}
              placeholder="••••••"
              className={`${INPUT} max-w-[10rem] text-center font-mono text-lg tracking-[0.4em]`}
            />
            <button type="button" onClick={() => void send()} disabled={wait > 0 || busy !== null} className="cursor-pointer text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:text-slate-400">
              {busy === 'verify' ? 'Checking…' : wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
