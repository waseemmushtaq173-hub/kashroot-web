'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { Recycle, Factory, Leaf, ArrowRight, Coins, ListPlus } from 'lucide-react';

// Mock DEMO DATA
const LOW_GRADE_LISTINGS = [
  { id: 'WG-01', farmer: 'Sopore Coop', product: 'Apple (Grade C / Culls)', volume: '40 MT', price: '₹12/kg', status: 'Available' },
  { id: 'WG-02', farmer: 'Fayaz Lone', product: 'Walnut Shells', volume: '2 MT', price: '₹8/kg', status: 'Available' },
];

const PROCESSING_UNITS = [
  { name: 'Kashmir Juice Concentrates', type: 'Juice Factory', demand: 'Apple Culls (Unlimited)', bid: '₹11.5/kg', distance: '12 km away' },
];

export default function WasteMarketPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Gold to Green Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-saffron-gold,#E8A317)] to-[var(--kr-orchard-green,#1E7B4F)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <Recycle className="w-8 h-8 text-black" /> Waste-to-Value Market
              </h1>
              <p className="text-lg text-black/80 font-medium max-w-xl">
                Monetize your Grade-C fruit and by-products by matching directly with juice factories and processing units.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <Recycle className="w-64 h-64 text-black" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Farmer Listings */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-saffron-gold,#E8A317)]/30 rounded-2xl p-6 shadow-[0_0_20px_rgba(232,163,23,0.1)]">
              <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--kr-saffron-gold,#E8A317)]">
                  <Leaf className="w-5 h-5" /> Available Low-Grade Stock
                </h2>
                <button className="bg-[var(--kr-saffron-gold,#E8A317)] hover:bg-[#B37A0B] text-black px-3 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-1">
                  <ListPlus className="w-4 h-4" /> List Stock
                </button>
              </div>
              
              <div className="space-y-4">
                {LOW_GRADE_LISTINGS.map(item => (
                  <div key={item.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="font-bold text-lg">{item.product}</h3>
                      <div className="text-sm text-white/60">Listed by: {item.farmer}</div>
                    </div>
                    <div className="flex gap-4 items-center">
                      <div className="text-right">
                        <div className="font-bold text-xl text-white">{item.volume}</div>
                        <div className="text-xs text-[var(--kr-saffron-gold,#E8A317)] font-bold">{item.price}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Processing Unit Matching */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-orchard-green,#1E7B4F)]/40 rounded-2xl p-6 shadow-[0_0_20px_rgba(30,123,79,0.15)]">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-[var(--kr-orchard-green,#1E7B4F)]">
                <Factory className="w-5 h-5" /> Live Factory Demand
              </h2>
              
              <div className="space-y-4">
                {PROCESSING_UNITS.map((unit, i) => (
                  <div key={i} className="bg-[var(--kr-orchard-green,#1E7B4F)]/10 border border-[var(--kr-orchard-green,#1E7B4F)]/30 rounded-xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-[var(--kr-orchard-green,#1E7B4F)]/20 px-3 py-1 rounded-bl-lg text-xs font-bold text-green-400 border-b border-l border-[var(--kr-orchard-green,#1E7B4F)]/30">
                      Matching Alert
                    </div>
                    
                    <h3 className="font-bold text-lg mb-1">{unit.name}</h3>
                    <div className="text-xs text-white/50 mb-3">{unit.type} • {unit.distance}</div>
                    
                    <div className="bg-black/20 p-3 rounded-lg border border-white/5 mb-4">
                      <div className="text-xs text-white/60 mb-1">Looking for:</div>
                      <div className="font-bold text-white">{unit.demand}</div>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="text-xs text-white/60">Current Bid</div>
                        <div className="font-bold flex items-center gap-1 text-[var(--kr-saffron-gold,#E8A317)]">
                          <Coins className="w-4 h-4" /> {unit.bid}
                        </div>
                      </div>
                      <button className="bg-[var(--kr-orchard-green,#1E7B4F)] hover:bg-[#165a39] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2">
                        Accept Bid <ArrowRight className="w-4 h-4" />
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
