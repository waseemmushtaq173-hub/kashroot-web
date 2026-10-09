'use client';

/**
 * RoleLoginForm — the shared engine behind <FarmerLogin />, <BuyerLogin /> and
 * <SellerLogin />. Each wrapper supplies its own story (headline, copy,
 * highlights) and palette; this component owns layout, the credential form and
 * what happens after sign-in.
 *
 * Sign-in mirrors the old /login page: authApi.login (Supabase email +
 * password), then tokenStore.setToken with the role of the portal the user
 * signed in through. On success the user goes to `next` (validated — see
 * safeNextPath) or the portal's dashboard.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  CircleAlert,
  Eye,
  EyeOff,
  Leaf,
  Loader2,
} from 'lucide-react';

import { authApi, tokenStore } from '@/lib/api/auth';
import {
  AUTH_ROUTES,
  loginHref,
  PORTAL_ROLES,
  ROLE_HOME,
  ROLE_LABELS,
  ROLE_VALUE,
  safeNextPath,
  type PortalRole,
} from '@/lib/auth/roles';

/** Complete literal Tailwind classes — see lib/tools.ts for why. */
export interface RoleLoginTheme {
  canvas: string;
  glowA: string;
  glowB: string;
  /** Background of the story panel (left on desktop). */
  story: string;
  iconTile: string;
  eyebrow: string;
  bullet: string;
  button: string;
  link: string;
  /** focus-visible outline colour for buttons and links. */
  outline: string;
  /** Focus ring colour for inputs. */
  inputFocus: string;
}

export interface RoleLoginFormProps {
  role: PortalRole;
  /** Rendered icon element (not a component: this crosses the server/client boundary). */
  icon: ReactNode;
  eyebrow: string;
  headline: string;
  description: string;
  highlights: readonly string[];
  identifierLabel: string;
  identifierPlaceholder: string;
  theme: RoleLoginTheme;
  /** Raw `next` from the query string — validated before use. */
  next?: string;
  /** Show the "email verified" banner (set after the OTP step). */
  verified?: boolean;
}

