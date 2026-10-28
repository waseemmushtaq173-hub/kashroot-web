'use client';

/**
 * Signing in right here on Price Comparison, to order or to sell — nobody is
 * sent into a portal. Email and password of the KashRoot account (Supabase,
 * through authApi.login: the same plain-language errors as every portal's
 * sign-in). It opens no portal and marks none as signed in: every portal
 * keeps its own sign-in (lib/auth/portalAccess).
 *
 * No account yet? "Create an account" asks what they want to do and offers
 * the Buyer (to buy) or Farmer (to sell) sign-up — only when they choose it.
 */
import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, LogIn, ShoppingCart, Store, UserPlus } from 'lucide-react';

import { Btn, INPUT, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { HumanCheck, humanCheckOn } from '@/components/security/HumanCheck';
import { authApi } from '@/lib/api/auth';
import { AUTH_ROUTES } from '@/lib/auth/roles';
import { rememberedPerson } from '@/lib/auth/session';
import { loadAccount, type Account } from '@/lib/db/client';

const theme = PORTAL_THEMES.buyer;

export type SignInReason = 'order' | 'sell' | 'orders';

const TITLE: Record<SignInReason, string> = {
  order: 'Sign in to order',
  sell: 'Sign in to sell',
  orders: 'Sign in to see your orders',
};

const BIG_LINK = 'flex min-h-14 items-center gap-3 rounded-2xl bg-white p-4 text-left no-underline ring-1 ring-slate-200 transition hover:bg-sky-50 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700';

export function SignInModal({ reason, onClose, onSignedIn }: { reason: SignInReason; onClose: () => void; onSignedIn: (account: Account) => void }) {
  const ids = { email: useId(), password: useId() };
  const [step, setStep] = useState<'signin' | 'create'>('signin');
  const [email, setEmail] = useState(() => (typeof window === 'undefined' ? '' : rememberedPerson()?.email ?? ''));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [human, setHuman] = useState<string | null>(null);
  const [humanTry, setHumanTry] = useState(0);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const address = email.trim();
    if (!address) return setError('Write the email address of your KashRoot account.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setError('This email address is not complete. Write it like name@gmail.com.');
    if (!password) return setError('Write your password.');
    setBusy(true);
    setError(null);
    try {
      await authApi.login({ email: address, password, captchaToken: human ?? undefined });
      const account = await loadAccount();
      if (!account) throw new Error('You are signed in, but your account could not be read. Please try again.');
      onSignedIn(account);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not sign in. Check your internet and try again.');
    } finally {
      setBusy(false);
      setHumanTry((n) => n + 1);
    }
  };

  const buy = (
    <Link key="buy" href={AUTH_ROUTES.register('buyer')} className={BIG_LINK}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${theme.tile}`}><ShoppingCart className="h-5 w-5" aria-hidden /></span>
      <span>
        <span className="block font-semibold text-slate-900">I want to buy</span>
        <span className="block text-sm text-slate-600">Create a Buyer account</span>
      </span>
    </Link>
  );
  const sell = (
    <Link key="sell" href={AUTH_ROUTES.register('farmer')} className={BIG_LINK}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-700 text-white"><Store className="h-5 w-5" aria-hidden /></span>
      <span>
        <span className="block font-semibold text-slate-900">I want to sell</span>
        <span className="block text-sm text-slate-600">Create a Farmer account (produce and farm inputs)</span>
      </span>
    </Link>
  );

  return (
    <Modal open onClose={onClose} title={step === 'create' ? 'Create an account' : TITLE[reason]}>
      {step === 'signin' ? (
        <form className="grid gap-4" onSubmit={(e) => void submit(e)} noValidate>
          <p className="text-sm text-slate-600">Use the email and password of your KashRoot account. You stay on Price Comparison.</p>
          <label htmlFor={ids.email} className="block text-sm font-medium text-slate-800">
            Email address
            <input id={ids.email} type="email" inputMode="email" autoComplete="email" className={`${INPUT} mt-1.5 min-h-11 text-base`} value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} />
          </label>
          <div>
            <label htmlFor={ids.password} className="block text-sm font-medium text-slate-800">Password</label>
            <div className="relative mt-1.5">
              <input id={ids.password} type={showPassword ? 'text' : 'password'} autoComplete="current-password" className={`${INPUT} min-h-11 pr-12 text-base`} value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-0 top-0 grid h-11 w-11 cursor-pointer place-items-center rounded-r-xl text-slate-500 hover:text-slate-900">
                {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
              </button>
            </div>
          </div>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">{error}</p>}
          <HumanCheck onToken={setHuman} resetKey={humanTry} action="signin" />
          <Btn theme={theme} type="submit" icon={LogIn} className="min-h-12 w-full text-base" disabled={busy || (humanCheckOn && !human)}>{busy ? 'Signing in…' : 'Sign in'}</Btn>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link href={AUTH_ROUTES.forgotPassword} className="inline-flex min-h-11 items-center font-semibold text-sky-800">Forgot password?</Link>
            <Link href="/support?topic=login" className="inline-flex min-h-11 items-center font-semibold text-sky-800">Trouble signing in?</Link>
            <button type="button" onClick={() => { setStep('create'); setError(null); }} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 font-semibold text-sky-800">
              <UserPlus className="h-4 w-4" aria-hidden /> Create an account
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-slate-700">What do you want to do on KashRoot?</p>
          {reason === 'sell' ? [sell, buy] : [buy, sell]}
          <p className="text-sm text-slate-600">After you create it, come back to Price Comparison and sign in.</p>
          <Btn theme={theme} variant="ghost" icon={ArrowLeft} className="min-h-11 justify-self-start" onClick={() => setStep('signin')}>Back to sign in</Btn>
        </div>
      )}
    </Modal>
  );
}
