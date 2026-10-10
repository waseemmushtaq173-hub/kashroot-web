'use client';

/** Forgot password — Supabase emails a reset link (free, no SMS needed). */
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Loader2, Mail, MailCheck } from 'lucide-react';

import { supabase, supabaseConfigured } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Enter the email you registered with.');
    if (!supabaseConfigured) return setError('Password reset is not set up on this site yet.');
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (err && !/rate limit/i.test(err.message)) return setError(err.message);
    if (err) return setError('Too many requests. Please wait a few minutes and try again.');
    // Same message whether or not the account exists, so emails can't be probed.
    setSent(true);
  };

  if (sent) {
    return (
      <div className="py-4 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg shadow-emerald-600/30">
          <MailCheck className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Check your email</h1>
        <p className="mt-2 text-slate-600">If an account exists for <strong className="text-slate-900">{email.trim()}</strong>, a reset link is on its way. Check Spam and Promotions too.</p>
        <Link href="/login" className="mt-6 inline-flex items-center gap-2 font-semibold text-emerald-800 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-lg shadow-rose-500/30">
        <KeyRound className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">Forgot your password?</h1>
      <p className="mt-2 text-slate-600">Enter your email and we’ll send you a link to set a new one.</p>
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <label htmlFor="fp-email" className="block text-sm font-semibold text-slate-800">
          Email address
          <span className="relative mt-1.5 block">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="fp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="block w-full rounded-xl border-0 bg-white py-3.5 pl-10 pr-4 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500" />
          </span>
        </label>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
        <button type="submit" disabled={busy} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-rose-600/30 transition hover:-translate-y-0.5 disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Send reset link
        </button>
      </form>
      <Link href="/login" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to sign in
      </Link>
    </div>
  );
}
