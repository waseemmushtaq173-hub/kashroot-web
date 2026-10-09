'use client';

/** Front-page entry to Orchard Health, with its three tools one tap away. */
import Link from 'next/link';
import { Camera, Droplets, HeartPulse, Map as MapIcon } from 'lucide-react';

import { Tilt3D } from '@/components/three/Tilt3D';

const OPTIONS = [
  { tab: 'risk', label: 'Scab risk map', hint: 'Which blocks are at risk after rain', icon: MapIcon, tile: 'from-emerald-400 to-green-600' },
  { tab: 'diagnose', label: 'Photo diagnosis', hint: 'Check symptoms, get treatment', icon: Camera, tile: 'from-sky-400 to-indigo-500' },
  { tab: 'sprays', label: 'Spray log', hint: 'Countdown to safe harvest', icon: Droplets, tile: 'from-amber-400 to-orange-600' },
];

export function OrchardHealthCard() {
  return (
    <div className="flex h-full flex-col rounded-[2rem] bg-gradient-to-br from-emerald-50 via-white to-lime-50 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] ring-1 ring-white/70 sm:p-8">
      <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
        <HeartPulse className="h-3.5 w-3.5" aria-hidden /> Orchard health
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Keep every block healthy</h2>
      <p className="mt-1 text-sm text-slate-600">Free tools for growers — no sign-in needed.</p>
      <ul className="mt-5 grid flex-1 gap-3">
        {OPTIONS.map(({ tab, label, hint, icon: Icon, tile }) => (
          <li key={tab}>
            <Tilt3D className="rounded-2xl" max={6}>
              <Link
                href={`/orchard-health?tab=${tab}`}
                className="flex items-center gap-3 rounded-2xl bg-white/90 p-3.5 text-slate-900 no-underline shadow-sm ring-1 ring-slate-900/5 transition [transform-style:preserve-3d] hover:no-underline hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                <span data-depth className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md ${tile}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-xs text-slate-600">{hint}</span>
                </span>
              </Link>
            </Tilt3D>
          </li>
        ))}
      </ul>
    </div>
  );
}
