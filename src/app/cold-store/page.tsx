'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { ThermometerSnowflake, Droplets, Wind, AlertTriangle, Calendar, Box, ShieldCheck, CheckCircle } from 'lucide-react';

// Mock DEMO DATA
const CHAMBER_KPIS = [
  { id: 'CH-01', name: 'Chamber 1', temp: '1.2°C', humidity: '92%', gas: '1.5% CO2', status: 'optimal' },
  { id: 'CH-02', name: 'Chamber 2', temp: '2.5°C', humidity: '85%', gas: '2.1% CO2', status: 'warning', alert: 'Temp slightly elevated' },
  { id: 'CH-03', name: 'Chamber 3', temp: '1.0°C', humidity: '94%', gas: '1.2% CO2', status: 'optimal' },
];

const CHAMBER_CAPACITY = [
  { id: 'CH-01', name: 'Chamber 1', total: 5000, used: 4800 },
  { id: 'CH-02', name: 'Chamber 2', total: 5000, used: 2100 },
  { id: 'CH-03', name: 'Chamber 3', total: 5000, used: 5000 }, // Full
];

const BOOKING_REQUESTS = [
  { id: 'BR-992', user: 'Fayaz Ahmad (Shopian)', qty: 500, duration: '3 Months', status: 'ESCROW_LOCKED', date: 'Oct 15 - Jan 15' },
  { id: 'BR-993', user: 'Bashir Traders', qty: 1200, duration: '6 Months', status: 'ESCROW_LOCKED', date: 'Oct 20 - Apr 20' },
  { id: 'BR-994', user: 'Zamindar Orchards', qty: 300, duration: '2 Months', status: 'PENDING_PAYMENT', date: 'Oct 12 - Dec 12' },
];

export default function ColdStoreOperatorPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Glacier Blue to Teal Accent */}
          <div className="bg-gradient-to-r from-[#0A3B5C] to-[var(--kr-dal-teal,#0E7C86)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <ThermometerSnowflake className="w-8 h-8 text-white" /> Cold Store Operations
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Monitor environmental metrics, manage chamber capacity, and review escrow-backed booking requests.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <ThermometerSnowflake className="w-64 h-64 text-white" />
            </div>
          </div>

          {/* Environment KPIs */}
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Wind className="w-6 h-6 text-[#4FD1C5]" /> Live Environment Logs
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {CHAMBER_KPIS.map((chamber) => (
              <div key={chamber.id} className={`bg-black/30 backdrop-blur-md border ${chamber.status === 'warning' ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-white/20'} p-6 rounded-2xl relative overflow-hidden`}>
                <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                  <span className="text-lg font-bold">{chamber.name}</span>
                  {chamber.status === 'warning' ? (
                    <span className="flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full border border-amber-500/30">
                      <AlertTriangle className="w-3 h-3" /> {chamber.alert}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full border border-green-500/30">
                      <CheckCircle className="w-3 h-3" /> Optimal
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="flex flex-col items-center">
                    <ThermometerSnowflake className={`w-5 h-5 mb-1 ${chamber.status === 'warning' ? 'text-amber-400' : 'text-blue-400'}`} />
                    <span className="text-xl font-bold">{chamber.temp}</span>
                    <span className="text-xs text-white/50">Temp</span>
                  </div>
                  <div className="flex flex-col items-center border-l border-r border-white/10">
                    <Droplets className="w-5 h-5 mb-1 text-cyan-400" />
                    <span className="text-xl font-bold">{chamber.humidity}</span>
                    <span className="text-xs text-white/50">RH</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <Wind className="w-5 h-5 mb-1 text-gray-400" />
                    <span className="text-xl font-bold">{chamber.gas}</span>
                    <span className="text-xs text-white/50">Gas</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Capacity Calendar */}
            <div className="bg-black/40 backdrop-blur-lg border border-white/20 rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Box className="w-5 h-5 text-[#4FD1C5]" /> Chamber Capacity Tracker
              </h2>
              <div className="space-y-6">
                {CHAMBER_CAPACITY.map((chamber) => {
                  const percent = (chamber.used / chamber.total) * 100;
                  const isFull = percent >= 100;
                  return (
                    <div key={chamber.id}>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium text-white/90">{chamber.name}</span>
                        <span className={isFull ? 'text-red-400 font-bold' : 'text-white/70'}>
                          {chamber.used} / {chamber.total} Boxes ({percent.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-4 w-full bg-white/10 rounded-full overflow-hidden flex">
                        <div 
                          className={`h-full ${isFull ? 'bg-red-500' : 'bg-gradient-to-r from-[#0A3B5C] to-[#0E7C86]'}`} 
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-8 flex items-center justify-center p-4 border border-white/10 rounded-xl bg-white/5 gap-3">
                <Calendar className="w-5 h-5 text-[#4FD1C5]" />
                <span className="text-sm font-medium">Next available major slot: <span className="text-[#4FD1C5]">Chamber 2 (Nov 1st)</span></span>
              </div>
            </div>

            {/* Escrow Bookings */}
            <div className="bg-black/40 backdrop-blur-lg border border-white/20 rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[var(--kr-dal-teal,#0E7C86)]" /> Incoming Bookings (Escrow)
              </h2>
              <div className="space-y-4">
                {BOOKING_REQUESTS.map((booking) => (
                  <div key={booking.id} className="p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-bold">{booking.user}</div>
                        <div className="text-xs text-white/50">{booking.date} • {booking.duration}</div>
                      </div>
                      {booking.status === 'ESCROW_LOCKED' ? (
                        <span className="px-2 py-1 bg-[var(--kr-dal-teal,#0E7C86)]/20 text-[var(--kr-dal-teal,#0E7C86)] text-xs font-bold rounded flex items-center gap-1 border border-[var(--kr-dal-teal,#0E7C86)]/30">
                          <ShieldCheck className="w-3 h-3" /> FUNDED
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs font-bold rounded border border-amber-500/30">
                          PENDING
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-end mt-4">
                      <div className="text-sm">
                        <span className="text-white/60">Requesting:</span> {booking.qty} Boxes
                      </div>
                      <button 
                        disabled={booking.status !== 'ESCROW_LOCKED'}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                          booking.status === 'ESCROW_LOCKED' 
                            ? 'bg-[#0E7C86] hover:bg-[#0A5C63] text-white' 
                            : 'bg-white/10 text-white/40 cursor-not-allowed'
                        }`}
                      >
                        {booking.status === 'ESCROW_LOCKED' ? 'Accept & Allocate' : 'Awaiting Funds'}
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
