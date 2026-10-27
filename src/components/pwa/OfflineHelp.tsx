'use client';

/**
 * The offline page's buttons: "Try again" (the page that was asked for) and
 * the pages saved on this phone, which open with no signal. Before its
 * script runs it shows the pages KashRoot saves for everyone.
 */
import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { PORTALS, portalOfPath } from '@/lib/auth/roles';

const NAMES: Record<string, string> = {
  '/': 'Home',
  '/mandi-weather': 'Mandi rates & weather',
  '/compare-prices': 'Price Comparison',
  '/supplies/tester': 'Fertiliser check',
  '/farmer/ask-expert': 'Ask an expert',
  '/farmer/orchard-health': 'Orchard health',
  '/farmer/season-planner': 'Season planner',
  '/support': 'Help',
};

/** A friendly name for a saved page, or null for pages not worth offering (sign-in, this page). */
function nameOf(path: string): string | null {
  if (NAMES[path]) return NAMES[path];
  if (/^\/(login|register|offline)(\/|$)/.test(path)) return null;
  const portal = portalOfPath(path);
  if (portal && PORTALS[portal].home === path) return `${PORTALS[portal].label} portal`;
  return null;
}

const ALWAYS = [
  { path: '/', name: 'Home' },
  { path: '/mandi-weather', name: 'Mandi rates & weather' },
];

export function OfflineHelp() {
  const [from, setFrom] = useState('/');
  const [saved, setSaved] = useState(ALWAYS);

  useEffect(() => {
    let live = true;
    const look = async () => {
      const asked = new URLSearchParams(window.location.search).get('from');
      // Only a page of this site.
      if (asked && asked.startsWith('/') && !asked.startsWith('//') && live) setFrom(asked);
      try {
        const found = new Map<string, string>();
        for (const name of await caches.keys()) {
          if (!name.startsWith('kr-pages-')) continue;
          for (const req of await (await caches.open(name)).keys()) {
            const path = new URL(req.url).pathname;
            const label = nameOf(path);
            if (label) found.set(path, label);
          }
        }
        if (live && found.size) setSaved([...found].map(([path, name]) => ({ path, name })).sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.name.localeCompare(b.name))));
      } catch {
        /* no saved pages to list: the usual ones stay */
      }
    };
    void look();
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <a href={from} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-700 px-6 text-lg font-bold text-white shadow-sm hover:bg-emerald-800">
        <RotateCcw className="h-5 w-5" aria-hidden /> Try again
      </a>
      <h2 className="mt-8 text-lg font-semibold text-slate-900">Saved on this phone</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {saved.map((p) => (
          <li key={p.path}>
            <a href={p.path} className="flex min-h-12 items-center rounded-xl bg-white px-4 text-base font-semibold text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-50">
              {p.name}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
