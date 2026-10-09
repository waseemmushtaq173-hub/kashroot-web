'use client';

/** DigiLocker sends the user back here; the KYC panel (in the other window) picks up the result. */
import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function DigiLockerDone() {
  useEffect(() => {
    const t = window.setTimeout(() => window.close(), 1500);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 to-emerald-50 p-6 text-center text-slate-900">
      <div className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-900/5">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold">DigiLocker step finished</h1>
        <p className="mt-1 text-slate-600">You can close this window and return to KashRoot.</p>
      </div>
    </main>
  );
}
