'use client';

/**
 * AuthShell — the premium frame for sign-up, password and portal-chooser
 * pages: a live 3D valley on one side, a glass card on a colour-washed canvas
 * on the other. Pages recolour it with setAuthTheme() (the register page does
 * this when the account type changes).
 */
import Link from 'next/link';
import { useSyncExternalStore, type ReactNode } from 'react';
import { BadgeCheck, LineChart, ShieldCheck } from 'lucide-react';

import { Emblem, Wordmark } from '@/components/brand/Emblem';
import { ValleyScene, type SceneMood } from '@/components/three/ValleyScene';
import { brandSerif } from '@/lib/fonts';

export type AuthThemeId = 'farmer' | 'buyer' | 'seller' | 'logistics' | 'default';

interface AuthTheme {
  mood: SceneMood;
  canvas: string;
  tint: string;
  blobA: string;
  blobB: string;
  eyebrow: string;
  headline: string;
  copy: string;
}

export const AUTH_THEMES: Record<AuthThemeId, AuthTheme> = {
  default: {
    mood: 'autumn',
    canvas: 'from-[#FBF8F0] via-[#F6F1E3] to-[#EAF3EE]',
    tint: 'from-[#052E26]/80 via-emerald-950/35 to-transparent',
    blobA: 'bg-emerald-300/40',
    blobB: 'bg-amber-200/50',
    eyebrow: 'text-amber-200',
    headline: 'Where every harvest meets a fair price.',
    copy: 'Growers, buyers, sellers and transporters — one trusted marketplace, pay after delivery.',
  },
  farmer: {
    mood: 'spring',
    canvas: 'from-[#FBF8F0] via-[#F6F1E3] to-[#EAF3EE]',
    tint: 'from-[#052E26]/80 via-emerald-950/35 to-transparent',
    blobA: 'bg-emerald-300/40',
    blobB: 'bg-amber-200/50',
    eyebrow: 'text-amber-200',
    headline: 'Grow more. Sell better. Get paid safely.',
    copy: 'List your harvest, follow live mandi rates and keep every block healthy.',
  },
  buyer: {
    mood: 'summer',
    canvas: 'from-[#FBF8F0] via-[#F6F1E3] to-[#EAF3EE]',
    tint: 'from-[#052E26]/80 via-emerald-950/35 to-transparent',
    blobA: 'bg-emerald-300/40',
    blobB: 'bg-amber-200/50',
    eyebrow: 'text-amber-200',
    headline: 'Source authentic produce, straight from the orchard.',
    copy: 'Verified growers, side-by-side offers, and you pay only after delivery.',
  },
  seller: {
    mood: 'autumn',
    canvas: 'from-[#FBF8F0] via-[#F6F1E3] to-[#EAF3EE]',
    tint: 'from-[#052E26]/80 via-emerald-950/35 to-transparent',
    blobA: 'bg-emerald-300/40',
    blobB: 'bg-amber-200/50',
    eyebrow: 'text-amber-200',
    headline: 'Reach buyers across the country.',
    copy: 'Publish your catalogue to price comparison; buyers pay you directly after delivery.',
  },
  logistics: {
    mood: 'winter',
    canvas: 'from-[#FBF8F0] via-[#F6F1E3] to-[#EAF3EE]',
    tint: 'from-[#052E26]/80 via-emerald-950/35 to-transparent',
    blobA: 'bg-emerald-300/40',
    blobB: 'bg-amber-200/50',
    eyebrow: 'text-amber-200',
    headline: 'Move the harvest on time, every time.',
    copy: 'Transport jobs near you, cold-chain logs and payment released on delivery.',
  },
};

const FEATURES = [
  { icon: ShieldCheck, label: 'Pay after delivery' },
  { icon: LineChart, label: 'Live government mandi rates' },
  { icon: BadgeCheck, label: 'Verified with UIDAI' },
];

// A tiny store, so a page can set the theme before or after the frame mounts.
let currentTheme: AuthThemeId = 'default';
const listeners = new Set<() => void>();

export function setAuthTheme(id: AuthThemeId) {
  currentTheme = id;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // Pages that never set a theme get the default again.
    if (listeners.size === 0) currentTheme = 'default';
  };
}

export function AuthShell({ children }: { children: ReactNode }) {
  const themeId = useSyncExternalStore(subscribe, () => currentTheme, () => 'default' as AuthThemeId);
  const theme = AUTH_THEMES[themeId];

  return (
    <div className={`kr-light relative isolate min-h-[100svh] overflow-hidden bg-gradient-to-br text-slate-900 transition-colors duration-700 ${theme.canvas}`}>
      <div aria-hidden className={`pointer-events-none absolute -left-32 -top-32 -z-10 h-[30rem] w-[30rem] rounded-full blur-3xl transition-colors duration-700 ${theme.blobA}`} />
      <div aria-hidden className={`pointer-events-none absolute -bottom-40 -right-24 -z-10 h-[34rem] w-[34rem] rounded-full blur-3xl transition-colors duration-700 ${theme.blobB}`} />

      <div className="mx-auto grid min-h-[100svh] max-w-7xl gap-6 p-4 sm:p-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:p-8">
        {/* 3D story panel */}
        <section className="relative isolate flex min-h-[15rem] flex-col justify-between overflow-hidden rounded-[2rem] p-6 text-white shadow-[0_30px_80px_rgba(15,23,42,0.25)] sm:p-10 lg:min-h-0">
          <div aria-hidden className="absolute inset-0 -z-20 bg-gradient-to-br from-sky-300 to-amber-200" />
          <ValleyScene key={theme.mood} mood={theme.mood} className="-z-20" />
          <div aria-hidden className={`absolute inset-0 -z-10 bg-gradient-to-t transition-colors duration-700 ${theme.tint}`} />

          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-xl text-white no-underline hover:no-underline">
            <Emblem className="h-11 w-11 drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
            <Wordmark className={`${brandSerif.className} text-2xl text-white`} />
          </Link>

          <div className="mt-10 lg:mt-0">
            <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${theme.eyebrow}`}>Join the valley marketplace</p>
            <h1 className="mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-tight drop-shadow-sm [text-wrap:balance] sm:text-5xl">{theme.headline}</h1>
            <p className="mt-3 max-w-lg text-base text-white/90 sm:text-lg">{theme.copy}</p>
            <ul className="mt-6 hidden flex-wrap gap-2 sm:flex">
              {FEATURES.map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium ring-1 ring-white/30 backdrop-blur">
                  <Icon className="h-4 w-4" aria-hidden /> {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Form card */}
        <main id="auth-main" className="flex items-center justify-center">
          <div className="w-full max-w-lg rounded-[2rem] bg-white/80 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.15)] ring-1 ring-white/80 backdrop-blur-2xl sm:p-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
