'use client';

/**
 * "Install the KashRoot app" — the card at the foot of the portal sidebar.
 *
 * Where the browser offers it (Chrome and others fire `beforeinstallprompt`
 * once the site can be installed), the Install button opens the browser's own
 * install question. Elsewhere it says how to add KashRoot to the home screen
 * by hand. Hidden once KashRoot runs as an installed app.
 *
 * The browser's offer can come before the portal has drawn, so it is caught
 * as soon as this file loads and kept until used.
 */
import { useState, useSyncExternalStore } from 'react';
import { Download, Smartphone } from 'lucide-react';

import { ChinarLeaf } from '@/components/brand/ChinarLeaf';
import { FOCUS } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';

interface InstallOffer extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offer: InstallOffer | null = null;
let installed = false;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep it for the Install button instead of the browser's own bar.
    e.preventDefault();
    offer = e as InstallOffer;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    installed = true;
    changed();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Running as the installed app (home-screen icon), not in a browser tab. */
function runningInstalled() {
  try {
    return installed || window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  } catch {
    return false;
  }
}

const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function InstallAppCard({ feature, accent }: { feature: string; accent: string }) {
  const ready = useSyncExternalStore(subscribe, () => offer, () => null);
  const hidden = useSyncExternalStore(subscribe, runningInstalled, () => false);
  const apple = useSyncExternalStore(subscribe, isApple, () => false);
  const [asking, setAsking] = useState(false);

  if (hidden) return null;

  const install = async () => {
    if (!offer) return;
    setAsking(true);
    try {
      await offer.prompt();
      const { outcome } = await offer.userChoice;
      if (outcome === 'accepted') toast.success('KashRoot is being added to your home screen.');
    } catch {
      toast.error('The install window did not open. Use your browser menu: “Add to Home screen”.');
    } finally {
      // An offer works once; the browser sends a new one if it can ask again.
      offer = null;
      changed();
      setAsking(false);
    }
  };

  return (
    <section aria-label="Install the KashRoot app" className={`relative isolate overflow-hidden rounded-2xl p-4 text-white shadow-lg ${feature}`}>
      <ChinarLeaf className="pointer-events-none absolute -right-5 -top-6 -z-10 h-24 w-24 rotate-12 opacity-30" color="#FDE68A" />
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
        <Smartphone className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 font-semibold leading-snug">Install the KashRoot app</p>
      <p className="mt-1 text-xs leading-relaxed text-white/90">Open KashRoot from your home screen, like any app.</p>
      {ready ? (
        <button
          type="button"
          onClick={() => void install()}
          disabled={asking}
          className={`mt-3 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold shadow-sm transition hover:bg-white/90 disabled:opacity-60 ${accent} ${FOCUS} focus-visible:outline-white`}
        >
          <Download className="h-4 w-4" aria-hidden /> Install
        </button>
      ) : (
        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs leading-relaxed text-white ring-1 ring-white/20">
          {apple ? (
            <>On iPhone: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</>
          ) : (
            <>On your phone: open the browser menu (<strong>⋮</strong>) and tap <strong>Add to Home screen</strong>.</>
          )}
        </p>
      )}
    </section>
  );
}
