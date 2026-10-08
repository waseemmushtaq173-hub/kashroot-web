import Link from 'next/link';
import { 
  CloudSun, 
  Droplets, 
  Wallet, 
  Package, 
  Volume2, 
  Tag, 
  Warehouse, 
  ShoppingCart, 
  MessageCircleQuestion, 
  PlusCircle,
  ArrowRight
} from 'lucide-react';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';

export default function FarmerDashboard() {
  return (
    <div className="flex min-h-screen flex-col">
      <DynamicBackdrop />
      <SiteHeader hideSignIn={false} />

      <main className="container mx-auto px-6 py-10 relative z-10 flex-1 text-[#F5F2EB]">
        
        {/* Header & Voice Read-out */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif font-black text-[#FFFDF8] drop-shadow-lg">
              Salaam, Tariq Bhat
            </h1>
            <p className="text-lg text-[#E2DAC8] mt-2 font-light">Shopian Orchard, Block B</p>
          </div>
          <button className="flex items-center gap-3 bg-black/40 backdrop-blur-md border border-[#D4AF37]/40 px-5 py-3 rounded-full hover:bg-black/60 hover:border-[#D4AF37] transition-all group shadow-lg">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[var(--kr-chinar-amber)] to-[var(--kr-saffron-gold)] flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
            </div>
            <span className="font-serif font-bold text-[#FFFDF8]">Voice Summary</span>
          </button>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Quick Actions (Chinar Amber to Saffron Accent) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Sell Produce', icon: Tag, href: '/farmer/sell' },
                { label: 'Cold Store', icon: Warehouse, href: '/farmer/store' },
                { label: 'Buy Inputs', icon: ShoppingCart, href: '/farmer/buy' },
                { label: 'Ask Expert', icon: MessageCircleQuestion, href: '/farmer/expert' },
              ].map((action, idx) => (
                <Link 
                  key={idx} 
                  href={action.href}
                  className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-black/30 backdrop-blur-md border border-[#D4AF37]/20 hover:border-[var(--kr-chinar-amber)] hover:bg-black/50 transition-all shadow-md group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--kr-chinar-amber)] to-[var(--kr-saffron-gold)] flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                    <action.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-sm font-medium text-[#E2DAC8] group-hover:text-white text-center">{action.label}</span>
                </Link>
              ))}
            </div>

            {/* List Your Product CTA */}
            <div className="relative p-8 rounded-3xl bg-gradient-to-br from-[var(--kr-chinar-amber)] to-[#E8A317]/80 backdrop-blur-lg border border-[#FFF]/20 shadow-[0_15px_40px_rgba(217,98,43,0.3)] flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden group">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_60%)] pointer-events-none" />
              <div className="relative z-10">
                <h3 className="text-2xl font-serif font-black text-white mb-2">Ready to Harvest?</h3>
                <p className="text-white/90 text-sm md:text-base max-w-md">List your Premium Apples or Saffron today to connect directly with verified pan-India buyers.</p>
              </div>
              <button className="relative z-10 shrink-0 flex items-center gap-2 bg-white text-[#D9622B] px-6 py-3.5 rounded-full font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all">
                <PlusCircle className="w-5 h-5" />
                List Your Product
              </button>
            </div>

            {/* Pending Orders */}
            <div className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-[var(--kr-chinar-amber)]" />
                  Pending Orders
                </h3>
                <Link href="/farmer/orders" className="text-sm text-[var(--kr-chinar-amber)] hover:text-[var(--kr-saffron-gold)] flex items-center gap-1">
                  View All <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="space-y-4">
                {[
                  { id: 'ORD-9921', item: '200 Boxes Grade-A Delicious', status: 'Awaiting Transport', amount: '₹1,45,000' },
                  { id: 'ORD-9918', item: '50kg Premium Walnut', status: 'Quality Check', amount: '₹82,500' },
                ].map((order, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                    <div>
                      <p className="text-sm text-white/50 mb-1">{order.id}</p>
                      <p className="font-medium text-white">{order.item}</p>
                    </div>
                    <div className="mt-3 md:mt-0 flex flex-row md:flex-col items-center md:items-end justify-between">
                      <p className="text-lg font-bold text-[var(--kr-saffron-gold)]">{order.amount}</p>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--kr-chinar-amber)]/20 text-[var(--kr-chinar-amber)] border border-[var(--kr-chinar-amber)]/30 mt-1 font-medium">
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Sidebar Column */}
          <div className="space-y-6">
            
            {/* Today Card */}
            <div className="p-6 rounded-2xl bg-black/40 backdrop-blur-md border border-[var(--kr-dal-teal)]/30 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <CloudSun className="w-24 h-24 text-white" />
              </div>
              <h3 className="text-lg font-serif font-bold text-white mb-1 relative z-10">Today in Shopian</h3>
              <p className="text-sm text-[var(--kr-dal-teal)] font-medium mb-6 relative z-10">Perfect Spray Window</p>
              
              <div className="grid grid-cols-2 gap-4 relative z-10">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <CloudSun className="w-8 h-8 text-[var(--kr-saffron-gold)] mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">24°C</p>
                  <p className="text-xs text-white/60">Mostly Sunny</p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--kr-dal-teal)]/20 border border-[var(--kr-dal-teal)]/40 text-center">
                  <Droplets className="w-8 h-8 text-[var(--kr-dal-teal)] mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">Low</p>
                  <p className="text-xs text-white/60">Scab Risk</p>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-[var(--kr-orchard-green)]/20 border border-[var(--kr-orchard-green)]/30">
                <p className="text-xs text-[var(--kr-orchard-green)] font-medium text-center">
                  Optimal time to apply foliar calcium: 4:00 PM - 7:00 PM
                </p>
              </div>
            </div>

            {/* Money Summary */}
            <div className="p-6 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-lg">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-serif font-bold text-white">Earnings</h3>
              </div>
              
              <div className="space-y-5">
                <div>
                  <p className="text-sm text-white/60 mb-1">Total Received (This Season)</p>
                  <p className="text-3xl font-black text-white">₹3,42,000</p>
                </div>
                <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div className="flex justify-between items-center">
                  <p className="text-sm text-white/60">In Escrow</p>
                  <p className="text-lg font-bold text-[var(--kr-chinar-amber)]">₹1,45,000</p>
                </div>
              </div>
              
              <button className="w-full mt-6 py-2.5 rounded-xl border border-white/20 text-sm font-medium text-white hover:bg-white/10 transition-colors">
                View Ledger
              </button>
            </div>

          </div>

        </div>
      </main>
      
      <SiteFooter />
    </div>
  );
}
