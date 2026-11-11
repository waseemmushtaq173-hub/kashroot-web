'use client';

/**
 * Offline-first root for KashRoot.
 * - Registers Serwist service worker (production only)
 * - Real connectivity detection with health checks
 * - Signed data pack sync (ECDSA P-256 verified)
 * - Outbox with idempotency keys
 * - Offline banner: "No internet. Showing saved data from [time]"
 * - Payment routes never cached; money actions blocked offline
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CloudUpload, Loader2, RotateCcw, Trash2, WifiOff, Wifi, AlertCircle } from 'lucide-react';

import { Btn, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import { supabase, supabaseConfigured } from '@/lib/supabase';

import { onOutboxChange, outbox, type OutboxItem } from './idb';
import { useConnectivity, checkConnectivity, startConnectivityChecks, formatLatency, isRecentlyOnline } from './connectivity';
import { currentUserId, flushOutbox } from './outboxSend';
import { forgetSavedCopies, savedTime } from './savedCopies';
import { loadDataPackPublicKey, startDataPackSync, getCachedDataPack, type DataPackPayload } from './dataPackSync';
import { outboxDb } from './offlineDb';

const theme = PORTAL_THEMES.farmer;
const OUTBOX_RETRY_MS = 60_000;
const OFFLINE_BANNER_HEIGHT = 56; // px, for --kr-bottom-bar

// Pages that NEVER work offline (money, auth, admin, KYC, codes)
const NEVER_OFFLINE_PATHS = [
  '/api/', '/kyc/', '/escrow/', '/admin/', '/team/', '/deliver/', '/drive/',
  '/verify-otp', '/mfa-setup', '/reset-password', '/forgot-password',
  '/login', '/register', '/support', '/account/', '/place', '/payment',
];

function isNeverOffline(path: string): boolean {
  return NEVER_OFFLINE_PATHS.some((p) => path.startsWith(p));
}

/** Registers the Serwist service worker; `onUpdate` gets a new version waiting to take over. */
function registerWorker(onUpdate: (waiting: ServiceWorker) => void): void {
  if (!('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') {
    void navigator.serviceWorker.getRegistrations().then((all) => all.forEach((r) => void r.unregister()));
    return;
  }
  try {
    if (navigator.webdriver && localStorage.getItem('kr_sw') !== 'on') return;
  } catch {
    /* storage blocked */
  }
  const start = async () => {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    const watch = (w: ServiceWorker | null) => {
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) onUpdate(w);
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) onUpdate(reg.waiting);
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
    });
    const ready = await navigator.serviceWorker.ready;
    const files = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => u.startsWith(`${location.origin}/_next/static/`) || /^\/(icons|hero|seasons)\//.test(new URL(u).pathname));
    const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    ready.active?.postMessage({ type: 'kr-warm', files, page: location.pathname + location.search, saveData });
  };
  if (document.readyState === 'complete') void start().catch(() => undefined);
  else window.addEventListener('load', () => void start().catch(() => undefined), { once: true });
}

/** When the page on screen was saved, if the service worker showed the saved copy (else null). */
function askSavedPage(): Promise<number | null> {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = window.setTimeout(() => resolve(null), 1500);
    ch.port1.onmessage = (e: MessageEvent<{ savedAt?: number | null }>) => {
      window.clearTimeout(t);
      resolve(e.data?.savedAt || null);
    };
    worker.postMessage({ type: 'kr-page-info' }, [ch.port2]);
  });
}

/** The time the saved copy of a page was saved (the worker stamps every copy). */
async function savedPageTime(path: string): Promise<number | null> {
  try {
    const hit = (await caches.match(path)) ?? (await caches.match(path, { ignoreSearch: true }));
    return Number(hit?.headers.get('x-kr-saved-at')) || null;
  } catch {
    return null;
  }
}

