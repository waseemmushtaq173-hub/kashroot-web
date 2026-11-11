'use client';

/**
 * QRCodeScanner — Live camera-based QR/barcode scanner for fertiliser/pesticide labels.
 * Uses jsQR for decoding (no ML, works offline).
 * Shows live preview, captures frames, decodes on interval.
 * When a QR is found, calls onResult with the decoded text.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RotateCcw, X, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

import { Btn, INPUT, PORTAL_THEMES } from '@/components/portal/kit';

const theme = PORTAL_THEMES.dealer;

interface QRCodeScannerProps {
  onResult: (text: string) => void;
  onClose: () => void;
  /** Manufacturer domains allowed for verification (prevents SSRF). */
  allowedDomains?: string[];
  /** Whether we're currently offline. */
  isOffline?: boolean;
}

export function QRCodeScanner({ onResult, onClose, allowedDomains = [], isOffline = false }: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState('');

  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setHasPermission(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera access denied';
      setError(msg);
      setHasPermission(false);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setHasPermission(false);
    setScanning(false);
  }, []);

  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    stopCamera();
    setTimeout(startCamera, 100);
  }, [startCamera, stopCamera]);

  const decodeFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // jsQR will be loaded dynamically
    try {
      const jsQR = (window as any).jsQR;
      if (jsQR) {
        const code = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
        if (code) {
          setLastResult(code.data);
          stopCamera();
          onResult(code.data);
        }
      }
    } catch {
      // jsQR not loaded yet or decode failed
    }
  }, [onResult, stopCamera]);

  const startScanning = useCallback(() => {
    if (!hasPermission) return;
    setScanning(true);
    intervalRef.current = setInterval(decodeFrame, 200); // 5 fps
  }, [hasPermission, decodeFrame]);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  useEffect(() => {
    // Load jsQR dynamically
    if (typeof window !== 'undefined' && !(window as any).jsQR) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (code.length >= 3) {
      onResult(code);
      setShowManualEntry(false);
      setManualCode('');
    }
  };

  if (!hasPermission && !error) {
    return (
      <div className="flex min-h-[300px] items-center justify-center gap-4 p-6 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-chinar" aria-hidden />
        <p className="text-slate-600">Starting camera…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-rose-50 p-6 ring-1 ring-rose-200 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-rose-600" aria-hidden />
        <p className="mt-3 text-sm text-rose-800">Could not start camera: {error}</p>
        <p className="mt-1 text-xs text-rose-600">Please allow camera access in your browser settings, or enter the code manually below.</p>
        <button
          type="button"
          onClick={() => setShowManualEntry(true)}
          className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50"
        >
          <Camera className="h-4 w-4" aria-hidden /> Enter code manually
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden ring-1 ring-slate-200 bg-black">
      {/* Live camera preview */}
      <video
        ref={videoRef}
        className="w-full h-[300px] object-cover"
        playsInline
        muted
        aria-label="Camera preview for QR code scanning"
      />
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      {/* Scanning indicator */}
      {hasPermission && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`relative w-[70%] h-[70%] rounded-xl border-4 ${scanning ? 'border-emerald-500 animate-pulse' : 'border-white/50'} shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]`} aria-hidden />
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center text-white">
            {scanning ? (
              <p className="text-sm font-medium">Scanning… point at the QR code on the label</p>
            ) : (
              <p className="text-sm text-white/80">Camera ready — tap "Start scanning"</p>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col gap-3">
        {lastResult && (
          <div className="rounded-xl bg-emerald-600 px-4 py-3 text-white text-center animate-slide-up">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
              <span className="font-semibold">QR code detected</span>
            </div>
            <p className="text-sm text-white/90 break-all">{lastResult}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {!scanning && hasPermission && (
            <Btn theme={theme} icon={Camera} onClick={startScanning} className="min-h-11 min-w-[140px]">
              Start scanning
            </Btn>
          )}
          {scanning && (
            <Btn theme={theme} variant="soft" icon={RotateCcw} onClick={stopCamera} className="min-h-11 min-w-[140px]">
              Stop
            </Btn>
          )}
          <Btn
            theme={theme}
            variant="soft"
            icon={RotateCcw}
            onClick={switchCamera}
            className="min-h-11 min-w-[140px]"
            aria-label="Switch front/back camera"
          >
            Switch camera
          </Btn>
          <Btn
            theme={theme}
            variant={showManualEntry ? 'solid' : 'soft'}
            icon={Camera}
            onClick={() => setShowManualEntry(!showManualEntry)}
            className="min-h-11 min-w-[140px]"
          >
            Manual entry
          </Btn>
        </div>

        {showManualEntry && (
          <div className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="Enter QR/barcode manually (e.g. CIR-12345/2021)"
              className={`${INPUT} flex-1 text-lg tracking-wide font-mono`}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            />
            <Btn theme={theme} onClick={handleManualSubmit} className="min-h-11 min-w-[100px] shrink-0">
              Submit
            </Btn>
          </div>
        )}
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 rounded-full p-2 bg-black/50 text-white hover:bg-black/70 transition"
        aria-label="Close scanner"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * QRCodeResult — Shows the verification result with clear outcome badge.
 */
export interface QRCodeVerificationResult {
  outcome: 'VERIFIED_BY_MANUFACTURER' | 'REGISTERED_BATCH_UNVERIFIED' | 'EXPIRED' | 'BANNED' | 'NOT_FOUND' | 'PENDING_MANUFACTURER' | 'OFFLINE_SAVED_LIST';
  productName: string;
  manufacturer: string;
  registrationNumber?: string;
  batchNumber?: string;
  expiryDate?: string;
  manufacturerVerifiedAt?: string;
  cibrcStatus?: 'registered' | 'banned' | 'not_found';
  fcoStandard?: boolean;
  details: string;
  offline?: boolean;
  source: string;
  checkedAt: string;
}

const OUTCOME_LABELS: Record<QRCodeVerificationResult['outcome'], { label: string; tone: 'green' | 'amber' | 'red' | 'blue' | 'slate'; icon: React.ReactNode }> = {
  VERIFIED_BY_MANUFACTURER: { label: 'Verified by Manufacturer', tone: 'green', icon: <CheckCircle2 className="h-4 w-4" /> },
  REGISTERED_BATCH_UNVERIFIED: { label: 'Registered — Batch Not Verified', tone: 'amber', icon: <AlertCircle className="h-4 w-4" /> },
  EXPIRED: { label: 'Expired', tone: 'red', icon: <AlertCircle className="h-4 w-4" /> },
  BANNED: { label: 'Banned / Restricted', tone: 'red', icon: <AlertCircle className="h-4 w-4" /> },
  NOT_FOUND: { label: 'Not in Official Lists', tone: 'red', icon: <AlertCircle className="h-4 w-4" /> },
  PENDING_MANUFACTURER: { label: 'Manufacturer Verification Pending', tone: 'blue', icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  OFFLINE_SAVED_LIST: { label: 'Checked Against Saved List', tone: 'blue', icon: <AlertCircle className="h-4 w-4" /> },
};

export function QRCodeResult({ result, onReportFake, onLabTest, onClose }: {
  result: QRCodeVerificationResult;
  onReportFake?: () => void;
  onLabTest?: () => void;
  onClose: () => void;
}) {
  const { label, tone, icon } = OUTCOME_LABELS[result.outcome];

  return (
    <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
            {icon} <span className={`text-${tone}-800`}>{label}</span>
            {result.offline && <span className="text-xs font-medium text-blue-800 bg-blue-50 px-2 py-0.5 rounded">Offline</span>}
          </p>
          <p className="mt-1 text-sm text-slate-600">{result.details}</p>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2 text-sm">
            <div><dt className="text-slate-500">Product</dt><dd className="font-medium text-slate-900">{result.productName}</dd></div>
            <div><dt className="text-slate-500">Manufacturer</dt><dd className="font-medium text-slate-900">{result.manufacturer}</dd></div>
            {result.registrationNumber && <div><dt className="text-slate-500">Registration</dt><dd className="font-mono text-slate-900">{result.registrationNumber}</dd></div>}
            {result.batchNumber && <div><dt className="text-slate-500">Batch</dt><dd className="font-mono text-slate-900">{result.batchNumber}</dd></div>}
            {result.expiryDate && (
              <div>
                <dt className="text-slate-500">Expiry</dt>
                <dd className={`font-medium ${result.outcome === 'EXPIRED' ? 'text-rose-700' : 'text-slate-900'}`}>{result.expiryDate}</dd>
              </div>
            )}
            {result.cibrcStatus && (
              <div>
                <dt className="text-slate-500">CIB&RC Status</dt>
                <dd className={`font-medium ${result.cibrcStatus === 'banned' ? 'text-rose-700' : result.cibrcStatus === 'registered' ? 'text-emerald-700' : 'text-slate-900'}`}>{result.cibrcStatus}</dd>
              </div>
            )}
          </dl>
          {result.manufacturerVerifiedAt && (
            <p className="mt-3 text-xs text-slate-500">Manufacturer verified: {new Date(result.manufacturerVerifiedAt).toLocaleString('en-IN')}</p>
          )}
          <p className="mt-3 text-xs text-slate-500">Source: {result.source} · Checked: {new Date(result.checkedAt).toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {onReportFake && result.outcome !== 'VERIFIED_BY_MANUFACTURER' && result.outcome !== 'OFFLINE_SAVED_LIST' && (
          <Btn theme={theme} variant="danger" icon={AlertCircle} onClick={onReportFake} className="min-h-11">
            Report Suspected Fake
          </Btn>
        )}
        {(result.outcome === 'EXPIRED' || result.outcome === 'NOT_FOUND' || result.outcome === 'REGISTERED_BATCH_UNVERIFIED') && onLabTest && (
          <Btn theme={theme} variant="soft" icon={AlertCircle} onClick={onLabTest} className="min-h-11">Book Lab Test</Btn>
        )}
        {result.outcome === 'NOT_FOUND' && !result.fcoStandard && onLabTest && (
          <Btn theme={theme} variant="soft" onClick={onLabTest} className="min-h-11">Bag-Marking Checklist</Btn>
        )}
        <Btn theme={theme} variant="ghost" onClick={onClose} className="min-h-11">Done</Btn>
      </div>
    </div>
  );
}