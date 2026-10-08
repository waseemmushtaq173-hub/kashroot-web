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
    <div className="flex min-h-screen flex-col relative text-gray-900 bg-[#FFFDF0]">
      {/* Background Component */}
      <div className="fixed inset-0 z-0 bg-gradient-to-br from-amber-100/50 via-[#FFFDF0] to-orange-100/50 pointer-events-none" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Forced KYC Panel Display */}
          <KYCPanel isOpen={true} onComplete={() => {}} />

          {/* Header Section - Saffron/Gold Accent */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-8 rounded-2xl mb-8 shadow-xl border border-white/40 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-white">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <ShieldCheck className="w-8 h-8 text-white/90" /> Money & Escrow Tracker
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Secure your payments. Funds are locked in escrow and only released when both parties confirm delivery.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <ShieldCheck className="w-64 h-64" />
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="bg-white/60 backdrop-blur-xl border border-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-gray-600 font-semibold">Money Locked</span>
                <Lock className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{ESCROW_KPIS.moneyLocked}</div>
            </div>

            <div className="bg-white/60 backdrop-blur-xl border border-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-gray-600 font-semibold">Money Released</span>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{ESCROW_KPIS.moneyReleased}</div>
            </div>

            <div className="bg-white/60 backdrop-blur-xl border border-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
              <div className="flex justify-between items-start mb-2">
                <span className="text-gray-600 font-semibold">Avg. Days-to-Payment</span>
                <AlertCircle className="w-5 h-5 text-orange-500" />
              </div>
              <div className="text-3xl font-bold text-gray-900">{ESCROW_KPIS.daysToPayment}</div>
            </div>
          </div>

          {/* Active Transaction Timeline */}
          <div className="bg-white/50 backdrop-blur-xl border border-white rounded-2xl p-6 md:p-8 mb-8 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <span className="bg-green-500 w-3 h-3 rounded-full animate-pulse"></span>
                  Active Order: #KR-8823
                </h2>
                <p className="text-gray-600 mt-1 font-medium">Gala Apples (Grade A) - 100 Boxes • Seller: Shopian Orchards</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-amber-600">₹1,45,000</div>
                <div className="text-sm text-gray-500 font-medium">Locked in Escrow</div>
              </div>
            </div>

            {/* Live Timeline UI */}
            <div className="relative">
              <div className="absolute top-8 left-[10%] right-[10%] h-1 bg-gray-200 hidden md:block rounded-full"></div>
              
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                {TIMELINE_STEPS.map((step, index) => {
                  const isCompleted = step.status === 'completed';
                  const isCurrent = step.status === 'current';
                  const Icon = step.icon;
                  
                  return (
                    <div key={step.id} className="relative flex flex-row md:flex-col items-center gap-4 md:gap-2 z-10">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 z-10 shadow-sm
                        ${isCompleted ? 'bg-amber-500 border-amber-100 text-white' : 
                          isCurrent ? 'bg-white border-amber-500 text-amber-600' : 
                          'bg-gray-100 border-white text-gray-400'}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      
                      <div className="text-left md:text-center mt-2">
                        <div className={`font-bold ${isCurrent ? 'text-amber-600' : isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                          {step.label}
                        </div>
                        <div className="text-xs text-gray-500 font-medium">{step.date}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
