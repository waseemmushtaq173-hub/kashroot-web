'use client';

/**
 * Links opened from WhatsApp, Instagram, Facebook or a QR-scanner app open in
 * that app's mini-browser, which forgets the sign-in when it is closed. Here
 * we suggest opening KashRoot in Chrome (one tap on Android), where people
 * stay signed in.
 */
import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|Telegram|LinkedInApp|; wv\)/i;

export function InAppBrowserNotice() {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const run = async () => {
      await Promise.resolve();
      if (!live || !IN_APP.test(navigator.userAgent)) return;
      const { host, pathname, search } = window.location;
      // Android: open the same page in Chrome; elsewhere just show the advice.
      setHref(/Android/i.test(navigator.userAgent) ? `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;end` : '');
    };
    void run();
    return () => {
      live = false;
    };
  }, []);
  if (href === null) return null;
  return (
    <div role="note" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
      <p>You opened KashRoot inside another app. It forgets your sign-in when closed — open it in <strong>Chrome</strong> to stay signed in.</p>
      {href ? (
        <a href={href} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white no-underline hover:bg-amber-700 hover:no-underline">
          <ExternalLink className="h-4 w-4" aria-hidden /> Open in Chrome
        </a>
      ) : (
        <p className="mt-1 text-xs">Tap ⋮ or ··· at the top, then “Open in browser”.</p>
      )}
    </div>
  );
}
