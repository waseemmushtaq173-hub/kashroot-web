'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { Landmark, PieChart, BarChart4, TrendingUp, Archive, AlertTriangle } from 'lucide-react';

// Mock DEMO DATA
const DISTRICT_YIELD = [
  { district: 'Shopian', yield: '1,45,000 MT', growth: '+5.2%' },
  { district: 'Sopore (Baramulla)', yield: '2,10,000 MT', growth: '-1.4%' },
  { district: 'Pulwama', yield: '95,000 MT', growth: '+2.1%' },
];

const STORAGE_GAP = [
  { region: 'South Kashmir', existing: 45000, required: 80000 },
  { region: 'North Kashmir', existing: 60000, required: 110000 },
];

export default function GovernmentInsightsPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Navy to Gold Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-pir-panjal-navy,#0B1F3A)] to-[var(--kr-saffron-gold,#E8A317)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <Landmark className="w-8 h-8 text-white" /> Govt & Research Insights
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Anonymised district-level production data and infrastructure gap analysis for policy making.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <PieChart className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Yield Data */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-saffron-gold,#E8A317)]/30 rounded-2xl p-6 shadow-[0_0_20px_rgba(232,163,23,0.1)]">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <BarChart4 className="w-5 h-5 text-[var(--kr-saffron-gold,#E8A317)]" /> Production & Yield (Anonymised)
              </h2>
              
              <div className="space-y-4">
                {DISTRICT_YIELD.map((d, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 flex justify-between items-center hover:bg-white/10 transition-colors">
                    <div>
                      <h3 className="font-bold text-lg">{d.district}</h3>
                      <div className="text-sm text-white/50">Apple (All Varieties)</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-xl">{d.yield}</div>
                      <div className={`text-xs font-bold flex items-center justify-end gap-1 ${d.growth.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>
                        <TrendingUp className={`w-3 h-3 ${d.growth.startsWith('-') && 'rotate-180'}`} /> {d.growth} YoY
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Storage Gap */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-pir-panjal-navy,#0B1F3A)]/50 rounded-2xl p-6 shadow-[0_0_20px_rgba(11,31,58,0.2)]">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Archive className="w-5 h-5 text-blue-400" /> Cold Storage Infrastructure Gap
              </h2>
              
              <div className="space-y-8">
                {STORAGE_GAP.map((region, i) => {
                  const percent = (region.existing / region.required) * 100;
                  const deficit = region.required - region.existing;
                  return (
                    <div key={i}>
                      <div className="flex justify-between items-end mb-2">
                        <h3 className="font-bold">{region.region}</h3>
                        <div className="text-xs text-white/60">Deficit: <span className="text-amber-400 font-bold">{deficit.toLocaleString()} MT</span></div>
                      </div>
                      
                      {/* Bar */}
                      <div className="h-6 w-full bg-black/50 border border-white/10 rounded-full overflow-hidden relative flex">
                        <div className="h-full bg-blue-500 flex items-center px-2 text-[10px] font-bold" style={{ width: `${percent}%` }}>
                          Existing ({region.existing/1000}k MT)
                        </div>
                        <div className="h-full bg-amber-500/20 flex items-center px-2 text-[10px] text-amber-200" style={{ width: `${100 - percent}%` }}>
                          Required ({region.required/1000}k MT total)
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <h4 className="font-bold text-amber-400 text-sm mb-1">Policy Recommendation</h4>
                  <p className="text-xs text-amber-200/80">North Kashmir shows a critical 50,000 MT deficit in CA storage. Subsidy allocation for new CA stores should be prioritized in Sopore/Baramulla belts.</p>
                </div>
              </div>
            </div>

          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
