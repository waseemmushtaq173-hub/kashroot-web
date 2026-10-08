import { Button } from "@/components/ui/Button";
import { Calendar, Briefcase, PlusCircle, Settings } from 'lucide-react';
import Link from 'next/link';
import { PortalShell } from '@/components/layout/PortalShell';

export default function ProviderDashboardPage() {
  const kpis = [
    { label: "Active Services", value: "0", trend: "Your offerings" },
    { label: "Bookings", value: "0", trend: "This week" },
  ];

  const navItems = [
    { label: "Dashboard", href: "/provider/dashboard", icon: Calendar, active: true },
    { label: "Services", href: "/provider/services", icon: Briefcase },
    { label: "Payouts", href: "/provider/payouts", icon: Settings },
  ];

  return (
    <PortalShell
      title="Service Provider Hub"
      description="Manage your rental equipment calendar and service requests."
      theme="kissan"
      kpis={kpis}
      navItems={navItems}
      bgImage="https://images.unsplash.com/photo-1592982537447-6f296d9b3014?auto=format&fit=crop&w=2400&q=80"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Link href="/provider/dashboard" className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all shadow-md group">
          <div className="w-12 h-12 bg-[var(--accent-gradient)] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <p className="font-bold text-white text-lg">Schedule</p>
          <p className="text-sm text-white/60">Bookings & availability</p>
        </Link>
        <Link href="/provider/services" className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all shadow-md group">
          <div className="w-12 h-12 bg-[var(--accent-gradient)] rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Briefcase className="w-6 h-6 text-white" />
          </div>
          <p className="font-bold text-white text-lg">Services</p>
          <p className="text-sm text-white/60">Manage offerings</p>
        </Link>
      </div>
      
      <div className="p-10 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 text-center shadow-sm">
        <Briefcase className="w-16 h-16 text-white/20 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">No Active Services</h3>
        <p className="text-white/60 mb-6 max-w-md mx-auto">You haven't listed any services or equipment for rent yet.</p>
        <Button className="bg-[var(--primary)] hover:brightness-110 text-white font-bold px-8 py-3 rounded-xl transition-all shadow-lg hidden">
          <PlusCircle className="w-5 h-5 mr-2" /> Add Rental or Service
        </Button>
      </div>
    </PortalShell>
  );
}
