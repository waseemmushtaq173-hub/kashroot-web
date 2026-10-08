'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { UserCog, Stethoscope, Map as MapIcon, Image as ImageIcon, Mic, MessageSquare, CheckCircle, AlertTriangle } from 'lucide-react';

// Mock DEMO DATA
const CASE_QUEUE = [
  { id: 'CASE-4091', farmer: 'Bashir Ahmad', location: 'Shopian', crop: 'Apple (Gala)', issue: 'Scab-like spots on leaves', time: '10 mins ago', type: 'photo', status: 'Open' },
  { id: 'CASE-4092', farmer: 'Tariq Lone', location: 'Sopore', crop: 'Walnut', issue: 'Voice Note (Kashmiri)', time: '45 mins ago', type: 'voice', status: 'Open' },
  { id: 'CASE-4088', farmer: 'Farooq Bhat', location: 'Pulwama', crop: 'Apple (Delicious)', issue: 'Premature dropping', time: '2 hours ago', type: 'text', status: 'Resolved' },
];

export default function ExpertDeskPage() {
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
                <Stethoscope className="w-8 h-8 text-white" /> Expert & Advisory Desk
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Triage incoming farmer queries, review field photos/voice notes, and monitor regional disease outbreaks.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <UserCog className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left/Middle Column: Case Queue */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-black/40 backdrop-blur-md border border-white/20 p-6 rounded-2xl h-full shadow-[0_0_20px_rgba(30,123,79,0.1)]">
                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <MessageSquare className="w-6 h-6 text-[var(--kr-orchard-green,#1E7B4F)]" /> Active Case Queue
                  </h2>
                  <div className="bg-white/10 px-3 py-1 rounded-full text-sm font-medium">
                    12 Open Cases
                  </div>
                </div>
                
                <div className="space-y-4">
                  {CASE_QUEUE.map(c => {
                    const isResolved = c.status === 'Resolved';
                    return (
                      <div key={c.id} className={`bg-white/5 border rounded-xl p-5 hover:bg-white/10 transition-colors ${isResolved ? 'border-green-500/30 opacity-70' : 'border-white/10'}`}>
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-white/50">{c.id}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isResolved ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                              {c.status}
                            </span>
                          </div>
                          <span className="text-xs text-white/40">{c.time}</span>
                        </div>
                        
                        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                          <div>
                            <h3 className="font-bold text-lg mb-1">{c.farmer} <span className="text-sm font-normal text-white/60">({c.location})</span></h3>
                            <div className="text-sm text-white/80">Crop: {c.crop}</div>
                            
                            <div className="mt-3 flex items-center gap-2 text-[var(--kr-dal-teal,#0E7C86)] bg-[var(--kr-dal-teal,#0E7C86)]/10 px-3 py-2 rounded-lg border border-[var(--kr-dal-teal,#0E7C86)]/20 w-max">
                              {c.type === 'photo' && <ImageIcon className="w-4 h-4" />}
                              {c.type === 'voice' && <Mic className="w-4 h-4" />}
                              {c.type === 'text' && <MessageSquare className="w-4 h-4" />}
                              <span className="text-sm font-medium">{c.issue}</span>
                            </div>
                          </div>
                          
                          <div className="w-full md:w-auto mt-4 md:mt-0">
                            {isResolved ? (
                              <button className="w-full bg-green-500/10 text-green-400 border border-green-500/20 px-6 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 cursor-default">
                                <CheckCircle className="w-4 h-4" /> Solved
                              </button>
                            ) : (
                              <button className="w-full bg-[var(--kr-orchard-green,#1E7B4F)] hover:bg-[#165a39] text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg">
                                Open Case
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <button className="mt-6 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors">
                  Load Older Cases
                </button>
              </div>
            </div>

            {/* Right Column: Outbreak Map */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-dal-teal,#0E7C86)]/30 p-6 rounded-2xl h-full shadow-[0_0_30px_rgba(14,124,134,0.15)] flex flex-col">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <MapIcon className="w-5 h-5 text-[var(--kr-dal-teal,#0E7C86)]" /> Regional Outbreak Map
                </h2>
                
                {/* Visual Map Placeholder */}
                <div className="h-48 w-full bg-[#0a1815] rounded-xl border border-amber-500/30 relative overflow-hidden mb-6 flex items-center justify-center">
                  <div className="absolute inset-0 opacity-40 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/e4/Jammu_and_Kashmir_locator_map.svg')] bg-center bg-no-repeat bg-contain filter invert sepia hue-rotate-[120deg] saturate-[300%]"></div>
                  
                  {/* Heatmap spots */}
                  <div className="absolute top-1/4 left-1/4 w-12 h-12 bg-amber-500/40 rounded-full blur-md"></div>
                  <div className="absolute top-1/4 left-1/4 w-3 h-3 bg-amber-500 rounded-full shadow-[0_0_10px_orange]"></div>
                  
                  <span className="z-10 text-amber-200 text-xs font-medium bg-amber-900/80 px-2 py-1 rounded border border-amber-500/50 backdrop-blur-sm absolute bottom-4 left-4 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Shopian (Apple Scab)
                  </span>
                </div>

                <h3 className="font-bold text-sm text-white/70 mb-3">Detected Trends (Last 7 Days)</h3>
                <div className="space-y-3 flex-1">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-amber-400">Apple Scab (Venturia)</span>
                      <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">Rising</span>
                    </div>
                    <div className="text-xs text-amber-200/70">14 cases reported in Shopian belt.</div>
                  </div>
                  
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-blue-400">Red Mite</span>
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">Stable</span>
                    </div>
                    <div className="text-xs text-blue-200/70">3 cases in Baramulla.</div>
                  </div>
                </div>
                
                <button className="mt-4 w-full py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-colors border border-white/20 text-sm">
                  Issue Region-wide Advisory
                </button>
              </div>
            </div>

          </div>

        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
