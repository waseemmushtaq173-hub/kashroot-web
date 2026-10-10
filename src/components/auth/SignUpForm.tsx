'use client';

/**
 * SignUpForm — creates a Supabase account. Two ways in:
 *   - from a portal (/register/<portal>): the account type is fixed by the
 *     portal and the form wears that portal's colours — nobody is asked again
 *     what kind of account they want;
 *   - from /register with no portal: a picker for the account type, which
 *     recolours the surrounding AuthShell.
 * Email/SMS codes are asked for only when the site has a provider for them;
 * otherwise Supabase's confirmation email verifies the address and the mobile
 * number is optional.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AlertCircle, ArrowRight, Check, CheckCircle2, Eye, EyeOff, GraduationCap, Leaf, Loader2, ShoppingBag, Store, Truck, type LucideIcon } from 'lucide-react';

import { setAuthTheme, type AuthThemeId } from '@/components/auth/AuthShell';
import { ContactOtp } from '@/components/auth/ContactOtp';
import { PORTAL_LOGIN } from '@/components/auth/portalLoginConfig';
import { authApi, type RegisterDto } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { loginHref, PORTALS, REGISTER_ROLES, SIGNUP_ROLE, type PortalId, type SignUpRole } from '@/lib/auth/roles';
import { getKycConfig } from '@/lib/kyc/kyc-service';

type RegisterRole = SignUpRole;

const ROLE_STYLE: Record<RegisterRole, { icon: LucideIcon; label: string; theme: AuthThemeId; hint: string; tile: string; selected: string; button: string; ring: string; text: string }> = {
  FARMER: {
    icon: Leaf,
    label: 'Farmer',
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
    label: 'Buyer',
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
    label: 'Seller',
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
    label: 'Logistics',
    theme: 'logistics',
    hint: 'Transport & cold chain',
    tile: 'from-teal-400 to-cyan-700 shadow-cyan-700/30',
    selected: 'bg-gradient-to-br from-teal-50 to-cyan-50 ring-2 ring-teal-500',
    button: 'from-teal-600 to-cyan-700 shadow-cyan-700/30',
    ring: 'focus:ring-teal-500',
    text: 'text-teal-700',
  },
};

/** Full class strings for the parts of the form that take the accent colour. */
interface Look {
  tile: string;
  button: string;
  ring: string;
  text: string;
}

function lookFor(portal: PortalId | undefined, role: RegisterRole): Look {
  if (portal) {
    const t = PORTAL_LOGIN[portal].theme;
    return { tile: t.iconTile, button: t.button, ring: t.inputFocus, text: t.link };
  }
  const s = ROLE_STYLE[role];
  return { tile: `bg-gradient-to-br text-white shadow-lg ${s.tile}`, button: `bg-gradient-to-r text-white ${s.button}`, ring: s.ring, text: s.text };
}

export interface SignUpFormProps {
  /** The portal the person came from; fixes the account type. */
  portal?: PortalId;
  /** Preselected type for the general page. */
  initialRole?: RegisterRole;
  /** id for the heading (the frame labels its section with it). */
  headingId?: string;
}

