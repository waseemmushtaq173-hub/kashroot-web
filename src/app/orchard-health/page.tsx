import Link from 'next/link';
import { ArrowLeft, Map, Camera, Droplets } from 'lucide-react';

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

export default function OrchardHealthPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-[#0B2E1D] via-[#1E7B4F] to-[#061C13] text-[#F5F2EB]">
      <div className="absolute top-8 right-8 opacity-10 pointer-events-none">
        <ChinarLeaf className="w-96 h-96" color="#D4AF37" />
      </div>
      
      <main className="container mx-auto px-6 py-10 relative z-10 flex-1">
        <Link href="/" className="inline-flex items-center gap-2 text-[#D4AF37] hover:text-[#FFFDF8] transition-colors mb-8 font-serif">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
        
        <h1 className="text-4xl md:text-5xl font-serif font-black text-[#FFFDF8] mb-10 drop-shadow-lg">
          Orchard Health
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="relative p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[#D4AF37]/30 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <div className="w-12 h-12 rounded-xl bg-[#1E7B4F]/40 border border-[#D4AF37]/40 flex items-center justify-center mb-4">
              <Map className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">Plot Risk Map</h3>
            <p className="text-sm text-[#E2DAC8]/80 leading-relaxed">
              Real-time spatial visualization of scab and pest risks across your orchard blocks, powered by micro-climate sensors.
            </p>
          </div>

          <div className="relative p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[#D4AF37]/30 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <div className="w-12 h-12 rounded-xl bg-[#1E7B4F]/40 border border-[#D4AF37]/40 flex items-center justify-center mb-4">
              <Camera className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">Photo Diagnosis</h3>
            <p className="text-sm text-[#E2DAC8]/80 leading-relaxed">
              Upload leaf or fruit photos for instant AI-driven pathogen identification and treatment recommendations.
            </p>
          </div>

          <div className="relative p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[#D4AF37]/30 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <div className="w-12 h-12 rounded-xl bg-[#1E7B4F]/40 border border-[#D4AF37]/40 flex items-center justify-center mb-4">
              <Droplets className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <h3 className="text-xl font-serif font-bold mb-2">Spray Log Countdown</h3>
            <p className="text-sm text-[#E2DAC8]/80 leading-relaxed">
              Track fungicide and nutrient spray schedules with automated reminders for withholding periods before harvest.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
