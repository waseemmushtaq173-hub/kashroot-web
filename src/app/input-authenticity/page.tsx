'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { QrCode, ShieldAlert, BarChart2, ShieldCheck, MapPin, AlertTriangle } from 'lucide-react';

// Mock DEMO DATA
const BATCH_REGISTRY = [
  { id: 'BATCH-F442', product: 'DAP Fertilizer 50kg', totalScans: 1450, suspiciousScans: 2, status: 'Healthy' },
  { id: 'BATCH-S910', product: 'Captan Fungicide 1kg', totalScans: 320, suspiciousScans: 45, status: 'High Risk' },
];

const SUSPICIOUS_SCANS = [
  { location: 'Anantnag Mandi', time: '10 mins ago', issue: 'Duplicate QR scanned 5 times in 1 hour', riskLevel: 'Critical' },
  { location: 'Pulwama Rural', time: '2 hours ago', issue: 'QR format mismatch', riskLevel: 'Medium' },
];

export default function InputAuthenticityPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Crimson to Navy Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-apple-crimson,#C62828)] to-[var(--kr-pir-panjal-navy,#0B1F3A)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <ShieldCheck className="w-8 h-8 text-white" /> Input Authenticity Network
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Protect your brand and farmers. Monitor QR scans of your agri-inputs in real-time to detect and stop counterfeiting.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <ShieldCheck className="w-64 h-64 text-white" />
            </div>
          </div>

          {/* Top KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-white/60 text-sm mb-1">Total Scans (30 Days)</div>
                <div className="text-3xl font-bold">12,450</div>
              </div>
              <QrCode className="w-10 h-10 text-blue-400 opacity-50" />
            </div>
            
            <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-white/60 text-sm mb-1">Authentic Verifications</div>
                <div className="text-3xl font-bold text-green-400">12,382</div>
              </div>
              <ShieldCheck className="w-10 h-10 text-green-400 opacity-50" />
            </div>
            
            <div className="bg-red-500/10 backdrop-blur-md border border-red-500/30 p-6 rounded-2xl flex items-center justify-between">
              <div>
                <div className="text-red-200 text-sm mb-1">Suspicious Alerts</div>
                <div className="text-3xl font-bold text-red-400">68</div>
              </div>
              <ShieldAlert className="w-10 h-10 text-red-400 opacity-50 animate-pulse" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Batch Registry */}
            <div className="bg-black/40 backdrop-blur-lg border border-white/20 rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-blue-400" /> Active Batch Registry
              </h2>
              
              <div className="space-y-4">
                {BATCH_REGISTRY.map((batch, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center">
                    <div className="mb-4 md:mb-0">
                      <div className="text-xs font-mono text-white/50 mb-1">{batch.id}</div>
                      <h3 className="font-bold text-lg">{batch.product}</h3>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{batch.totalScans}</div>
                        <div className="text-xs text-white/50">Total Scans</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${batch.suspiciousScans > 10 ? 'text-red-400' : 'text-green-400'}`}>
                          {batch.suspiciousScans}
                        </div>
                        <div className="text-xs text-white/50">Flags</div>
                      </div>
                      <div>
                        <span className={`px-3 py-1 rounded text-xs font-bold ${batch.status === 'High Risk' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                          {batch.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-6 w-full py-3 border border-white/20 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors hidden">
                Register New Batch QR
              </button>
            </div>

            {/* Suspicious Scans Map & Feed */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-apple-crimson,#C62828)]/50 rounded-2xl p-6 shadow-[0_0_30px_rgba(198,40,40,0.15)] flex flex-col">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
                <MapPin className="w-5 h-5 text-[var(--kr-apple-crimson,#C62828)]" /> Counterfeit Threat Map
              </h2>
              
              {/* Fake Map UI */}
              <div className="h-48 w-full bg-[#1a0f14] rounded-xl border border-red-500/20 relative overflow-hidden mb-6 flex items-center justify-center">
                <div className="absolute inset-0 opacity-20 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/e4/Jammu_and_Kashmir_locator_map.svg')] bg-center bg-no-repeat bg-contain filter invert sepia hue-rotate-[300deg] saturate-[500%]"></div>
                
                {/* Threat Blips */}
                <div className="absolute top-1/3 left-1/3 flex flex-col items-center">
                  <div className="w-4 h-4 bg-red-500 rounded-full shadow-[0_0_20px_red] animate-ping"></div>
                  <div className="w-2 h-2 bg-red-500 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
                </div>
                
                <span className="z-10 text-red-200 text-xs font-medium bg-red-900/80 px-2 py-1 rounded border border-red-500/50 backdrop-blur-sm absolute top-4 right-4">
                  2 Active Hotspots
                </span>
              </div>

              {/* Alerts Feed */}
              <div className="space-y-3 flex-1 overflow-y-auto">
                {SUSPICIOUS_SCANS.map((scan, i) => (
                  <div key={i} className="bg-red-500/10 border border-red-500/20 p-4 rounded-lg flex gap-4">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-red-100">{scan.location}</span>
                        <span className="text-xs text-red-400/60">{scan.time}</span>
                      </div>
                      <p className="text-sm text-red-200/80 mb-2">{scan.issue}</p>
                      <button className="text-xs bg-red-500/20 hover:bg-red-500/40 text-red-300 px-3 py-1 rounded transition-colors border border-red-500/30 hidden">
                        Investigate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
