'use client';

/**
 * RoleLoginForm — every portal's own sign-in page (/login/<portal>). The
 * portal supplies its story, colours and 3D scene mood (portalLoginConfig);
 * this component owns the layout, the credential form and what happens after.
 *
 * Sign-in: Supabase email + password (authApi.login). Every portal is its
 * own sign-in (lib/auth/portalAccess): being signed in to another portal on
 * this device does not open this one. One email is one KashRoot account that
 * can hold an account in several portals:
 *   - an account without one in this portal is offered "Create your
 *     <portal> account" (its details for each portal stay separate);
 *   - admin: only accounts an admin has granted the role.
 * Then a one-time code: to the mobile number on the account by SMS and
 * WhatsApp together (email when there is no mobile or phone codes fail on the
 * site's side). The dashboards open only once it is verified.
 * Coming back (lib/auth/session):
 *   - the portal was locked after 12 hours unused, but the account is still
 *     signed in on this device: one big "Continue as <name>" opens it again;
 *   - the device signed out after 7 days unused: "Welcome back, <name>" with
 *     the email filled in and the password box ready (the browser's saved
 *     password makes it one tap). "Forget me on this device" removes that;
 *     on the "Continue as" card, "Sign out and forget me on this device"
 *     also signs the account out here (a shared phone).
 * Accounts created before roles were saved have no role: they may use the
 * farmer and buyer portals (bound to that portal, as before), but not the
 * admin portal.
 *
 * SECURITY: UX only — the backend must authorise every request itself.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CircleAlert, Eye, EyeOff, Loader2, PlusCircle, UserRound } from 'lucide-react';

import { ContactOtp, type PhoneRoute } from '@/components/auth/ContactOtp';
import { PortalAuthFrame } from '@/components/auth/PortalAuthFrame';
import { PORTAL_LOGIN } from '@/components/auth/portalLoginConfig';
import { HumanCheck, humanCheckOn } from '@/components/security/HumanCheck';
import { authApi, SELF_JOIN_ROLES, tokenStore } from '@/lib/api/auth';
import { isMember, joinPortal, markPortalSignedIn, portalAccess, PORTAL_SIGNIN_LIMIT_MS, signedInPortals } from '@/lib/auth/portalAccess';
import { AUTH_ROUTES, loginHref, PORTALS, portalForRole, portalOfPath, safeNextPath, type PortalId } from '@/lib/auth/roles';
import { forgetPerson, rememberedPerson, rememberSignedIn, restoreSession, signOutCompletely, type RememberedPerson } from '@/lib/auth/session';
import { getKycConfig } from '@/lib/kyc/kyc-service';

const LEGACY_OK: PortalId[] = ['farmer', 'buyer'];

type JoinRole = (typeof SELF_JOIN_ROLES)[number];
const isJoinRole = (role: string | null): role is JoinRole => (SELF_JOIN_ROLES as readonly string[]).includes(role ?? '');

interface Session {
  userId: string;
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
  // The "I am human" check (off until its keys are set): a fresh token for each try.
  const [human, setHuman] = useState<string | null>(null);
  const [humanTry, setHumanTry] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; portal?: PortalId } | null>(null);
  // Second step: a one-time code to the account's mobile (SMS + WhatsApp) or email.
  const [step, setStep] = useState<OtpStep | null>(null);
  const [codesDown, setCodesDown] = useState(false);
  // Signed in with an account that has no account in this portal yet: offer to create it.
  const [join, setJoin] = useState<{ session: Session; has: PortalId[] } | null>(null);
  // Signed in to other portals on this device (this portal has its own sign-in).
  const [elsewhere, setElsewhere] = useState<PortalId[]>([]);
  const [joining, setJoining] = useState(false);
  // This portal was locked after hours unused, the account still signed in here: one tap opens it.
  const [resume, setResume] = useState<{ userId: string; name: string; email: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Where to go after signing in: never into another portal (it has its own
  // sign-in, so it would only bounce to that portal's sign-in page).
  const wanted = safeNextPath(next, info.home);
  const wantedPortal = portalOfPath(wanted);
  const destination = wantedPortal && wantedPortal !== portal ? info.home : wanted;

  // Already signed in on this device (came back after closing the app): go
  // straight to the portal. Locked after hours unused: "Continue as …".
  // Signed out after days away: greet them by name with their email filled
  // in, so only the password is needed.
  const [checking, setChecking] = useState(true);
  const [remembered, setRemembered] = useState<RememberedPerson | null>(null);
  useEffect(() => {
    let live = true;
    const run = async () => {
      const active = await restoreSession().catch(() => null);
      if (!live) return;
      if (active) {
        const access = await portalAccess(active.session.user, active.roles, portal);
        if (!live) return;
        const allowed = access.member && (!info.requiredRole || active.roles.includes(info.requiredRole));
        if (allowed && access.signedIn) {
          localStorage.setItem('auth_portal', portal);
          router.replace(destination);
          return;
        }
        if (allowed && access.locked) {
          setResume({ userId: active.session.user.id, name: active.name, email: access.email });
          setChecking(false);
          return;
        }
        // Signed in to another portal: same person, but this portal asks for its own sign-in.
        setElsewhere(access.others);
        setEmail((e) => e || access.email);
      }
      const person = rememberedPerson();
      if (person) {
        setRemembered(person);
        setEmail((e) => e || person.email);
      }
      setChecking(false);
    };
    void run();
    return () => {
      live = false;
    };
  }, [destination, info.requiredRole, portal, router]);
  // Welcome back: the email is filled in, so the password box is ready (the browser's saved password fills it).
  useEffect(() => {
    if (!checking && !resume && remembered) passwordRef.current?.focus();
  }, [checking, resume, remembered]);

  const focusRing = `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.outline}`;
  const inputClass = `block w-full rounded-xl border-0 bg-white/90 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 shadow-sm ring-1 ring-inset ring-slate-200 transition focus:outline-none focus:ring-2 ${theme.inputFocus}`;
  const canSubmit = email.trim() !== '' && password !== '' && !pending && (!humanCheckOn || Boolean(human));

  const finish = (session: Session) => {
    markPortalSignedIn(session.userId, portal);
    tokenStore.setToken(session.accessToken, session.role, session.roles);
    localStorage.setItem('auth_portal', portal);
    void rememberSignedIn(portal, email.trim());
    // KYC done on any device: never ask again. Otherwise the dashboard opens
    // the KYC panel once, the first time on this browser.
    if (session.kycSubmitted) localStorage.setItem('kyc_status', 'submitted');
    else if (!localStorage.getItem('kyc_status')) localStorage.setItem('kyc_status', 'pending');
    router.replace(destination);
  };

  /** "Continue as …": the account is still signed in on this device, so the portal opens again with one tap. */
  const continueHere = async () => {
    if (!resume) return;
    setPending(true);
    setError(null);
    const active = await restoreSession().catch(() => null);
    if (!active || active.session.user.id !== resume.userId) {
      // The sign-in ended meanwhile (signed out in another tab, or days away): the password is needed.
      setResume(null);
      setEmail(resume.email);
      setPending(false);
      setError({ text: 'Your sign-in on this device has ended. Enter your password to sign in again.' });
      return;
    }
    markPortalSignedIn(resume.userId, portal);
    localStorage.setItem('auth_portal', portal);
    void rememberSignedIn(portal, resume.email);
    router.replace(destination);
  };

  /** "Not you?" on the "Continue as …" card: sign out on this device and forget the name and email (a shared phone). */
  const forgetHere = async () => {
    setPending(true);
    setError(null);
    await signOutCompletely().catch(() => undefined);
    setResume(null);
    setRemembered(null);
    setElsewhere([]);
    setEmail('');
    setPassword('');
    setPending(false);
    window.setTimeout(() => emailRef.current?.focus(), 0);
  };

  /** Back out of this portal's sign-in; other portals signed in on this device stay signed in. */
  const cancelStep = async (anotherAccount = false) => {
    const userId = step?.session.userId ?? join?.session.userId;
    if (anotherAccount || !userId || signedInPortals(userId).length === 0) await authApi.logout();
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
      const data = await authApi.login({ email: email.trim(), password, captchaToken: human ?? undefined });
      if (!data.accessToken) throw new Error('Sign-in did not return a session. Please try again.');

      const accountRole = data.accountRole;
      const roles = data.accountRoles;
      const required = info.requiredRole;
      const session: Session = { userId: data.userId, accessToken: data.accessToken, role: required ?? accountRole ?? 'FARMER', roles, kycSubmitted: data.kycSubmitted, phone: data.phone };

      // Each portal has its own account: none here yet → create it (same email and password).
      if (portal !== 'admin' && !isMember(data.portals, roles, portal)) {
        setJoin({ session, has: (data.portals ?? []).filter((p) => p !== portal) });
        return;
      }
      if (required && roles.length > 0 && !roles.includes(required)) {
        // Same person, another portal: offer to add it to this account.
        if (isJoinRole(required)) {
          setJoin({ session, has: data.portals ?? [] });
          return;
        }
        // Stay signed in: it is their own account, only not for this portal.
        // (Signing out here also ended their session in the other portal.)
        const home = portalForRole(accountRole ?? roles[0]);
        setError({
          text: required === 'ADMIN' ? 'This account is not a KashRoot admin.' : `This account cannot open the ${info.label} portal.`,
          portal: home ?? undefined,
        });
        return;
      }
      if (required && roles.length === 0 && !LEGACY_OK.includes(portal)) {
        setError({ text: `This account is not set up for the ${info.label} portal. Ask an administrator to enable it.` });
        return;
      }

      navigating = await startCodeStep(session);
    } catch (err) {
      setError({ text: err instanceof Error && err.message ? err.message : 'Failed to sign in. Please check your connection.' });
    } finally {
      if (!navigating) setPending(false);
      // Tokens work once.
      setHumanTry((n) => n + 1);
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
    if (!join) return;
    setJoining(true);
    setError(null);
    try {
      const role = isJoinRole(info.requiredRole) ? info.requiredRole : undefined;
      await joinPortal(portal, role);
      const session = { ...join.session, roles: [...new Set([...join.session.roles, ...(role ? [role] : [])])] };
      setJoin(null);
      await startCodeStep(session);
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : 'Could not add this portal. Please try again.' });
    } finally {
      setJoining(false);
    }
  };

  if (resume) {
    const hours = Math.round(PORTAL_SIGNIN_LIMIT_MS / 3_600_000);
    return (
      <PortalAuthFrame portal={portal} labelledBy={ids.heading}>
        <h2 id={ids.heading} className="text-2xl font-semibold tracking-tight text-slate-900">
          Welcome back
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          The {info.label} portal was closed because it was not used for {hours} hours. You are still signed in on this device. Tap below to open it.
        </p>
        <button
          type="button"
          onClick={() => void continueHere()}
          disabled={pending}
          aria-label={`Continue as ${resume.name} (${resume.email})`}
          className={`mt-6 flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-5 py-4 text-left shadow-lg transition disabled:cursor-wait disabled:opacity-70 ${theme.button} ${focusRing}`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/20" aria-hidden>
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserRound className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Continue as {resume.name}</span>
            <span className="block break-all text-sm opacity-90">({resume.email})</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            setResume(null);
            setRemembered(null);
            setEmail('');
            setPassword('');
            window.setTimeout(() => emailRef.current?.focus(), 0);
          }}
          className={`mt-3 min-h-12 w-full cursor-pointer rounded-xl px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 ${focusRing}`}
        >
          Use another account
        </button>
        <p className="mt-6 border-t border-slate-900/5 pt-3 text-sm text-slate-600">
          Not you, or a shared phone?
          <button
            type="button"
            onClick={() => void forgetHere()}
            disabled={pending}
            className={`mt-1 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl px-4 py-2 font-semibold text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60 ${focusRing}`}
          >
            Sign out and forget me on this device
          </button>
        </p>
      </PortalAuthFrame>
    );
  }

  if (join) {
    const has = [...new Set(join.has.filter((p) => p !== portal).map((p) => PORTALS[p].label))];
    return (
      <PortalAuthFrame portal={portal} labelledBy={ids.heading}>
        <h2 id={ids.heading} className="text-2xl font-semibold tracking-tight text-slate-900">
          Create your {info.label} account
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {has.length ? <>You have a KashRoot account for <strong className="text-slate-900">{has.join(', ')}</strong>, but not for the {info.label} portal yet. </> : <>You don’t have a {info.label} account yet. </>}
          Create it with the same email and password — your {info.label} details are kept separately from your other portals.
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
          Create my {info.label} account
        </button>
        <button type="button" onClick={() => void cancelStep()} className={`mt-3 w-full cursor-pointer rounded-xl px-5 py-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 ${focusRing}`}>
          Not now
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
          <button type="button" onClick={() => void cancelStep(true)} className={`cursor-pointer rounded font-semibold text-slate-800 underline-offset-4 hover:underline ${focusRing}`}>
            Sign out and use another account
          </button>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          The code does not come?{' '}
          <Link href="/support?topic=login" className={`inline-flex min-h-11 items-center rounded font-semibold ${theme.link} ${focusRing}`}>
            Get help
          </Link>
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
        Every KashRoot portal has its own sign-in. No {info.label} account yet? Sign in with your KashRoot email and password and create it, or use Create an account below.
      </p>
      {elsewhere.length > 0 && (
        <p role="status" className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-950 ring-1 ring-sky-200">
          You are signed in to <strong>{elsewhere.map((p) => PORTALS[p].label).join(', ')}</strong> on this device. The {info.label} portal has its own sign-in — enter your password to open it.
        </p>
      )}

      {verified && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Email verified successfully! You can now sign in.
        </p>
      )}

      {checking && (
        <p role="status" className="mt-6 flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking if you are already signed in…
        </p>
      )}
      {!checking && remembered && (
        <p className="mt-6 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          Welcome back, <strong>{remembered.name}</strong>. Your email is filled in — just enter your password.
          <button
            type="button"
            className="mt-1 flex min-h-11 cursor-pointer items-center font-semibold underline underline-offset-2"
            onClick={() => {
              forgetPerson();
              setRemembered(null);
              setEmail('');
              window.setTimeout(() => emailRef.current?.focus(), 0);
            }}
          >
            Forget me on this device
          </button>
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className={`mt-6 space-y-5 ${checking ? 'hidden' : ''}`}>
        <div>
          <label htmlFor={ids.email} className="block text-sm font-medium text-slate-800">
            Email address
          </label>
          <input
            ref={emailRef}
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
              ref={passwordRef}
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

        <HumanCheck onToken={setHuman} resetKey={humanTry} action="signin" />
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
        <p>
          Trouble signing in?{' '}
          <Link href="/support?topic=login" className={`inline-flex min-h-11 items-center rounded font-semibold ${theme.link} ${focusRing}`}>
            Get help
          </Link>
        </p>
      </div>
    </PortalAuthFrame>
  );
}
