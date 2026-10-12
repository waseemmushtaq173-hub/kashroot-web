'use client';

/**
 * A UPI QR code: anyone can scan it with PhonePe, Google Pay, Paytm or BHIM
 * to pay this UPI ID (with the amount filled in when given). Used both to
 * pay someone (from another phone or a computer) and to receive money (show
 * it to the person paying you). Drawn in the browser; nothing is sent anywhere.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

import { upiLink } from '@/lib/db/rentals';

export function UpiQr({ upi, name, amount, note, size = 176, caption }: { upi: string; name: string; amount?: number; note?: string; size?: number; caption?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const link = upiLink({ upi, name, amount, note: note ?? 'KashRoot' });

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: size * 2, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [link, size]);

  if (!src) return null;
  return (
    <figure className="inline-flex flex-col items-center rounded-2xl bg-white p-3 ring-1 ring-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
      <img src={src} width={size} height={size} alt={`UPI QR code to pay ${name} (${upi})`} />
      <figcaption className="mt-2 max-w-[14rem] text-center text-xs text-slate-600">{caption ?? 'Scan with any UPI app — PhonePe, Google Pay, Paytm, BHIM'}</figcaption>
    </figure>
  );
}
