'use client';

/**
 * The floating microphone on the public pages — home, Price Comparison,
 * mandi rates, TrueScan, escrow payment and support — and in every portal:
 * one big button at the bottom right, clear of the phone's home bar, that
 * opens the voice assistant over the page. On public pages it starts
 * listening; in a portal it first shows and reads aloud the guide to the page
 * and tab the person is on (PageGuide), then answers questions. On the home
 * page it steps aside while the assistant's own panel is on screen.
 *
 * Rendered by the public SiteHeader and by PortalShell; drawn into <body>, because the header's
 * frosted glass would otherwise hold the "fixed" button inside the header.
 * The assistant's code loads on the first tap, so pages stay light.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Loader2, Mic, X } from 'lucide-react';

import { PageGuide } from '@/components/voice/PageGuide';
import { portalOfPath } from '@/lib/auth/roles';

// The assistant itself loads only when someone taps the microphone.
const VoiceConcierge = dynamic(() => import('@/components/voice/VoiceConcierge').then((m) => m.VoiceConcierge), {
  ssr: false,
  loading: () => (
    <p className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Opening the voice assistant…
    </p>
  ),
});

const PAGES = ['/', '/compare-prices', '/mandi-weather', '/supplies/tester', '/escrow', '/support'];

const noSubscribe = () => () => undefined;

/**
 * Phones show the 800px-wide page shrunk to fit the screen (app/layout.tsx).
 * The microphone and the panel are grown back by the same amount, so they
 * are phone-sized: a big button to tap and text that can be read.
 */
function onScale(change: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', change);
  return () => vv?.removeEventListener('resize', change);
}
const readScale = () => Math.min(1, Math.max(0.25, window.visualViewport?.scale ?? 1));

export function FloatingVoice() {
  const pathname = usePathname();
  const inPortal = portalOfPath(pathname) !== null;
  const here = PAGES.includes(pathname) || inPortal;
  // Only in the browser: <body> is where it is drawn.
  const browser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const scale = useSyncExternalStore(onScale, readScale, () => 1);
  const zoom = scale < 0.95 ? 1 / scale : 1;
  const phone = zoom > 1;
  const [open, setOpen] = useState(false);
  const [panelShown, setPanelShown] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  // The home page's own assistant panel on screen: no second microphone over it.
  useEffect(() => {
    if (!here) return;
    const panel = document.querySelector('[data-voice-panel]');
    if (!panel || typeof IntersectionObserver === 'undefined') return;
    const watch = new IntersectionObserver(([e]) => setPanelShown(e.isIntersecting), { threshold: 0.2 });
    watch.observe(panel);
    return () => watch.disconnect();
  }, [here, pathname]);

  // Closed again: back to the microphone button.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) button.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    // Focus moves into the panel (the text box takes it when the phone cannot listen).
    const id = requestAnimationFrame(() => {
      if (!sheet.current?.contains(document.activeElement)) sheet.current?.focus();
    });
    return () => {
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(id);
    };
  }, [open]);

  const close = () => setOpen(false);

  if (!here || !browser) return null;

  return createPortal(
    <>
      {!open && !panelShown && (
        <button
          ref={button}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={inPortal ? 'Help on this page — speak to KashRoot' : 'Speak to KashRoot'}
          title={inPortal ? 'Help on this page' : 'Speak to KashRoot'}
          // Above the offline banner when it shows (--kr-bottom-bar, components/pwa), in this button's zoomed pixels.
          style={{ bottom: `calc(1rem + env(safe-area-inset-bottom) + var(--kr-bottom-bar, 0px) / ${zoom})`, right: 'calc(1rem + env(safe-area-inset-right))', zoom }}
          className="fixed z-40 grid h-16 w-16 cursor-pointer place-items-center rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-white shadow-[0_14px_32px_rgba(234,88,12,0.5),inset_0_-6px_14px_rgba(0,0,0,0.2),inset_0_6px_12px_rgba(255,255,255,0.35)] ring-4 ring-white/80 transition hover:scale-105 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-amber-500 motion-reduce:transition-none"
        >
          <Mic className="h-8 w-8" aria-hidden />
        </button>
      )}
      {open && (
        <div style={{ zoom }} className={`fixed inset-0 z-50 flex items-end bg-slate-900/40 ${phone ? 'justify-center' : 'justify-center sm:justify-end sm:p-4'}`} onClick={(e) => e.target === e.currentTarget && close()}>
          <div
            ref={sheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-panel-title"
            tabIndex={-1}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            className={`relative w-full overflow-y-auto overscroll-contain bg-white shadow-[0_-24px_60px_rgba(15,23,42,0.3)] outline-none ${phone ? 'max-h-[92%] rounded-t-[2rem]' : 'max-h-[92svh] rounded-t-[2rem] sm:max-h-[calc(100svh-2rem)] sm:w-[30rem] sm:rounded-[2rem]'}`}
          >
            <button type="button" onClick={close} aria-label="Close voice panel" className="absolute right-3 top-3 z-10 grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-slate-900/5 text-slate-700 hover:bg-slate-900/10">
              <X className="h-5 w-5" aria-hidden />
            </button>
            {inPortal && <PageGuide path={pathname} />}
            <VoiceConcierge compact autoListen={!inPortal} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
