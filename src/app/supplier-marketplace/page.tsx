'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { PackageOpen, QrCode, Users, Tag, Plus, Printer, TrendingDown } from 'lucide-react';

// Mock DEMO DATA
const CATALOGUE_ITEMS = [
  { id: 'PKG-01', name: 'Universal Corrugated Apple Box (10kg)', price: '₹55/pc', moq: 1000, img: '📦', stock: 'In Stock' },
  { id: 'PKG-02', name: 'Premium Tray Set (5 Layer)', price: '₹12/set', moq: 5000, img: '🗂️', stock: 'Low Stock' },
  { id: 'PKG-03', name: 'Branded Sealing Tape (KashRoot Edition)', price: '₹45/roll', moq: 100, img: '🏷️', stock: 'In Stock' },
];

const GROUP_ORDERS = [
  { id: 'GO-402', item: 'Universal Corrugated Box', currentQty: 12000, targetQty: 20000, discount: '15% Off', endsIn: '2 Days' },
  { id: 'GO-405', item: 'Premium Tray Set', currentQty: 4500, targetQty: 10000, discount: '10% Off', endsIn: '5 Days' },
];

export default function SupplierMarketplacePage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Walnut Brown to Amber Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-walnut-brown,#6B4423)] to-[var(--kr-chinar-amber,#D9622B)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <PackageOpen className="w-8 h-8 text-white" /> Supplier & Packing Market
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Source verified horticulture supplies, generate batch QRs, and pool orders to unlock bulk discounts.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <PackageOpen className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Catalogue & Group Orders */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* Rate Cards Catalogue */}
              <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Tag className="w-5 h-5 text-[var(--kr-chinar-amber,#D9622B)]" /> Supplier Rate Cards
                  </h2>
                  <button className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-medium transition-colors border border-white/10">
                    View Full Catalogue
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {CATALOGUE_ITEMS.map(item => (
                    <div key={item.id} className="bg-black/40 border border-white/10 rounded-xl p-4 hover:border-white/30 transition-colors flex flex-col h-full">
                      <div className="text-4xl mb-3 text-center">{item.img}</div>
                      <h3 className="font-bold text-sm mb-1 leading-tight flex-1">{item.name}</h3>
                      <div className="text-xl font-bold text-[var(--kr-chinar-amber,#D9622B)] mb-2">{item.price}</div>
                      <div className="flex justify-between text-xs text-white/60 mb-4">
                        <span>MOQ: {item.moq}</span>
                        <span className={item.stock === 'In Stock' ? 'text-green-400' : 'text-amber-400'}>{item.stock}</span>
                      </div>
                      <button className="w-full py-2 bg-white/10 hover:bg-[var(--kr-chinar-amber,#D9622B)] hover:text-black border border-white/20 hover:border-transparent rounded-lg text-sm font-bold transition-all">
                        Request Quote
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Group Orders Pipeline */}
              <div className="bg-black/30 backdrop-blur-md border border-white/20 p-6 rounded-2xl">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5 text-[var(--kr-chinar-amber,#D9622B)]" /> Group Orders Pipeline
                </h2>
                <p className="text-sm text-white/60 mb-6">Pool your requirements with other farmers to reach target MOQs and unlock massive tier discounts.</p>
                
                <div className="space-y-4">
                  {GROUP_ORDERS.map(order => {
                    const percent = (order.currentQty / order.targetQty) * 100;
                    return (
                      <div key={order.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center">
                        <div className="flex-1 w-full">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-bold">{order.item}</div>
                              <div className="text-xs text-white/50">Target: {order.targetQty} • Ends in {order.endsIn}</div>
                            </div>
                            <div className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 border border-green-500/30">
                              <TrendingDown className="w-3 h-3" /> {order.discount}
                            </div>
                          </div>
                          
                          {/* Progress Bar */}
                          <div className="h-3 w-full bg-black/50 rounded-full overflow-hidden mt-3 border border-white/5">
                            <div 
                              className="h-full bg-gradient-to-r from-[var(--kr-walnut-brown,#6B4423)] to-[var(--kr-chinar-amber,#D9622B)]" 
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                          <div className="text-right text-xs text-white/70 mt-1">{order.currentQty} / {order.targetQty} Committed</div>
                        </div>
                        
                        <div className="w-full md:w-auto shrink-0 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-4">
                          <button className="w-full bg-[var(--kr-chinar-amber,#D9622B)] hover:bg-[#B55020] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2">
                            <Plus className="w-4 h-4" /> Join Order
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Right Column: QR Batch Generator */}
            <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-walnut-brown,#6B4423)] p-6 rounded-2xl shadow-[0_0_30px_rgba(107,68,35,0.2)] flex flex-col">
              <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-[var(--kr-chinar-amber,#D9622B)]">
                <QrCode className="w-6 h-6" /> Batch QR Generator
              </h2>
              <p className="text-sm text-white/70 mb-6">Generate traceability QR codes for your packed boxes instantly.</p>
              
              <div className="space-y-4 mb-8 flex-1">
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Product Type</label>
                  <select className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--kr-chinar-amber,#D9622B)] appearance-none">
                    <option>Apple (Gala)</option>
                    <option>Apple (Delicious)</option>
                    <option>Walnut (Kagzi)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Grade / Size</label>
                  <select className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--kr-chinar-amber,#D9622B)] appearance-none">
                    <option>Grade A (Premium)</option>
                    <option>Grade B (Standard)</option>
                    <option>Grade C (Processing)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Number of Boxes</label>
                  <input type="number" defaultValue={50} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[var(--kr-chinar-amber,#D9622B)] transition-colors" />
                </div>
                <div>
                  <label className="text-sm text-white/60 mb-1 block">Harvest Batch ID</label>
                  <input type="text" defaultValue="HB-26-OCT-12" readOnly className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white/50 cursor-not-allowed" />
                </div>
              </div>

              {/* Action */}
              <div className="bg-[var(--kr-walnut-brown,#6B4423)]/20 p-4 rounded-xl border border-[var(--kr-walnut-brown,#6B4423)]/50 text-center">
                <QrCode className="w-16 h-16 text-white/20 mx-auto mb-3" />
                <button className="w-full py-3 bg-[var(--kr-walnut-brown,#6B4423)] hover:bg-[#523319] text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-white/10">
                  <Printer className="w-5 h-5" /> Generate 50 QR Labels
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
