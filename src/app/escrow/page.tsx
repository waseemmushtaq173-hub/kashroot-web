'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import KYCPanel from '@/components/auth/KYCPanel';
import { ShieldCheck, Lock, CheckCircle, Truck, Mic, Handshake, AlertCircle } from 'lucide-react';

// Mock DEMO DATA
const ESCROW_KPIS = {
  moneyLocked: '₹14,50,000',
  moneyReleased: '₹42,80,000',
  daysToPayment: '4.2 Days'
};

const TIMELINE_STEPS = [
  { id: 'offer', label: 'Offer', icon: Handshake, status: 'completed', date: 'Oct 10, 10:00 AM' },
  { id: 'lock', label: 'Lock', icon: Lock, status: 'completed', date: 'Oct 10, 11:30 AM' },
  { id: 'deliver', label: 'Deliver', icon: Truck, status: 'current', date: 'In Transit' },
  { id: 'confirm', label: 'Confirm', icon: CheckCircle, status: 'pending', date: '--' },
  { id: 'release', label: 'Release', icon: ShieldCheck, status: 'pending', date: '--' },
];

export default function EscrowTrackerPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Forced KYC Panel Display */}
          <KYCPanel isOpen={true} onComplete={() => {}} />

          {/* Header Section - Dal Teal Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-dal-teal,#0E7C86)] to-[#085C63] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <ShieldCheck className="w-8 h-8 text-white/90" /> Money & Escrow Tracker
              </h1>
              <p className="text-lg text-white/80 font-light max-w-xl">
                Secure your payments. Funds are locked in escrow and only released when both parties confirm delivery.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <ShieldCheck className="w-64 h-64" />
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-white/70 font-medium">Money Locked</span>
                <Lock className="w-5 h-5 text-[var(--kr-dal-teal,#0E7C86)]" />
              </div>
              <div className="text-3xl font-bold text-white">{ESCROW_KPIS.moneyLocked}</div>
              <div className="absolute -bottom-4 -right-4 opacity-5">
                <Lock className="w-24 h-24" />
              </div>
            </div>

            <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-white/70 font-medium">Money Released</span>
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div className="text-3xl font-bold text-white">{ESCROW_KPIS.moneyReleased}</div>
              <div className="absolute -bottom-4 -right-4 opacity-5">
                <CheckCircle className="w-24 h-24" />
              </div>
            </div>

            <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-white/70 font-medium">Avg. Days-to-Payment</span>
                <AlertCircle className="w-5 h-5 text-[var(--kr-saffron-gold,#E8A317)]" />
              </div>
              <div className="text-3xl font-bold text-white">{ESCROW_KPIS.daysToPayment}</div>
            </div>
          </div>

          {/* Active Transaction Timeline */}
          <div className="bg-black/40 backdrop-blur-lg border border-white/20 rounded-2xl p-6 md:p-8 mb-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <span className="bg-[var(--kr-dal-teal,#0E7C86)] w-3 h-3 rounded-full animate-pulse"></span>
                  Active Order: #KR-8823
                </h2>
                <p className="text-white/70 mt-1">Gala Apples (Grade A) - 100 Boxes • Seller: Shopian Orchards</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-[var(--kr-saffron-gold,#E8A317)]">₹1,45,000</div>
                <div className="text-sm text-white/60">Locked in Escrow</div>
              </div>
            </div>

            {/* Live Timeline UI */}
            <div className="relative">
              {/* Connecting Line */}
              <div className="absolute top-8 left-[10%] right-[10%] h-1 bg-white/10 hidden md:block rounded-full"></div>
              
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {TIMELINE_STEPS.map((step, index) => {
                  const isCompleted = step.status === 'completed';
                  const isCurrent = step.status === 'current';
                  const isPending = step.status === 'pending';
                  const Icon = step.icon;
                  
                  return (
                    <div key={step.id} className="relative flex flex-row md:flex-col items-center gap-4 md:gap-2 z-10">
                      {/* Mobile Connecting Line */}
                      {index !== TIMELINE_STEPS.length - 1 && (
                        <div className="absolute top-10 left-5 bottom-[-10px] w-0.5 bg-white/10 md:hidden z-0"></div>
                      )}
                      
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 z-10
                        ${isCompleted ? 'bg-[var(--kr-dal-teal,#0E7C86)] border-black/50 text-white' : 
                          isCurrent ? 'bg-black border-[var(--kr-saffron-gold,#E8A317)] text-[var(--kr-saffron-gold,#E8A317)]' : 
                          'bg-black/50 border-white/20 text-white/30'}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      
                      <div className="text-left md:text-center mt-2">
                        <div className={`font-bold ${isCurrent ? 'text-[var(--kr-saffron-gold,#E8A317)]' : isCompleted ? 'text-white' : 'text-white/40'}`}>
                          {step.label}
                        </div>
                        <div className="text-xs text-white/50">{step.date}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-10 flex flex-col sm:flex-row justify-end gap-4 border-t border-white/10 pt-6">
              <button className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium border border-white/20 transition-all backdrop-blur-md hidden">
                <Mic className="w-5 h-5 text-[var(--kr-dal-teal,#0E7C86)]" />
                Voice Receipt
              </button>
              <button className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--kr-dal-teal,#0E7C86)] hover:bg-[#0b636b] text-white font-bold transition-all shadow-lg shadow-[var(--kr-dal-teal,#0E7C86)]/20 hidden">
                <CheckCircle className="w-5 h-5" />
                Confirm Delivery
              </button>
            </div>
          </div>

        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
