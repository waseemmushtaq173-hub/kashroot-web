'use client';

/**
 * The seller's side of a shipped Kissan Tools order: share the vehicle's
 * location from this phone (sent about every 30 seconds while the page is
 * open), or send the driver a tracking link — a small page where the driver
 * taps Start and their phone shares it instead.
 *
 * Sharing is kept outside the card, one per order, for as long as the page is
 * open: it goes on while the seller looks at another tab of the portal and
 * comes back. It stops on "Stop sharing", when the order is no longer on the
 * way, when location is blocked, when the seller leaves this page or signs
 * out, and the card then says why.
 */
import { useState, useSyncExternalStore } from 'react';
import { Copy, Link2, MapPin, MessageCircle, Square } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Btn, type PortalTheme } from '@/components/portal/kit';
import { ago, supabase } from '@/lib/db/client';
import { driverLink, sendLocation } from '@/lib/db/shop';

const EVERY_MS = 30_000;
type WakeLock = { release: () => Promise<void> };

interface ShareView {
  sharing: boolean;
  sentAt: string | null;
  problem: string | null;
}
interface Share {
  view: ShareView;
  watch: number | null;
  timer: number | null;
  latest: GeolocationPosition | null;
  wake: WakeLock | null;
  /** The page it was started on: leaving it stops the sharing. */
  path: string;
}

const IDLE: ShareView = { sharing: false, sentAt: null, problem: null };
const shares = new Map<string, Share>();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

function show(orderId: string, patch: Partial<ShareView>) {
  const s = shares.get(orderId);
  if (!s) return;
  s.view = { ...s.view, ...patch };
  listeners.forEach((l) => l());
}

async function keepAwake(s: Share) {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
    s.wake = (await nav.wakeLock?.request('screen')) ?? null;
  } catch {
    /* the screen may sleep; sharing continues while the page is open */
  }
}

// The browser lets go of the screen lock when the page is hidden: ask again when it is back.
// Signing out stops every sharing at once.
let watching = false;
function watchPage() {
  if (watching) return;
  watching = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    for (const s of shares.values()) if (s.view.sharing) void keepAwake(s);
  });
  supabase.auth.onAuthStateChange((event) => {
    if (event !== 'SIGNED_OUT') return;
    for (const [id, s] of shares) if (s.view.sharing) stopSharing(id, 'Sharing stopped: you signed out.');
  });
}

/** Stops sharing one order's location; `why` tells the seller when they did not press Stop. */
function stopSharing(orderId: string, why: string | null = null) {
  const s = shares.get(orderId);
  if (!s) return;
  if (s.watch != null) navigator.geolocation.clearWatch(s.watch);
  if (s.timer != null) window.clearInterval(s.timer);
  void s.wake?.release().catch(() => undefined);
  Object.assign(s, { watch: null, timer: null, latest: null, wake: null });
  show(orderId, { sharing: false, problem: why });
}

async function send(orderId: string) {
  const s = shares.get(orderId);
  if (!s?.view.sharing) return;
  if (window.location.pathname !== s.path) return stopSharing(orderId, 'Sharing stopped because you left the orders page. Press the button again to share.');
  const p = s.latest;
  if (!p) return;
  try {
    await sendLocation(orderId, p.coords.latitude, p.coords.longitude, p.coords.accuracy);
    show(orderId, { sentAt: new Date().toISOString(), problem: null });
  } catch (err) {
    const m = err instanceof Error ? err.message : '';
    // Received or closed: there is nothing more to share.
    if (/not on the way any more/.test(m)) return stopSharing(orderId, m);
    show(orderId, { problem: m || 'Could not send the location. Check your internet.' });
  }
}