export function SignUpForm({ portal, initialRole = 'FARMER', headingId }: SignUpFormProps) {
  const router = useRouter();
  const lockedRole = portal ? SIGNUP_ROLE[portal] : undefined;
  const requested: RegisterRole = lockedRole ?? initialRole;
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
  const RoleIcon = style.icon;
  const look = lookFor(portal, selectedRole);
  const otpAccent = { button: look.button, ring: look.ring, text: look.text, tile: look.tile };
  // Where this account signs in: the portal it came from, else its role's portal.
  const homePortal: PortalId = portal ?? REGISTER_ROLES.find((r) => r.role === selectedRole)?.portal ?? 'farmer';

  // On the general page, recolour the frame and its 3D valley for the chosen type.
  useEffect(() => {
    if (portal) return;
    setAuthTheme(style.theme);
    return () => setAuthTheme('default');
  }, [portal, style.theme]);

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
    onSuccess: (result) => {
      setSuccess(true);
      setNeedsEmailConfirmation(result.needsEmailConfirmation);
      if (result.needsEmailConfirmation) return;
      setTimeout(() => router.push(loginHref(homePortal)), 2000);
    },
  });

  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);
  const resend = useMutation({
    mutationFn: () => authApi.resendSignupEmail(String(emailValue ?? '').trim(), selectedRole, homePortal),
    onSuccess: () => setResendIn(60),
  });

  const onSubmit = ({ confirmPassword: _confirm, ...dto }: RegisterDto & { confirmPassword: string }) => {
    registerMutation.mutate({ ...dto, role: selectedRole, portal: homePortal });
  };

  const errorMsg =
    registerMutation.error instanceof ApiError
      ? registerMutation.error.messages[0]
      : registerMutation.error instanceof Error
        ? registerMutation.error.message
        : registerMutation.error
          ? 'Registration failed. Please try again.'
          : null;

  const input = `block w-full rounded-xl border-0 bg-white px-4 py-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 transition focus:ring-2 ${look.ring}`;

  if (success) {
    return (
      <div className="py-6 text-center">
        <span className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${look.tile}`}>
          <CheckCircle2 className="h-8 w-8" aria-hidden />
        </span>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Account created!</h2>
        {needsEmailConfirmation ? (
          <>
            <p className="mt-2 text-slate-600">
              We emailed a confirmation link to <strong className="text-slate-900">{emailValue}</strong>. Click it (check Spam and Promotions too), then sign in.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href={loginHref(homePortal)} className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold no-underline shadow-lg hover:no-underline ${look.button}`}>
                Go to {PORTALS[homePortal].label} sign in <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <button
                type="button"
                disabled={resendIn > 0 || resend.isPending}
                onClick={() => resend.mutate()}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resend.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend email'}
              </button>
            </div>
            {resend.isSuccess && resendIn > 0 && <p className="mt-3 text-sm text-emerald-700">Sent again — it can take a minute to arrive.</p>}
            {resend.error && <p role="alert" className="mt-3 text-sm text-rose-700">{(resend.error as Error).message}</p>}
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
      {portal ? (
        <>
          <h2 id={headingId} className="text-2xl font-semibold tracking-tight text-slate-900">
            Create your {PORTALS[portal].label} account
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Already have one?{' '}
            <Link href={loginHref(portal)} className={`font-semibold ${look.text}`}>
              Sign in to {PORTALS[portal].label}
            </Link>
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
            <span className={`grid h-6 w-6 place-items-center rounded-full ${look.tile}`}>
              <RoleIcon className="h-3.5 w-3.5" aria-hidden />
            </span>
            {PORTALS[portal].requiredRole ? `${style.label} account` : `${style.label} account · also opens the ${style.label} portal`}
          </p>
        </>
      ) : (
        <>
          <h1 id={headingId} className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Create your <span className={`bg-gradient-to-r bg-clip-text text-transparent ${style.button}`}>account</span>
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Already have one?{' '}
            <Link href={loginHref(homePortal)} className={`font-semibold hover:underline ${look.text}`}>
              Sign in
            </Link>
          </p>
        </>
      )}

      {errorMsg && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-5">
        {!portal && (
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
        )}

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

        <div className="space-y-3">
          <ContactOtp
            channel="email"
            label="Email address"
            accent={otpAccent}
            required={contactConfig ? contactConfig.email : undefined}
            value={emailValue ?? ''}
            onChange={(v) => {
              setValue('email', v);
              setIsEmailVerified(false);
            }}
            verified={isEmailVerified}
            onVerified={() => setIsEmailVerified(true)}
            onReset={() => setIsEmailVerified(false)}
          />
          <ContactOtp
            channel="sms"
            label="Mobile number"
            accent={otpAccent}
            required={contactConfig ? contactConfig.sms : undefined}
            value={phoneValue ?? ''}
            onChange={(v) => {
              setValue('phone', v);
              setIsPhoneVerified(false);
            }}
            verified={isPhoneVerified}
            onVerified={() => setIsPhoneVerified(true)}
            onReset={() => setIsPhoneVerified(false)}
          />
          {!phoneOk && !contactConfig?.sms && <p className="text-xs text-rose-600">Enter a valid 10-digit Indian mobile number, or leave it empty.</p>}
        </div>

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
            I agree to the <Link href="/terms" className={`font-semibold hover:underline ${look.text}`}>Terms</Link> and <Link href="/privacy" className={`font-semibold hover:underline ${look.text}`}>Privacy Policy</Link>
          </span>
        </label>

        <button
          type="submit"
          disabled={!isFormValid || registerMutation.isPending}
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-4 text-base font-semibold shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${look.button}`}
        >
          {registerMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          {registerMutation.isPending ? 'Creating account…' : 'Create account'}
          {!registerMutation.isPending && <ArrowRight className="h-5 w-5" aria-hidden />}
        </button>
      </form>

      {portal === 'expert' && (
        <p className="mt-6 flex items-center gap-2 border-t border-slate-900/5 pt-4 text-sm text-slate-600">
          <GraduationCap className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Agronomist?{' '}
            <Link href="/register/agronomist" className={`font-semibold ${look.text}`}>
              Apply to answer questions
            </Link>
          </span>
        </p>
      )}
    </div>
  );
}
