import { ShoppingBag, Star, Calendar, Search, Truck, FileText } from 'lucide-react';
import Link from 'next/link';
import { PortalShell } from '@/components/layout/PortalShell';
import KYCOnboardingPanel from '@/components/auth/KYCOnboardingPanel';

export default function BuyerDashboardPage() {
  const kpis = [
    { label: "Active Inquiries", value: "2", trend: "Awaiting supplier quote" },
    { label: "In Transit", value: "0", trend: "No active shipments" },
    { label: "Saved Suppliers", value: "4", trend: "Verified farmers" },
  ];

  const navItems = [
    { label: "Overview", href: "/buyer/dashboard", icon: ShoppingBag, active: true },
    { label: "Marketplace", href: "/buyer/discover", icon: Search },
    { label: "Inquiries", href: "/buyer/appointments", icon: FileText },
    { label: "Tracking", href: "/tracking/dashboard", icon: Truck },
  ];

  return (
    <PortalShell
      title="Buyer Portal"
      description="Manage your active purchase inquiries, supplier quotes, and track consignments."
      theme="buyer"
      kpis={kpis}
      navItems={navItems}
      bgImage="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=2400&q=80"
    >
      {/* Full KYC gate — auto-opens while kycStatus is 'pending' */}
      <KYCOnboardingPanel role="BUYER" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Link href="/buyer/discover" className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] hover:bg-black/50 transition-all shadow-md group">
          <div className="w-12 h-12 bg-[var(--accent-gradient)] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform opacity-80 group-hover:opacity-100">
            <Search className="w-6 h-6 text-white" />
          </div>
          <p className="font-bold text-white text-lg">Marketplace</p>
          <p className="text-sm text-white/60">Source authentic produce</p>
        </Link>
        <Link href="/buyer/appointments" className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] hover:bg-black/50 transition-all shadow-md group">
          <div className="w-12 h-12 bg-[var(--accent-gradient)] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform opacity-80 group-hover:opacity-100">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <p className="font-bold text-white text-lg">Purchase Inquiries</p>
          <p className="text-sm text-white/60">Active quotes & negotiations</p>
        </Link>
        <Link href="/tracking" className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] hover:bg-black/50 transition-all shadow-md group">
          <div className="w-12 h-12 bg-[var(--accent-gradient)] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform opacity-80 group-hover:opacity-100">
            <Truck className="w-6 h-6 text-white" />
          </div>
          <p className="font-bold text-white text-lg">Consignment Tracking</p>
          <p className="text-sm text-white/60">Live logistics monitoring</p>
        </Link>
        <div className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] hover:bg-black/50 transition-all shadow-md group cursor-pointer">
          <div className="w-12 h-12 bg-[var(--accent-gradient)] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform opacity-80 group-hover:opacity-100">
            <Star className="w-6 h-6 text-white" />
          </div>
          <p className="font-bold text-white text-lg">Saved Suppliers</p>
          <p className="text-sm text-white/60">Your trusted farmer network</p>
        </div>
      </div>
      
      <div className="p-10 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-center shadow-sm">
        <ShoppingBag className="w-16 h-16 text-white/20 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">No Active Consignments</h3>
        <p className="text-white/60 mb-6 max-w-md mx-auto">You don't have any active purchases or pending shipments at the moment.</p>
        <Link href="/buyer/discover" className="inline-block bg-[var(--accent-gradient)] hover:brightness-110 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg border border-white/20">
          Browse Marketplace Produce
        </Link>
      </div>
    </PortalShell>
  );
}
