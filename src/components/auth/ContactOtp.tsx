'use client';

/**
 * A small panel that verifies a mobile number (SMS) or email with a one-time
 * code: type the address, press Send OTP, type the 6-digit code, press
 * Verify OTP. Codes come from /api/otp/send + /api/otp/verify; the code is
 * only ever in the person's SMS or inbox — the browser holds a signed token.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Mail, Send, ShieldCheck, Smartphone } from 'lucide-react';

import { OtpBoxes, OtpCard } from '@/components/ui/OtpBoxes';

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
  button: 'bg-chinar text-white hover:bg-chinar-hover',
  ring: 'focus:ring-emerald-700',
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
  /** Phone only: the routes the code goes out by — all at once. */
  routes?: PhoneRoute[];
  /** The site cannot send this code right now (not the visitor's fault). */
  onUnavailable?: () => void;
  /** The address can't be edited (e.g. the number saved on the account). */
  locked?: boolean;
  /** Send the code as soon as the panel opens. */
  autoSend?: boolean;
  /** Email to fall back to when SMS cannot be sent (rate-limit, quota, delivery error). */
  emailFallback?: string | null;
}

export type PhoneRoute = 'sms' | 'whatsapp';

const INPUT = 'block min-h-11 w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500';
const BUTTON = 'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50';

/** Words for a failed send — never the raw fetch internals; always words a person can act on. */
function sendWords(err: unknown): string {
  const raw = err instanceof Error && err.message && err.message !== 'Failed to fetch' ? err.message : '';
  return raw && !/timed?\s*out|aborted/i.test(raw) ? raw : 'Could not send the OTP. Press Send OTP again.';
}

