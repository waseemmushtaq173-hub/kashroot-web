'use client';

import { useState } from 'react';
import { ShieldCheck, Lock, CheckCircle, Truck, Handshake, AlertCircle, IdCard } from 'lucide-react';

import { KYCPanel } from '@/components/auth/KYCPanel';
import { ToolHeader, ToolShell } from '@/components/layout/ToolShell';
import { GLASS } from '@/lib/tools';

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
  const [kycOpen, setKycOpen] = useState(false);

  return (
    <ToolShell
      tool="escrow"
      header={
        <ToolHeader
          tool="escrow"
          title="Money & Escrow Tracker"
          description="Secure your payments. Funds are locked in escrow and only released when both parties confirm delivery."
          actions={
            <button
              type="button"
              onClick={() => setKycOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-teal-700/20 transition hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <IdCard className="h-4 w-4" aria-hidden />
              Complete KYC
            </button>
          }
        />
      }
    >
      <KYCPanel
        open={kycOpen}
        onClose={() => setKycOpen(false)}
        // No self-service KYC endpoint exists yet; record the submission locally.
        onComplete={() => localStorage.setItem('kyc_status', 'submitted')}
      />

      {/* KPI Cards */}
      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className={`${GLASS.card} relative overflow-hidden p-6`}>
          <div className="mb-2 flex items-start justify-between">
            <span className="font-semibold text-slate-600">Money Locked</span>
            <Lock className="h-5 w-5 text-teal-600" aria-hidden />
          </div>
          <div className="text-3xl font-bold text-slate-900">{ESCROW_KPIS.moneyLocked}</div>
        </div>

        <div className={`${GLASS.card} relative overflow-hidden p-6`}>
          <div className="mb-2 flex items-start justify-between">
            <span className="font-semibold text-slate-600">Money Released</span>
            <CheckCircle className="h-5 w-5 text-emerald-600" aria-hidden />
          </div>
          <div className="text-3xl font-bold text-slate-900">{ESCROW_KPIS.moneyReleased}</div>
        </div>

        <div className={`${GLASS.card} relative overflow-hidden p-6`}>
          <div className="mb-2 flex items-start justify-between">
            <span className="font-semibold text-slate-600">Avg. Days-to-Payment</span>
            <AlertCircle className="h-5 w-5 text-cyan-600" aria-hidden />
          </div>
          <div className="text-3xl font-bold text-slate-900">{ESCROW_KPIS.daysToPayment}</div>
        </div>
      </div>

      {/* Active Transaction Timeline */}
      <div className={`${GLASS.card} mb-8 p-6 md:p-8`}>
        <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" aria-hidden></span>
              Active Order: #KR-8823
            </h2>
            <p className="mt-1 font-medium text-slate-600">Gala Apples (Grade A) - 100 Boxes • Seller: Green Valley Orchards</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-teal-700">₹1,45,000</div>
            <div className="text-sm font-medium text-slate-500">Locked in Escrow</div>
          </div>
        </div>

        {/* Live Timeline UI */}
        <div className="relative">
          <div className="absolute left-[10%] right-[10%] top-8 hidden h-1 rounded-full bg-slate-200 md:block"></div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
            {TIMELINE_STEPS.map((step) => {
              const isCompleted = step.status === 'completed';
              const isCurrent = step.status === 'current';
              const Icon = step.icon;

              return (
                <div key={step.id} className="relative z-10 flex flex-row items-center gap-4 md:flex-col md:gap-2">
                  <div
                    className={`z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 shadow-sm
                      ${isCompleted ? 'border-emerald-100 bg-teal-600 text-white' :
                        isCurrent ? 'border-teal-600 bg-white text-teal-700' :
                        'border-white bg-slate-100 text-slate-400'}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>

                  <div className="mt-2 text-left md:text-center">
                    <div className={`font-bold ${isCurrent ? 'text-teal-700' : isCompleted ? 'text-slate-900' : 'text-slate-500'}`}>
                      {step.label}
                    </div>
                    <div className="text-xs font-medium text-slate-500">{step.date}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
