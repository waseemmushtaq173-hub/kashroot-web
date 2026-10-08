'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { Briefcase, Users, HandCoins, UserPlus, FileSignature, CheckCircle, IndianRupee } from 'lucide-react';

// Mock DEMO DATA
const ONBOARDING_PIPELINE = [
  { id: 'F-881', name: 'Zahoor Ahmad', village: 'Sopore', status: 'KYC Pending', step: 'Upload Aadhaar' },
  { id: 'F-882', name: 'Mohammad Yaseen', village: 'Pulwama', status: 'Verification', step: 'Bank Details' },
];

const ASSISTED_ORDERS = [
  { id: 'ORD-9192', farmer: 'Farooq Bhat', type: 'DAP Fertilizer', amount: '₹14,500', commission: '₹145', status: 'Delivered' },
  { id: 'ORD-9193', farmer: 'Tariq Lone', type: 'Apple Boxes (1000)', amount: '₹55,000', commission: '₹550', status: 'Pending' },
];

export default function FieldAgentPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Amber to Green Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-chinar-amber,#D9622B)] to-[var(--kr-orchard-green,#1E7B4F)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <Briefcase className="w-8 h-8 text-white" /> Field Agent (KashRoot Saathi)
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Onboard rural farmers, facilitate assisted commerce, and track your performance commissions.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <Users className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Earnings & KPIs */}
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-white/60 text-sm mb-1">Total Farmers Onboarded</div>
                  <div className="text-3xl font-bold">142</div>
                </div>
                <Users className="w-10 h-10 text-[var(--kr-chinar-amber,#D9622B)] opacity-50" />
              </div>
              <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-white/60 text-sm mb-1">Assisted Orders Volume</div>
                  <div className="text-3xl font-bold">₹8.4L</div>
                </div>
                <Briefcase className="w-10 h-10 text-[var(--kr-orchard-green,#1E7B4F)] opacity-50" />
              </div>
              <div className="bg-[var(--kr-chinar-amber,#D9622B)]/10 backdrop-blur-md border border-[var(--kr-chinar-amber,#D9622B)]/30 p-6 rounded-2xl flex items-center justify-between">
                <div>
                  <div className="text-[var(--kr-chinar-amber,#D9622B)] text-sm font-bold mb-1">Month's Commission</div>
                  <div className="text-3xl font-bold text-white">₹14,250</div>
                </div>
                <IndianRupee className="w-10 h-10 text-[var(--kr-chinar-amber,#D9622B)] opacity-50" />
              </div>
            </div>

            {/* Left Column: Onboarding Pipeline */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-chinar-amber,#D9622B)]/30 rounded-2xl p-6 shadow-[0_0_20px_rgba(217,98,43,0.1)] h-full">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-[var(--kr-chinar-amber,#D9622B)]" /> Onboarding
                  </h2>
                  <button className="bg-[var(--kr-chinar-amber,#D9622B)] hover:bg-[#B55020] text-white px-3 py-1 rounded text-sm font-bold transition-colors">
                    + New
                  </button>
                </div>
                
                <div className="space-y-4">
                  {ONBOARDING_PIPELINE.map(f => (
                    <div key={f.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                      <div className="flex justify-between">
                        <div>
                          <div className="font-bold text-sm">{f.name}</div>
                          <div className="text-xs text-white/50">{f.village}</div>
                        </div>
                        <div className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded h-max border border-amber-500/20">
                          {f.status}
                        </div>
                      </div>
                      <button className="w-full bg-white/10 hover:bg-white/20 text-white py-2 rounded-lg text-xs font-bold border border-white/10 transition-colors flex justify-center items-center gap-1">
                        <FileSignature className="w-3 h-3" /> {f.step}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Assisted Order Mode */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-orchard-green,#1E7B4F)]/30 rounded-2xl p-6 h-full shadow-[0_0_20px_rgba(30,123,79,0.1)] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <HandCoins className="w-5 h-5 text-[var(--kr-orchard-green,#1E7B4F)]" /> Assisted Orders
                  </h2>
                  <button className="bg-[var(--kr-orchard-green,#1E7B4F)] hover:bg-[#165a39] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-lg">
                    Place Order for Farmer
                  </button>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-white/50">
                        <th className="pb-3 font-medium">Order ID</th>
                        <th className="pb-3 font-medium">Farmer</th>
                        <th className="pb-3 font-medium">Product</th>
                        <th className="pb-3 font-medium">Amount</th>
                        <th className="pb-3 font-medium">My Cut</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ASSISTED_ORDERS.map(order => (
                        <tr key={order.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-4 font-mono text-xs">{order.id}</td>
                          <td className="py-4 font-bold">{order.farmer}</td>
                          <td className="py-4">{order.type}</td>
                          <td className="py-4 font-bold">{order.amount}</td>
                          <td className="py-4 font-bold text-[var(--kr-chinar-amber,#D9622B)]">{order.commission}</td>
                          <td className="py-4">
                            {order.status === 'Delivered' ? (
                              <span className="flex items-center gap-1 text-green-400 bg-green-500/10 px-2 py-1 rounded text-xs w-max">
                                <CheckCircle className="w-3 h-3" /> Delivered
                              </span>
                            ) : (
                              <span className="text-amber-400 bg-amber-500/10 px-2 py-1 rounded text-xs w-max">
                                Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
