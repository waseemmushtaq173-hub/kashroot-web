'use client';

/**
 * Landing page of Supabase's reset email. supabase-js reads the recovery
 * session from the link automatically; the user then picks a new password.
 */
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';

import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady('ok');
    });
    const timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data: s }) => setReady(s.session ? 'ok' : 'invalid'));
    }, 1200);
    return () => {
      data.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const strong = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!strong) return setError('Use at least 8 characters with upper- and lowercase letters and a number.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message);
    await supabase.auth.signOut();
    setDone(true);
  };

  if (done) {
    return (
      <div className="py-4 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Password updated</h1>
        <p className="mt-2 text-slate-600">Sign in with your new password.</p>
        <Link href="/login" className="mt-6 inline-flex rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 font-semibold text-white no-underline shadow-lg hover:no-underline">Choose your sign-in</Link>
      </div>
    );
  }

  if (ready === 'invalid') {
    return (
      <div className="py-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">This link has expired</h1>
        <p className="mt-2 text-slate-600">Reset links work once and expire after a while. Request a new one.</p>
        <Link href="/forgot-password" className="mt-6 inline-flex rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 px-6 py-3 font-semibold text-white no-underline shadow-lg hover:no-underline">Send a new link</Link>
      </div>
    );
  }

  const input = 'block w-full rounded-xl border-0 bg-white px-4 py-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500';
  return (
    <div>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-600/30">
        <KeyRound className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">Set a new password</h1>
      {ready === 'checking' ? (
        <p className="mt-4 flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking your link…</p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-slate-800">
            New password
            <span className="relative mt-1.5 block">
              <input type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} pr-11`} />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          <label className="block text-sm font-semibold text-slate-800">
            Confirm new password
            <input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${input} mt-1.5`} />
          </label>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
          <button type="submit" disabled={busy} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-emerald-600/30 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save new password
          </button>
        </form>
      )}
    </div>
  );
}
