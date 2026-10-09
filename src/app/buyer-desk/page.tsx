'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { Building2, Map, Gavel, FileCheck, CheckCircle, Globe, Anchor, ChevronRight } from 'lucide-react';

// Mock DEMO DATA
const SUPPLY_MAP_DATA = [
  { region: 'Shopian', volume: '4,500 MT', activeListings: 142, quality: 'Premium (Grade A)' },
  { region: 'Sopore', volume: '12,000 MT', activeListings: 350, quality: 'Standard (Grade B)' },
];

const BIDDING_BOARD = [
  { id: 'LOT-921', seller: 'Cooperative Hub Alpha', variety: 'Gala Apple', volume: '20 MT', topBid: '₹1450/box', timeLeft: '2h 15m' },
  { id: 'LOT-922', seller: 'Lone Orchards', variety: 'Walnut (Kagzi)', volume: '5 MT', topBid: '₹320/kg', timeLeft: '45m' },
];

export default function BuyerDeskPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Navy to Crimson */}
          <div className="bg-gradient-to-r from-[var(--kr-pir-panjal-navy,#0B1F3A)] to-[var(--kr-apple-crimson,#C62828)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <Globe className="w-8 h-8 text-white" /> Buyer & Exporter Desk
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Source verified, graded produce directly from the valley. Bid on aggregated lots and manage your export pipeline.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <Building2 className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Bidding Board */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-black/30 backdrop-blur-md border border-[var(--kr-pir-panjal-navy,#0B1F3A)]/50 p-6 rounded-2xl h-full shadow-[0_0_30px_rgba(11,31,58,0.3)]">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-[var(--kr-apple-crimson,#C62828)]" /> Live Bidding Board
                </h2>
                
                <div className="space-y-4">
                  {BIDDING_BOARD.map(lot => (
                    <div key={lot.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-[var(--kr-apple-crimson,#C62828)]/50 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-xs text-white/50">{lot.id}</div>
                        <div className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded animate-pulse">
                          Ends in {lot.timeLeft}
                        </div>
                      </div>
                      <h3 className="font-bold mb-1">{lot.seller}</h3>
                      <div className="flex justify-between items-center text-sm mb-4">
                        <span className="text-white/70">{lot.variety}</span>
                        <span className="font-bold">{lot.volume}</span>
                      </div>
                      <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                        <div>
                          <div className="text-xs text-white/50">Top Bid</div>
                          <div className="font-bold text-[var(--kr-apple-crimson,#C62828)]">{lot.topBid}</div>
                        </div>
                        <button className="bg-[var(--kr-pir-panjal-navy,#0B1F3A)] hover:bg-[#112a4f] text-white px-4 py-2 rounded-lg text-sm font-bold border border-white/20 transition-colors hidden">
                          Place Bid
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Middle Column: Supply Map */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-black/40 backdrop-blur-lg border border-white/20 p-6 rounded-2xl h-full">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Map className="w-5 h-5 text-blue-400" /> Verified Supply Radar
                </h2>
                
                {/* Map Visual Placeholder */}
                <div className="h-48 w-full bg-[#0B1F3A]/40 rounded-xl border border-white/10 relative overflow-hidden mb-6 flex items-center justify-center">
                  <div className="absolute inset-0 opacity-30 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/e4/Jammu_and_Kashmir_locator_map.svg')] bg-center bg-no-repeat bg-contain filter invert"></div>
                  <div className="absolute top-12 left-12 w-3 h-3 bg-red-500 rounded-full shadow-[0_0_15px_red] animate-ping"></div>
                  <div className="absolute top-20 right-20 w-4 h-4 bg-green-500 rounded-full shadow-[0_0_15px_green] animate-pulse"></div>
                  <span className="z-10 text-white/50 font-medium bg-black/50 px-3 py-1 rounded backdrop-blur-sm">Valley region</span>
                </div>

                <div className="space-y-3">
                  {SUPPLY_MAP_DATA.map((region, i) => (
                    <div key={i} className="bg-white/5 p-3 rounded-lg flex justify-between items-center border border-white/5">
                      <div>
                        <div className="font-bold">{region.region}</div>
                        <div className="text-xs text-[var(--kr-apple-crimson,#C62828)] font-medium">{region.quality}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-white">{region.volume}</div>
                        <div className="text-xs text-white/50">{region.activeListings} Active Lots</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Export Document Checklist */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-apple-crimson,#C62828)]/30 p-6 rounded-2xl h-full shadow-[0_0_30px_rgba(198,40,40,0.15)] flex flex-col">
                <h2 className="text-xl font-bold mb-2 flex items-center gap-2 text-white">
                  <Anchor className="w-5 h-5 text-[var(--kr-apple-crimson,#C62828)]" /> Export Pipeline
                </h2>
                <p className="text-sm text-white/60 mb-6">Track compliance and paperwork for international shipping.</p>
                
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-3">
                    <span className="font-bold text-sm">Shipment: UAE-992</span>
                    <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">Clearance Pending</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                      <div>
                        <div className="text-sm font-medium">Commercial Invoice</div>
                        <div className="text-xs text-white/50">Generated auto from Escrow</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                      <div>
                        <div className="text-sm font-medium">Phytosanitary Certificate</div>
                        <div className="text-xs text-white/50">Approved by J&K Govt.</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-3 bg-red-500/10 p-2 rounded -mx-2">
                      <FileCheck className="w-5 h-5 text-red-400 shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-red-200">Certificate of Origin</div>
                        <div className="text-xs text-red-400/80">Pending Chamber of Commerce signature</div>
                      </div>
                      <button className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 transition-colors hidden">Resolve</button>
                    </div>
                  </div>
                </div>

                <div className="mt-auto">
                  <button className="w-full bg-[var(--kr-apple-crimson,#C62828)] hover:bg-[#9E2020] text-white px-4 py-3 rounded-xl font-bold transition-colors flex justify-center items-center gap-2 shadow-lg shadow-red-500/20 hidden">
                    Open Customs Desk <ChevronRight className="w-4 h-4" />
                  </button>
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