function startSharing(orderId: string) {
  const s: Share = shares.get(orderId) ?? { view: IDLE, watch: null, timer: null, latest: null, wake: null, path: '' };
  shares.set(orderId, s);
  if (s.view.sharing) return;
  s.path = window.location.pathname;
  if (!navigator.geolocation) return show(orderId, { problem: 'This phone cannot share its location. Send the tracking link to the driver instead.' });
  show(orderId, { sharing: true, problem: null });
  watchPage();
  void keepAwake(s);
  let first = true;
  s.watch = navigator.geolocation.watchPosition(
    (pos) => {
      s.latest = pos;
      if (first) {
        first = false;
        void send(orderId);
      }
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) stopSharing(orderId, 'Sharing stopped: location is blocked for this site. Allow it in the browser settings, then press the button again.');
      else show(orderId, { problem: 'Waiting for GPS. Go outside or turn on location.' });
    },
    { enableHighAccuracy: true, maximumAge: 15_000, timeout: 60_000 },
  );
  s.timer = window.setInterval(() => void send(orderId), EVERY_MS);
}

export function LiveShare({ orderId, driverPhone, lastAt, theme }: { orderId: string; driverPhone?: string | null; lastAt?: string | null; theme: PortalTheme }) {
  const { sharing, sentAt, problem } = useSyncExternalStore(subscribe, () => shares.get(orderId)?.view ?? IDLE, () => IDLE);
  const [link, setLink] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  const makeLink = async () => {
    setMaking(true);
    try {
      setLink(await driverLink(orderId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not make the driver link.');
    } finally {
      setMaking(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied. Send it to the driver.');
    } catch {
      toast.error('Could not copy. Press and hold the link to copy it.');
    }
  };

  const phone = (driverPhone ?? '').replace(/\D/g, '').slice(-10);
  const message = link ? `KashRoot delivery: open this link and press Start, so the buyer can see where the goods are. ${link}` : '';
  const last = sentAt ?? lastAt ?? null;

  return (
    <div className="space-y-3 rounded-2xl bg-orange-50/60 p-4 ring-1 ring-orange-200">
      <p className="font-semibold text-slate-900">Show the buyer where the goods are</p>
      {sharing ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 rounded-xl bg-emerald-600 p-3 font-semibold text-white">
            <MapPin className="h-5 w-5 animate-pulse" aria-hidden /> Sharing this phone’s location{last ? ` · sent ${ago(last)}` : ' · getting GPS…'}
          </p>
          <p className="text-sm text-slate-700">Keep this page open on the phone that travels with the goods. It sends the location about every 30 seconds, also while you look at other tabs here.</p>
          <Btn theme={theme} variant="ghost" icon={Square} className="min-h-11" onClick={() => stopSharing(orderId)}>Stop sharing</Btn>
        </div>
      ) : (
        <>
          <Btn theme={theme} icon={MapPin} className="min-h-11" onClick={() => startSharing(orderId)}>Share live location from this phone</Btn>
          {last && <p className="text-sm text-slate-600">Last position sent {ago(last)}.</p>}
        </>
      )}
      <div className="border-t border-orange-200 pt-3">
        {link ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-700">Send this link to the driver. The driver opens it and presses Start. Anyone with the link can share the location, so send it only to the driver.</p>
            <p className="break-all rounded-xl bg-white p-2 font-mono text-xs text-slate-800 ring-1 ring-slate-200" data-testid="driver-link">{link}</p>
            <div className="flex flex-wrap gap-2">
              <Btn theme={theme} variant="soft" icon={Copy} className="min-h-11" onClick={() => void copyLink()}>Copy link</Btn>
              <a href={`https://wa.me/${/^[6-9]\d{9}$/.test(phone) ? `91${phone}` : ''}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white no-underline hover:bg-emerald-700 hover:no-underline">
                <MessageCircle className="h-4 w-4" aria-hidden /> Send on WhatsApp
              </a>
              <a href={`sms:${/^[6-9]\d{9}$/.test(phone) ? `+91${phone}` : ''}?body=${encodeURIComponent(message)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-800 no-underline ring-1 ring-slate-200 hover:bg-slate-50 hover:no-underline">
                Send by SMS
              </a>
            </div>
          </div>
        ) : (
          <Btn theme={theme} variant="soft" icon={Link2} className="min-h-11" disabled={making} onClick={() => void makeLink()}>{making ? 'Making the link…' : 'Send tracking link to the driver'}</Btn>
        )}
      </div>
      {problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{problem}</p>}
    </div>
  );
}
