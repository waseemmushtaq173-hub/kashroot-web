'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { Sprout, Droplets, FlaskConical, LineChart, CheckCircle, Leaf } from 'lucide-react';

// Mock DEMO DATA
const PRACTICE_RECORDS = [
  { date: 'Oct 5, 2026', type: 'Pesticide', detail: 'Captan (Fungicide) - 500ml/100L', compliance: 'Safe (Within Limits)' },
  { date: 'Sep 28, 2026', type: 'Irrigation', detail: 'Drip system (4 hours)', compliance: 'Optimal' },
];

export default function SustainabilityPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Green to Teal Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-orchard-green,#1E7B4F)] to-[var(--kr-dal-teal,#0E7C86)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <Sprout className="w-8 h-8 text-white" /> Sustainability & Impact
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Log your farming practices to build a verifiable sustainability footprint that commands premium export prices.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <Leaf className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Impact Estimates */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-black/40 backdrop-blur-md border border-[var(--kr-orchard-green,#1E7B4F)]/40 p-6 rounded-2xl h-full shadow-[0_0_20px_rgba(30,123,79,0.15)]">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <LineChart className="w-5 h-5 text-[var(--kr-orchard-green,#1E7B4F)]" /> My Impact Estimates
                </h2>
                
                <div className="space-y-4">
                  <div className="bg-[var(--kr-orchard-green,#1E7B4F)]/10 border border-[var(--kr-orchard-green,#1E7B4F)]/30 p-5 rounded-xl text-center">
                    <Droplets className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                    <div className="text-3xl font-bold text-white mb-1">12,500 L</div>
                    <div className="text-xs text-white/60">Water Saved (vs Flood Irrigation)</div>
                  </div>
                  
                  <div className="bg-[var(--kr-dal-teal,#0E7C86)]/10 border border-[var(--kr-dal-teal,#0E7C86)]/30 p-5 rounded-xl text-center">
                    <FlaskConical className="w-8 h-8 text-[var(--kr-dal-teal,#0E7C86)] mx-auto mb-2" />
                    <div className="text-3xl font-bold text-white mb-1">-15%</div>
                    <div className="text-xs text-white/60">Chemical Load (YoY Reduction)</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Practice Records Log */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-black/40 backdrop-blur-lg border border-white/20 p-6 rounded-2xl h-full">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Leaf className="w-5 h-5 text-green-400" /> Farm Practice Records
                  </h2>
                  <button className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-white/10 hidden">
                    + Log New Entry
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-white/50">
                        <th className="pb-3 font-medium">Date</th>
                        <th className="pb-3 font-medium">Type</th>
                        <th className="pb-3 font-medium">Details</th>
                        <th className="pb-3 font-medium">Global GAP Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PRACTICE_RECORDS.map((rec, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-4 whitespace-nowrap">{rec.date}</td>
                          <td className="py-4 font-bold flex items-center gap-2 mt-2">
                            {rec.type === 'Pesticide' ? <FlaskConical className="w-4 h-4 text-purple-400" /> : <Droplets className="w-4 h-4 text-blue-400" />}
                            {rec.type}
                          </td>
                          <td className="py-4">{rec.detail}</td>
                          <td className="py-4">
                            <span className="flex items-center gap-1 text-green-400 bg-green-500/10 px-2 py-1 rounded text-xs w-max">
                              <CheckCircle className="w-3 h-3" /> {rec.compliance}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
