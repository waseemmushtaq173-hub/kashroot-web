'use client';

/**
 * RoleLoginForm — the shared engine behind <FarmerLogin />, <BuyerLogin /> and
 * <SellerLogin />. Each wrapper supplies its own story (headline, copy,
 * highlights) and palette; this component owns layout, the credential form and
 * what happens after sign-in.
 *
 * Adapted from the web-overhaul stub for this repo's auth. Sign-in is Supabase
 * through `authApi.login`, which takes an email and password and returns no
 * role list, so three things from the stub are gone:
 *
 *   - the identifier is an email, not "mobile number or email": Supabase signs
 *     in with an email address only, and a phone placeholder would promise
 *     something that cannot work;
 *   - the post-sign-in role check (and its "this account is a Buyer, not a
 *     Farmer" branch) has nothing to check against — a session's role is the
 *     page it signed in through, enforced later by the dashboard guard;
 *   - the authenticator-code step is unreachable, because `authApi.login`
 *     hardcodes `requiresMfa: false`.
 *
 * On success the token and role go to `tokenStore.setToken`, which writes
 * auth_token and user_role to both localStorage and a cookie, and the user
 * lands on `next` (validated — see safeNextPath) or the role's dashboard.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Leaf, Loader2 } from 'lucide-react';

import { authApi, tokenStore } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import {
  AUTH_ROUTES,
  loginHref,
  LOGIN_ROLES,
  ROLE_HOME,
  ROLE_LABELS,
  safeNextPath,
  SELF_REGISTER_ROLES,
  SESSION_ROLE,
  type LoginRole,
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
  role: LoginRole;
  /** Rendered icon element (not a component: this crosses the server/client boundary). */
  icon: ReactNode;
  eyebrow: string;
  headline: string;
  description: string;
  highlights: readonly string[];
  emailLabel: string;
  emailPlaceholder: string;
  theme: RoleLoginTheme;
  /** Raw `next` from the query string — validated before use. */
  next?: string;
}

export function RoleLoginForm({
  role,
  icon,
  eyebrow,
  headline,
  description,
  highlights,
  emailLabel,
  emailPlaceholder,
  theme,
  next,
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
  // Carry a valid `next` across when switching to another role's sign-in.
  const carriedNext = safeNextPath(next, '') || undefined;
  const focusRing = `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.outline}`;
  // border-0: @tailwindcss/forms puts a grey border on inputs, and these draw
  // their own with ring classes, so without it the two show as a double edge.
  const inputClass = `block w-full rounded-xl border-0 bg-white/90 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 shadow-sm ring-1 ring-inset ring-slate-200 transition focus:outline-none focus:ring-2 ${theme.inputFocus}`;

  const canSubmit = email.trim() !== '' && password !== '' && !pending;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    let navigating = false;
    try {
      const result = await authApi.login({ email: email.trim(), password });
      if (!result.accessToken) {
        // Navigating without a token lands on the dashboard guard, which
        // bounces straight back here and loses the reason why.
        setError('Sign-in did not return a session. Please try again.');
        return;
      }
      tokenStore.setToken(result.accessToken, SESSION_ROLE[role]);
      localStorage.setItem('auth_email', email.trim());
      navigating = true;
      router.replace(destination);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.messages[0] ?? 'Unable to sign in.'
          : reason instanceof Error
            ? reason.message
            : 'Something went wrong. Please try again.',
      );
    } finally {
      // Leave the button spinning while the next page loads.
      if (!navigating) setPending(false);
    }
  };

  return (
    <div
      className={`relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden px-4 py-10 text-slate-900 ${theme.canvas}`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -left-24 -top-24 -z-10 h-[26rem] w-[26rem] rounded-full blur-3xl ${theme.glowA}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute -bottom-32 -right-20 -z-10 h-[30rem] w-[30rem] rounded-full blur-3xl ${theme.glowB}`}
      />

      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white/50 shadow-[0_30px_80px_rgba(15,23,42,0.15)] ring-1 ring-white/70 backdrop-blur-2xl lg:grid-cols-[1.05fr_1fr]">
        {/* Story — the role's own message. Desktop only; phones get the compact version above the form. */}
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
                    <Check className={`h-3.5 w-3.5 ${theme.bullet}`} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-600">Escrow-protected trade · Verified growers, traders and buyers</p>
        </section>

        <section aria-labelledby={ids.heading} className="bg-white/70 p-6 sm:p-10">
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
          <p className="mt-1 text-sm text-slate-600">Use the email address you registered with.</p>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            <div>
              <label htmlFor={ids.email} className="block text-sm font-medium text-slate-800">
                {emailLabel}
              </label>
              <input
                id={ids.email}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={emailPlaceholder}
                className={`mt-1.5 ${inputClass}`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor={ids.password} className="block text-sm font-medium text-slate-800">
                  Password
                </label>
                <Link href={AUTH_ROUTES.forgotPassword} className={`rounded text-sm font-medium ${theme.link} ${focusRing}`}>
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
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="flex-1">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${theme.button} ${focusRing}`}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? 'Signing in…' : `Sign in as ${label}`}
              {!pending && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-sm text-slate-600">
            {SELF_REGISTER_ROLES.includes(role) ? (
              <p>
                New to Kashroot?{' '}
                <Link href={AUTH_ROUTES.register(role)} className={`rounded font-semibold ${theme.link} ${focusRing}`}>
                  Create a {label.toLowerCase()} account
                </Link>
              </p>
            ) : (
              <p>Seller accounts are issued by Kashroot — get in touch to have one set up.</p>
            )}
            <p className="border-t border-slate-900/5 pt-3">
              Not a {label.toLowerCase()}? Sign in as{' '}
              {LOGIN_ROLES.filter((r) => r !== role).map((r, i) => (
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
              .{' '}
              <Link
                href={AUTH_ROUTES.otherRoles}
                className={`rounded font-semibold text-slate-800 underline-offset-4 hover:underline ${focusRing}`}
              >
                Other roles
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function BrandLink({ className }: { className: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 rounded-xl ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/30">
        <Leaf className="h-4 w-4" />
      </span>
      <span className="text-base font-semibold tracking-tight text-slate-900">Kashroot</span>
    </Link>
  );
}
