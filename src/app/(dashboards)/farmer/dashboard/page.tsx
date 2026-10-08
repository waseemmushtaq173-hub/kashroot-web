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
  ArrowRight,
  Sprout,
  Store,
  Tractor,
  Activity
} from 'lucide-react';
import { PortalShell } from '@/components/layout/PortalShell';
import { Button } from "@/components/ui/Button";
import KYCOnboardingPanel from '@/components/auth/KYCOnboardingPanel';

export default function FarmerDashboard() {
  const kpis = [
    { label: "Total Received", value: "₹3,42,000", trend: "+12% this season" },
    { label: "In Escrow", value: "₹1,45,000", trend: "Awaiting transport" },
    { label: "Active Listings", value: "3 Lots", trend: "High buyer interest" },
    { label: "Orchard Grade", value: "A+", trend: "Pesticide verified" },
  ];

  const navItems = [
    { label: "Home", href: "/farmer/dashboard", icon: Sprout, active: true },
    { label: "Market", href: "/farmer/sell", icon: Store },
    { label: "Tools", href: "/kissan-tools/dashboard", icon: Tractor },
    { label: "Health", href: "/orchard-health", icon: Activity },
  ];

  return (
    <PortalShell
      title="Salaam, Tariq Bhat"
      description="Shopian Orchard, Block B"
      theme="farmer"
      kpis={kpis}
      navItems={navItems}
      bgImage="https://images.unsplash.com/photo-1715457573748-8e8a70b2c1be?auto=format&fit=crop&w=2400&q=80"
    >
        {/* Full KYC gate — auto-opens while kycStatus is 'pending' */}
        <KYCOnboardingPanel role="FARMER" />

        <div className="flex justify-end mb-6">
          <Button variant="secondary" className="flex items-center gap-3 rounded-full hidden">
            <Volume2 className="w-5 h-5" /> Voice Summary
          </Button>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Quick Actions */}
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
                  className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] hover:bg-black/50 transition-all shadow-md group"
                >
                  <div className="w-12 h-12 rounded-xl bg-[var(--accent-gradient)] flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                    <action.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-sm font-medium text-[#E2DAC8] group-hover:text-white text-center">{action.label}</span>
                </Link>
              ))}
            </div>

            {/* List Your Product CTA */}
            <div className="relative p-8 rounded-3xl bg-[var(--accent-gradient)] backdrop-blur-lg border border-[#FFF]/20 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden group">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_60%)] pointer-events-none" />
              <div className="relative z-10">
                <h3 className="text-2xl font-serif font-black text-white mb-2">Ready to Harvest?</h3>
                <p className="text-white/90 text-sm md:text-base max-w-md">List your Premium Apples or Saffron today to connect directly with verified pan-India buyers.</p>
              </div>
              <Button variant="secondary" className="relative z-10 shrink-0 shadow-lg text-white font-bold bg-white/20 border-white/50 hidden">
                <PlusCircle className="w-5 h-5 mr-2" /> List Your Product
              </Button>
            </div>

            {/* Pending Orders */}
            <div className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-white/10 shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-[var(--primary)]" />
                  Pending Orders
                </h3>
                <Link href="/farmer/orders" className="text-sm text-[var(--primary)] hover:brightness-125 flex items-center gap-1">
                  View All <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="space-y-4">
                {[
                  { id: 'ORD-9921', item: '200 Boxes Grade-A Delicious', status: 'Awaiting Transport', amount: '₹1,45,000' },
                  { id: 'ORD-9918', item: '50kg Premium Walnut', status: 'Quality Check', amount: '₹82,500' },
                ].map((order, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-[var(--primary)]/50 transition-colors">
                    <div>
                      <p className="text-sm text-white/50 mb-1">{order.id}</p>
                      <p className="font-medium text-white">{order.item}</p>
                    </div>
                    <div className="mt-3 md:mt-0 flex flex-row md:flex-col items-center md:items-end justify-between">
                      <p className="text-lg font-bold text-[var(--primary)]">{order.amount}</p>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-[var(--primary)]/20 text-white border border-[var(--primary)]/50 mt-1 font-medium">
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
            <div className="p-6 rounded-2xl bg-black/40 backdrop-blur-md border border-[#0E7C86]/30 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <CloudSun className="w-24 h-24 text-white" />
              </div>
              <h3 className="text-lg font-serif font-bold text-white mb-1 relative z-10">Today in Shopian</h3>
              <p className="text-sm text-[#0E7C86] font-medium mb-6 relative z-10">Perfect Spray Window</p>
              
              <div className="grid grid-cols-2 gap-4 relative z-10">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                  <CloudSun className="w-8 h-8 text-[var(--primary)] mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">24°C</p>
                  <p className="text-xs text-white/60">Mostly Sunny</p>
                </div>
                <div className="p-4 rounded-xl bg-[#0E7C86]/20 border border-[#0E7C86]/40 text-center">
                  <Droplets className="w-8 h-8 text-[#0E7C86] mx-auto mb-2" />
                  <p className="text-2xl font-bold text-white">Low</p>
                  <p className="text-xs text-white/60">Scab Risk</p>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-[#1E7B4F]/20 border border-[#1E7B4F]/30">
                <p className="text-xs text-[#1E7B4F] font-medium text-center">
                  Optimal time to apply foliar calcium: 4:00 PM - 7:00 PM
                </p>
              </div>
            </div>

          </div>
        </div>
    </PortalShell>
  );
}
