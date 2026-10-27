'use client';

/**
 * Offline-first, for 2G, unsteady 4G and no signal at all. Mounted once in
 * the root layout:
 *   - registers the service worker (public/sw.js) in production builds, and
 *     offers "New version — tap to refresh" when an update is ready;
 *   - with no signal, a banner at the bottom: what is shown was saved at
 *     10:42, and actions are sent when the signal is back;
 *   - the outbox (idb.ts): "Waiting to send (2)", sent by itself when the
 *     phone is back online, with a "Back online" message.
 * Automated test browsers (navigator.webdriver) get no service worker
 * unless a test turns it on (localStorage kr_sw = "on"): their request
 * mocks cannot see the requests a service worker answers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CloudUpload, Loader2, RotateCcw, Trash2, WifiOff } from 'lucide-react';

import { Btn, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { toast } from '@/lib/client/toast';
import { supabase, supabaseConfigured } from '@/lib/supabase';

import { onOutboxChange, outbox, type OutboxItem } from './idb';
import { useOnline } from './net';
import { currentUserId, flushOutbox } from './outboxSend';
import { forgetSavedCopies, savedTime } from './savedCopies';

const theme = PORTAL_THEMES.farmer;
/** Items that could not be sent yet are tried again this often while online. */
const RETRY_MS = 60_000;

