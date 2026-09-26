'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2, ShieldCheck, Copy, CheckCircle2 } from 'lucide-react';
import { authApi, tokenStore } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

/**
 * MfaSetupPage
 *
 * API contract (Module 1 — verified against src/modules/auth/):
 *   POST /auth/mfa/setup   → { qrCodeDataUrl: string, secret: string }
 *   POST /auth/mfa/verify  { totp: string } → { accessToken, user }
 *
 * Who sees this page:
 *   Only REGIONAL_ADMIN and PLATFORM_ADMIN roles, after login if mfaEnabled=false
 *   OR after explicit navigation to /mfa-setup from account settings.
 *
 * Security notes:
 *   - The TOTP secret is shown ONCE here. The user must store it in their
 *     authenticator app. We never store or re-display it after this page.
 *   - qrCodeDataUrl is a data URL from the backend — displayed as an <img>,
 *     never sent to a third party.
 *
 * RBAC note (UI only):
 *   <!-- SECURITY: This page is shown based on user.role from the JWT. -->
 *   <!-- The backend MfaGuard enforces actual access. This UI gating is     -->
 *   <!-- for UX only and CANNOT be relied on as a security control.         -->
 */
export default function MfaSetupPage() {
  const router = useRouter();
  const [totpCode, setTotpCode] = useState('');
  const [secretCopied, setSecretCopied] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  // Step 1: generate QR code
  const setupMutation = useMutation({
    mutationFn: authApi.mfaSetup,
  });

  // Step 2: verify TOTP to confirm setup
  const verifyMutation = useMutation({
    mutationFn: () => authApi.mfaVerify({ totp: totpCode }),
    onSuccess: (data) => {
      tokenStore.set(data.accessToken);
      setSetupComplete(true);
      setTimeout(() => {
        const role = data.user.role;
        router.push(role === 'PLATFORM_ADMIN' ? '/admin' : '/admin/regional');
      }, 2_000);
    },
  });

  async function copySecret(secret: string) {
    await navigator.clipboard.writeText(secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2_000);
  }

  const setupData = setupMutation.data;
  const setupError = setupMutation.error instanceof ApiError
    ? setupMutation.error.messages[0]
    : setupMutation.error ? 'Could not generate MFA setup. Please try again.' : null;
  const verifyError = verifyMutation.error instanceof ApiError
    ? verifyMutation.error.messages[0]
    : verifyMutation.error ? 'Invalid code. Try again.' : null;

  if (setupComplete) {
    return (
      <div role="status" aria-live="polite" className="text-center space-y-4 py-8">
        <ShieldCheck className="w-12 h-12 text-kr-success-500 mx-auto" aria-hidden="true" />
        <h2 className="font-heading text-h3 text-kr-text-primary">MFA enabled!</h2>
        <p className="text-body-sm text-kr-text-secondary">Redirecting to your dashboard…</p>
        <Loader2 className="w-5 h-5 animate-spin text-kr-primary-500 mx-auto" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-center mb-6">
        <div className="w-14 h-14 rounded-full bg-kr-fill-brand-subtle flex items-center justify-center">
          <ShieldCheck className="w-7 h-7 text-kr-primary-600" aria-hidden="true" />
        </div>
      </div>

      <h1 className="font-heading text-h2 text-kr-text-primary text-center mb-1">
        Set up two-factor authentication
      </h1>
      <p className="text-body-sm text-kr-text-secondary text-center mb-8">
        Required for admin accounts. Use an authenticator app
        (Google Authenticator, Authy, 1Password).
      </p>

      {/* Step 1: Generate QR code */}
      {!setupData && (
        <div className="space-y-4">
          {setupError && (
            <div role="alert" className="kr-error-state flex items-start gap-3 text-left">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-body-sm">{setupError}</p>
            </div>
          )}
          <div className="kr-card bg-kr-bg-sunken border-0 space-y-3">
            <p className="text-body-sm text-kr-text-primary font-medium">Before you begin:</p>
            <ol className="list-decimal list-inside space-y-1 text-body-sm text-kr-text-secondary">
              <li>Install an authenticator app on your phone.</li>
              <li>Click Generate QR code below.</li>
              <li>Scan the QR code or enter the secret manually.</li>
              <li>Enter the 6-digit code from the app to confirm.</li>
            </ol>
          </div>
          <button
            type="button"
            onClick={() => setupMutation.mutate()}
            disabled={setupMutation.isPending}
            aria-busy={setupMutation.isPending}
            className="kr-btn-primary w-full kr-btn-lg"
          >
            {setupMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Generating…</>
            ) : 'Generate QR code'}
          </button>
        </div>
      )}

      {/* Step 2: Show QR + confirm TOTP */}
      {setupData && (
        <div className="space-y-6">
          {/* QR code */}
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-white rounded-xl border border-kr-border-default shadow-kr-card">
              {/* QR code is a data URL from backend — never sent to a third party */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setupData.qrCodeDataUrl}
                alt="MFA QR code — scan with your authenticator app"
                width={180}
                height={180}
                className="block"
              />
            </div>
            <p className="text-caption text-kr-text-secondary">
              Can't scan? Enter this secret manually:
            </p>
            {/* Manual secret */}
            <div className="flex items-center gap-2 px-4 py-2 bg-kr-bg-sunken rounded-md border border-kr-border-default">
              <code className="text-mono text-body-sm tracking-widest text-kr-text-primary select-all">
                {setupData.secret}
              </code>
              <button
                type="button"
                onClick={() => copySecret(setupData.secret)}
                aria-label="Copy secret key"
                className="text-kr-text-secondary hover:text-kr-text-primary kr-focus-ring rounded transition-colors"
              >
                {secretCopied
                  ? <CheckCircle2 className="w-4 h-4 text-kr-success-500" aria-hidden="true" />
                  : <Copy         className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
            <p className="text-caption text-kr-text-danger text-center">
              ⚠ Save this secret somewhere safe. It won't be shown again.
            </p>
          </div>

          {/* TOTP confirm */}
          <div className="space-y-3">
            <label htmlFor="totp" className="kr-label">Enter the 6-digit code from your app</label>
            <input
              id="totp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="123456"
              aria-describedby={verifyError ? 'totp-error' : undefined}
              aria-invalid={!!verifyError}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={`kr-input text-center text-h3 font-heading tracking-widest ${
                verifyError ? 'kr-input-error' : ''
              }`}
            />
            {verifyError && (
              <p id="totp-error" role="alert" className="kr-error-msg">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {verifyError}
              </p>
            )}

            <button
              type="button"
              onClick={() => verifyMutation.mutate()}
              disabled={totpCode.length < 6 || verifyMutation.isPending}
              aria-busy={verifyMutation.isPending}
              className="kr-btn-primary w-full kr-btn-lg"
            >
              {verifyMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Verifying…</>
              ) : 'Confirm & enable MFA'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
