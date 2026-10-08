'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { ShieldAlert, AlertTriangle, UserCheck, Gavel, Scale, AlertOctagon } from 'lucide-react';

// Mock DEMO DATA
const VERIFICATION_QUEUE = [
  { id: 'USR-911', name: 'Zahoor Traders', type: 'Buyer', match: '98% (Aadhaar)', risk: 'Low' },
  { id: 'USR-912', name: 'Lone Cold Store', type: 'Facility', match: '65% (FSSAI mismatch)', risk: 'High' },
];

const DISPUTES = [
  { id: 'DSP-01', order: 'ORD-5542', issue: 'Grade mismatch reported on delivery', amount: '₹1.2L locked', status: 'Pending Review' },
];

export default function TrustSafetyAdminPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Navy to Crimson Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-pir-panjal-navy,#0B1F3A)] to-[var(--kr-apple-crimson,#C62828)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <ShieldAlert className="w-8 h-8 text-white" /> Trust & Safety Admin
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Oversee platform integrity, adjudicate escrow disputes, and process manual KYC overrides.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <AlertOctagon className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* User Verification Queue */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-pir-panjal-navy,#0B1F3A)]/50 rounded-2xl p-6 shadow-[0_0_20px_rgba(11,31,58,0.2)]">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-blue-400" /> KYC Verification Queue
                </h2>
                <div className="text-sm bg-white/10 px-3 py-1 rounded-full font-medium">12 Pending</div>
              </div>
              
              <div className="space-y-4">
                {VERIFICATION_QUEUE.map((usr, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div>
                      <h3 className="font-bold text-lg mb-1">{usr.name}</h3>
                      <div className="text-xs text-white/60 mb-2">{usr.id} • {usr.type}</div>
                      <div className={`text-xs font-bold px-2 py-0.5 rounded w-max ${usr.risk === 'High' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                        Auth Match: {usr.match}
                      </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button className="flex-1 sm:flex-none bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30 px-4 py-2 rounded-lg text-sm font-bold transition-colors hidden">Reject</button>
                      <button className="flex-1 sm:flex-none bg-green-500 hover:bg-green-600 text-black px-4 py-2 rounded-lg text-sm font-bold transition-colors hidden">Approve</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Dispute Console */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-apple-crimson,#C62828)]/40 rounded-2xl p-6 shadow-[0_0_20px_rgba(198,40,40,0.15)]">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Scale className="w-5 h-5 text-[var(--kr-apple-crimson,#C62828)]" /> Active Escrow Disputes
              </h2>
              
              <div className="space-y-4">
                {DISPUTES.map((dsp, i) => (
                  <div key={i} className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span className="font-bold text-red-400">{dsp.id}</span>
                      </div>
                      <span className="text-xs bg-red-500 text-white px-2 py-1 rounded font-bold">{dsp.status}</span>
                    </div>
                    
                    <div className="text-sm font-medium mb-1">Order: {dsp.order}</div>
                    <div className="text-white/80 text-sm mb-4">Issue: {dsp.issue}</div>
                    
                    <div className="flex justify-between items-center border-t border-red-500/20 pt-4">
                      <div className="text-sm font-bold text-red-300">{dsp.amount}</div>
                      <button className="bg-[var(--kr-apple-crimson,#C62828)] hover:bg-[#9E2020] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 hidden">
                        <Gavel className="w-4 h-4" /> Intervene
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
