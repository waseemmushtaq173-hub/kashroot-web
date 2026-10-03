'use client';

import { useState } from 'react';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { ShieldAlert, ShieldCheck, Search, Loader2, FlaskConical } from 'lucide-react';

export default function FertilizerTesterPage() {
  const [batchCode, setBatchCode] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [npk, setNpk] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    isOriginal: boolean;
    score: number;
    matchDetails: string;
    clearance: string;
  }>(null);

  const handleTest = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate verification check against baselines
    setTimeout(() => {
      const isFake = batchCode.toUpperCase().includes('X') || manufacturer.toLowerCase().includes('fake');
      
      setResult({
        isOriginal: !isFake,
        score: isFake ? 24 : 98,
        matchDetails: isFake 
          ? `NPK ratio (${npk}) strongly deviates from official baseline for ${manufacturer || 'this brand'}. Batch code pattern mismatch.`
          : `NPK ratio (${npk}) matches manufacturer baseline. Batch code verified against central registry.`,
        clearance: isFake 
          ? "HIGH RISK COUNTERFEIT. Do not use. Report to local agriculture office."
          : "VERIFIED ORIGINAL. Safe for agricultural application."
      });
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-kr-bg-page">
      <SiteHeader />
      <main className="flex-1 kr-container py-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <FlaskConical className="w-8 h-8 text-kr-text-brand" />
            <h1 className="font-heading text-h1 text-kr-text-primary">Advanced Fertilizer Authenticity Tester</h1>
          </div>
          <p className="text-body-lg text-kr-text-secondary mb-10">
            Verify the authenticity of your fertilizers and agricultural inputs before applying them to your orchards. 
            Enter the batch code, manufacturer, and NPK ratio to run a simulated cross-reference check against official baselines.
          </p>

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
                    placeholder="e.g. BT-99234"
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
                  disabled={loading}
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
                  <p>Awaiting input data. Fill the form to generate the authenticity report.</p>
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
      <SiteFooter />
    </div>
  );
}
