'use client';

/**
 * Free Aadhaar verification: upload UIDAI's Offline e-KYC ZIP (with its share
 * code) or scan the Secure QR on the Aadhaar. Both are checked server-side
 * against UIDAI's digital signature; the mobile number, if given, is matched
 * against the hash UIDAI puts in the document.
 */
import { useId, useState } from 'react';
import { ExternalLink, FileArchive, Loader2, QrCode, ShieldCheck } from 'lucide-react';

import { QrScanner } from '@/components/auth/QrScanner';
import { verifyAadhaarQr, verifyOfflineZip, type OfflineAadhaarResult } from '@/lib/kyc/kyc-service';

const INPUT = 'block w-full rounded-xl border-0 bg-white px-4 py-3 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600';

export function OfflineAadhaarVerify({ onVerified }: { onVerified: (result: OfflineAadhaarResult, mobile: string) => void }) {
  const ids = { mobile: useId(), file: useId(), code: useId() };
  const [mode, setMode] = useState<'zip' | 'qr'>('zip');
  const [mobile, setMobile] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [shareCode, setShareCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<OfflineAadhaarResult>) => {
    setBusy(true);
    setError(null);
    try {
      onVerified(await task(), mobile.replace(/\D/g, '').slice(-10));
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
          <p className="font-semibold text-slate-900">Verify Aadhaar for free</p>
          <p className="text-sm text-slate-600">Checked against UIDAI’s digital signature — nothing is stored except your name and the last 4 digits.</p>
        </div>
      </div>

      <label htmlFor={ids.mobile} className="block text-sm font-medium text-slate-800">
        Mobile number registered with Aadhaar <span className="font-normal text-slate-500">(we match it with UIDAI’s record)</span>
        <input id={ids.mobile} inputMode="numeric" autoComplete="tel-national" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/[^\d+ ]/g, '').slice(0, 14))} placeholder="10-digit mobile" className={`${INPUT} mt-1.5`} />
      </label>

      <div role="group" aria-label="Verification method" className="inline-flex rounded-xl bg-white/80 p-1 ring-1 ring-emerald-200">
        {([
          ['zip', 'Offline e-KYC file', FileArchive],
          ['qr', 'Scan Aadhaar QR', QrCode],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => {
              setMode(id);
              setError(null);
            }}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${mode === id ? 'bg-emerald-700 text-white shadow-sm' : 'text-emerald-900 hover:bg-emerald-50'}`}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {mode === 'zip' ? (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>
              Open{' '}
              <a href="https://myaadhaar.uidai.gov.in/offline-ekyc" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-emerald-800 underline">
                UIDAI Offline e-KYC <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
              , enter your Aadhaar and the OTP UIDAI sends to your phone.
            </li>
            <li>Choose a 4-character share code and download the ZIP file.</li>
            <li>Upload that ZIP here with the same share code.</li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <label htmlFor={ids.file} className="block text-sm font-medium text-slate-800">
              Aadhaar ZIP file
              <input id={ids.file} type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-sm text-slate-700 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-emerald-700 file:px-3 file:py-2 file:font-semibold file:text-white" />
            </label>
            <label htmlFor={ids.code} className="block text-sm font-medium text-slate-800">
              Share code
              <input id={ids.code} value={shareCode} maxLength={4} autoComplete="off" onChange={(e) => setShareCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 4))} placeholder="••••" className={`${INPUT} mt-1.5 text-center font-mono tracking-[0.4em]`} />
            </label>
          </div>
          <button
            type="button"
            disabled={!file || shareCode.length !== 4 || busy}
            onClick={() => void run(() => verifyOfflineZip(file!, shareCode, mobile))}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Verify Aadhaar file
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">Scan the QR code printed on your Aadhaar letter or PVC card, or shown in the mAadhaar app.</p>
          <QrScanner disabled={busy} onResult={(text) => void run(() => verifyAadhaarQr(text, mobile))} />
          {busy && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking UIDAI’s signature…</p>}
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
    </div>
  );
}
