'use client';

/**
 * Sign-in for the roles with no dedicated page: Admin, Expert, Kissan Partner,
 * Logistics and Rental. Farmers, buyers and sellers go to /login/<role>
 * instead, which /login redirects them to.
 *
 * The role picked here is the role the session is scoped to — `tokenStore`
 * writes it to localStorage and a cookie, and the guard in
 * src/app/(dashboards)/layout.tsx holds the session to that portal's routes.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';

import { authApi, tokenStore } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { ACCENT_BADGE, type PortalAccent, type PortalRole } from '@/lib/auth/portals';
import { loginHref, LOGIN_ROLES, ROLE_LABELS, safeNextPath } from '@/lib/auth/roles';

const INPUT =
  'block w-full rounded-xl border-0 bg-white px-4 py-3 text-base text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-emerald-500';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700';

/**
 * Only the serialisable fields of a Portal. The registry's `icon` is a React
 * component, and a function cannot cross the server/client boundary — passing
 * whole Portal objects in here made /login fail to render.
 */
export interface RoleOption {
  role: PortalRole;
  accountLabel: string;
  dashboard: string;
  accent: PortalAccent;
}

interface OtherRolesLoginFormProps {
  /** The roles offered in the picker, in display order. */
  portals: readonly RoleOption[];
  /** Preselected from ?role=, already checked against `portals`. */
  initialRole: string;
  /** Validated `next` / `returnTo`, or undefined. */
  next?: string;
}

export function OtherRolesLoginForm({ portals, initialRole, next }: OtherRolesLoginFormProps) {
  const router = useRouter();
  const ids = { role: useId(), email: useId(), password: useId() };

  const [role, setRole] = useState(initialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = portals.find((portal) => portal.role === role) ?? portals[0];
  const canSubmit = email.trim() !== '' && password !== '' && !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    let navigating = false;
    try {
      const result = await authApi.login({ email: email.trim(), password });
      if (!result.accessToken) {
        setError('Sign-in did not return a session. Please try again.');
        return;
      }
      tokenStore.setToken(result.accessToken, selected.role);
      localStorage.setItem('auth_email', email.trim());
      navigating = true;
      router.replace(safeNextPath(next, selected.dashboard));
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.messages[0] ?? 'Unable to sign in.'
          : reason instanceof Error
            ? reason.message
            : 'Something went wrong. Please try again.',
      );
    } finally {
      if (!navigating) setPending(false);
    }
  }

  return (
    <div className="w-full text-slate-900">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Partner &amp; staff sign-in</h1>
      <p className="mt-2 text-sm text-slate-600">
        For Kashroot staff and partner organisations. Farmers, buyers and sellers have their own sign-in.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {LOGIN_ROLES.map((loginRole) => (
          <Link
            key={loginRole}
            href={loginHref(loginRole, next)}
            className={`inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 ${FOCUS}`}
          >
            {ROLE_LABELS[loginRole]} sign-in
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        <div>
          <label htmlFor={ids.role} className="mb-1 block text-sm font-medium text-slate-800">
            Account type
          </label>
          <select
            id={ids.role}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className={INPUT}
          >
            {portals.map((portal) => (
              <option key={portal.role} value={portal.role}>
                {portal.accountLabel}
              </option>
            ))}
          </select>
          <p className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
            <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${ACCENT_BADGE[selected.accent]}`}>
              {selected.accountLabel}
            </span>
            Signs in to {selected.dashboard}
          </p>
        </div>

        <div>
          <label htmlFor={ids.email} className="mb-1 block text-sm font-medium text-slate-800">
            Email address
          </label>
          <input
            id={ids.email}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@kashroot.com"
            className={INPUT}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor={ids.password} className="block text-sm font-medium text-slate-800">
              Password
            </label>
            <Link href="/forgot-password" className={`rounded text-sm font-medium text-emerald-800 hover:underline ${FOCUS}`}>
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-1">
            <input
              id={ids.password}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className={`${INPUT} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className={`absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 ${FOCUS}`}
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
          className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-700/25 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${FOCUS}`}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? 'Signing in…' : 'Sign in'}
          {!pending && <ArrowRight className="h-4 w-4" />}
        </button>
      </form>

      <p className="mt-6 text-sm text-slate-600">
        Partner and staff accounts are issued by Kashroot — they cannot be created here.
      </p>
    </div>
  );
}
