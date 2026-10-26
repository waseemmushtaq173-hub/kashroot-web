'use client';

/**
 * A QR code drawn in the browser: a UPI payment link (scan with any UPI
 * app) or a receipt's own address (the cold store staff scan it to check
 * the receipt on KashRoot). The qrcode library loads only when a QR is
 * shown; nothing is sent anywhere.
 */
import { useEffect, useState } from 'react';

export function QrImage({ text, alt, size = 176, caption }: { text: string; alt: string; size?: number; caption?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#0f172a', light: '#ffffff' } }))
      .then((svg) => live && setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [text]);

  return (
    <figure className="inline-flex flex-col items-center rounded-2xl bg-white p-3 ring-1 ring-slate-200">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL
        <img src={src} width={size} height={size} alt={alt} />
      ) : (
        <span aria-hidden className="block animate-pulse rounded-lg bg-slate-100" style={{ width: size, height: size }} />
      )}
      {caption && <figcaption className="mt-2 max-w-[15rem] text-center text-xs text-slate-600">{caption}</figcaption>}
    </figure>
  );
}
