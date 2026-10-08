'use client';

import { useState } from 'react';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { TrendingUp, BarChart3, Calculator, Info, LineChart, Apple, ArrowRight } from 'lucide-react';

// Mock DEMO DATA
const MARKET_TRENDS = [
  { day: 'Mon', price: 1100 },
  { day: 'Tue', price: 1150 },
  { day: 'Wed', price: 1120 },
  { day: 'Thu', price: 1200 },
  { day: 'Fri', price: 1250 },
  { day: 'Sat', price: 1230 },
  { day: 'Sun', price: 1300 },
];

export default function PriceIntelligencePage() {
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('7');

  // Calculator State
  const [qty, setQty] = useState(100);
  const [expectedFuture, setExpectedFuture] = useState(1400);
  const storageCost = 20; // per box per month
  const months = 3; // default storage time

  const currentPrice = 1250;
  const currentRevenue = qty * currentPrice;
  const futureRevenue = qty * expectedFuture;
  const totalStorageCost = qty * storageCost * months;
  const netFutureRevenue = futureRevenue - totalStorageCost;
  const profitDiff = netFutureRevenue - currentRevenue;

  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Saffron Gold Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-saffron-gold,#E8A317)] to-[#B37A0B] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <LineChart className="w-8 h-8 text-white" /> Price & Market Intelligence
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Real-time mandi trends, fair-price bands, and predictive insights to maximize your returns.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <TrendingUp className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Charts and Bands */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Trend Chart */}
              <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-[var(--kr-saffron-gold,#E8A317)]" />
                    Market Trends: Apple (Gala, Grade A)
                  </h2>
                  <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                    <button onClick={() => setTimeRange('7')} className={`px-4 py-1 text-sm font-medium rounded-md transition-colors ${timeRange === '7' ? 'bg-[var(--kr-saffron-gold,#E8A317)] text-black' : 'text-white/60 hover:text-white'}`}>7D</button>
                    <button onClick={() => setTimeRange('30')} className={`px-4 py-1 text-sm font-medium rounded-md transition-colors ${timeRange === '30' ? 'bg-[var(--kr-saffron-gold,#E8A317)] text-black' : 'text-white/60 hover:text-white'}`}>30D</button>
                    <button onClick={() => setTimeRange('90')} className={`px-4 py-1 text-sm font-medium rounded-md transition-colors ${timeRange === '90' ? 'bg-[var(--kr-saffron-gold,#E8A317)] text-black' : 'text-white/60 hover:text-white'}`}>90D</button>
                  </div>
                </div>

                {/* Mock Chart UI */}
                <div className="h-64 flex items-end justify-between gap-2 border-b border-l border-white/20 pb-2 pl-2">
                  {MARKET_TRENDS.map((data, i) => {
                    const height = (data.price / 1500) * 100;
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 gap-2 group">
                        <div className="relative w-full flex justify-center h-full items-end">
                          <div 
                            className="w-full max-w-[40px] bg-gradient-to-t from-[var(--kr-saffron-gold,#E8A317)]/40 to-[var(--kr-saffron-gold,#E8A317)] rounded-t-sm group-hover:opacity-80 transition-opacity relative"
                            style={{ height: `${height}%` }}
                          >
                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                              ₹{data.price}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs text-white/50">{data.day}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Fair-Price Band */}
              <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl relative overflow-hidden">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Info className="w-5 h-5 text-[var(--kr-saffron-gold,#E8A317)]" />
                  Today's Fair-Price Band
                </h2>
                
                <div className="relative h-12 w-full rounded-full bg-gradient-to-r from-red-500/20 via-green-500/30 to-red-500/20 border border-white/10 mb-4">
                  {/* Indicator Line */}
                  <div className="absolute top-0 bottom-0 left-[65%] w-1 bg-white shadow-[0_0_10px_white] z-10 rounded-full flex flex-col justify-center items-center">
                    <div className="absolute -top-8 bg-black/80 px-3 py-1 rounded-lg text-sm font-bold border border-[var(--kr-saffron-gold,#E8A317)] whitespace-nowrap">
                      Current: ₹1250
                    </div>
                  </div>
                  
                  {/* Min / Max Labels */}
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white/70">Min: ₹1050</div>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/70">Max: ₹1380</div>
                </div>
                <p className="text-sm text-white/60">Based on recent trades in Sopore & Shopian mandis. Current price is trending near the upper band.</p>
              </div>

            </div>

            {/* Right Column: Sell or Store Calculator */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-saffron-gold,#E8A317)]/30 p-6 rounded-2xl shadow-[0_0_30px_rgba(232,163,23,0.1)] flex flex-col h-full">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-[var(--kr-saffron-gold,#E8A317)]">
                <Calculator className="w-6 h-6" /> Sell or Store?
              </h2>
              <p className="text-sm text-white/70 mb-6">Calculate ROI considering cold storage costs vs expected future prices.</p>
              
              <div className="space-y-4 mb-8 flex-1">
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Quantity (Boxes)</label>
                  <input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--kr-saffron-gold,#E8A317)] transition-colors" />
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Expected Price in 3 Months (₹)</label>
                  <input type="number" value={expectedFuture} onChange={e => setExpectedFuture(Number(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--kr-saffron-gold,#E8A317)] transition-colors" />
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white/60">Storage Cost (3 months)</span>
                    <span className="text-red-400">-₹{totalStorageCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Sell Now Revenue</span>
                    <span className="text-white">₹{currentRevenue.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Recommendation Box */}
              <div className={`p-4 rounded-xl border ${profitDiff > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <h3 className="font-bold mb-1 text-lg">
                  {profitDiff > 0 ? 'Recommendation: STORE' : 'Recommendation: SELL NOW'}
                </h3>
                <p className="text-sm text-white/80">
                  {profitDiff > 0 
                    ? `Storing could net you an extra ₹${profitDiff.toLocaleString()} after storage fees.` 
                    : `Selling now saves you ₹${Math.abs(profitDiff).toLocaleString()} compared to future net revenue.`}
                </p>
                <button className="mt-4 w-full py-2 bg-[var(--kr-saffron-gold,#E8A317)] hover:bg-[#B37A0B] text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2 hidden">
                  Book Cold Storage <ArrowRight className="w-4 h-4" />
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