/** Registers the service worker; `onUpdate` gets a new version waiting to take over. */
function registerWorker(onUpdate: (waiting: ServiceWorker) => void): void {
  if (!('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') {
    // `next dev`: no service worker (a copy left from a production run would serve old pages).
    void navigator.serviceWorker.getRegistrations().then((all) => all.forEach((r) => void r.unregister()));
    return;
  }
  try {
    if (navigator.webdriver && localStorage.getItem('kr_sw') !== 'on') return;
  } catch {
    /* storage blocked: go on */
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
    // Look for a new version when the person comes back to KashRoot.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
    });
    const ready = await navigator.serviceWorker.ready;
    // Keep this page, the files it loaded before the worker started, and the
    // pages most needed with no signal (home, mandi rates and weather).
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
  const online = useOnline();
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [open, setOpen] = useState(false);
  // When what is on screen came from the internet (or was saved, if the saved copy showed).
  const [shownAt, setShownAt] = useState<number | null>(null);
  const wasOnline = useRef(true);

  // The service worker, and its "New version" message.
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
            // If the new version does not take over in time, reload anyway.
            window.setTimeout(() => window.location.reload(), 3000);
          },
        },
      });
    });
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', onChange);
  }, []);

  // Each page: forget the last page's saved data, and note when this one was shown.
  useEffect(() => {
    let live = true;
    forgetSavedCopies();
    const note = async () => {
      const opened = Date.now();
      let at = await askSavedPage();
      // Opened with no signal and the worker does not remember: the saved copy's own time.
      if (!at && !navigator.onLine) at = await savedPageTime(location.pathname + location.search);
      if (live) setShownAt(at ?? (navigator.onLine ? opened : null));
    };
    void note();
    return () => {
      live = false;
    };
  }, [pathname]);

  // Who is signed in on this phone: only their outbox shows and is sent.
  useEffect(() => {
    if (!supabaseConfigured) return;
    let live = true;
    const read = () => void currentUserId().then((id) => live && setUserId(id));
    read();
    const { data } = supabase.auth.onAuthStateChange(() => read());
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const reload = useCallback(async () => {
    if (!userId) return setItems([]);
    try {
      setItems((await outbox.all()).filter((i) => i.userId === userId));
    } catch {
      setItems([]);
    }
  }, [userId]);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await reload();
    };
    void run();
    const stop = onOutboxChange(() => void run());
    return () => {
      live = false;
      stop();
    };
  }, [reload]);

  const send = useCallback(
    async (again = false) => {
      if (!userId || !navigator.onLine) return;
      await flushOutbox(userId, again).catch(() => 0);
    },
    [userId],
  );

  // Sent by itself: now, when the signal comes back, when the person returns, and every minute.
  useEffect(() => {
    if (!userId) return;
    const run = () => void send();
    run();
    const visible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', visible);
    const id = window.setInterval(run, RETRY_MS);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(id);
    };
  }, [send, userId]);

  // Offline → online: say so, then send what is waiting.
  useEffect(() => {
    if (online && !wasOnline.current) {
      const waiting = items.filter((i) => i.state !== 'failed').length;
      toast.success(waiting ? `You are back online. Sending ${waiting} saved item${waiting === 1 ? '' : 's'}…` : 'You are back online.');
      void send();
    }
    wasOnline.current = online;
  }, [items, online, send]);

  // The offline banner's height as --kr-bottom-bar, so the floating
  // microphone (components/voice/FloatingVoice) stands above it.
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = banner.current;
    if (!el) {
      root.style.removeProperty('--kr-bottom-bar');
      return;
    }
    const measure = () => root.style.setProperty('--kr-bottom-bar', `${el.offsetHeight}px`);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.style.removeProperty('--kr-bottom-bar');
    };
  }, [online]);

  const waiting = items.length;
  const failed = items.filter((i) => i.state === 'failed').length;
  const sending = items.some((i) => i.state === 'sending');
  const chipLabel = sending ? 'Sending…' : failed ? `Could not send (${failed})` : `Waiting to send (${waiting})`;

  return (
    <>
      {!online && (
        <>
          {/* Room at the end of the page, so the banner never hides its last lines. */}
          <div aria-hidden className="h-32" />
          <div ref={banner} role="status" aria-live="polite" className="fixed inset-x-0 bottom-0 z-[60] border-t-4 border-amber-400 bg-slate-900 px-4 py-3 text-white shadow-[0_-8px_30px_rgba(15,23,42,0.35)]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
              <WifiOff className="h-7 w-7 shrink-0 text-amber-300" aria-hidden />
              <p className="min-w-0 flex-1 text-base font-medium leading-snug">
                You are offline — showing what was saved{shownAt ? ` at ${savedTime(shownAt)}` : ' on this phone'}. Your actions will be sent when you are back online.
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
      {online && waiting > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`fixed bottom-4 left-4 z-[60] inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full px-5 text-base font-bold shadow-lg ring-1 ${failed ? 'bg-rose-50 text-rose-900 ring-rose-300' : 'bg-white text-slate-900 ring-slate-200'}`}
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <CloudUpload className="h-5 w-5" aria-hidden />} {chipLabel}
        </button>
      )}
      {open && <OutboxWindow items={items} online={online} onClose={() => setOpen(false)} onSend={(again) => void send(again)} />}
    </>
  );
}

function OutboxWindow({ items, online, onClose, onSend }: { items: OutboxItem[]; online: boolean; onClose: () => void; onSend: (again: boolean) => void }) {
  const remove = (item: OutboxItem) => {
    if (!window.confirm(`Remove “${item.label}”? It will not be sent.`)) return;
    void outbox.remove(item.id).catch(() => toast.error('Could not remove it. Close KashRoot and open it again.'));
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
        {online ? 'These are sent by themselves while you have signal.' : 'You are offline. These are kept on this phone and sent by themselves when you are back online.'} Orders, bookings and payments are never kept: they need the internet.
      </p>
      {items.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">Everything has been sent.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="font-semibold text-slate-900">{item.label}</p>
              <p className="text-xs text-slate-500">Written at {savedTime(item.createdAt)}</p>
              <p className={`mt-1 text-sm ${item.state === 'failed' ? 'font-medium text-rose-800' : 'text-slate-700'}`}>
                {item.state === 'sending' ? 'Sending…' : item.state === 'failed' ? `Not sent: ${item.error ?? 'please check it.'}` : item.error ? item.error : online ? 'Waiting to send.' : 'Waiting for signal.'}
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
