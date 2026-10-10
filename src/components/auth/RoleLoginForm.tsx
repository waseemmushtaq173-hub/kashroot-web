'use client';

/**
 * RoleLoginForm — every portal's own sign-in page (/login/<portal>). The
 * portal supplies its story, colours and 3D scene mood (portalLoginConfig);
 * this component owns the layout, the credential form and what happens after.
 *
 * Sign-in: Supabase email + password (authApi.login), then the account's roles
 * are checked against the portal. One email is one KashRoot account that can
 * hold several portals:
 *   - farmer, buyer, seller and logistics: an account without that portal is
 *     offered to add it (its details for each portal stay separate);
 *   - admin: only accounts an admin has granted the role;
 *   - shared portals accept any account.
 * Then a one-time code: to the mobile number on the account by SMS and
 * WhatsApp together (email when there is no mobile or phone codes fail on the
 * site's side). The dashboards open only once it is verified.
 * Accounts created before roles were saved have no role: they may use the
 * farmer, buyer and seller portals (bound to that portal, as before), but not
 * the logistics or admin portals.
 *
 * SECURITY: UX only — the backend must authorise every request itself.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { ArrowRight, CircleAlert, Eye, EyeOff, Loader2, PlusCircle } from 'lucide-react';

import { ContactOtp, type PhoneRoute } from '@/components/auth/ContactOtp';
import { PortalAuthFrame } from '@/components/auth/PortalAuthFrame';
import { PORTAL_LOGIN } from '@/components/auth/portalLoginConfig';
import { authApi, SELF_JOIN_ROLES, tokenStore } from '@/lib/api/auth';
import { AUTH_ROUTES, loginHref, PORTALS, portalForRole, safeNextPath, type PortalId } from '@/lib/auth/roles';
import { getKycConfig } from '@/lib/kyc/kyc-service';

const LEGACY_OK: PortalId[] = ['farmer', 'buyer', 'seller'];

type JoinRole = (typeof SELF_JOIN_ROLES)[number];
const isJoinRole = (role: string | null): role is JoinRole => (SELF_JOIN_ROLES as readonly string[]).includes(role ?? '');

interface Session {
  accessToken: string;
  role: string;
  roles: string[];
  kycSubmitted: boolean;
  phone: string | null;
}

interface OtpStep {
  /** Held back until the code is verified; the dashboards open only after tokenStore has it. */
  session: Session;
  channel: 'sms' | 'email';
  to: string;
  routes: PhoneRoute[];
  emailFallback: string | null;
}

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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; portal?: PortalId } | null>(null);
  // Second step: a one-time code to the account's mobile (SMS + WhatsApp) or email.
  const [step, setStep] = useState<OtpStep | null>(null);
  const [codesDown, setCodesDown] = useState(false);
  // Signed in with an account that doesn't have this portal yet: offer to add it.
  const [join, setJoin] = useState<{ session: Session; has: string[] } | null>(null);
  const [joining, setJoining] = useState(false);

  const destination = safeNextPath(next, info.home);
  const focusRing = `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.outline}`;
  const inputClass = `block w-full rounded-xl border-0 bg-white/90 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 shadow-sm ring-1 ring-inset ring-slate-200 transition focus:outline-none focus:ring-2 ${theme.inputFocus}`;
  const canSubmit = email.trim() !== '' && password !== '' && !pending;

  const finish = (session: Session) => {
    tokenStore.setToken(session.accessToken, session.role, session.roles);
    localStorage.setItem('auth_email', email.trim());
    localStorage.setItem('auth_portal', portal);
    // KYC done on any device: never ask again. Otherwise the dashboard opens
    // the KYC panel once, the first time on this browser.
    if (session.kycSubmitted) localStorage.setItem('kyc_status', 'submitted');
    else if (!localStorage.getItem('kyc_status')) localStorage.setItem('kyc_status', 'pending');
    router.replace(destination);
  };

  const cancelStep = async () => {
    await authApi.logout();
    setStep(null);
    setJoin(null);
    setCodesDown(false);
    setPassword('');
  };

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
      const roles = data.accountRoles;
      const required = info.requiredRole;
      const session: Session = { accessToken: data.accessToken, role: required ?? accountRole ?? 'FARMER', roles, kycSubmitted: data.kycSubmitted, phone: data.phone };

      if (required && roles.length > 0 && !roles.includes(required)) {
        // Same person, another portal: offer to add it to this account.
        if (isJoinRole(required)) {
          setJoin({ session, has: roles });
          return;
        }
        await authApi.logout();
        const home = portalForRole(accountRole ?? roles[0]);
        setError({
          text: required === 'ADMIN' ? 'This account is not a KashRoot admin.' : `This account cannot open the ${info.label} portal.`,
          portal: home ?? undefined,
        });
        return;
      }
      if (required && roles.length === 0 && !LEGACY_OK.includes(portal)) {
        await authApi.logout();
        setError({ text: `This account is not set up for the ${info.label} portal. Ask an administrator to enable it.` });
        return;
      }

      navigating = await startCodeStep(session);
    } catch (err) {
      setError({ text: err instanceof Error && err.message ? err.message : 'Failed to sign in. Please check your connection.' });
    } finally {
      if (!navigating) setPending(false);
    }
  };

  /** One-time code to the account's mobile or email; returns true when it went straight in. */
  const startCodeStep = async (session: Session): Promise<boolean> => {
    const config = await getKycConfig();
    const phone = (session.phone ?? '').replace(/\D/g, '').slice(-10);
    const phoneRoutes: PhoneRoute[] = [...(config.sms ? (['sms'] as const) : []), ...(config.whatsapp ? (['whatsapp'] as const) : [])];
    const emailFallback = config.email ? email.trim() : null;
    if (/^[6-9]\d{9}$/.test(phone) && phoneRoutes.length > 0) {
      setStep({ session, channel: 'sms', to: phone, routes: phoneRoutes, emailFallback });
      return false;
    }
    if (emailFallback) {
      setStep({ session, channel: 'email', to: emailFallback, routes: [], emailFallback: null });
      return false;
    }
    finish(session);
    return true;
  };

  const addThisPortal = async () => {
    if (!join || !isJoinRole(info.requiredRole)) return;
    setJoining(true);
    setError(null);
    try {
      const roles = await authApi.addPortalRole(info.requiredRole);
      const session = { ...join.session, roles: [...new Set([...join.session.roles, ...roles])] };
      setJoin(null);
      await startCodeStep(session);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : 'Could not add this portal. Please try again.' });
    } finally {
      setJoining(false);
    }
  };

  if (join) {
    const has = join.has.map((r) => portalForRole(r)).filter((p): p is PortalId => Boolean(p)).map((p) => PORTALS[p].label);
    return (
      <PortalAuthFrame portal={portal} labelledBy={ids.heading}>
        <h2 id={ids.heading} className="text-2xl font-semibold tracking-tight text-slate-900">
          Add the {info.label} portal to your account?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {has.length ? <>This account is already set up for <strong className="text-slate-900">{has.join(', ')}</strong>. </> : null}
          You can use the same email and password for the {info.label} portal too. Your {info.label} details are kept separately from your other portals.
        </p>
        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error.text}
          </p>
        )}
        <button
          type="button"
          onClick={() => void addThisPortal()}
          disabled={joining}
          className={`mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${theme.button} ${focusRing}`}
        >
          {joining ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlusCircle className="h-4 w-4" aria-hidden />}
          Yes, add the {info.label} portal
        </button>
        <button type="button" onClick={() => void cancelStep()} className={`mt-3 w-full cursor-pointer rounded-xl px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 ${focusRing}`}>
          No, sign out
        </button>
      </PortalAuthFrame>
    );
  }

  if (step) {
    const phoneStep = step.channel === 'sms';
    return (
      <PortalAuthFrame portal={portal} labelledBy={ids.heading}>
        <h2 id={ids.heading} className="text-2xl font-semibold tracking-tight text-slate-900">
          Verify it’s you
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {phoneStep ? 'We’re sending a one-time code to the mobile number on your account.' : 'We’re emailing a one-time code to the address on your account.'}
        </p>
        <div className="mt-6">
          <ContactOtp
            key={step.channel}
            channel={step.channel}
            label={phoneStep ? 'Mobile number' : 'Email address'}
            value={step.to}
            onChange={() => undefined}
            locked
            autoSend
            required
            routes={phoneStep ? step.routes : undefined}
            verified={false}
            onVerified={() => finish(step.session)}
            onUnavailable={() => {
              // Phone codes failing on the site's side: fall back to email, then let them in.
              if (phoneStep && step.emailFallback) setStep({ ...step, channel: 'email', to: step.emailFallback, routes: [], emailFallback: null });
              else setCodesDown(true);
            }}
          />
        </div>
        {codesDown && (
          <button type="button" onClick={() => finish(step.session)} className={`mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold shadow-lg ${theme.button} ${focusRing}`}>
            Continue to {info.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
        <p className="mt-6 border-t border-slate-900/5 pt-3 text-sm text-slate-600">
          Not you?{' '}
          <button type="button" onClick={() => void cancelStep()} className={`cursor-pointer rounded font-semibold text-slate-800 underline-offset-4 hover:underline ${focusRing}`}>
            Sign out and use another account
          </button>
        </p>
      </PortalAuthFrame>
    );
  }

  return (
    <PortalAuthFrame portal={portal} labelledBy={ids.heading}>
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
    </PortalAuthFrame>
  );
}