export function RoleLoginForm({
  role,
  icon,
  eyebrow,
  headline,
  description,
  highlights,
  identifierLabel,
  identifierPlaceholder,
  theme,
  next,
  verified = false,
}: RoleLoginFormProps) {
  const router = useRouter();
  const ids = { email: useId(), password: useId(), heading: useId() };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = ROLE_LABELS[role];
  const destination = safeNextPath(next, ROLE_HOME[role]);
  // Carry a valid `next` across when switching to another portal's sign-in.
  const carriedNext = safeNextPath(next, '') || undefined;
  const focusRing = `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.outline}`;
  const inputClass = `block w-full rounded-xl border-0 bg-white/90 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 shadow-sm ring-1 ring-inset ring-slate-200 transition focus:outline-none focus:ring-2 ${theme.inputFocus}`;

  const canSubmit = email.trim() !== '' && password !== '' && !pending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    let navigating = false;
    try {
      const data = await authApi.login({ email: email.trim(), password });
      if (!data.accessToken) throw new Error('Sign-in did not return a session. Please try again.');

      const roleValue = ROLE_VALUE[role];
      tokenStore.setToken(data.accessToken, roleValue);
      localStorage.setItem('auth_email', email.trim());
      // First sign-in on this browser: ask the dashboard to open the KYC panel.
      if (!localStorage.getItem('kyc_status')) localStorage.setItem('kyc_status', 'pending');

      navigating = true;
      router.replace(destination);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to sign in. Please check your connection.');
    } finally {
      // Leave the button spinning while the next page loads.
      if (!navigating) setPending(false);
    }
  };

  return (
    <div className={`relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden px-4 py-10 ${theme.canvas}`}>
      <div
        aria-hidden
        className={`pointer-events-none absolute -left-24 -top-24 -z-10 h-[26rem] w-[26rem] rounded-full blur-3xl ${theme.glowA}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute -bottom-32 -right-20 -z-10 h-[30rem] w-[30rem] rounded-full blur-3xl ${theme.glowB}`}
      />

      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white/50 shadow-[0_30px_80px_rgba(15,23,42,0.15)] ring-1 ring-white/70 backdrop-blur-2xl lg:grid-cols-[1.05fr_1fr]">
        {/* Story — the portal's own message. Desktop only; phones get the compact version above the form. */}
        <section className={`relative hidden flex-col justify-between gap-10 p-10 lg:flex ${theme.story}`}>
          <BrandLink className={focusRing} />
          <div>
            <span className={`grid h-14 w-14 place-items-center rounded-2xl ${theme.iconTile}`}>{icon}</span>
            <p className={`mt-6 text-xs font-semibold uppercase tracking-[0.18em] ${theme.eyebrow}`}>{eyebrow}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900 [text-wrap:balance]">{headline}</h1>
            <p className="mt-3 max-w-md leading-relaxed text-slate-700">{description}</p>
            <ul className="mt-6 space-y-2.5">
              {highlights.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-slate-800">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/80 shadow-sm">
                    <Check className={`h-3.5 w-3.5 ${theme.bullet}`} aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-600">Escrow-protected trade · Verified growers, traders and buyers</p>
        </section>

        <section aria-labelledby={ids.heading} className="bg-white/70 p-6 text-slate-900 sm:p-10">
          <div className="lg:hidden">
            <BrandLink className={focusRing} />
            <div className="mt-6 flex items-center gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${theme.iconTile}`}>{icon}</span>
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${theme.eyebrow}`}>{eyebrow}</p>
                <p className="text-xl font-semibold tracking-tight text-slate-900">{headline}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{description}</p>
          </div>

          <h2 id={ids.heading} className="mt-8 text-2xl font-semibold tracking-tight text-slate-900 lg:mt-0">
            Sign in to the {label} portal
          </h2>
          <p className="mt-1 text-sm text-slate-600">Use the email you registered with.</p>

          {verified && (
            <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
              Email verified successfully! You can now sign in.
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            <div>
              <label htmlFor={ids.email} className="block text-sm font-medium text-slate-800">
                {identifierLabel}
              </label>
              <input
                id={ids.email}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={identifierPlaceholder}
                className={`mt-1.5 ${inputClass}`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor={ids.password} className="block text-sm font-medium text-slate-800">
                  Password
                </label>
                <Link
                  href={AUTH_ROUTES.forgotPassword}
                  className={`rounded text-sm font-medium ${theme.link} ${focusRing}`}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative mt-1.5">
                <input
                  id={ids.password}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className={`absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 ${focusRing}`}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${theme.button} ${focusRing}`}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {pending ? 'Signing in…' : `Sign in as ${label}`}
              {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-sm text-slate-600">
            <p>
              New to Kashroot?{' '}
              <Link
                href={AUTH_ROUTES.register()}
                className={`rounded font-semibold ${theme.link} ${focusRing}`}
              >
                Create an account
              </Link>
            </p>
            <p className="border-t border-slate-900/5 pt-3">
              Not a {label.toLowerCase()}? Sign in as{' '}
              {PORTAL_ROLES.filter((r) => r !== role).map((r, i) => (
                <span key={r}>
                  {i > 0 && ' or '}
                  <Link
                    href={loginHref(r, carriedNext)}
                    className={`rounded font-semibold text-slate-800 underline-offset-4 hover:underline ${focusRing}`}
                  >
                    {ROLE_LABELS[r]}
                  </Link>
                </span>
              ))}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function BrandLink({ className }: { className: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 rounded-xl no-underline hover:no-underline ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/30">
        <Leaf className="h-4 w-4" aria-hidden />
      </span>
      <span className="text-base font-semibold tracking-tight text-slate-900">Kashroot</span>
    </Link>
  );
}
