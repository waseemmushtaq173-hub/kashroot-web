'use client';

/**
 * QRCodeScanner — Live camera-based QR/barcode scanner for fertiliser/pesticide labels.
 *
 * The camera NEVER starts on mount: the panel opens on an instant
 * "📷 Tap to Start Live QR / Label Scanner" button, so the page renders in well
 * under 100 ms with no hardware permission prompt. Once the camera is requested
 * the <video> element stays mounted the whole time (the spinner overlays it), so
 * `videoRef.current` is never null when the stream arrives. A 2-step constraint
 * request with a 2.5 s timeout guard falls back to the plainest laptop webcam,
 * and decoding runs live via the browser's BarcodeDetector with bundled
 * ZXing-wasm / jsQR fallbacks (no CDN — the CSP blocks third-party scripts).
 * An "Upload QR / Label Image from Device" input sits next to the live feed so
 * a saved photo of a bag QR or label can be scanned instantly.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, ImageUp, Loader2, QrCode, RotateCcw, X } from 'lucide-react';
import type { ReadInputBarcodeFormat } from 'zxing-wasm/reader';

import { Btn, INPUT, PORTAL_THEMES } from '@/components/portal/kit';

const theme = PORTAL_THEMES.dealer;

/** QR codes and the barcodes printed on labels (CIR registration numbers are usually Code 128). */
const LABEL_FORMATS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'data_matrix', 'pdf417', 'aztec'] as const;

interface BarcodeDetectorLike {
  detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

let zxingReady: Promise<typeof import('zxing-wasm/reader')> | null = null;
function zxing() {
  zxingReady ??= import('zxing-wasm/reader').then((mod) => {
    mod.prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? '/vendor/zxing_reader-3.1.5.wasm' : prefix + path) },
    });
    return mod;
  });
  return zxingReady;
}

const ZXING_NAME: Record<(typeof LABEL_FORMATS)[number], ReadInputBarcodeFormat> = {
  qr_code: 'QRCode',
  code_128: 'Code128',
  code_39: 'Code39',
  ean_13: 'EAN13',
  ean_8: 'EAN8',
  upc_a: 'UPCA',
  upc_e: 'UPCE',
  data_matrix: 'DataMatrix',
  pdf417: 'PDF417',
  aztec: 'Aztec',
};

/**
 * Read a code from a canvas: the browser's BarcodeDetector first (Chrome/Edge/
 * Android), then ZXing compiled to WebAssembly (its .wasm is served from this
 * site, so the CSP allows it), then the bundled jsQR. Returns null when the
 * frame holds no readable code.
 */