export function PwaRoot() {
  const pathname = usePathname();
  const connectivity = useConnectivity();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [open, setOpen] = useState(false);
  const [shownAt, setShownAt] = useState<number | null>(null);
  const [dataPack, setDataPack] = useState<DataPackPayload | null>(null);
  const wasOnline = useRef(true);
  const connectivityCheckStop = useRef<(() => void) | null>(null);
  const dataPackSyncStop = useRef<(() => void) | null>(null);

  // Service worker + "New version" toast
  useEffect(() => {
    let refreshing = false;
    const onChange = () => {
      if (refreshing) window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', onChange);
    registerWorker((waiting) => {
      toast('New version — tap to refresh', {
        description: 'KashRoot has been updated.',
        duration: Infinity,
        action: {
          label: 'Refresh',
          onClick: () => {
            refreshing = true;
            waiting.postMessage({ type: 'kr-skip-waiting' });
            window.setTimeout(() => window.location.reload(), 3000);
          },
        },
      });
    });
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', onChange);
  }, []);

  // Connectivity checks (real health checks, not just navigator.onLine)
  useEffect(() => {
    connectivityCheckStop.current = startConnectivityChecks();
    return () => connectivityCheckStop.current?.();
  }, []);

  // Data pack sync (signed, verified)
  useEffect(() => {
    loadDataPackPublicKey().then(() => {
      dataPackSyncStop.current = startDataPackSync();
      // Also load cached pack immediately
      getCachedDataPack().then(setDataPack);
    });
    return () => dataPackSyncStop.current?.();
  }, []);

  // Each page: forget last page's saved data, note when this one was shown
  useEffect(() => {
    let live = true;
    forgetSavedCopies();
    const note = async () => {
      const opened = Date.now();
      let at = await askSavedPage();
      if (!at && !navigator.onLine) at = await savedPageTime(location.pathname + location.search);
      if (live) setShownAt(at ?? (navigator.onLine ? opened : null));
    };
    void note();
    return () => { live = false; };
  }, [pathname]);

  // Current user (for outbox)
  useEffect(() => {
    if (!supabaseConfigured) return;
    let live = true;
    const read = () => void currentUserId().then((id) => live && setUserId(id));
    read();
    const { data } = supabase.auth.onAuthStateChange(() => read());
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);

  const reloadOutbox = useCallback(async () => {
    if (!userId) return setItems([]);
    try {
      setItems(await outboxDb.allForUser(userId));
    } catch {
      setItems([]);
    }
  }, [userId]);

  useEffect(() => {
    let live = true;
    const run = async () => { if (live) await reloadOutbox(); };
    void run();
    const stop = onOutboxChange(() => void run());
    return () => { live = false; stop(); };
  }, [reloadOutbox]);

  const sendOutbox = useCallback(
    async (again = false) => {
      if (!userId || !connectivity.online) return;
      await flushOutbox(userId, again).catch(() => 0);
    },
    [userId, connectivity.online],
  );

  // Offline → online: toast + send
  useEffect(() => {
    if (connectivity.online && !wasOnline.current) {
      const waiting = items.filter((i) => i.state !== 'failed').length;
      toast.success(waiting ? `Back online. Sending ${waiting} item${waiting === 1 ? '' : 's'}…` : 'Back online.');
      void sendOutbox();
    }
    wasOnline.current = connectivity.online;
  }, [items, connectivity.online, sendOutbox]);

  // Banner height for floating mic
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = bannerRef.current;
    if (!el) { root.style.removeProperty('--kr-bottom-bar'); return; }
    const measure = () => root.style.setProperty('--kr-bottom-bar', `${el.offsetHeight}px`);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => { watch.disconnect(); root.style.removeProperty('--kr-bottom-bar'); };
  }, [connectivity.online]);

  const waiting = items.length;
  const failed = items.filter((i) => i.state === 'failed').length;
  const sending = items.some((i) => i.state === 'sending');
  const chipLabel = sending ? 'Sending…' : failed ? `Failed (${failed})` : `Waiting (${waiting})`;

  // Determine if current page is a money action
  const isMoneyPage = isNeverOffline(pathname);

  return (
    <>
      {/* Offline banner */}
      {!connectivity.online && (
        <>
          <div aria-hidden className="h-32" />
          <div
            ref={bannerRef}
            role="status"
            aria-live="polite"
            className="fixed inset-x-0 bottom-0 z-[60] border-t-4 border-amber-400 bg-slate-900 px-4 py-3 text-white shadow-[0_-8px_30px_rgba(15,23,42,0.35)]"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
              <WifiOff className="h-7 w-7 shrink-0 text-amber-300" aria-hidden />
              <p className="min-w-0 flex-1 text-base font-medium leading-snug">
                No internet — showing saved data{shownAt ? ` from ${savedTime(shownAt)}` : ' on this phone'}.
                {isMoneyPage && ' Payments, bookings and KYC need internet.'}
                {!isMoneyPage && ' Your actions will be sent when you are back online.'}
              </p>
              {waiting > 0 && (
                <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-amber-300 px-4 text-base font-bold text-slate-950 hover:bg-amber-200">
                  <CloudUpload className="h-5 w-5" aria-hidden /> {chipLabel}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Online with pending outbox */}
      {connectivity.online && waiting > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`fixed bottom-4 left-4 z-[60] inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full px-5 text-base font-bold shadow-lg ring-1 ${
            failed ? 'bg-rose-50 text-rose-900 ring-rose-300' : 'bg-white text-slate-900 ring-slate-200'
          }`}
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <CloudUpload className="h-5 w-5" aria-hidden />} {chipLabel}
        </button>
      )}

      {/* Outbox modal */}
      {open && <OutboxWindow items={items} online={connectivity.online} onClose={() => setOpen(false)} onSend={(again) => void sendOutbox(again)} />}

      {/* Data pack status (dev/debug) */}
      {process.env.NODE_ENV !== 'production' && dataPack && (
        <div className="fixed bottom-4 right-4 z-[50] rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200 shadow">
          Data pack: {dataPack.metadata.mandiCount} mandi, {dataPack.metadata.weatherCount} weather, {dataPack.metadata.registryCount} registry, {dataPack.metadata.advisoryCount} advisories
        </div>
      )}
    </>
  );
}

