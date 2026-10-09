'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AlertCircle, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { authApi, type RegisterDto } from '@/lib/api/auth';
import { loginHref, REGISTER_ROLES } from '@/lib/auth/roles';
import { ApiError } from '@/lib/api/client';
import { ContactOtp } from '@/components/auth/ContactOtp';

type RegisterRole = RegisterDto['role'];
const ROLE_EMOJI: Record<RegisterRole, string> = { FARMER: '🌾', BUYER: '🛒', SELLER: '🏪', PROVIDER: '🚚' };

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = REGISTER_ROLES.find((r) => r.role === searchParams.get('role'))?.role ?? 'FARMER';
  const [showPw, setShowPw] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RegisterRole>(requested as RegisterRole);

  // Contact verification (codes are checked on the server — see ContactOtp)
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);

  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterDto & { confirmPassword: string }>({
    defaultValues: {
      role: requested as RegisterRole,
    },
  });

  const emailValue = watch('email', '');
  const phoneValue = watch('phone', '');
  const password = watch('password', '');

  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  const registerMutation = useMutation({
    mutationFn: (dto: RegisterDto) => authApi.register(dto),
    onSuccess: (result, variables) => {
      setSuccess(true);
      setNeedsEmailConfirmation(result.needsEmailConfirmation);
      // Sending them to /login would land on the partner and staff form; each
      // role has its own sign-in. Skip the redirect entirely while the email
      // is unconfirmed, because signing in would fail until the link is used.
      if (result.needsEmailConfirmation) return;
      const role = REGISTER_ROLES.find((r) => r.role === variables.role)?.portal ?? 'farmer';
      setTimeout(() => {
        router.push(loginHref(role));
      }, 2000);
    },
  });

  const onSubmit = ({ confirmPassword, ...dto }: RegisterDto & { confirmPassword: string }) => {
    dto.role = selectedRole;
    registerMutation.mutate(dto);
  };

  const errorMsg = registerMutation.error instanceof ApiError
    ? registerMutation.error.messages[0]
    : registerMutation.error instanceof Error 
    ? registerMutation.error.message 
    : registerMutation.error ? 'Registration failed. Please try again.' : null;

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <CheckCircle2 style={{ width: '3rem', height: '3rem', color: '#16a34a', margin: '0 auto 1rem' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>Account created!</h2>
        {needsEmailConfirmation ? (
          <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>
            Check your inbox and click the confirmation link, then sign in.
          </p>
        ) : (
          <>
            <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>You have successfully registered. Redirecting to sign in…</p>
            <Loader2 className="animate-spin" style={{ width: '1.25rem', height: '1.25rem', color: '#d97706', margin: '1rem auto 0' }} />
          </>
        )}
      </div>
    );
  }

  const isFormValid = isEmailVerified && isPhoneVerified && agreedToTerms;

  return (
    <div className="kr-glass shadow-2xl shadow-gray-200/50 rounded-[2rem] p-8 sm:p-10 border border-kr-border-default max-w-md w-full mx-auto relative z-10">
      <h1 className="text-4xl font-extrabold text-[#1B4332] tracking-tight mb-2">Create your account</h1>
      <p className="text-sm text-kr-text-secondary mb-8">
        Already have an account?{' '}
        <Link href={loginHref(REGISTER_ROLES.find((r) => r.role === selectedRole)?.portal ?? 'farmer')} className="text-[#E76F51] font-semibold hover:text-[#D65A3D] transition-colors">
          Sign in
        </Link>
      </p>

      {errorMsg && (
        <div className="bg-kr-badge-rejected-bg border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium mb-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="m-0">{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Role selector */}
        <div>
          <label className="text-sm font-semibold text-kr-text-primary mb-1.5 block">I am a</label>
          <div className="grid grid-cols-2 gap-3">
            {REGISTER_ROLES.map(({ role: r, label }) => {
              const isSelected = selectedRole === r;
              return (
                <button
                  type="button"
                  key={r}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedRole(r as RegisterRole);
                    setValue('role', r as RegisterRole);
                  }}
                  className={`border-2 rounded-xl p-4 font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    isSelected
                      ? 'bg-[#1B4332]/5 border-[#1B4332] text-[#1B4332] shadow-sm ring-1 ring-[#1B4332]'
                      : 'kr-glass border-kr-border-default text-kr-text-secondary hover:border-[#1B4332]/30 hover:shadow-md'
                  }`}
                >
                  <span className="text-2xl" aria-hidden>{ROLE_EMOJI[r as RegisterRole]}</span>
                  <span className="text-sm">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Full name */}
        <div>
          <label htmlFor="fullName" className="text-sm font-semibold text-kr-text-primary mb-1.5 block">Full name</label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            className="w-full px-4 py-3.5 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none"
            {...register('fullName', {
              required: 'Full name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
            })}
          />
          {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName.message}</p>}
        </div>

        {/* Email — verified with a code sent to the inbox */}
        <ContactOtp
          channel="email"
          label="Email address"
          value={emailValue ?? ""}
          onChange={(v) => setValue('email', v)}
          verified={isEmailVerified}
          onVerified={() => setIsEmailVerified(true)}
          onReset={() => setIsEmailVerified(false)}
        />

        {/* Mobile — verified with an SMS code */}
        <ContactOtp
          channel="sms"
          label="Mobile number"
          value={phoneValue ?? ""}
          onChange={(v) => setValue('phone', v)}
          verified={isPhoneVerified}
          onVerified={() => setIsPhoneVerified(true)}
          onReset={() => setIsPhoneVerified(false)}
        />

        {/* Password */}
        <div>
          <label htmlFor="reg-password" className="text-sm font-semibold text-kr-text-primary mb-1.5 block">Password</label>
          <div className="relative">
            <input
              id="reg-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              className="w-full px-4 py-3.5 pr-10 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none"
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
              className="absolute right-3 top-3.5 text-kr-text-disabled hover:text-kr-text-secondary transition-colors"
            >
              {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="confirm-password" className="text-sm font-semibold text-kr-text-primary mb-1.5 block">Confirm password</label>
          <input
            id="confirm-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            className="w-full px-4 py-3.5 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none"
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (v) => v === password || 'Passwords do not match',
            })}
          />
          {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
        </div>

        {/* T&C Checkbox */}
        <div className="flex items-center mt-4">
          <input
            type="checkbox"
            id="terms"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="w-4 h-4 text-[#1B4332] border-kr-border-default rounded focus:ring-[#1B4332]"
          />
          <label htmlFor="terms" className="ml-2 block text-sm text-kr-text-primary">
            I agree to the <Link href="/terms" className="text-[#E76F51] hover:underline">Terms & Conditions</Link> & <Link href="/privacy" className="text-[#E76F51] hover:underline">Privacy Policy</Link>
          </label>
        </div>

        <button
          type="submit"
          disabled={!isFormValid || registerMutation.isPending}
          className="w-full py-4 mt-4 bg-gradient-to-r from-[#E76F51] to-[#F4A261] hover:from-[#D65A3D] hover:to-[#E76F51] text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:-translate-y-0 disabled:hover:shadow-lg"
        >
          {registerMutation.isPending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Creating account…</>
          ) : 'Signup'}
        </button>
      </form>
    </div>
  );
}