async function decodeCanvas(canvas: HTMLCanvasElement, thorough = false): Promise<string | null> {
  const w = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike };
  if (w.BarcodeDetector) {
    try {
      const found = await new w.BarcodeDetector({ formats: [...LABEL_FORMATS] }).detect(canvas);
      if (found[0]?.rawValue) return found[0].rawValue;
    } catch {
      /* fall through */
    }
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  try {
    const { readBarcodes } = await zxing();
    const found = await readBarcodes(img, { formats: LABEL_FORMATS.map((f) => ZXING_NAME[f]), tryHarder: true, tryRotate: thorough, tryInvert: thorough, tryDownscale: true, maxNumberOfSymbols: 1 });
    const hit = found.find((r) => r.isValid && r.text);
    if (hit) return hit.text;
  } catch {
    /* fall through to jsQR */
  }
  const { default: jsQR } = await import('jsqr');
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/**
 * getUserMedia raced against a timeout: a slow laptop webcam (or a stuck
 * permission prompt) must not hold the "Starting camera…" spinner for ever —
 * after `ms` the slow request is abandoned (its tracks are stopped if it ever
 * resolves) and the caller falls back to the plainest constraints.
 */
function requestStreamWithTimeout(constraints: MediaStreamConstraints, ms = 2500): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = navigator.mediaDevices.getUserMedia(constraints);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // If the slow request resolves late, stop its tracks so no camera stays on.
      void request.then((late) => late.getTracks().forEach((t) => t.stop())).catch(() => {});
      reject(new Error('Camera took too long to start'));
    }, ms);
    void request.then(
      (stream) => {
        if (settled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(stream);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

type CameraState = 'idle' | 'starting' | 'ready' | 'error';
type FacingMode = 'environment' | 'user';

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
  const runIdRef = useRef(0);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // The latest onResult without restarting the decode loop on every render.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  });

  const stopScanning = useCallback(() => setScanning(false), []);

  const stopCamera = useCallback(() => {
    runIdRef.current++; // any in-flight start becomes a no-op
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
    setCameraState('idle');
  }, []);

  const attachStream = useCallback(async (stream: MediaStream, run: number) => {
    streamRef.current = stream;
    const video = videoRef.current; // mounted from the tap onward — never null here
    if (!video) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      /* muted autoplay can still be blocked on rare devices; the user can tap again */
    }
    if (runIdRef.current !== run) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    setCameraState('ready');
    setScanning(true); // live detection starts at once
  }, []);

  /**
   * 2-step constraint request: the rich constraints first (rear camera, 720p),
   * then — on OverconstrainedError / NotFoundError / NotReadableError or if it
   * takes longer than 2.5 s (slow Windows laptop webcam) — the plainest
   * `{ video: true }`. Resolves in well under a second on most devices, so
   * "Starting camera…" disappears almost immediately.
   */
  const startCamera = useCallback(
    async (mode?: FacingMode) => {
      if (streamRef.current) return;
      const run = ++runIdRef.current;
      setError(null);
      setPhotoError(null);
      setCameraState('starting');
      const facing = mode ?? facingMode;
      let stream: MediaStream | null = null;
      try {
        stream = await requestStreamWithTimeout({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        try {
          stream = await requestStreamWithTimeout({ video: true, audio: false });
        } catch (err) {
          if (runIdRef.current !== run) return;
          const msg = err instanceof Error ? err.message : 'Camera access denied';
          setError(msg);
          setCameraState('error');
          return;
        }
      }
      if (runIdRef.current !== run) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      await attachStream(stream, run);
    },
    [attachStream, facingMode],
  );

  const switchCamera = useCallback(() => {
    const next: FacingMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    stopCamera();
    setTimeout(() => void startCamera(next), 100);
  }, [facingMode, startCamera, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const text = await decodeCanvas(canvas);
          if (text && !cancelled) {
            setLastResult(text);
            stopCamera();
            onResultRef.current(text);
            return;
          }
        } catch {
          /* a transient decode error just waits for the next frame */
        }
      }
      if (!cancelled) timer = setTimeout(loop, 300);
    };
    void loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // The loop only needs the latest onResult, read through onResultRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, stopCamera]);

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (code.length >= 3) {
      onResult(code);
      setShowManualEntry(false);
      setManualCode('');
    }
  };

  /** Decode a saved photo (multi-scale: dense codes read best near native size). */
  const fromPhoto = useCallback(async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError(null);
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      let text: string | null = null;
      for (const max of [2400, 1600, 1000]) {
        const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        text = await decodeCanvas(canvas, true);
        if (text || scale === 1) break;
      }
      bitmap.close();
      if (text) {
        setLastResult(text);
        onResultRef.current(text);
      } else {
        setPhotoError('No QR code or barcode found in that photo. Take it straight-on in good light, with the code filling most of the picture and in sharp focus.');
      }
    } catch {
      setPhotoError('Could not read that image. Try another photo.');
    } finally {
      setPhotoBusy(false);
    }
  }, []);

  const uploadButton = (label: string, className = '') => (
    <label
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50 ${photoBusy ? 'pointer-events-none opacity-50' : ''} ${className}`}
    >
      {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImageUp className="h-4 w-4" aria-hidden />} {label}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          void fromPhoto(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </label>
  );

  return (
    <div className="space-y-3">
      {/* Idle: no camera request has been made — instant buttons, no permission prompt. */}
      {cameraState === 'idle' && (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <QrCode className="mx-auto h-9 w-9 text-slate-500" aria-hidden />
          <p className="mt-2 font-semibold text-slate-800">Point at the QR code or barcode printed on the bag or bottle</p>
          <p className="mt-1 text-xs text-slate-500">The camera starts only when you tap — nothing runs until then.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Btn theme={theme} icon={Camera} onClick={() => void startCamera()} className="min-h-11 min-w-[200px]">
              📷 Tap to Start Live QR / Label Scanner
            </Btn>
            {uploadButton('📁 Upload QR / Label Photo')}
          </div>
        </div>
      )}

      {/* From the tap onward the <video> stays mounted, so the stream always has it. */}
      {cameraState !== 'idle' && (
        <div className="relative overflow-hidden rounded-2xl bg-black ring-1 ring-slate-200">
          <video
            ref={videoRef}
            className="h-[300px] w-full object-cover"
            autoPlay
            playsInline
            muted
            aria-label="Camera preview for QR code scanning"
          />
          <canvas ref={canvasRef} className="hidden" aria-hidden />

          {cameraState === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-400" aria-hidden />
              <p className="text-sm text-white/90">Starting camera…</p>
            </div>
          )}

          {cameraState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
              <AlertCircle className="h-10 w-10 text-rose-400" aria-hidden />
              <p className="text-sm text-white/90">Could not start camera: {error}</p>
              <p className="text-xs text-white/70">Allow camera access in your browser settings, upload a photo instead, or enter the code manually.</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Btn theme={theme} icon={Camera} onClick={() => void startCamera()}>
                  Try again
                </Btn>
                <Btn theme={theme} variant="soft" onClick={() => setShowManualEntry(true)}>
                  Enter code manually
                </Btn>
              </div>
            </div>
          )}

          {cameraState === 'ready' && (
            <>
              {/* Scanning frame + hint */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`relative h-[70%] w-[70%] rounded-xl border-4 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] ${scanning ? 'animate-pulse border-emerald-500' : 'border-white/50'}`}
                  aria-hidden
                />
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center text-white">
                  {scanning ? (
                    <p className="text-sm font-medium">Scanning… point at the QR code on the label</p>
                  ) : (
                    <p className="text-sm text-white/80">Camera ready — tap "Start scanning"</p>
                  )}
                </div>
              </div>

              {/* Controls */}
              <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-4">
                {lastResult && (
                  <div className="animate-slide-up rounded-xl bg-emerald-600 px-4 py-3 text-center text-white">
                    <div className="mb-1 flex items-center justify-center gap-2">
                      <CheckCircle2 className="h-5 w-5" aria-hidden />
                      <span className="font-semibold">QR code detected</span>
                    </div>
                    <p className="break-all text-sm text-white/90">{lastResult}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-2">
                  {!scanning && (
                    <Btn theme={theme} icon={Camera} onClick={() => setScanning(true)} className="min-h-11 min-w-[140px]">
                      Start scanning
                    </Btn>
                  )}
                  {scanning && (
                    <Btn theme={theme} variant="soft" icon={RotateCcw} onClick={stopScanning} className="min-h-11 min-w-[140px]">
                      Stop
                    </Btn>
                  )}
                  <Btn theme={theme} variant="soft" icon={RotateCcw} onClick={switchCamera} className="min-h-11 min-w-[140px]" aria-label="Switch front/back camera">
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
            </>
          )}

          {/* Close button */}
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
            aria-label="Close scanner"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      )}

      {/* Upload — always rendered, right next to the live feed as well. */}
      {cameraState !== 'idle' && (
        <div className="flex flex-wrap items-center justify-center gap-2">{uploadButton('Upload QR / Label Image from Device')}</div>
      )}
      {photoError && <p role="alert" className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{photoError}</p>}
      {isOffline && cameraState === 'ready' && (
        <p className="text-center text-xs text-slate-500">Offline — live verification needs internet, or use manual entry.</p>
      )}
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
