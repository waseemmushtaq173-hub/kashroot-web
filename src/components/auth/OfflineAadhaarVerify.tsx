'use client';

/**
 * Free Aadhaar verification: scan the Secure QR on the Aadhaar. It is checked
 * server-side against UIDAI's digital signature, and the mobile number on the
 * KashRoot account is matched against the hash UIDAI puts in the QR.
 */
import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

import { QrScanner } from '@/components/auth/QrScanner';
import { loadAccount } from '@/lib/db/client';
import { verifyAadhaarQr, type OfflineAadhaarResult } from '@/lib/kyc/kyc-service';

export function OfflineAadhaarVerify({ onVerified }: { onVerified: (result: OfflineAadhaarResult, mobile: string) => void }) {
  // The phone given at sign-up: nothing extra to type.
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadAccount()
      .then((a) => live && setMobile((a?.phone ?? '').replace(/\D/g, '').slice(-10)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const check = async (text: string) => {
    setBusy(true);
    setError(null);
    try {
      onVerified(await verifyAadhaarQr(text, mobile), mobile);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-4 ring-1 ring-emerald-200 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white shadow-md">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-slate-900">Scan the QR on your Aadhaar</p>
          <p className="text-sm text-slate-600">
            The <strong>big QR code</strong> on your Aadhaar card, e-Aadhaar or mAadhaar app. UIDAI’s digital signature is checked — we keep only your name and the last 4 digits.
          </p>
        </div>
      </div>

      <QrScanner disabled={busy} onResult={(text) => void check(text)} />
      {busy && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking UIDAI’s signature…
        </p>
      )}

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
    </div>
  );
}
