'use client';
import { Button } from "@/components/ui/Button";
import { Package, PenTool, LayoutDashboard, Settings } from 'lucide-react';
import Link from 'next/link';
import { PortalShell } from '@/components/layout/PortalShell';

export default function SellerDashboardPage() {
  const kpis = [
    { label: "Active Listings", value: "0", trend: "Hardware catalog" },
    { label: "Pending Orders", value: "0", trend: "Awaiting fulfillment" },
    { label: "Total Revenue", value: "₹0", trend: "This month" },
  ];

  const navItems = [
    { label: "Overview", href: "/seller/dashboard", icon: LayoutDashboard, active: true },
    { label: "Catalog", href: "/seller/catalog", icon: PenTool },
    { label: "Orders", href: "/seller/orders", icon: Package },
    { label: "Payouts", href: "/seller/payouts", icon: Settings },
  ];

  return (
    <PortalShell
      title="Hardware Seller Studio"
      description="Manage your tools, machinery inventory, and hardware sales."
      theme="kissan"
      kpis={kpis}
      navItems={navItems}
      bgImage="https://images.unsplash.com/photo-1533422902779-babd0060e0ce?auto=format&fit=crop&w=2400&q=80"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Link href="/seller/dashboard" className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all shadow-md group">
          <div className="w-12 h-12 bg-[var(--accent-gradient)] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <LayoutDashboard className="w-6 h-6 text-white" />
          </div>
          <p className="font-bold text-white text-lg">Sales Overview</p>
          <p className="text-sm text-white/60">Performance & analytics</p>
        </Link>
        <Link href="/seller/catalog" className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all shadow-md group">
          <div className="w-12 h-12 bg-[var(--accent-gradient)] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <PenTool className="w-6 h-6 text-white" />
          </div>
          <p className="font-bold text-white text-lg">Hardware Catalog</p>
          <p className="text-sm text-white/60">Add & edit tools</p>
        </Link>
        <Link href="/seller/orders" className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all shadow-md group">
          <div className="w-12 h-12 bg-[var(--accent-gradient)] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Package className="w-6 h-6 text-white" />
          </div>
          <p className="font-bold text-white text-lg">Manage Orders</p>
          <p className="text-sm text-white/60">Fulfillment & shipping</p>
        </Link>
      </div>
      
      <div className="p-10 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-center shadow-sm mb-8">
        <PenTool className="w-16 h-16 text-white/20 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">No Hardware Listings</h3>
        <p className="text-white/60 mb-6 max-w-md mx-auto">Your catalog is currently empty. Add your first piece of machinery or equipment.</p>
        <Button variant="secondary" className="px-8 py-3 font-bold bg-white/20 text-white border-white/50 shadow-lg hover:bg-white/30 hidden">
          List Machinery
        </Button>
      </div>

      <div className="p-6 md:p-8 rounded-3xl bg-black/30 backdrop-blur-md border border-white/10 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Settings className="w-48 h-48 text-white" />
        </div>
        <div className="relative z-10">
          <h2 className="text-2xl font-serif font-bold text-white mb-2">Payout Settings (Escrow)</h2>
          <p className="text-white/60 mb-8 max-w-2xl">Securely configure your bank details to receive automatic escrow payouts when buyers confirm delivery.</p>
          
          <form className="max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={(e) => { e.preventDefault(); alert("Payout settings updated securely."); }}>
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-bold text-white mb-1.5">Account Holder Name</label>
              <input required type="text" className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none transition-all" placeholder="As per bank records" />
            </div>
            <div>
              <label className="block text-sm font-bold text-white mb-1.5">Bank Account Number</label>
              <input required type="password" text-security="disc" className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none transition-all" placeholder="••••••••••••" />
            </div>
            <div>
              <label className="block text-sm font-bold text-white mb-1.5">IFSC Code</label>
              <input required type="text" className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none transition-all uppercase" placeholder="e.g. SBIN0001234" />
            </div>
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-bold text-white mb-1.5">UPI ID (Optional)</label>
              <input type="text" className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none transition-all" placeholder="yourname@bank" />
            </div>
            <div className="col-span-1 md:col-span-2 mt-4 pt-6 border-t border-white/10">
              <Button type="submit" className="bg-[var(--primary)] hover:brightness-110 text-white px-8 py-3.5 rounded-xl font-bold transition-all shadow-lg w-full md:w-auto">
                Save Payout Configuration
              </Button>
            </div>
          </form>
        </div>
      </div>
    </PortalShell>
  );
}
