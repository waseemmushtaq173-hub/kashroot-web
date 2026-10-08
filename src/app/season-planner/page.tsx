import Link from 'next/link';
import { ArrowLeft, CalendarDays, Calculator } from 'lucide-react';

const ChinarLeaf = ({ className = "w-6 h-6", color = "#D4AF37" }: { className?: string; color?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M50 8 C47 22 36 28 28 32 C34 36 33 42 22 46 C32 50 31 60 25 68 C35 66 38 72 35 84 C43 76 47 79 50 92 C53 79 57 76 65 84 C62 72 65 66 75 68 C69 60 68 50 78 46 C67 42 66 36 72 32 C64 28 53 22 50 8 Z" 
      fill={color} 
      fillOpacity="0.25"
      stroke={color} 
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M50 18 L50 84 M50 44 L32 36 M50 48 L68 36 M50 58 L28 52 M50 62 L72 52 M50 72 L36 70 M50 74 L64 70" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
  </svg>
);

export default function SeasonPlannerPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#4A0E0E] via-[#C62828] to-[#D9622B] text-[#F5F2EB]">
      <div className="absolute top-8 right-8 opacity-10 pointer-events-none">
        <ChinarLeaf className="w-96 h-96" color="#D4AF37" />
      </div>
      
      <main className="container mx-auto px-6 py-10 relative z-10 flex-1">
        <Link href="/" className="inline-flex items-center gap-2 text-[#D4AF37] hover:text-[#FFFDF8] transition-colors mb-8 font-serif">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        
        <h1 className="text-4xl md:text-5xl font-serif font-black text-[#FFFDF8] mb-10 drop-shadow-lg">
          Season Planner
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="relative p-6 rounded-2xl bg-black/40 backdrop-blur-md border border-[#D4AF37]/30 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <div className="w-12 h-12 rounded-xl bg-[#C62828]/50 border border-[#D4AF37]/40 flex items-center justify-center mb-4">
              <CalendarDays className="w-6 h-6 text-[#F4A261]" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">Pruning & Harvest Calendar</h3>
            <p className="text-sm text-[#E2DAC8]/90 leading-relaxed">
              Plan and optimize your horticultural calendar. Ensure timely pruning, blossom management, and coordinate harvesting labor for peak apple ripeness.
            </p>
          </div>

          <div className="relative p-6 rounded-2xl bg-black/40 backdrop-blur-md border border-[#D4AF37]/30 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <div className="w-12 h-12 rounded-xl bg-[#C62828]/50 border border-[#D4AF37]/40 flex items-center justify-center mb-4">
              <Calculator className="w-6 h-6 text-[#F4A261]" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">Cost vs. Revenue Profit Calculator</h3>
            <p className="text-sm text-[#E2DAC8]/90 leading-relaxed">
              Calculate projected ROI by logging input costs (fertilizer, labor, packaging) against real-time mandi rate estimates. Keep your orchard profitable.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
