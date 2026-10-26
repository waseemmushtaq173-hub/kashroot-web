'use client';

/**
 * The KashRoot one-time-code look, used wherever a code is typed:
 *   OtpBoxes  one box per digit — filled boxes turn blue with the digit in
 *             white, the box being typed in glows. A single input lies over
 *             the boxes, so paste, the phone's number keyboard and SMS
 *             autofill (one-time-code) keep working.
 *   OtpCard   the card around it: lock icon, "Verification code", where the
 *             code went, and "Didn't receive the code? Resend OTP".
 */
import { Fragment, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';

export function OtpBoxes({
  id,
  value,
  onChange,
  length = 6,
  disabled = false,
  invalid = false,
  label,
  describedBy,
  onEnter,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  /** Read by screen readers when there is no <label for={id}> (the boxes are only a picture of the input). */
  label?: string;
  describedBy?: string;
  /** Enter pressed in the code. */
  onEnter?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const caret = Math.min(value.length, length - 1);

  return (
    <div className="relative mx-auto w-fit">
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="absolute inset-0 z-10 h-full w-full cursor-text border-0 text-base opacity-0 disabled:cursor-not-allowed"
      />
      <div aria-hidden className="flex items-center gap-1 sm:gap-1.5">
        {Array.from({ length }, (_, i) => {
          const digit = value[i];
          const active = focused && !disabled && i === caret;
          return (
            <Fragment key={i}>
              {i > 0 && <span className="h-0.5 w-1.5 shrink-0 rounded-full bg-sky-200 sm:w-2.5" />}
              <span
                className={`relative grid h-12 w-10 shrink-0 place-items-center overflow-hidden rounded-xl text-xl font-bold tabular-nums transition duration-200 sm:h-14 sm:w-12 sm:text-2xl ${
                  digit
                    ? 'bg-gradient-to-b from-sky-400 via-blue-500 to-blue-700 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-white text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200'
                } ${invalid ? 'ring-2 ring-rose-400' : active ? 'ring-2 ring-sky-500 ring-offset-2' : ''} ${disabled ? 'opacity-60' : ''}`}
              >
                {/* A soft shine across the top of a filled box. */}
                {digit && <span className="absolute inset-x-1 top-1 h-2/5 rounded-lg bg-gradient-to-b from-white/45 to-white/0" />}
                {digit && <span key={digit} className="kr-otp-pop relative">{digit}</span>}
                {active && !digit && <span className="h-6 w-0.5 animate-pulse rounded-full bg-sky-500" />}
              </span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function OtpCard({
  title = 'Verification code',
  sentTo,
  children,
  onResend,
  resendIn = 0,
  resending = false,
}: {
  title?: string;
  /** Where the code went, e.g. "98••••3210"; shown in "Enter the 6-digit code sent to …". */
  sentTo?: ReactNode;
  children: ReactNode;
  onResend?: () => void;
  /** Seconds until a new code may be asked for. */
  resendIn?: number;
  resending?: boolean;
}) {
  return (
    <div className="rounded-3xl bg-white/95 p-5 text-center shadow-[0_18px_50px_-20px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5 sm:p-6">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-b from-sky-50 to-blue-100 shadow-inner ring-1 ring-sky-100">
        <Lock className="h-8 w-8 text-amber-500 drop-shadow-sm" strokeWidth={2.4} aria-hidden />
      </span>
      <p className="mt-3 text-lg font-bold text-slate-900">{title}</p>
      {sentTo && <p className="mt-1 text-sm text-slate-600">Enter the code sent to {sentTo}.</p>}
      <div className="mt-4">{children}</div>
      {onResend && (
        <p className="mt-4 text-sm text-slate-600">
          Didn’t receive the code?{' '}
          {resendIn > 0 ? (
            <span className="font-semibold text-slate-500">Resend in {resendIn}s</span>
          ) : (
            <button type="button" onClick={onResend} disabled={resending} className="cursor-pointer font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-800 disabled:cursor-wait disabled:opacity-60">
              {resending ? 'Sending…' : 'Resend OTP'}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
