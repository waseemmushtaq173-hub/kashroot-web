'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AlertCircle, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { authApi, type RegisterDto } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

export default function RegisterPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterDto & { confirmPassword: string }>({
    defaultValues: {
      role: 'FARMER',
    },
  });

  const role = watch('role');
  const password = watch('password', '');

  const registerMutation = useMutation({
    mutationFn: (dto: RegisterDto) => authApi.register(dto),
    onSuccess: (_, variables) => {
      setSuccess(true);
      setTimeout(() => {
        router.push(`/verify-otp?email=${encodeURIComponent(variables.email)}`);
      }, 1500);
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
      <div role="status" aria-live="polite" className="text-center space-y-4 py-8">
        <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" aria-hidden="true" />
        <h2 className="text-2xl font-bold text-gray-900">Account created!</h2>
        <p className="text-sm text-gray-600">We've sent a verification code to your email. Redirecting…</p>
        <Loader2 className="w-5 h-5 animate-spin text-amber-600 mx-auto" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-1">Create your account</h1>
      <p className="text-sm text-gray-600 mb-8">
        Already have an account?{' '}
        <Link href="/login" className="text-amber-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>

      {errorMsg && (
        <div role="alert" aria-live="polite" className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md mb-6 flex items-start gap-3 text-left">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Role selector */}
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-1">I am a</legend>
          <div className="grid grid-cols-2 gap-3">
            {(['FARMER', 'BUYER'] as const).map((r) => {
              const isSelected = role === r;
              return (
                <label
                  key={r}
                  className={`relative flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? 'border-amber-600 bg-amber-50 ring-2 ring-amber-500 shadow-sm'
                      : 'border-gray-300 hover:border-gray-400 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    value={r}
                    className="sr-only"
                    {...register('role', { required: 'Please select your role' })}
                  />
                  <span className="text-2xl" aria-hidden="true">
                    {r === 'FARMER' ? '🌾' : '🛒'}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {r === 'FARMER' ? 'Farmer / Grower' : 'Buyer / Importer'}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.role && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.role.message}
            </p>
          )}
        </fieldset>

        {/* Full name */}
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 ${
              errors.fullName ? 'border-red-500 bg-red-50' : 'border-gray-300'
            }`}
            {...register('fullName', {
              required: 'Full name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
            })}
          />
          {errors.fullName && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.fullName.message}
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 ${
              errors.email ? 'border-red-500 bg-red-50' : 'border-gray-300'
            }`}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
            })}
          />
          {errors.email && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.email.message}
            </p>
          )}
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone number <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
            {...register('phone')}
          />
          <p className="text-xs text-gray-500 mt-1">Used for SMS notifications. We never share your number.</p>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="reg-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <div className="relative">
            <input
              id="reg-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 pr-10 ${
                errors.password ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">Min. 8 characters with uppercase, lowercase, and a number.</p>
          {errors.password && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.password.message}
            </p>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
          <input
            id="confirm-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 ${
              errors.confirmPassword ? 'border-red-500 bg-red-50' : 'border-gray-300'
            }`}
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (v) => v === password || 'Passwords do not match',
            })}
          />
          {errors.confirmPassword && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {/* Terms */}
        <p className="text-xs text-gray-500">
          By creating an account you agree to our{' '}
          <Link href="/terms" className="text-amber-600 hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-amber-600 hover:underline">Privacy Policy</Link>.
        </p>

        <button
          type="submit"
          disabled={registerMutation.isPending}
          className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-md transition-colors flex justify-center items-center gap-2 shadow-sm"
        >
          {registerMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Creating account…</>
          ) : 'Create account'}
        </button>
      </form>
    </div>
  );
}