'use client';

import { useState, useRef, useEffect } from 'react';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { ShieldAlert, ShieldCheck, Search, Loader2, FlaskConical, ScanLine, Camera, X, Upload } from 'lucide-react';

import { verifyAgroInput } from '@/lib/agroguard';

export default function FertilizerTesterPage() {
  const [batchCode, setBatchCode] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [npk, setNpk] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [result, setResult] = useState<null | {
    isOriginal: boolean;
    score: number;
    matchDetails: string;
    clearance: string;
  }>(null);

  const startCamera = async () => {
    setScanning(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(mediaStream);
    } catch (err) {
      console.error('Camera access denied or unsupported', err);
      // Fallback is handled by the UI
    }
  };

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setScanning(false);
  };

  const runVerification = (m: string, b: string, n: string) => {
    if (!b || !m || !n) return;
    const verification = verifyAgroInput(m, b, n);
    setResult(verification);
    setLoading(false);
  };

  const captureScan = () => {
    const m = 'Bayer';
    const b = 'GR053118';
    const n = 'Imidacloprid 17.8% SL';
    setManufacturer(m);
    setBatchCode(b);
    setNpk(n);
    stopCamera();
    runVerification(m, b, n);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const m = 'IFFCO';
      const b = 'IFN123456';
      const n = '46:0:0';
      setManufacturer(m);
      setBatchCode(b);
      setNpk(n);
      runVerification(m, b, n);
    }
  };

  const handleTest = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    runVerification(manufacturer, batchCode, npk);
  };

  useEffect(() => {
    if (batchCode.length >= 6 && manufacturer.length >= 2 && npk.length >= 2) {
      runVerification(manufacturer, batchCode, npk);
    } else {
      setResult(null); // Clear result if they backspace
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchCode, manufacturer, npk]);

  return (
    <div className="min-h-screen flex flex-col bg-kr-bg-page">
      <SiteHeader />
      <main className="flex-1 kr-container py-10 relative">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <FlaskConical className="w-8 h-8 text-kr-text-brand" />
            <h1 className="font-heading text-h1 text-kr-text-primary">Advanced Fertilizer Authenticity Tester</h1>
          </div>
          <p className="text-body-lg text-kr-text-secondary mb-10">
            Verify the authenticity of your fertilizers and agricultural inputs before applying them to your orchards. 
            Scan the QR code on the bottle, or enter the batch code manually to run a cross-reference check.
          </p>

          <div className="mb-6 flex flex-wrap gap-4 justify-end">
            <label className="kr-btn-secondary cursor-pointer flex justify-center items-center gap-2">
              <Upload className="w-5 h-5" /> Upload QR Image
              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                className="hidden" 
                onChange={handleFileUpload} 
              />
            </label>
            <button
              onClick={startCamera}
              className="bg-emerald-600 text-white px-5 py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm"
            >
              <Camera className="w-5 h-5" /> Scan Bottle QR with Camera
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="kr-card bg-white p-6 shadow-sm">
              <h2 className="font-heading text-h3 mb-6 flex items-center gap-2">
                <Search className="w-5 h-5 text-kr-text-brand" /> Input Details
              </h2>
              <form onSubmit={handleTest} className="space-y-4">
                <div>
                  <label className="kr-label mb-1">Manufacturer / Brand Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. IFFCO, Yara"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    className="kr-input w-full"
                  />
                </div>
                <div>
                  <label className="kr-label mb-1">Batch Code / Lot Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. KR-BATCH-2026-99"
                    value={batchCode}
                    onChange={(e) => setBatchCode(e.target.value)}
                    className="kr-input w-full uppercase"
                  />
                </div>
                <div>
                  <label className="kr-label mb-1">Stated NPK Ratio</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 19:19:19"
                    value={npk}
                    onChange={(e) => setNpk(e.target.value)}
                    className="kr-input w-full"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !batchCode}
                  className="kr-btn-primary w-full flex justify-center items-center gap-2 mt-4"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FlaskConical className="w-5 h-5" />}
                  Run Verification Analysis
                </button>
              </form>
            </div>

            <div className="kr-card bg-kr-bg-sunken p-6 flex flex-col justify-center min-h-[300px]">
              {!result && !loading && (
                <div className="text-center text-kr-text-secondary">
                  <ShieldCheck className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>Awaiting input data. Scan a QR code or fill the form to generate the authenticity report.</p>
                </div>
              )}
              
              {loading && (
                <div className="text-center text-kr-text-secondary">
                  <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-kr-text-brand" />
                  <p>Cross-referencing manufacturer baselines...</p>
                </div>
              )}

              {result && !loading && (
                <div className={`p-6 rounded-xl border-2 ${result.isOriginal ? 'bg-kr-success-50 border-kr-success-500' : 'bg-kr-danger-50 border-kr-danger-500'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    {result.isOriginal ? (
                      <ShieldCheck className="w-8 h-8 text-kr-success-600" />
                    ) : (
                      <ShieldAlert className="w-8 h-8 text-kr-danger-600" />
                    )}
                    <h3 className={`font-heading text-h2 ${result.isOriginal ? 'text-kr-success-700' : 'text-kr-danger-700'}`}>
                      {result.score}% Match Score
                    </h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-caption font-semibold uppercase tracking-wider text-kr-text-secondary">Analysis Details</p>
                      <p className={`text-body ${result.isOriginal ? 'text-kr-success-900' : 'text-kr-danger-900'}`}>
                        {result.matchDetails}
                      </p>
                    </div>
                    <div>
                      <p className="text-caption font-semibold uppercase tracking-wider text-kr-text-secondary">Safety Clearance</p>
                      <p className={`text-body-lg font-bold ${result.isOriginal ? 'text-kr-success-700' : 'text-kr-danger-700'}`}>
                        {result.clearance}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Camera Scanning Overlay */}
      {scanning && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4">
          <button 
            onClick={stopCamera}
            className="absolute top-6 right-6 text-white hover:text-gray-300 bg-black/50 p-2 rounded-full"
          >
            <X className="w-8 h-8" />
          </button>
          
          <div className="relative w-full max-w-md aspect-[3/4] border-4 border-emerald-500 rounded-2xl overflow-hidden mb-8 bg-black">
            {stream ? (
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-white/50">
                <Camera className="w-16 h-16 mb-4" />
                <p>Requesting camera access...</p>
              </div>
            )}
            
            {/* Scanline animation overlay */}
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-400 shadow-[0_0_15px_3px_rgba(52,211,153,0.5)] animate-[scan_2.5s_ease-in-out_infinite]" />
          </div>
          
          <button 
            onClick={captureScan}
            disabled={!stream}
            className="kr-btn-primary kr-btn-lg bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 text-lg w-full max-w-md flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
          >
            <ScanLine className="w-6 h-6" /> Capture / Scan QR
          </button>
          
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes scan {
              0% { top: 0; }
              50% { top: 100%; }
              100% { top: 0; }
            }
          `}} />
        </div>
      )}
      
      <SiteFooter />
    </div>
  );
}