function OutboxWindow({
  items,
  online,
  onClose,
  onSend,
}: {
  items: OutboxItem[];
  online: boolean;
  onClose: () => void;
  onSend: (again: boolean) => void;
}) {
  const remove = async (item: OutboxItem) => {
    if (!window.confirm(`Remove “${item.label}”? It will not be sent.`)) return;
    try {
      await outboxDb.remove(item.id);
    } catch {
      toast.error('Could not remove. Close KashRoot and open again.');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={items.length ? `Waiting to send (${items.length})` : 'Nothing waiting to send'}
      footer={
        <>
          <Btn theme={theme} variant="ghost" className="min-h-11" onClick={onClose}>Close</Btn>
          {online && items.length > 0 && <Btn theme={theme} icon={RotateCcw} className="min-h-11" onClick={() => onSend(true)}>Send now</Btn>}
        </>
      }
    >
      <p className="text-sm text-slate-700">
        {online ? 'These are sent automatically while you have signal.' : 'You are offline. Kept on this phone and sent when back online.'}
        Orders, bookings, payments and KYC are never kept offline — they need the internet.
      </p>
      {items.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">Everything has been sent.</p>
      ) : (
        <ul className="mt-4 space-y-3 max-h-[50vh] overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="font-semibold text-slate-900">{item.label}</p>
              <p className="text-xs text-slate-500">Written at {savedTime(item.createdAt)}</p>
              <p className={`mt-1 text-sm ${
                item.state === 'failed' ? 'font-medium text-rose-800' :
                item.state === 'sending' ? 'text-sky-700' :
                'text-slate-700'
              }`}>
                {item.state === 'sending' ? 'Sending…' :
                 item.state === 'failed' ? `Failed: ${item.error ?? 'please check.'}` :
                 item.error ? item.error :
                 online ? 'Waiting to send.' : 'Waiting for signal.'}
              </p>
              {item.state !== 'sending' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.state === 'failed' && online && <Btn theme={theme} size="sm" variant="soft" icon={RotateCcw} className="min-h-11" onClick={() => onSend(true)}>Try again</Btn>}
                  <Btn theme={theme} size="sm" variant="danger" icon={Trash2} className="min-h-11" onClick={() => remove(item)}>Remove</Btn>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}