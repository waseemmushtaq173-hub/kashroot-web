import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';

import { OfflineHelp } from '@/components/pwa/OfflineHelp';

/**
 * Shown by the service worker (public/sw.js) when there is no signal and the
 * page asked for was never saved on this phone. Saved on install, so it
 * opens with no signal; it works without its script too (plain links).
 */
export const metadata: Metadata = {
  title: 'You are offline',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-50 px-4 py-12 text-slate-900">
      <div className="w-full max-w-xl rounded-3xl bg-white/90 p-8 shadow-[0_8px_30px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-amber-800">
          <WifiOff className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-5 font-sans text-3xl font-bold">You are offline</h1>
        <p className="mt-3 text-lg text-slate-700">There is no internet on this phone right now, and this page was not saved on it yet.</p>
        <p className="mt-2 text-lg text-slate-700">Pages you opened before still work. Try one of them, or try again when you have signal.</p>
        <OfflineHelp />
        <p className="mt-6 rounded-2xl bg-emerald-50 p-4 text-base text-emerald-950 ring-1 ring-emerald-200">
          A question to the experts, a Mandi Helper’s rate, or a listing draft written now is kept on this phone and sent when you are back online. Orders, bookings and payments need the internet.
        </p>
      </div>
    </main>
  );
}
