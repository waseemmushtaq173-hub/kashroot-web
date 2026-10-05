import Link from 'next/link';
import { Tractor, Sprout, ShieldCheck, Box, Drill, Beaker } from 'lucide-react';

export default function KissanToolsDashboardPage() {
  return (
    <main className="kr-container py-10 theme-farmer">
      <div className="bg-[#1B4332] text-white p-8 md:p-10 rounded-2xl mb-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
          <Tractor className="w-96 h-96" />
        </div>
        <h1 className="font-heading text-4xl md:text-5xl font-bold text-white mb-3 relative z-10">
          Kissan Tools <span className="text-[#E76F51]">Hub</span>
        </h1>
        <p className="text-xl text-white/90 max-w-2xl relative z-10 font-light">
          Your consolidated center for both agricultural inputs and high-density horticulture equipment.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Horticulture & Orchard */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-[#1B4332]/10 hover:shadow-lg transition-all">
          <div className="flex items-center gap-3 mb-6 border-b pb-4">
            <div className="w-12 h-12 rounded-lg bg-[#E76F51]/10 flex items-center justify-center">
              <Sprout className="w-6 h-6 text-[#E76F51]" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-[#1B4332]">Orchard Equipment</h2>
          </div>
          <ul className="space-y-4">
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700 group-hover:text-[#E76F51] transition-colors">High-Density Poles (Trellis)</span>
              <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-bold">In Stock</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700 group-hover:text-[#E76F51] transition-colors">Tree Pruning Secateurs</span>
              <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-bold">In Stock</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700 group-hover:text-[#E76F51] transition-colors">Drip Irrigation Lines</span>
              <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded font-bold">Low Stock</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700 group-hover:text-[#E76F51] transition-colors">Anti-Hail Nets</span>
              <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-bold">In Stock</span>
            </li>
          </ul>
        </section>

        {/* Agrochemicals */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-[#1B4332]/10 hover:shadow-lg transition-all">
          <div className="flex items-center gap-3 mb-6 border-b pb-4">
            <div className="w-12 h-12 rounded-lg bg-[#1B4332]/10 flex items-center justify-center">
              <Beaker className="w-6 h-6 text-[#1B4332]" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-[#1B4332]">Agrochemicals</h2>
          </div>
          <ul className="space-y-4">
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700">Urea (46% N)</span>
              <span className="text-gray-500 text-sm font-mono">1,200 Bags</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700">DAP (18-46-0)</span>
              <span className="text-gray-500 text-sm font-mono">850 Bags</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700">MOP (Muriate of Potash)</span>
              <span className="text-gray-500 text-sm font-mono">500 Bags</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700">Standard Fungicides</span>
              <span className="text-gray-500 text-sm font-mono">Verified Stock</span>
            </li>
          </ul>
        </section>

        {/* Heavy Machinery */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-[#1B4332]/10 hover:shadow-lg transition-all">
          <div className="flex items-center gap-3 mb-6 border-b pb-4">
            <div className="w-12 h-12 rounded-lg bg-[#D4A373]/20 flex items-center justify-center">
              <Tractor className="w-6 h-6 text-[#D4A373]" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-[#1B4332]">Machinery</h2>
          </div>
          <ul className="space-y-4">
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700">Tractors (45 HP)</span>
              <span className="text-gray-500 text-sm font-mono">12 Units</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700">Power Tillers & Weeders</span>
              <span className="text-gray-500 text-sm font-mono">24 Units</span>
            </li>
            <li className="flex justify-between items-center group">
              <span className="font-medium text-gray-700">Hydraulic Sprayers</span>
              <span className="text-gray-500 text-sm font-mono">8 Units</span>
            </li>
          </ul>
        </section>

        {/* Packaging */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-[#1B4332]/10 hover:shadow-lg transition-all md:col-span-2 lg:col-span-3">
          <div className="flex items-center gap-3 mb-6 border-b pb-4">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <Box className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="font-heading text-2xl font-bold text-[#1B4332]">Packaging & Logistics</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <ul className="space-y-4">
              <li className="flex justify-between items-center">
                <span className="font-medium text-gray-700">Apple Corrugated Boxes (Universal)</span>
                <span className="text-gray-500 text-sm font-mono">Bulk Available</span>
              </li>
              <li className="flex justify-between items-center">
                <span className="flex items-center gap-2 font-medium text-gray-700">Apple Boxes (Telescopic 20kg)</span>
                <span className="text-gray-500 text-sm font-mono">Bulk Available</span>
              </li>
            </ul>
            <ul className="space-y-4">
              <li className="flex justify-between items-center">
                <span className="font-medium text-gray-700">Plastic Harvest Crates</span>
                <span className="text-gray-500 text-sm font-mono">Bulk Available</span>
              </li>
              <li className="flex justify-between items-center">
                <span className="font-medium text-gray-700">Jute Sacks (Walnuts)</span>
                <span className="text-gray-500 text-sm font-mono">Low Stock</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
