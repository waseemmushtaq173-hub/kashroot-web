'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { LineChart, BarChart3, TrendingUp, Users, ShieldCheck, IndianRupee, PieChart } from 'lucide-react';

export default function FounderAnalyticsPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Gold to Navy Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-saffron-gold,#E8A317)] to-[var(--kr-pir-panjal-navy,#0B1F3A)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <LineChart className="w-8 h-8 text-black" /> Founder Analytics
              </h1>
              <p className="text-lg text-black/80 font-medium max-w-xl">
                High-level view of platform GMV, active escrow locked value, and revenue streams.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <BarChart3 className="w-64 h-64 text-black" />
            </div>
          </div>

          {/* Top KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
              <div className="flex justify-between items-start mb-2">
                <div className="text-white/60 text-sm">GMV (30 Days)</div>
                <IndianRupee className="w-5 h-5 text-[var(--kr-saffron-gold,#E8A317)]" />
              </div>
              <div className="text-2xl font-bold">₹4.2 Cr</div>
              <div className="text-xs text-green-400 mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +12% MoM</div>
            </div>
            
            <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
              <div className="flex justify-between items-start mb-2">
                <div className="text-white/60 text-sm">Total Value Locked</div>
                <ShieldCheck className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-2xl font-bold">₹1.8 Cr</div>
              <div className="text-xs text-white/40 mt-2">Currently in Escrow</div>
            </div>
            
            <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
              <div className="flex justify-between items-start mb-2">
                <div className="text-white/60 text-sm">Platform Revenue</div>
                <PieChart className="w-5 h-5 text-green-400" />
              </div>
              <div className="text-2xl font-bold">₹8.4 L</div>
              <div className="text-xs text-green-400 mt-2 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +5% MoM</div>
            </div>

            <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
              <div className="flex justify-between items-start mb-2">
                <div className="text-white/60 text-sm">Weekly Active Users</div>
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-2xl font-bold">12,450</div>
              <div className="text-xs text-white/40 mt-2">Farmers & Buyers</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Chart Placeholders */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-saffron-gold,#E8A317)]/30 p-6 rounded-2xl h-64 flex flex-col justify-between">
              <h3 className="font-bold text-lg text-[var(--kr-saffron-gold,#E8A317)]">Transaction Success Rate</h3>
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-5xl font-bold text-white mb-2">94.2%</div>
                  <div className="text-sm text-white/50">Successful Escrow Releases</div>
                </div>
              </div>
            </div>

            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-pir-panjal-navy,#0B1F3A)]/50 p-6 rounded-2xl h-64 flex flex-col justify-between">
              <h3 className="font-bold text-lg text-blue-400">Revenue Streams</h3>
              <div className="flex-1 flex flex-col justify-center space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Escrow Fees (1%)</span>
                    <span>₹5.2 L</span>
                  </div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-[60%]"></div></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Logistics Commission</span>
                    <span>₹2.1 L</span>
                  </div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-amber-500 w-[25%]"></div></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Data Insights APIs</span>
                    <span>₹1.1 L</span>
                  </div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-purple-500 w-[15%]"></div></div>
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
