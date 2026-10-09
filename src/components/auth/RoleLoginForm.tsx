'use client';

/**
 * RoleLoginForm — every portal's own sign-in page (/login/<portal>). The
 * portal supplies its story, colours and 3D scene mood (portalLoginConfig);
 * this component owns the layout, the credential form and what happens after.
 *
 * Sign-in: Supabase email + password (authApi.login), then the account's role
 * is checked against the portal:
 *   - role portals (farmer, buyer, seller, logistics, admin) refuse accounts of
 *     another role and point to the right sign-in;
 *   - shared portals accept any account.
 * Accounts created before roles were saved have no role: they may use the
 * farmer, buyer and seller portals (bound to that portal, as before), but not
 * the logistics or admin portals.
 *
 * SECURITY: UX only — the backend must authorise every request itself.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { ArrowRight, Check, CircleAlert, Eye, EyeOff, Leaf, Loader2 } from 'lucide-react';

import { PORTAL_LOGIN } from '@/components/auth/portalLoginConfig';
import { ValleyScene } from '@/components/three/ValleyScene';
import { authApi, tokenStore } from '@/lib/api/auth';
import { AUTH_ROUTES, loginHref, PORTALS, portalForRole, safeNextPath, type PortalId } from '@/lib/auth/roles';

const LEGACY_OK: PortalId[] = ['farmer', 'buyer', 'seller'];

export interface RoleLoginFormProps {
  portal: PortalId;
  /** Raw `next` from the query string — validated before use. */
  next?: string;
  /** Show the "email verified" banner (set after the OTP step). */
  verified?: boolean;
}

export function RoleLoginForm({ portal, next, verified = false }: RoleLoginFormProps) {
  const router = useRouter();
  const ids = { email: useId(), password: useId(), heading: useId() };
  const info = PORTALS[portal];
  const copy = PORTAL_LOGIN[portal];
  const { theme } = copy;
  const Icon = copy.icon;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; portal?: PortalId } | null>(null);

  const destination = safeNextPath(next, info.home);
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

      const accountRole = data.accountRole;
      const required = info.requiredRole;
      if (required && accountRole && accountRole !== required) {
        await authApi.logout();
        const home = portalForRole(accountRole);
        setError({
          text: home
            ? `This account is registered for the ${PORTALS[home].label} portal.`
            : `This account cannot open the ${info.label} portal.`,
          portal: home ?? undefined,
        });
        return;
      }
      if (required && !accountRole && !LEGACY_OK.includes(portal)) {
        await authApi.logout();
        setError({ text: `This account is not set up for the ${info.label} portal. Ask an administrator to enable it.` });
        return;
      }

      tokenStore.setToken(data.accessToken, required ?? accountRole ?? 'FARMER');
      localStorage.setItem('auth_email', email.trim());
      localStorage.setItem('auth_portal', portal);
      // First sign-in on this browser: ask the dashboard to open the KYC panel.
      if (!localStorage.getItem('kyc_status')) localStorage.setItem('kyc_status', 'pending');

      navigating = true;
      router.replace(destination);
    } catch (err) {
      setError({ text: err instanceof Error && err.message ? err.message : 'Failed to sign in. Please check your connection.' });
    } finally {
      if (!navigating) setPending(false);
    }
  };

  return (
    <div className={`relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden px-4 py-10 ${theme.canvas}`}>
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.18)] ring-1 ring-white/70 backdrop-blur-2xl lg:grid-cols-[1.05fr_1fr]">
        {/* Story over the live 3D valley. */}
        <section className="relative isolate min-h-[220px] overflow-hidden p-6 text-white sm:p-10 lg:flex lg:min-h-[620px] lg:flex-col lg:justify-between">
          <div aria-hidden className={`absolute inset-0 -z-20 bg-gradient-to-b ${theme.canvas}`} />
          <ValleyScene mood={copy.mood} className="-z-20" />
          <div aria-hidden className={`absolute inset-0 -z-10 bg-gradient-to-tr ${theme.sceneTint}`} />

          <BrandLink className={focusRing} />
          <div className="mt-8 lg:mt-0">
            <span data-depth className={`grid h-14 w-14 place-items-center rounded-2xl ${theme.iconTile}`}>
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <p className={`mt-5 text-xs font-semibold uppercase tracking-[0.18em] ${theme.eyebrow}`}>{copy.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white drop-shadow-sm [text-wrap:balance] sm:text-4xl">{copy.headline}</h1>
            <p className="mt-3 max-w-md leading-relaxed text-white/90">{copy.description}</p>
            <ul className="mt-6 hidden space-y-2.5 sm:block">
              {copy.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-white">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/90 shadow-sm">
                    <Check className={`h-3.5 w-3.5 ${theme.bullet}`} aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-8 hidden text-xs text-white/80 lg:block">Escrow-protected trade · Verified growers, traders and buyers</p>
        </section>

        <section aria-labelledby={ids.heading} className="bg-white/80 p-6 text-slate-900 sm:p-10">
          <h2 id={ids.heading} className="text-2xl font-semibold tracking-tight text-slate-900">
            Sign in to the {info.label} portal
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {info.requiredRole ? `For ${info.label.toLowerCase()} accounts.` : 'Any KashRoot account works here.'}
          </p>

          {verified && (
            <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
              Email verified successfully! You can now sign in.
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
            <div>
              <label htmlFor={ids.email} className="block text-sm font-medium text-slate-800">
                Email address
              </label>
              <input
                id={ids.email}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
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
                  {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="flex-1">
                  {error.text}{' '}
                  {error.portal && (
                    <Link href={loginHref(error.portal)} className="font-semibold underline underline-offset-2">
                      Go to the {PORTALS[error.portal].label} sign-in
                    </Link>
                  )}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${theme.button} ${focusRing}`}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {pending ? 'Signing in…' : `Sign in to ${info.label}`}
              {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
            </button>
          </form>

          <div className="mt-6 space-y-3 text-sm text-slate-600">
            {portal !== 'admin' && (
              <p>
                New to KashRoot?{' '}
                <Link href={AUTH_ROUTES.register(portal)} className={`rounded font-semibold ${theme.link} ${focusRing}`}>
                  Create an account
                </Link>
              </p>
            )}
            <p className="border-t border-slate-900/5 pt-3">
              Wrong portal?{' '}
              <Link href="/login" className={`rounded font-semibold text-slate-800 underline-offset-4 hover:underline ${focusRing}`}>
                Choose another sign-in
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
    <Link href="/" className={`inline-flex items-center gap-2 rounded-xl text-white no-underline hover:no-underline ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 text-white ring-1 ring-white/40 backdrop-blur">
        <Leaf className="h-4 w-4" aria-hidden />
      </span>
      <span className="text-base font-semibold tracking-tight">KashRoot</span>
    </Link>
  );
}
