'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { Truck, MapPin, ShieldAlert, CheckCircle, Navigation, Calendar, PackageCheck, AlertTriangle } from 'lucide-react';

// Mock DEMO DATA
const ACTIVE_ROUTES = [
  { id: 'RT-101', origin: 'Sopore', dest: 'Azadpur Mandi, Delhi', type: 'Refrigerated Van', status: 'In Transit', ETA: 'Oct 14, 08:00 AM', risk: 'Low', temp: '2.5°C' },
];

const ROUTE_RISK = [
  { highway: 'NH-44 (Srinagar - Jammu)', status: 'Clear', delay: 'None', icon: CheckCircle, color: 'text-green-400' },
  { highway: 'Mughal Road', status: 'Restricted', delay: '2-4 Hrs (Landslide clearup)', icon: AlertTriangle, color: 'text-amber-400' },
];

export default function LogisticsPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Navy to Amber Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-pir-panjal-navy,#0B1F3A)] to-[var(--kr-chinar-amber,#D9622B)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <Truck className="w-8 h-8 text-white" /> Transport & Logistics
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Book verified freight, track your cargo live, and monitor highway conditions before dispatch.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <Navigation className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left/Main Column */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Active Shipments / Live Tracking */}
              <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <Navigation className="w-6 h-6 text-[var(--kr-chinar-amber,#D9622B)]" /> Active Dispatches
                </h2>
                
                {ACTIVE_ROUTES.map(route => (
                  <div key={route.id} className="bg-black/40 border border-[var(--kr-chinar-amber,#D9622B)]/30 rounded-xl p-5 md:p-6 shadow-[0_0_20px_rgba(217,98,43,0.1)]">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-sm text-white/60 mb-1">
                          <span className="font-mono bg-white/10 px-2 py-0.5 rounded text-white">{route.id}</span>
                          <span>•</span>
                          <span>{route.type}</span>
                        </div>
                        <div className="text-lg font-bold flex items-center gap-2">
                          {route.origin} <MapPin className="w-4 h-4 text-white/40" /> {route.dest}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-white/50 mb-1">ETA</div>
                        <div className="font-bold text-[var(--kr-chinar-amber,#D9622B)]">{route.ETA}</div>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-4 border-t border-white/10 pt-4">
                      <div className="bg-white/5 px-3 py-2 rounded-lg flex items-center gap-2 border border-white/5">
                        <span className="text-xs text-white/50">Van Temp:</span>
                        <span className="font-bold text-blue-400">{route.temp}</span>
                      </div>
                      <div className="bg-white/5 px-3 py-2 rounded-lg flex items-center gap-2 border border-white/5">
                        <span className="text-xs text-white/50">Route Risk:</span>
                        <span className="font-bold text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {route.risk}</span>
                      </div>
                      <button className="ml-auto bg-[var(--kr-chinar-amber,#D9622B)] hover:bg-[#B55020] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 hidden">
                        <PackageCheck className="w-4 h-4" /> View Delivery Proof
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Highway Risk Dashboard */}
              <div className="bg-black/30 backdrop-blur-md border border-[var(--kr-pir-panjal-navy,#0B1F3A)]/50 p-6 rounded-2xl">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" /> Highway Risk Intelligence
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ROUTE_RISK.map((risk, i) => {
                    const Icon = risk.icon;
                    return (
                      <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4 items-center">
                        <div className={`p-3 rounded-full bg-white/5 ${risk.color}`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm mb-1">{risk.highway}</h3>
                          <div className={`text-xs ${risk.color} font-medium`}>{risk.status} • {risk.delay}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Right Column: Book Transport */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-pir-panjal-navy,#0B1F3A)] p-6 rounded-2xl shadow-[0_0_30px_rgba(11,31,58,0.2)] flex flex-col h-full">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-white">
                <Truck className="w-6 h-6" /> Book Freight
              </h2>
              <p className="text-sm text-white/70 mb-6">Request verified transporters at transparent market rates.</p>
              
              <div className="space-y-4 mb-8 flex-1">
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Pickup Location</label>
                  <select className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--kr-chinar-amber,#D9622B)] appearance-none">
                    <option>Sopore Fruit Mandi</option>
                    <option>Shopian Cold Store</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Destination Mandi</label>
                  <select className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--kr-chinar-amber,#D9622B)] appearance-none">
                    <option>Azadpur Mandi, Delhi</option>
                    <option>Ghazipur, UP</option>
                    <option>Vashi, Mumbai</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Vehicle Type</label>
                  <select className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--kr-chinar-amber,#D9622B)] appearance-none">
                    <option>Standard Truck (9 Tonne)</option>
                    <option>Refrigerated Van (Cold Chain)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Expected Dispatch</label>
                  <div className="relative">
                    <input type="date" className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--kr-chinar-amber,#D9622B)]" />
                  </div>
                </div>
              </div>

              {/* Estimate Box */}
              <div className="p-4 bg-white/5 rounded-xl border border-white/10 mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/60">Estimated Rate</span>
                  <span className="font-bold text-[var(--kr-chinar-amber,#D9622B)]">₹42,000 - ₹45,000</span>
                </div>
                <div className="text-xs text-white/40">Includes toll & transit insurance</div>
              </div>

              <button className="w-full py-3 bg-[var(--kr-pir-panjal-navy,#0B1F3A)] hover:bg-[#112a4f] text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-white/20 hidden">
                Get Instant Quotes
              </button>
            </div>

          </div>

        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