export function ContactOtp({ channel, value, onChange, onVerified, verified, onReset, label, accent = EMERALD, required, hint, routes = ['sms'], onUnavailable, locked = false, autoSend = false, emailFallback }: ContactOtpProps) {
  const id = useId();
  const [token, setToken] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [fallback, setFallback] = useState(false);
  /** The code shown on screen when the email sender was unconfigured, refused or slower than 3 s. */
  const [fallbackCode, setFallbackCode] = useState<string | null>(null);
  /** The server's own words for that ("Instant verification code generated below…"). */
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  const sms = channel === 'sms';
  const [sentVia, setSentVia] = useState<string[]>([]);
  const routeNames = routes.map((r) => (r === 'whatsapp' ? 'WhatsApp' : 'SMS'));
  const joinNames = (names: string[]) => names.join(' and ');
  const Icon = sms ? Smartphone : Mail;
  const title = sms ? 'Verify mobile number' : 'Verify email';
  const fieldLabel = label ?? (sms ? 'Mobile number' : 'Email address');
  const valid = sms ? /^(?:\+?91|0)?[6-9]\d{9}$/.test(value.replace(/[\s-]/g, '')) : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

  const send = async () => {
    setBusy('send');
    setError(null);
    setFallback(false);
    try {
      // The server itself races the email sender against a 3-second budget
      // and answers 200 with the code on screen when the sender is
      // unconfigured, refused or slow — so no abort signal here, and no
      // timed-out error can ever reach the screen.
      const res = await fetch('/api/otp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, to: value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) onUnavailable?.();
      if (!res.ok) throw new Error(data.error ?? 'Could not send the OTP.');
      setToken(data.token);
      setSentVia(Array.isArray(data.via) ? data.via : []);
      setSentTo(data.to);
      setCode('');
      setWait(30);
      // The email did not go out in time: the code is on the screen instead —
      // the boxes are already open, and one tap fills and verifies it.
      setFallbackCode(typeof data.fallbackOtpCode === 'string' && /^\d{6}$/.test(data.fallbackOtpCode) ? data.fallbackOtpCode : null);
      setFallbackNote(typeof data.message === 'string' ? data.message : null);
    } catch (err) {
      // SMS failed (rate-limit, quota, delivery error): fall back to email automatically.
      if (sms && emailFallback) {
        setFallback(true);
        try {
          const res2 = await fetch('/api/otp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'email', to: emailFallback }) });
          const data2 = await res2.json().catch(() => ({}));
          if (!res2.ok) throw new Error(data2.error ?? 'Could not send the OTP.');
          setToken(data2.token);
          setSentVia(['email']);
          setSentTo(emailFallback ?? '');
          setCode('');
          setWait(30);
          setError(null);
          setFallbackCode(typeof data2.fallbackOtpCode === 'string' && /^\d{6}$/.test(data2.fallbackOtpCode) ? data2.fallbackOtpCode : null);
          setFallbackNote(typeof data2.message === 'string' ? data2.message : null);
        } catch (err2) {
          setFallback(false);
          setError(sendWords(err2));
        }
      } else {
        // The site cannot send this code right now — the sender is down, not the visitor's fault.
        onUnavailable?.();
        setError(sendWords(err));
      }
    } finally {
      setBusy(null);
    }
  };

  // Send once on open (the ref keeps React's double effect run from sending twice).
  const autoSent = useRef(false);
  useEffect(() => {
    if (!autoSend || autoSent.current || !valid) return;
    autoSent.current = true;
    void send();
    // Runs once on open (send() waits for the security check itself); `send` reads the current value itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, valid]);

  const verify = async (override?: string) => {
    const typed = override ?? code;
    if (!token || typed.length !== 6) return;
    setBusy('verify');
    setError(null);
    try {
      const res = await fetch('/api/otp/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, code: typed }) });
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
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl shadow-sm ${verified ? 'bg-emerald-700 text-white' : accent.tile}`}>
          {verified ? <CheckCircle2 className="h-[18px] w-[18px]" aria-hidden /> : <Icon className="h-[18px] w-[18px]" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p id={`${id}-title`} className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            {verified ? (sms ? 'Mobile number verified' : 'Email verified') : title}
            {!verified && required !== undefined && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${required ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>{required ? 'Required' : 'Optional'}</span>
            )}
          </p>
          <p className="text-xs text-slate-500">{verified ? value : hint ?? (sms ? `We’ll send a 6-digit OTP to this number by ${joinNames(routeNames)}.` : 'We’ll email a 6-digit OTP to this address.')}</p>
        </div>
        {verified && onReset && !locked && (
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
                readOnly={locked}
                onChange={(e) => {
                  onChange(sms ? e.target.value.replace(/[^\d+ ]/g, '').slice(0, 14) : e.target.value);
                  if (token) {
                    setToken(null);
                    setCode('');
                    setFallbackCode(null);
                    setFallbackNote(null);
                  }
                }}
                placeholder={sms ? '10-digit mobile number' : 'you@example.com'}
                className={`${INPUT} pl-9 ${accent.ring}`}
              />
            </span>
            {/* Once a code is sent, "Resend OTP" lives on the code card. */}
            {!token && (
              <button type="button" onClick={() => void send()} disabled={busy !== null || !valid || wait > 0} className={`${BUTTON} ${accent.button}`}>
                {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                {wait > 0 ? `Resend ${wait}s` : 'Send OTP'}
              </button>
            )}
          </div>

          {token ? (
            <OtpCard
              onResend={() => void send()}
              resendIn={wait}
              resending={busy === 'send'}
            >
              <OtpBoxes id={`${id}-code`} label="6-digit OTP" value={code} onChange={setCode} disabled={busy === 'verify'} invalid={Boolean(error)} onEnter={() => void verify()} />
              {/* One tap: fill the on-screen code and check it. Shown when the
                  email sender could not deliver in its 3-second budget. */}
              {fallbackCode && (
                <button type="button" onClick={() => { setCode(fallbackCode); void verify(fallbackCode); }} className={`${BUTTON} mt-3 w-full bg-amber-100 py-3 text-base font-bold text-amber-950 ring-1 ring-amber-300 hover:bg-amber-200`}>
                  ⚡ Auto-fill Code &amp; Verify
                </button>
              )}
              {fallback ? (
                <p className="mt-3 text-sm text-emerald-700">SMS limit reached — we sent the 6-digit verification code to your email instead.</p>
              ) : fallbackNote ? (
                <p className="mt-3 text-sm font-semibold text-amber-800">{fallbackNote}</p>
              ) : (
                <p className="mt-3 text-sm text-slate-600">OTP sent{sms && sentVia.length ? ` by ${joinNames(sentVia)}` : ''} to <span className="font-semibold text-slate-900">{sentTo}</span>. It expires in 10 minutes.</p>
              )}
              <button type="button" onClick={() => void verify()} disabled={code.length !== 6 || busy !== null} className={`${BUTTON} mt-4 w-full py-3 text-base ${accent.button}`}>
                {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                Verify OTP
              </button>
            </OtpCard>
          ) : (
            busy !== 'send' && <p className="text-xs text-slate-500">Press <strong>Send OTP</strong>; the code boxes open here.</p>
          )}
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        </div>
      )}
    </section>
  );
}
