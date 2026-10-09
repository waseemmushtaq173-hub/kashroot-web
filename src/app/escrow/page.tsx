'use client';

import { useState } from 'react';

import { AlertCircle, CheckCircle, Handshake, Lock, ShieldCheck, Truck } from 'lucide-react';

import { KYCPanel } from '@/components/auth/KYCPanel';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';
import { ToolShell } from '@/components/layout/ToolShell';
import { kycRoleFor, markKycSubmitted } from '@/lib/kyc/submission';
import { GLASS, TOOLS } from '@/lib/tools';

// Mock DEMO DATA — labelled so these numbers are not mistaken for live figures.
const ESCROW_KPIS = {
  moneyLocked: '₹14,50,000',
  moneyReleased: '₹42,80,000',
  daysToPayment: '4.2 Days',
};

const TIMELINE_STEPS = [
  { id: 'offer', label: 'Offer', icon: Handshake, status: 'completed', date: 'Oct 10, 10:00 AM' },
  { id: 'lock', label: 'Lock', icon: Lock, status: 'completed', date: 'Oct 10, 11:30 AM' },
  { id: 'deliver', label: 'Deliver', icon: Truck, status: 'current', date: 'In Transit' },
  { id: 'confirm', label: 'Confirm', icon: CheckCircle, status: 'pending', date: '--' },
  { id: 'release', label: 'Release', icon: ShieldCheck, status: 'pending', date: '--' },
];

const { theme } = TOOLS.escrow;

export default function EscrowTrackerPage() {
  const [kycOpen, setKycOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <ToolShell tool="escrow">
        {/* KYC is opt-in from here. It used to be rendered with isOpen={true},
            so the modal covered the page on every visit with no way past it. */}
        <div className={`mb-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between ${GLASS.card}`}>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Verify your account to receive payouts</h2>
            <p className="mt-1 text-sm text-slate-600">
              Escrow releases funds to a verified bank account. It takes about three minutes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setKycOpen(true)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.primaryButton}`}
          >
            <ShieldCheck className="h-4 w-4" />
            Complete KYC
          </button>
        </div>

        <KYCPanel
          open={kycOpen}
          onClose={() => setKycOpen(false)}
          onComplete={(submission) => markKycSubmitted(kycRoleFor(submission.role))}
        />

        {/* KPI cards */}
        <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className={`p-6 ${GLASS.card}`}>
            <div className="mb-2 flex items-start justify-between">
              <span className="font-semibold text-slate-600">Money Locked</span>
              <Lock className="h-5 w-5 text-emerald-700" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{ESCROW_KPIS.moneyLocked}</div>
            <p className="mt-1 text-xs font-medium text-slate-500">Sample figure</p>
          </div>

          <div className={`p-6 ${GLASS.card}`}>
            <div className="mb-2 flex items-start justify-between">
              <span className="font-semibold text-slate-600">Money Released</span>
              <CheckCircle className="h-5 w-5 text-teal-700" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{ESCROW_KPIS.moneyReleased}</div>
            <p className="mt-1 text-xs font-medium text-slate-500">Sample figure</p>
          </div>

          <div className={`p-6 ${GLASS.card}`}>
            <div className="mb-2 flex items-start justify-between">
              <span className="font-semibold text-slate-600">Avg. Days-to-Payment</span>
              <AlertCircle className="h-5 w-5 text-cyan-700" />
            </div>
            <div className="text-3xl font-bold text-slate-900">{ESCROW_KPIS.daysToPayment}</div>
            <p className="mt-1 text-xs font-medium text-slate-500">Sample figure</p>
          </div>
        </div>

        {/* Active transaction timeline */}
        <div className={`mb-8 p-6 md:p-8 ${GLASS.card}`}>
          <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
                Sample order: #KR-8823
              </h2>
              <p className="mt-1 font-medium text-slate-600">Gala Apples (Grade A) — 100 boxes · Seller: Greenfield Orchards</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-teal-800">₹1,45,000</div>
              <div className="text-sm font-medium text-slate-500">Locked in escrow</div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-[10%] right-[10%] top-8 hidden h-1 rounded-full bg-slate-200 md:block" />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
              {TIMELINE_STEPS.map((step) => {
                const isCompleted = step.status === 'completed';
                const isCurrent = step.status === 'current';
                const Icon = step.icon;

                return (
                  <div key={step.id} className="relative z-10 flex flex-row items-center gap-4 md:flex-col md:gap-2">
                    <div
                      className={`z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 shadow-sm ${
                        isCompleted
                          ? 'border-emerald-100 bg-emerald-600 text-white'
                          : isCurrent
                            ? 'border-emerald-500 bg-white text-emerald-700'
                            : 'border-white bg-slate-100 text-slate-400'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="mt-2 text-left md:text-center">
                      <div
                        className={`font-bold ${
                          isCurrent ? 'text-emerald-800' : isCompleted ? 'text-slate-900' : 'text-slate-400'
                        }`}
                      >
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

      <SiteFooter />
    </div>
  );
}
