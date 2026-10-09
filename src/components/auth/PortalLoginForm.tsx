'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { authApi, tokenStore } from '@/lib/api/auth';
import { ACCENT_BUTTON, ACCENT_LINK, PORTALS_BY_ROLE, returnToFor, type PortalAccent, type PortalRole } from '@/lib/auth/portals';

export function PortalLoginForm({ role, accent, returnTo }: { role: PortalRole; accent?: PortalAccent; returnTo?: string }) {
  const router = useRouter();
  const portal = PORTALS_BY_ROLE[role];
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const tone = accent ?? portal.accent;
  const buttonTone = ACCENT_BUTTON[tone];
  const linkTone = ACCENT_LINK[tone];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await authApi.login({ email, password });
      if (!result.accessToken) {
        // Navigating without a token lands on the dashboard guard, which
        // bounces straight back here and loses the reason why.
        setError('Sign-in did not return a session. Please try again.');
        return;
      }
      // setToken writes auth_token and, given a role, user_role to both
      // localStorage and the cookie; only the email is extra.
      tokenStore.setToken(result.accessToken, role);
      localStorage.setItem('auth_email', email);
      router.push(returnToFor(returnTo, portal));
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.messages[0] ?? 'Unable to sign in.' : reason instanceof Error ? reason.message : 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="portal-email" className="block text-sm font-semibold text-slate-700">Email address</label>
        <input id="portal-email" type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-slate-200" />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="portal-password" className="block text-sm font-semibold text-slate-700">Password</label>
          <Link href="/forgot-password" className={`text-sm font-semibold text-slate-500 transition-colors ${linkTone}`}>
            Forgot password?
          </Link>
        </div>
        <input id="portal-password" type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-slate-200" />
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <button type="submit" disabled={loading} className={`w-full rounded-xl px-5 py-3 font-bold text-white transition disabled:cursor-wait disabled:opacity-60 ${buttonTone}`}>
        {loading ? 'Signing in…' : 'Sign in securely'}
      </button>

      {portal.signupHref ? (
        <p className="text-center text-sm text-slate-600">
          Don&apos;t have an account?{' '}
          <Link href={portal.signupHref} className={`font-semibold text-slate-700 transition-colors ${linkTone}`}>
            Create one free
          </Link>
        </p>
      ) : (
        <p className="text-center text-sm text-slate-500">
          {portal.accountLabel} accounts are issued by KashRoot.{' '}
          <Link href="/login" className={`font-semibold transition-colors ${linkTone}`}>
            Other sign-in options
          </Link>
        </p>
      )}
    </form>
  );
}
