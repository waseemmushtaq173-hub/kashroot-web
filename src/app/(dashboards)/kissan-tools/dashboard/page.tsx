import Link from 'next/link';
import { Tractor, Sprout, ShieldCheck, Box, Drill, Beaker, Wrench, ShoppingCart } from 'lucide-react';
import { PortalShell } from '@/components/layout/PortalShell';

export default function KissanToolsDashboardPage() {
  const kpis = [
    { label: "Orchard Tools", value: "850+", trend: "In Stock" },
    { label: "Fertilizers", value: "Verified", trend: "Grade A" },
    { label: "Machinery", value: "Rent/Buy", trend: "Available" },
  ];

  const navItems = [
    { label: "Dashboard", href: "/kissan-tools/dashboard", icon: Tractor, active: true },
    { label: "Equipment", href: "/kissan-tools/equipment", icon: Wrench },
    { label: "Agrochemicals", href: "/kissan-tools/chemicals", icon: Beaker },
    { label: "Orders", href: "/kissan-tools/orders", icon: ShoppingCart },
  ];

  return (
    <PortalShell
      title="Kissan Tools Hub"
      description="Your consolidated center for both agricultural inputs and high-density horticulture equipment."
      theme="kissan"
      kpis={kpis}
      navItems={navItems}
      bgImage="https://images.unsplash.com/photo-1592982537447-6f296d9b3014?auto=format&fit=crop&w=2400&q=80"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Horticulture & Orchard */}
        <section className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all shadow-md">
          <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
            <div className="w-12 h-12 rounded-lg bg-[var(--accent-gradient)] flex items-center justify-center">
              <Sprout className="w-6 h-6 text-white" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-white">Orchard Equipment</h2>
          </div>
          <ul className="space-y-4">
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80 group-hover:text-white transition-colors">High-Density Poles (Trellis)</span>
              <span className="bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/50 text-xs px-2 py-1 rounded font-bold">In Stock</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80 group-hover:text-white transition-colors">Tree Pruning Secateurs</span>
              <span className="bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/50 text-xs px-2 py-1 rounded font-bold">In Stock</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80 group-hover:text-white transition-colors">Drip Irrigation Lines</span>
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/50 text-xs px-2 py-1 rounded font-bold">Low Stock</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80 group-hover:text-white transition-colors">Anti-Hail Nets</span>
              <span className="bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/50 text-xs px-2 py-1 rounded font-bold">In Stock</span>
            </li>
          </ul>
        </section>

        {/* Agrochemicals */}
        <section className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all shadow-md">
          <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
            <div className="w-12 h-12 rounded-lg bg-[var(--accent-gradient)] flex items-center justify-center">
              <Beaker className="w-6 h-6 text-white" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-white">Agrochemicals</h2>
          </div>
          <ul className="space-y-4">
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80">Urea (46% N)</span>
              <span className="text-white/50 text-sm font-mono">1,200 Bags</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80">DAP (18-46-0)</span>
              <span className="text-white/50 text-sm font-mono">850 Bags</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80">MOP (Muriate of Potash)</span>
              <span className="text-white/50 text-sm font-mono">500 Bags</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80">Standard Fungicides</span>
              <span className="text-white/50 text-sm font-mono">Verified Stock</span>
            </li>
          </ul>
        </section>

        {/* Heavy Machinery */}
        <section className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all shadow-md">
          <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
            <div className="w-12 h-12 rounded-lg bg-[var(--accent-gradient)] flex items-center justify-center">
              <Tractor className="w-6 h-6 text-white" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-white">Machinery</h2>
          </div>
          <ul className="space-y-4">
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80">Tractors (45 HP)</span>
              <span className="text-white/50 text-sm font-mono">12 Units</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80">Power Tillers & Weeders</span>
              <span className="text-white/50 text-sm font-mono">24 Units</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-white/80">Hydraulic Sprayers</span>
              <span className="text-white/50 text-sm font-mono">8 Units</span>
            </li>
          </ul>
        </section>

        {/* Packaging */}
        <section className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all shadow-md md:col-span-2 lg:col-span-3">
          <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
            <div className="w-12 h-12 rounded-lg bg-[var(--accent-gradient)] flex items-center justify-center">
              <Box className="w-6 h-6 text-white" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-white">Packaging & Logistics</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <ul className="space-y-4">
              <li className="flex justify-between items-center">
                <span className="font-medium text-white/80">Apple Corrugated Boxes (Universal)</span>
                <span className="text-white/50 text-sm font-mono">Bulk Available</span>
              </li>
              <li className="flex justify-between items-center">
                <span className="flex items-center gap-2 font-medium text-white/80">Apple Boxes (Telescopic 20kg)</span>
                <span className="text-white/50 text-sm font-mono">Bulk Available</span>
              </li>
            </ul>
            <ul className="space-y-4">
              <li className="flex justify-between items-center">
                <span className="font-medium text-white/80">Plastic Harvest Crates</span>
                <span className="text-white/50 text-sm font-mono">Bulk Available</span>
              </li>
              <li className="flex justify-between items-center">
                <span className="font-medium text-white/80">Jute Sacks (Walnuts)</span>
                <span className="text-amber-400 text-sm font-mono">Low Stock</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
