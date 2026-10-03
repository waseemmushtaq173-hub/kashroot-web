'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2, CheckCircle2, MailOpen } from 'lucide-react';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

/**
 * VerifyOtpPage
 *
 * API contract (Module 1 — verified against src/modules/auth/):
 *   POST /auth/otp/verify  { email, otp }  → { verified: boolean, message: string }
 *   POST /auth/otp/resend  { email }        → { message: string }
 *
 * Routing:
 *   Receives `email` from query string (set by register page after successful signup).
 *   On success: redirects to /login with a success toast param.
 *
 * UX:
 *   - 6-cell OTP input (one digit per cell) for mobile-friendly entry.
 *   - Auto-advances to next cell on digit entry.
 *   - Backspace returns to previous cell.
 *   - Paste support: pastes all digits at once.
 *   - Resend button with 60-second cooldown.
 *   - No blank error states — every failure path has a message.
 */
export default function VerifyOtpPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-kr-primary-500" aria-hidden="true" />
      </div>
    }>
      <VerifyOtpForm />
    </Suspense>
  );
}

function OtpInput({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) {
  const OTP_LEN = 6;
  const digits = value.padEnd(OTP_LEN, ' ').split('').map(d => d === ' ' ? '' : d);
  const inputRefs = useRef<Array<HTMLInputElement | null>>(Array(OTP_LEN).fill(null));

  function handleDigitChange(index: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    const finalVal = next.join('');
    onChange(finalVal);
    if (digit && index < OTP_LEN - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LEN);
    if (!pasted) return;
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, OTP_LEN - 1);
    inputRefs.current[focusIdx]?.focus();
  }

  return (
    <fieldset className="mb-6">
      <legend className="text-body-sm font-medium text-kr-text-primary mb-2 text-center w-full">{label}</legend>
      <div className="flex gap-2 sm:gap-3 justify-center" aria-label={`6-digit verification code for ${label}`}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]"
            maxLength={1}
            value={digit}
            aria-label={`Digit ${i + 1} of ${OTP_LEN}`}
            className={`
              w-11 h-14 sm:w-12 sm:h-16 text-center text-h3 font-heading
              border rounded-md bg-kr-bg-surface text-kr-text-primary
              transition-colors
              focus:outline-none focus:border-kr-border-focus focus:shadow-kr-brand
              ${digit ? 'border-kr-border-brand' : 'border-kr-border-default'}
            `}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
          />
        ))}
      </div>
    </fieldset>
  );
}

function VerifyOtpForm() {
  const params  = useSearchParams();
  const router  = useRouter();
  const email   = params.get('email') ?? '';
  const phone   = params.get('phone') ?? '';

  const [emailCode, setEmailCode] = useState<string>('');
  const [phoneCode, setPhoneCode] = useState<string>('');

  const [resendCooldown, setResendCooldown] = useState(0);
  const [verified, setVerified] = useState(false);

  // Cooldown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1_000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const verifyMutation = useMutation({
    // Modify mutationFn to pass both codes down, the backend/mock expects it
    mutationFn: () => authApi.verifyOtp({ email, code: emailCode, phoneCode }),
    onSuccess: () => {
      setVerified(true);
      router.push('/login?verified=1');
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => authApi.resendOtp({ email, phone }),
    onSuccess: () => setResendCooldown(60),
  });

  // Auto-submit when both 6 digits filled
  useEffect(() => {
    if (emailCode.length === OTP_LEN && phoneCode.length === OTP_LEN && !verifyMutation.isPending) {
      verifyMutation.mutate();
    }
  }, [emailCode, phoneCode]);

  const OTP_LEN = 6;

  const errorMsg = verifyMutation.error instanceof ApiError
    ? verifyMutation.error.messages[0]
    : verifyMutation.error ? 'Verification failed. Please try again.' : null;

  if (verified) {
    return (
      <div role="status" aria-live="polite" className="text-center space-y-4 py-8">
        <CheckCircle2 className="w-12 h-12 text-kr-success-500 mx-auto" aria-hidden="true" />
        <h2 className="font-heading text-h3 text-kr-text-primary">Identity verified!</h2>
        <p className="text-body-sm text-kr-text-secondary">Redirecting to sign in…</p>
        <Loader2 className="w-5 h-5 animate-spin text-kr-primary-500 mx-auto" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-center mb-6">
        <div className="w-14 h-14 rounded-full bg-kr-fill-brand-subtle flex items-center justify-center">
          <MailOpen className="w-7 h-7 text-kr-primary-600" aria-hidden="true" />
        </div>
      </div>

      <h1 className="font-heading text-h2 text-kr-text-primary text-center mb-1">
        Check your email and mobile device
      </h1>
      <p className="text-body-sm text-kr-text-secondary text-center mb-8">
        We sent a 6-digit code to{' '}
        <span className="font-medium text-kr-text-primary">
          {email || 'your email address'}
        </span>
        {' '}and{' '}
        <span className="font-medium text-kr-text-primary">
          {phone || 'your mobile number'}
        </span>.
      </p>

      {errorMsg && (
        <div role="alert" aria-live="polite" className="kr-error-state mb-6 flex items-start gap-3 text-left">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-body-sm">{errorMsg}</p>
        </div>
      )}

      <OtpInput label="Verify Mobile" value={phoneCode} onChange={setPhoneCode} />
      <OtpInput label="Verify Email" value={emailCode} onChange={setEmailCode} />

      <button
        type="button"
        onClick={() => verifyMutation.mutate()}
        disabled={emailCode.length < OTP_LEN || phoneCode.length < OTP_LEN || verifyMutation.isPending}
        aria-busy={verifyMutation.isPending}
        className="kr-btn-primary w-full kr-btn-lg mb-6"
      >
        {verifyMutation.isPending ? (
          <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Verifying…</>
        ) : 'Verify code'}
      </button>

      {/* Resend */}
      <p className="text-center text-body-sm text-kr-text-secondary">
        Didn't receive it?{' '}
        {resendCooldown > 0 ? (
          <span className="text-kr-text-disabled">Resend in {resendCooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={() => resendMutation.mutate()}
            disabled={resendMutation.isPending}
            className="text-kr-text-brand font-medium hover:underline disabled:opacity-50
                       kr-focus-ring rounded"
          >
            {resendMutation.isPending ? 'Sending…' : 'Resend code'}
          </button>
        )}
      </p>

      <p className="text-center text-caption text-kr-text-secondary mt-4">
        <Link href="/register" className="text-kr-text-brand hover:underline">Wrong email?</Link>
      </p>
    </div>
  );
}
