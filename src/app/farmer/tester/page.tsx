'use client';

import { useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, QrCode } from 'lucide-react';

export default function TesterPage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tester/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCode: code }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error('Inspection failed:', err);
      setResult({ isAuthentic: false, message: 'Server connection error.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">AgroGuard Input Tester</h1>
        <p className="text-stone-600 mt-1">Scan or enter batch verification codes to stop counterfeit pesticides & fertilizers.</p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-stone-200 shadow-sm">
        <form onSubmit={handleInspect} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Batch / QR Code</label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g., KR-BATCH-2026-99"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full pl-4 pr-10 py-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-900"
                required
              />
              <QrCode className="absolute right-3 top-3.5 w-5 h-5 text-stone-400" />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-stone-900 text-white py-3 px-4 rounded-lg font-medium hover:bg-black transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify Authenticity'}
          </button>
        </form>

        {result && (
          <div className={`mt-6 p-4 rounded-lg border flex items-start gap-3 ${result.isAuthentic !== false ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
            {result.isAuthentic !== false ? (
              <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <h3 className="font-semibold text-lg">{result.isAuthentic !== false ? 'Verified Authentic Product' : 'Warning: Counterfeit Risk'}</h3>
              <p className="text-sm mt-1">{result.message || 'This batch is registered and certified under KashRoot safety guidelines.'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}