'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { Landmark, FileText, CheckCircle, Clock, ChevronRight, FileCheck, Percent } from 'lucide-react';

// Mock DEMO DATA
const ELIGIBLE_SCHEMES = [
  { id: 'SCH-01', name: 'PM-KUSUM Solar Pump Subsidy', agency: 'Govt. of India', match: '98%', subsidy: 'Up to 60%', deadline: 'Nov 30, 2026' },
  { id: 'SCH-02', name: 'J&K High-Density Apple Plantation Scheme', agency: 'Horticulture Dept J&K', match: '100%', subsidy: '50% Cost Cover', deadline: 'Open' },
];

const APPLICATION_STATUS = [
  { id: 'APP-882', scheme: 'Cold Storage Capacity Expansion Subsidy', status: 'Under Review', date: 'Submitted Oct 1', step: 2, totalSteps: 4 },
];

export default function SchemesFinderPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Walnut Brown to Gold */}
          <div className="bg-gradient-to-r from-[var(--kr-walnut-brown,#6B4423)] to-[var(--kr-saffron-gold,#E8A317)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <Landmark className="w-8 h-8 text-white" /> Scheme & Subsidy Finder
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Discover government subsidies tailored to your profile. Auto-fill applications using your KashRoot data.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <Landmark className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Eligible Schemes */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold flex items-center gap-2 text-[var(--kr-saffron-gold,#E8A317)]">
                    <FileText className="w-6 h-6" /> Recommended for You
                  </h2>
                  <span className="text-sm text-white/60">Based on 2 hectares land</span>
                </div>
                
                <div className="space-y-4">
                  {ELIGIBLE_SCHEMES.map(scheme => (
                    <div key={scheme.id} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/30 transition-colors flex flex-col md:flex-row gap-4 justify-between items-center group">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded font-bold">{scheme.match} Match</span>
                          <span className="text-xs text-white/50">{scheme.agency}</span>
                        </div>
                        <h3 className="font-bold text-lg text-white">{scheme.name}</h3>
                        <div className="flex gap-4 mt-3">
                          <div className="flex items-center gap-1 text-sm text-[var(--kr-saffron-gold,#E8A317)] font-medium">
                            <Percent className="w-4 h-4" /> {scheme.subsidy}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-white/50">
                            <Clock className="w-4 h-4" /> Deadline: {scheme.deadline}
                          </div>
                        </div>
                      </div>
                      <button className="w-full md:w-auto bg-white/10 group-hover:bg-[var(--kr-saffron-gold,#E8A317)] text-white group-hover:text-black border border-white/20 group-hover:border-transparent px-6 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2">
                        View Details <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Application Status */}
              <div className="bg-black/30 backdrop-blur-md border border-[var(--kr-walnut-brown,#6B4423)]/50 p-6 rounded-2xl">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[var(--kr-walnut-brown,#6B4423)]" /> My Applications
                </h2>
                
                {APPLICATION_STATUS.map(app => (
                  <div key={app.id} className="bg-black/40 border border-white/10 rounded-xl p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="text-xs text-white/50 mb-1">{app.id} • {app.date}</div>
                        <h3 className="font-bold">{app.scheme}</h3>
                      </div>
                      <span className="bg-blue-500/20 text-blue-400 text-xs font-bold px-2 py-1 rounded border border-blue-500/30">
                        {app.status}
                      </span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="relative pt-1">
                      <div className="flex mb-2 items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold inline-block text-white/70">
                            Step {app.step} of {app.totalSteps}
                          </span>
                        </div>
                      </div>
                      <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-white/10">
                        <div style={{ width: `${(app.step / app.totalSteps) * 100}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-[var(--kr-saffron-gold,#E8A317)]"></div>
                      </div>
                      <div className="flex justify-between text-xs text-white/50">
                        <span>Submitted</span>
                        <span className="text-white">Dept Review</span>
                        <span>Inspection</span>
                        <span>Approved</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Document Vault / Checklist */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-saffron-gold,#E8A317)]/30 p-6 rounded-2xl shadow-[0_0_30px_rgba(232,163,23,0.1)] flex flex-col">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-[var(--kr-saffron-gold,#E8A317)]">
                <FileCheck className="w-6 h-6" /> Document Vault
              </h2>
              <p className="text-sm text-white/70 mb-6">Keep your standard KYC and land documents ready for quick 1-click applications.</p>
              
              <div className="space-y-3 flex-1">
                <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">Aadhaar Card</div>
                    <div className="text-xs text-white/50">Verified on Aug 12</div>
                  </div>
                </div>
                
                <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">Bank Passbook</div>
                    <div className="text-xs text-white/50">Verified on Aug 12</div>
                  </div>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-amber-100">Revenue Extract (Intikhab)</div>
                    <div className="text-xs text-amber-400/70">Action Required: Upload latest copy</div>
                  </div>
                  <button className="text-xs bg-amber-500 hover:bg-amber-600 text-black px-3 py-1.5 rounded font-bold">Upload</button>
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
