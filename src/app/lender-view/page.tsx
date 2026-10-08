'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { Landmark, Shield, LineChart, Umbrella, Map, ChevronRight, Activity } from 'lucide-react';

// Mock DEMO DATA
const CREDIT_PROFILES = [
  { id: 'F-8821', name: 'Bashir Traders', score: 785, risk: 'Low Risk', escrowHistory: '₹14L cleared', crop: 'Apple' },
  { id: 'F-8843', name: 'Zahoor Orchards', score: 620, risk: 'Medium Risk', escrowHistory: '₹2.5L cleared', crop: 'Walnut' },
];

const WEATHER_TRIGGERS = [
  { region: 'Shopian Block A', event: 'Hailstorm (Severe)', date: 'Oct 5', affectedPolices: 42, status: 'Claim Auto-Triggered' },
];

export default function LenderViewPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Teal to Navy Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-dal-teal,#0E7C86)] to-[var(--kr-pir-panjal-navy,#0B1F3A)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <Landmark className="w-8 h-8 text-white" /> Lender & Insurer Desk
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Assess farmer creditworthiness backed by KashRoot escrow data, and monitor weather-triggered parametric insurance.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <Shield className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Credit Scoring */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-dal-teal,#0E7C86)]/40 rounded-2xl p-6 shadow-[0_0_20px_rgba(14,124,134,0.15)] flex flex-col">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <LineChart className="w-5 h-5 text-[var(--kr-dal-teal,#0E7C86)]" /> Explainable Credit Scores
              </h2>
              
              <div className="space-y-4 flex-1">
                {CREDIT_PROFILES.map(profile => (
                  <div key={profile.id} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-[var(--kr-dal-teal,#0E7C86)]/50 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-lg">{profile.name}</h3>
                        <div className="text-xs text-white/50">{profile.id} • {profile.crop}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-[var(--kr-dal-teal,#0E7C86)]">{profile.score}</div>
                        <div className={`text-xs font-bold ${profile.risk === 'Low Risk' ? 'text-green-400' : 'text-amber-400'}`}>
                          {profile.risk}
                        </div>
                      </div>
                    </div>
                    
                    <div className="border-t border-white/10 pt-3 flex gap-4 text-sm">
                      <div className="flex-1">
                        <div className="text-xs text-white/50">Escrow History</div>
                        <div className="font-bold">{profile.escrowHistory}</div>
                      </div>
                      <div className="flex-1 border-l border-white/10 pl-4">
                        <div className="text-xs text-white/50">Collateral (Cold Store)</div>
                        <div className="font-bold">400 Boxes Locked</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Insurance Tracking */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-pir-panjal-navy,#0B1F3A)]/50 rounded-2xl p-6 shadow-[0_0_20px_rgba(11,31,58,0.2)]">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Umbrella className="w-5 h-5 text-blue-400" /> Weather-Trigger Insurance
              </h2>
              
              <div className="bg-[#0B1F3A]/30 border border-white/10 rounded-xl p-5 mb-6 relative overflow-hidden">
                <div className="absolute right-0 top-0 h-full w-1/3 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/e4/Jammu_and_Kashmir_locator_map.svg')] bg-cover opacity-10"></div>
                <div className="relative z-10">
                  <div className="text-xs font-bold text-blue-400 bg-blue-500/20 px-2 py-1 rounded w-max mb-3">Parametric Monitoring Active</div>
                  <div className="flex gap-6">
                    <div>
                      <div className="text-white/60 text-sm">Active Policies</div>
                      <div className="text-2xl font-bold">1,402</div>
                    </div>
                    <div>
                      <div className="text-white/60 text-sm">Insured Value</div>
                      <div className="text-2xl font-bold">₹14.2 Cr</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <h3 className="font-bold text-sm text-white/70 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Recent Triggers
              </h3>
              <div className="space-y-3">
                {WEATHER_TRIGGERS.map((trigger, i) => (
                  <div key={i} className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-red-400">{trigger.event}</h4>
                      <div className="text-xs text-white/60">{trigger.region} • {trigger.date}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{trigger.affectedPolices} Policies</div>
                      <div className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded font-bold mt-1">{trigger.status}</div>
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
