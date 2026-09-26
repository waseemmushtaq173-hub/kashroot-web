'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AlertCircle, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { authApi, type RegisterDto } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

/**
 * RegisterPage
 *
 * API contract (Module 1 — verified against src/modules/auth/):
 *   POST /auth/register  { email, password, role, fullName, phone? }
 *   → { message: string }   (201 Created)
 *   After registration, backend sends OTP to email → redirect to /verify-otp
 *
 * Role selection:
 *   Only FARMER and BUYER roles are self-registerable.
 *   REGIONAL_ADMIN and PLATFORM_ADMIN are created by the platform (not exposed here).
 *
 * KYC note:
 *   Both farmers and buyers must complete KYC after registration.
 *   Farmers need VERIFIED KYC to publish listings (enforced by backend ListingsGuard).
 *   The UI surfaces this clearly in the onboarding checklist after sign-up.
 */
export default function RegisterPage() {
  const router  = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterDto & { confirmPassword: string }>();

  const password = watch('password', '');

  const registerMutation = useMutation({
    mutationFn: (dto: RegisterDto) => authApi.register(dto),
    onSuccess: (_, variables) => {
      setSuccess(true);
      // Redirect to OTP verification, passing email via query string
      setTimeout(() => {
        router.push(`/verify-otp?email=${encodeURIComponent(variables.email)}`);
      }, 1_500);
    },
  });

  const onSubmit = ({ confirmPassword, ...dto }: RegisterDto & { confirmPassword: string }) => {
    registerMutation.mutate(dto);
  };

  const errorMsg = registerMutation.error instanceof ApiError
    ? registerMutation.error.messages[0]
    : registerMutation.error ? 'Registration failed. Please try again.' : null;

  if (success) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="text-center space-y-4 py-8"
      >
        <CheckCircle2
          className="w-12 h-12 text-kr-success-500 mx-auto"
          aria-hidden="true"
        />
        <h2 className="font-heading text-h3 text-kr-text-primary">
          Account created!
        </h2>
        <p className="text-body-sm text-kr-text-secondary">
          We've sent a verification code to your email. Redirecting…
        </p>
        <Loader2 className="w-5 h-5 animate-spin text-kr-primary-500 mx-auto" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading text-h2 text-kr-text-primary mb-1">
        Create your account
      </h1>
      <p className="text-body-sm text-kr-text-secondary mb-8">
        Already have an account?{' '}
        <Link href="/login" className="text-kr-text-brand font-medium hover:underline">
          Sign in
        </Link>
      </p>

      {errorMsg && (
        <div role="alert" aria-live="polite" className="kr-error-state mb-6 flex items-start gap-3 text-left">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-body-sm">{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Role selector — farmers vs buyers */}
        <fieldset>
          <legend className="kr-label">I am a</legend>
          <div className="grid grid-cols-2 gap-3 mt-1">
            {(['FARMER', 'BUYER'] as const).map((role) => (
              <label
                key={role}
                className="relative flex items-center gap-3 p-3 border rounded-md cursor-pointer
                           transition-colors has-[:checked]:border-kr-border-brand
                           has-[:checked]:bg-kr-fill-brand-subtle
                           border-kr-border-default hover:border-kr-border-strong"
              >
                <input
                  type="radio"
                  value={role}
                  className="sr-only"
                  {...register('role', { required: 'Please select your role' })}
                />
                <span className="text-2xl" aria-hidden="true">
                  {role === 'FARMER' ? '🌾' : '🛒'}
                </span>
                <span className="text-body-sm font-medium text-kr-text-primary">
                  {role === 'FARMER' ? 'Farmer / Grower' : 'Buyer / Importer'}
                </span>
              </label>
            ))}
          </div>
          {errors.role && (
            <p className="kr-error-msg mt-1" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.role.message}
            </p>
          )}
        </fieldset>

        {/* Full name */}
        <div>
          <label htmlFor="fullName" className="kr-label">Full name</label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            aria-describedby={errors.fullName ? 'name-error' : undefined}
            aria-invalid={!!errors.fullName}
            className={`kr-input ${errors.fullName ? 'kr-input-error' : ''}`}
            {...register('fullName', {
              required: 'Full name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
            })}
          />
          {errors.fullName && (
            <p id="name-error" className="kr-error-msg" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.fullName.message}
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="reg-email" className="kr-label">Email address</label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            aria-describedby={errors.email ? 'reg-email-error' : undefined}
            aria-invalid={!!errors.email}
            className={`kr-input ${errors.email ? 'kr-input-error' : ''}`}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
            })}
          />
          {errors.email && (
            <p id="reg-email-error" className="kr-error-msg" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Phone (optional) */}
        <div>
          <label htmlFor="phone" className="kr-label">
            Phone number
            <span className="text-kr-text-secondary font-normal ml-1">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            className="kr-input"
            {...register('phone')}
          />
          <p className="kr-hint">Used for SMS notifications. We never share your number.</p>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="reg-password" className="kr-label">Password</label>
          <div className="relative">
            <input
              id="reg-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              aria-describedby="pw-requirements"
              aria-invalid={!!errors.password}
              className={`kr-input pr-11 ${errors.password ? 'kr-input-error' : ''}`}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'At least 8 characters' },
                pattern: {
                  value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                  message: 'Must include uppercase, lowercase, and a number',
                },
              })}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2
                         text-kr-text-secondary hover:text-kr-text-primary kr-focus-ring rounded"
            >
              {showPw
                ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                : <Eye     className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
          <p id="pw-requirements" className="kr-hint">
            Min. 8 characters with uppercase, lowercase, and a number.
          </p>
          {errors.password && (
            <p className="kr-error-msg" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="confirm-password" className="kr-label">Confirm password</label>
          <input
            id="confirm-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            aria-describedby={errors.confirmPassword ? 'confirm-pw-error' : undefined}
            aria-invalid={!!errors.confirmPassword}
            className={`kr-input ${errors.confirmPassword ? 'kr-input-error' : ''}`}
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (v) => v === password || 'Passwords do not match',
            })}
          />
          {errors.confirmPassword && (
            <p id="confirm-pw-error" className="kr-error-msg" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Terms */}
        <p className="text-caption text-kr-text-secondary">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="text-kr-text-brand hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-kr-text-brand hover:underline">Privacy Policy</Link>.
        </p>

        <button
          type="submit"
          disabled={registerMutation.isPending}
          aria-busy={registerMutation.isPending}
          className="kr-btn-primary w-full kr-btn-lg"
        >
          {registerMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Creating account…</>
          ) : 'Create account'}
        </button>
      </form>
    </div>
  );
}
