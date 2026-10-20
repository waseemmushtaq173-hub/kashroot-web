'use client';

/**
 * The seller's side of a shipped Kissan Tools order: share the vehicle's
 * location from this phone (sent about every 30 seconds while the page is
 * open), or send the driver a tracking link — a small page where the driver
 * taps Start and their phone shares it instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Link2, MapPin, MessageCircle, Square } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Btn, type PortalTheme } from '@/components/portal/kit';
import { ago } from '@/lib/db/client';
import { driverLink, sendLocation } from '@/lib/db/shop';

const EVERY_MS = 30_000;
type WakeLock = { release: () => Promise<void> };

export function LiveShare({ orderId, driverPhone, lastAt, theme, onSent }: { orderId: string; driverPhone?: string | null; lastAt?: string | null; theme: PortalTheme; onSent?: () => void }) {
  const [sharing, setSharing] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const watch = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef<GeolocationPosition | null>(null);
  const wake = useRef<WakeLock | null>(null);

  const stop = useCallback(() => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    if (timer.current != null) window.clearInterval(timer.current);
    watch.current = null;
    timer.current = null;
    latest.current = null;
    void wake.current?.release().catch(() => undefined);
    wake.current = null;
    setSharing(false);
  }, []);
  useEffect(() => stop, [stop]);

  const send = useCallback(async () => {
    const p = latest.current;
    if (!p) return;
    try {
      await sendLocation(orderId, p.coords.latitude, p.coords.longitude, p.coords.accuracy);
      setSentAt(new Date().toISOString());
      setProblem(null);
      onSent?.();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not send the location. Check your internet.');
    }
  }, [orderId, onSent]);

  const start = () => {
    setProblem(null);
    if (!navigator.geolocation) return setProblem('This phone cannot share its location. Send the tracking link to the driver instead.');
    setSharing(true);
    void (async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
        wake.current = (await nav.wakeLock?.request('screen')) ?? null;
      } catch {
        /* the screen may sleep; sharing continues while the page is open */
      }
    })();
    let first = true;
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = pos;
        if (first) {
          first = false;
          void send();
        }
      },
      (err) => {
        setProblem(err.code === err.PERMISSION_DENIED ? 'Location is blocked for this site. Allow it in the browser settings, then press the button again.' : 'Waiting for GPS. Go outside or turn on location.');
        if (err.code === err.PERMISSION_DENIED) stop();
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 60_000 },
    );
    timer.current = window.setInterval(() => void send(), EVERY_MS);
  };

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
          <p className="text-sm text-slate-700">Keep this page open on the phone that travels with the goods. It sends the location about every 30 seconds.</p>
          <Btn theme={theme} variant="ghost" icon={Square} className="min-h-11" onClick={stop}>Stop sharing</Btn>
        </div>
      ) : (
        <>
          <Btn theme={theme} icon={MapPin} className="min-h-11" onClick={start}>Share live location from this phone</Btn>
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
