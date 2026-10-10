'use client';

/**
 * Reads a QR code from the camera or from a photo. Aadhaar Secure QRs are
 * very dense, so three readers are tried in turn: the browser's
 * BarcodeDetector (Android Chrome, macOS), ZXing compiled to WebAssembly
 * (strong on dense codes, works everywhere — its .wasm is served from this
 * site), then jsQR.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, ImageUp, Loader2, X } from 'lucide-react';

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

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

async function decodeCanvas(canvas: HTMLCanvasElement, thorough = false): Promise<string | null> {
  const w = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
  if (w.BarcodeDetector) {
    try {
      const found = await new w.BarcodeDetector({ formats: ['qr_code'] }).detect(canvas);
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
    const found = await readBarcodes(img, { formats: ['QRCode'], tryHarder: true, tryRotate: thorough, tryInvert: thorough, tryDownscale: true, maxNumberOfSymbols: 1 });
    const hit = found.find((r) => r.isValid && r.text);
    if (hit) return hit.text;
  } catch {
    /* fall through to jsQR */
  }
  const { default: jsQR } = await import('jsqr');
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

export function QrScanner({ onResult, disabled }: { onResult: (text: string) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    const loop = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (cancelled || !video || !canvas) return;
      if (video.readyState >= 2 && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        const text = await decodeCanvas(canvas);
        if (text && !cancelled) {
          stop();
          onResult(text);
          return;
        }
      }
      if (!cancelled) setTimeout(loop, 300);
    };
    void loop();
    return () => {
      cancelled = true;
    };
    // onResult is a fresh closure each render; the loop only needs the latest at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
      streamRef.current = stream;
      setScanning(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError('Camera not available. Allow camera access, or upload a clear photo of the QR instead.');
    }
  };

  const fromPhoto = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current!;
      // Dense codes read best near native size; very large photos are tried smaller too.
      let text: string | null = null;
      for (const max of [2400, 1600, 1000]) {
        const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        text = await decodeCanvas(canvas, true);
        if (text || scale === 1) break;
      }
      if (text) onResult(text);
      else setError('No QR code found in that photo. Take it straight-on in good light, with the QR filling most of the picture and in sharp focus.');
    } catch {
      setError('Could not read that image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <canvas ref={canvasRef} className="hidden" />
      {scanning ? (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" />
          <span aria-hidden className="pointer-events-none absolute inset-[15%] rounded-2xl border-4 border-white/80" />
          <button type="button" onClick={stop} className="absolute right-2 top-2 inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold text-slate-800">
            <X className="h-3.5 w-3.5" aria-hidden /> Stop
          </button>
          <p className="absolute inset-x-0 bottom-2 text-center text-xs font-medium text-white">Hold the Aadhaar QR inside the frame</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled} onClick={startCamera} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50">
            <Camera className="h-4 w-4" aria-hidden /> Scan with camera
          </button>
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImageUp className="h-4 w-4" aria-hidden />} Upload QR photo
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => void fromPhoto(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
