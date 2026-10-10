'use client';

/**
 * Create an account (Supabase sign-up). The account type recolours the page
 * and its 3D valley. Email/SMS codes are asked for only when the site has a
 * provider for them; otherwise Supabase's confirmation email verifies the
 * address and the mobile number is optional.
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AlertCircle, ArrowRight, Check, CheckCircle2, Eye, EyeOff, Leaf, Loader2, Mail, ShoppingBag, Smartphone, Store, Truck, type LucideIcon } from 'lucide-react';

import { setAuthTheme, type AuthThemeId } from '@/components/auth/AuthShell';
import { ContactOtp } from '@/components/auth/ContactOtp';
import { authApi, type RegisterDto } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { loginHref, REGISTER_ROLES } from '@/lib/auth/roles';
import { getKycConfig } from '@/lib/kyc/kyc-service';

type RegisterRole = RegisterDto['role'];

const ROLE_STYLE: Record<RegisterRole, { icon: LucideIcon; theme: AuthThemeId; hint: string; tile: string; selected: string; button: string; ring: string; text: string }> = {
  FARMER: {
    icon: Leaf,
    theme: 'farmer',
    hint: 'Sell my harvest',
    tile: 'from-emerald-400 to-green-600 shadow-emerald-600/30',
    selected: 'bg-gradient-to-br from-emerald-50 to-lime-50 ring-2 ring-emerald-500',
    button: 'from-emerald-600 to-teal-600 shadow-emerald-600/30',
    ring: 'focus:ring-emerald-500',
    text: 'text-emerald-700',
  },
  BUYER: {
    icon: ShoppingBag,
    theme: 'buyer',
    hint: 'Source produce',
    tile: 'from-sky-400 to-indigo-500 shadow-indigo-500/30',
    selected: 'bg-gradient-to-br from-sky-50 to-indigo-50 ring-2 ring-sky-500',
    button: 'from-sky-600 to-indigo-600 shadow-indigo-600/30',
    ring: 'focus:ring-sky-500',
    text: 'text-sky-700',
  },
  SELLER: {
    icon: Store,
    theme: 'seller',
    hint: 'Sell inputs & packaging',
    tile: 'from-amber-400 to-orange-500 shadow-orange-500/30',
    selected: 'bg-gradient-to-br from-amber-50 to-orange-50 ring-2 ring-amber-500',
    button: 'from-amber-500 to-orange-600 shadow-orange-600/30',
    ring: 'focus:ring-amber-500',
    text: 'text-amber-700',
  },
  PROVIDER: {
    icon: Truck,
    theme: 'logistics',
    hint: 'Transport & cold chain',
    tile: 'from-teal-400 to-cyan-700 shadow-cyan-700/30',
    selected: 'bg-gradient-to-br from-teal-50 to-cyan-50 ring-2 ring-teal-500',
    button: 'from-teal-600 to-cyan-700 shadow-cyan-700/30',
    ring: 'focus:ring-teal-500',
    text: 'text-teal-700',
  },
};

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
  const requested = (REGISTER_ROLES.find((r) => r.role === searchParams.get('role'))?.role ?? 'FARMER') as RegisterRole;
  const [showPw, setShowPw] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RegisterRole>(requested);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  // Codes only when the site has an email/SMS provider (see /api/kyc/config).
  const [contactConfig, setContactConfig] = useState<{ sms: boolean; email: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    void getKycConfig().then((c) => live && setContactConfig({ sms: c.sms, email: c.email }));
    return () => {
      live = false;
    };
  }, []);

  const style = ROLE_STYLE[selectedRole];
  const portal = REGISTER_ROLES.find((r) => r.role === selectedRole)?.portal ?? 'farmer';

  // Recolour the frame and its 3D valley for the chosen account type.
  useEffect(() => {
    setAuthTheme(style.theme);
    return () => setAuthTheme('default');
  }, [style.theme]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterDto & { confirmPassword: string }>({ defaultValues: { role: requested } });

  const emailValue = watch('email', '');
  const phoneValue = watch('phone', '');
  const password = watch('password', '');

  const registerMutation = useMutation({
    mutationFn: (dto: RegisterDto) => authApi.register(dto),
    onSuccess: (result, variables) => {
      setSuccess(true);
      setNeedsEmailConfirmation(result.needsEmailConfirmation);
      if (result.needsEmailConfirmation) return;
      const role = REGISTER_ROLES.find((r) => r.role === variables.role)?.portal ?? 'farmer';
      setTimeout(() => router.push(loginHref(role)), 2000);
    },
  });

  const onSubmit = ({ confirmPassword: _confirm, ...dto }: RegisterDto & { confirmPassword: string }) => {
    dto.role = selectedRole;
    registerMutation.mutate(dto);
  };

  const errorMsg =
    registerMutation.error instanceof ApiError
      ? registerMutation.error.messages[0]
      : registerMutation.error instanceof Error
        ? registerMutation.error.message
        : registerMutation.error
          ? 'Registration failed. Please try again.'
          : null;

  const input = `block w-full rounded-xl border-0 bg-white px-4 py-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 transition focus:ring-2 ${style.ring}`;

  if (success) {
    return (
      <div className="py-6 text-center">
        <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${style.tile}`}>
          <CheckCircle2 className="h-8 w-8" aria-hidden />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Account created!</h2>
        {needsEmailConfirmation ? (
          <>
            <p className="mt-2 text-slate-600">
              We emailed a confirmation link to <strong className="text-slate-900">{emailValue}</strong>. Click it (check Spam and Promotions too), then sign in.
            </p>
            <Link href={loginHref(portal)} className={`mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r px-6 py-3 font-semibold text-white no-underline shadow-lg hover:no-underline ${style.button}`}>
              Go to sign in <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </>
        ) : (
          <p className="mt-2 flex items-center justify-center gap-2 text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Taking you to sign in…
          </p>
        )}
      </div>
    );
  }

  const emailFormatOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((emailValue ?? '').trim());
  const phoneDigits = (phoneValue ?? '').replace(/\D/g, '');
  const emailOk = contactConfig?.email ? isEmailVerified : emailFormatOk;
  const phoneOk = contactConfig?.sms ? isPhoneVerified : phoneDigits.length === 0 || /^(91)?[6-9]\d{9}$/.test(phoneDigits);
  const isFormValid = emailOk && phoneOk && agreedToTerms;

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Create your <span className={`bg-gradient-to-r bg-clip-text text-transparent ${style.button}`}>account</span>
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Already have one?{' '}
        <Link href={loginHref(portal)} className={`font-semibold hover:underline ${style.text}`}>
          Sign in
        </Link>
      </p>

      {errorMsg && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-800">I am a</legend>
          <div className="grid grid-cols-2 gap-3">
            {REGISTER_ROLES.map(({ role, label }) => {
              const r = role as RegisterRole;
              const s = ROLE_STYLE[r];
              const Icon = s.icon;
              const on = selectedRole === r;
              return (
                <button
                  type="button"
                  key={r}
                  aria-pressed={on}
                  onClick={() => {
                    setSelectedRole(r);
                    setValue('role', r);
                  }}
                  className={`relative flex cursor-pointer items-center gap-3 rounded-2xl p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${on ? `${s.selected} shadow-md` : 'bg-white ring-1 ring-slate-200'}`}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg ${s.tile}`}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">{label}</span>
                    <span className="block truncate text-xs text-slate-500">{s.hint}</span>
                  </span>
                  {on && (
                    <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-white shadow">
                      <Check className={`h-3.5 w-3.5 ${s.text}`} aria-hidden />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="fullName" className="mb-1.5 block text-sm font-semibold text-slate-800">Full name</label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            placeholder="As on your Aadhaar"
            className={input}
            {...register('fullName', { required: 'Full name is required', minLength: { value: 2, message: 'Name must be at least 2 characters' } })}
          />
          {errors.fullName && <p className="mt-1 text-xs text-rose-600">{errors.fullName.message}</p>}
        </div>

        {contactConfig?.email ? (
          <ContactOtp channel="email" label="Email address" value={emailValue ?? ''} onChange={(v) => setValue('email', v)} verified={isEmailVerified} onVerified={() => setIsEmailVerified(true)} onReset={() => setIsEmailVerified(false)} />
        ) : (
          <div>
            <label htmlFor="reg-email" className="mb-1.5 block text-sm font-semibold text-slate-800">Email address</label>
            <span className="relative block">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input id="reg-email" type="email" autoComplete="email" value={emailValue ?? ''} onChange={(e) => setValue('email', e.target.value)} placeholder="you@example.com" className={`${input} pl-10`} />
            </span>
            <p className="mt-1 text-xs text-slate-500">We’ll email you a link to confirm this address.</p>
          </div>
        )}

        {contactConfig?.sms ? (
          <ContactOtp channel="sms" label="Mobile number" value={phoneValue ?? ''} onChange={(v) => setValue('phone', v)} verified={isPhoneVerified} onVerified={() => setIsPhoneVerified(true)} onReset={() => setIsPhoneVerified(false)} />
        ) : (
          <div>
            <label htmlFor="reg-phone" className="mb-1.5 block text-sm font-semibold text-slate-800">
              Mobile number <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <span className="relative block">
              <Smartphone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="reg-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phoneValue ?? ''}
                onChange={(e) => setValue('phone', e.target.value.replace(/[^\d+ ]/g, '').slice(0, 14))}
                placeholder="10-digit mobile number"
                className={`${input} pl-10`}
              />
            </span>
            {!phoneOk && <p className="mt-1 text-xs text-rose-600">Enter a valid 10-digit Indian mobile number, or leave it empty.</p>}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="reg-password" className="mb-1.5 block text-sm font-semibold text-slate-800">Password</label>
            <span className="relative block">
              <input
                id="reg-password"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                className={`${input} pr-11`}
                {...register('password', {
                  required: 'Password is required',
                  minLength: { value: 8, message: 'At least 8 characters' },
                  pattern: { value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, message: 'Use upper- and lowercase letters and a number' },
                })}
              />
              <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
            {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-semibold text-slate-800">Confirm password</label>
            <input
              id="confirm-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              className={input}
              {...register('confirmPassword', { required: 'Please confirm your password', validate: (v) => v === password || 'Passwords do not match' })}
            />
            {errors.confirmPassword && <p className="mt-1 text-xs text-rose-600">{errors.confirmPassword.message}</p>}
          </div>
        </div>

        <label htmlFor="terms" className="flex items-start gap-2.5 text-sm text-slate-700">
          <input id="terms" type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" />
          <span>
            I agree to the <Link href="/terms" className={`font-semibold hover:underline ${style.text}`}>Terms</Link> and <Link href="/privacy" className={`font-semibold hover:underline ${style.text}`}>Privacy Policy</Link>
          </span>
        </label>

        <button
          type="submit"
          disabled={!isFormValid || registerMutation.isPending}
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-5 py-4 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${style.button}`}
        >
          {registerMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          {registerMutation.isPending ? 'Creating account…' : 'Create account'}
          {!registerMutation.isPending && <ArrowRight className="h-5 w-5" aria-hidden />}
        </button>
      </form>
    </div>
  );
}
