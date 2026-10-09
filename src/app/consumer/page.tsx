'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { ShoppingBag, Gift, Truck, Leaf, CheckCircle, Search, MapPin } from 'lucide-react';

// Mock DEMO DATA
const PRODUCE_LIST = [
  { id: 'PROD-1', name: 'Premium Kagzi Walnuts', origin: 'Anantnag', farmer: 'Fayaz Orchards', price: '₹850/kg', rating: 4.9, img: '🌰' },
  { id: 'PROD-2', name: 'GI Tagged Pampore Saffron', origin: 'Pampore', farmer: 'Bhat Saffron Co.', price: '₹2,500/10g', rating: 5.0, img: '🌸' },
  { id: 'PROD-3', name: 'Fresh Gala Apples (Gift Box)', origin: 'Shopian', farmer: 'Shopian Fruit Coop', price: '₹1,200/5kg', rating: 4.8, img: '🍎' },
];

const TRACKING = [
  { id: 'TRK-9921', item: 'Pampore Saffron', status: 'In Transit (Jammu Hub)', eta: 'Tomorrow, 4 PM' },
];

export default function ConsumerDirectPage() {
  return (
    <div className="flex min-h-screen flex-col relative text-white">
      {/* Background Component */}
      <div className="fixed inset-0 z-0">
        <DynamicBackdrop />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <SiteHeader hideSignIn={false} />

        <main className="container mx-auto px-4 py-8 flex-1">
          {/* Header Section - Crimson to Gold Accent */}
          <div className="bg-gradient-to-r from-[var(--kr-apple-crimson,#C62828)] to-[var(--kr-saffron-gold,#E8A317)] p-8 rounded-2xl mb-8 shadow-2xl border border-white/10 backdrop-blur-md relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="relative z-10">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                <ShoppingBag className="w-8 h-8 text-white" /> Direct from the valley
              </h1>
              <p className="text-lg text-white/90 font-medium max-w-xl">
                Buy 100% traced, authentic valley produce directly from the source. Perfect for yourself or as a premium gift.
              </p>
            </div>
            <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
              <Gift className="w-64 h-64 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Main Column: Browse Produce */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-black/40 backdrop-blur-md border border-[var(--kr-apple-crimson,#C62828)]/50 p-6 rounded-2xl shadow-[0_0_20px_rgba(198,40,40,0.15)]">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Leaf className="w-6 h-6 text-[var(--kr-saffron-gold,#E8A317)]" /> Traced Produce
                  </h2>
                  <div className="relative w-48 hidden md:block">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                    <input type="text" placeholder="Search..." className="w-full bg-black/50 border border-white/20 rounded-full pl-9 pr-4 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--kr-saffron-gold,#E8A317)]" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PRODUCE_LIST.map(prod => (
                    <div key={prod.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/30 transition-colors group">
                      <div className="text-4xl mb-4 text-center bg-black/30 py-4 rounded-lg border border-white/5">{prod.img}</div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg leading-tight group-hover:text-[var(--kr-saffron-gold,#E8A317)] transition-colors">{prod.name}</h3>
                        <div className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">
                          ★ {prod.rating}
                        </div>
                      </div>
                      <div className="text-xs text-white/60 mb-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {prod.origin}
                      </div>
                      <div className="text-xs text-white/40 mb-4">By: {prod.farmer}</div>
                      
                      <div className="flex justify-between items-center mt-auto border-t border-white/10 pt-3">
                        <div className="text-lg font-bold">{prod.price}</div>
                        <button className="bg-[var(--kr-apple-crimson,#C62828)] hover:bg-[#9E2020] text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-lg hidden">
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Tracking & Gifting */}
            <div className="space-y-6">
              
              {/* Delivery Tracking */}
              <div className="bg-black/40 backdrop-blur-lg border border-white/20 p-6 rounded-2xl">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-400" /> Active Deliveries
                </h2>
                
                {TRACKING.map(trk => (
                  <div key={trk.id} className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 relative overflow-hidden">
                    <div className="font-bold mb-1">{trk.item}</div>
                    <div className="text-xs text-blue-200/80 mb-3">{trk.id}</div>
                    
                    <div className="flex items-center gap-3 bg-black/40 p-2 rounded-lg border border-white/10">
                      <Truck className="w-5 h-5 text-blue-400" />
                      <div>
                        <div className="text-xs font-bold text-blue-400">{trk.status}</div>
                        <div className="text-[10px] text-white/50">ETA: {trk.eta}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Gifting Module */}
              <div className="bg-black/40 backdrop-blur-lg border border-[var(--kr-saffron-gold,#E8A317)]/40 p-6 rounded-2xl shadow-[0_0_20px_rgba(232,163,23,0.15)] flex flex-col">
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-[var(--kr-saffron-gold,#E8A317)] to-[var(--kr-apple-crimson,#C62828)] rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(232,163,23,0.4)]">
                    <Gift className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h2 className="text-xl font-bold mb-2 text-center text-[var(--kr-saffron-gold,#E8A317)]">Corporate Gifting</h2>
                <p className="text-sm text-white/70 text-center mb-6">Send customized boxes of authentic dry fruits and saffron to your clients.</p>
                
                <button className="w-full py-3 bg-[var(--kr-saffron-gold,#E8A317)] hover:bg-[#B37A0B] text-black font-bold rounded-lg transition-colors border border-white/20 hidden">
                  Explore Gift Boxes
                </button>
              </div>
              
              <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-green-400 shrink-0" />
                <div className="text-sm text-white/80">Every purchase includes a QR code allowing you to trace the exact orchard your food came from.</div>
              </div>

            </div>

          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
