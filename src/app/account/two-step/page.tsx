'use client';

/**
 * Two-step sign-in for anyone with a KashRoot account (components/security/TwoStep):
 * optional for farmers and buyers, required for admins (who are led to it by
 * the Admin portal). Set up an authenticator app, add a second phone as a
 * backup, or remove a lost one — removing needs a code from an app still in
 * hand (a session that passed the check), so a thief with only the password
 * cannot take it off.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';

import { InfoPage } from '@/components/layout/InfoPage';
import { TwoStepSetup, TwoStepVerify, twoStepState } from '@/components/security/TwoStep';
import { supabase } from '@/lib/supabase';

/** "Protect your account", in the four languages KashRoot speaks. */
const PROTECT: { lang: string; dir?: 'rtl'; text: string }[] = [
  { lang: 'en', text: 'Protect your account: even if someone learns your password, they cannot sign in without the code from your phone.' },
  { lang: 'hi', text: 'अपना खाता सुरक्षित करें: अगर किसी को आपका पासवर्ड पता चल भी जाए, तो वह आपके फ़ोन के कोड के बिना साइन इन नहीं कर सकता।' },
  { lang: 'ur', dir: 'rtl', text: 'اپنا اکاؤنٹ محفوظ کریں: اگر کسی کو آپ کا پاس ورڈ معلوم ہو بھی جائے، تو وہ آپ کے فون کے کوڈ کے بغیر سائن اِن نہیں کر سکتا۔' },
  { lang: 'ks', dir: 'rtl', text: 'پنُن اکاؤنٹ رٹِو محفوظ: اگر کانٛہہ چھُو پاس ورڈ ژھینِتھ، تَمِس چھُنہٕ فونَس پیٚٹھ آمُت کوڈ ورٲے سائن اِن سپدان۔' },
];

interface Factor {
  id: string;
  friendly_name?: string;
  created_at: string;
}

export default function TwoStepPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [passed, setPassed] = useState(false);
  const [mode, setMode] = useState<'list' | 'add' | 'verify'>('list');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSignedIn(Boolean(data.session));
    if (!data.session) return;
    const listed = await supabase.auth.mfa.listFactors();
    setFactors((listed.data?.totp ?? []) as Factor[]);
    setPassed((await twoStepState()).passed);
  }, []);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  const remove = async (id: string) => {
    setBusy(id);
    setError(null);
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(null);
    if (err) setError(/aal2|assurance/i.test(err.message) ? 'First type a code from one of your apps (below), then remove it.' : err.message);
    await load();
  };

  return (
    <InfoPage title="Two-step sign-in" intro="A code from an app on your phone, as well as your password.">
      <section>
        <ul className="!list-none space-y-2 !pl-0">
          {PROTECT.map((p) => (
            <li key={p.lang} lang={p.lang} dir={p.dir} className={`rounded-xl bg-emerald-50 p-3 text-emerald-950 ring-1 ring-emerald-200 ${p.lang === 'en' ? 'font-semibold' : ''}`}>
              {p.text}
            </li>
          ))}
        </ul>
      </section>

      {signedIn === null ? (
        <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking…</p>
      ) : !signedIn ? (
        <p>
          Sign in to your portal first, then come back here. <Link className="font-semibold text-emerald-800 underline" href="/login">Sign in</Link>
        </p>
      ) : mode === 'add' ? (
        <section>
          <h2>{factors.length ? 'Add another phone (a backup)' : 'Set up your authenticator app'}</h2>
          <TwoStepSetup onDone={() => { setMode('list'); void load(); }} />
        </section>
      ) : mode === 'verify' ? (
        <section>
          <h2>Type a code from your app</h2>
          <TwoStepVerify onDone={() => { setMode('list'); void load(); }} />
        </section>
      ) : (
        <section data-two-step-list>
          <h2 className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden /> {factors.length ? 'Two-step sign-in is on' : 'Two-step sign-in is off'}</h2>
          {factors.length > 0 && (
            <ul className="!list-none space-y-2 !pl-0">
              {factors.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" aria-hidden /> {f.friendly_name || 'Authenticator app'} · added {new Date(f.created_at).toLocaleDateString('en-IN')}</span>
                  <button type="button" disabled={busy !== null} onClick={() => (passed ? void remove(f.id) : setMode('verify'))} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-60">
                    {busy === f.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />} Remove (lost phone)
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-900 ring-1 ring-rose-200">{error}</p>}
          <button
            type="button"
            onClick={() => setMode(factors.length && !passed ? 'verify' : 'add')}
            className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800"
          >
            <ShieldCheck className="h-5 w-5" aria-hidden /> {factors.length ? 'Add a backup phone' : 'Turn on two-step sign-in'}
          </button>
          <p className="text-sm text-slate-600">Lost every phone with the app? Ask through Help &amp; support — KashRoot checks it is really you before removing it.</p>
        </section>
      )}
    </InfoPage>
  );
}
