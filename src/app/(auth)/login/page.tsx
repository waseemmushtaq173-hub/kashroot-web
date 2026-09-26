'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import type { Metadata } from 'next';
import { authApi, tokenStore, type LoginDto } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

/**
 * LoginPage
 *
 * API contract (Module 1 — verified against src/modules/auth/auth.controller.ts):
 *   POST /auth/login  { email, password }
 *   → { accessToken: string, requiresMfa: boolean, user: AuthUser }
 *
 * Post-login routing:
 *   requiresMfa = false  → store token, redirect to role-based dashboard
 *   requiresMfa = true   → redirect to /mfa-verify (admin roles with MFA enabled)
 *
 * Accessibility: WCAG 2.1 AA
 *   - All inputs have associated <label>
 *   - Error messages linked via aria-describedby
 *   - Focus-visible ring on all interactive elements
 *   - Loading state announced via aria-busy
 *   - No browser alert() / confirm() used anywhere
 */
export default function LoginPage() {
  const router   = useRouter();
  const [showPw, setShowPw] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginDto>();

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      tokenStore.set(data.accessToken);
      if (data.requiresMfa) {
        // Admin roles with MFA enabled must complete TOTP verification
        router.push('/mfa-verify');
        return;
      }
      // Route by role
      const role = data.user.role;
      if (role === 'FARMER')         router.push('/farmer/dashboard');
      else if (role === 'BUYER')     router.push('/buyer/discover');
      else                           router.push('/admin');
    },
  });

  const onSubmit = (dto: LoginDto) => loginMutation.mutate(dto);

  const errorMsg = loginMutation.error instanceof ApiError
    ? loginMutation.error.messages[0]
    : loginMutation.error ? 'Login failed. Please try again.' : null;

  return (
    <div>
      <h1 className="font-heading text-h2 text-kr-text-primary mb-1">
        Welcome back
      </h1>
      <p className="text-body-sm text-kr-text-secondary mb-8">
        Don’t have an account?{' '}
        <Link href="/register" className="text-kr-text-brand font-medium hover:underline">
          Create one free
        </Link>
      </p>

      {/* Server error banner */}
      {errorMsg && (
        <div
          role="alert"
          aria-live="polite"
          className="kr-error-state mb-6 flex items-start gap-3 text-left"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-kr-text-danger" aria-hidden="true" />
          <p className="text-body-sm text-kr-text-danger">{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Email */}
        <div>
          <label htmlFor="email" className="kr-label">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            aria-describedby={errors.email ? 'email-error' : undefined}
            aria-invalid={!!errors.email}
            className={`kr-input ${
              errors.email ? 'kr-input-error' : ''
            }`}
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Enter a valid email address',
              },
            })}
          />
          {errors.email && (
            <p id="email-error" className="kr-error-msg" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="kr-label !mb-0">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-caption text-kr-text-brand hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              aria-describedby={errors.password ? 'password-error' : undefined}
              aria-invalid={!!errors.password}
              className={`kr-input pr-11 ${
                errors.password ? 'kr-input-error' : ''
              }`}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'Password must be at least 8 characters' },
              })}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2
                         text-kr-text-secondary hover:text-kr-text-primary
                         transition-colors kr-focus-ring rounded"
            >
              {showPw
                ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                : <Eye     className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="kr-error-msg" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loginMutation.isPending}
          aria-busy={loginMutation.isPending}
          className="kr-btn-primary w-full kr-btn-lg mt-2"
        >
          {loginMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <hr className="flex-1 kr-divider" />
        <span className="text-caption text-kr-text-secondary">or</span>
        <hr className="flex-1 kr-divider" />
      </div>

      <p className="text-center text-caption text-kr-text-secondary">
        New to KashRoot?{' '}
        <Link href="/register" className="text-kr-text-brand font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
