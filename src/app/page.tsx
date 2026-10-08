'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Tractor,
  Sprout,
  Store,
  ShoppingCart,
  ShieldCheck,
  PackageSearch,
  X,
  ChevronRight,
  Activity,
  CalendarDays,
  QrCode
} from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';
import { HeroShowcase } from '@/components/ui/HeroShowcase';
import { ScrollScenes } from '@/components/ui/ScrollScenes';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1715457573748-8e8a70b2c1be?auto=format&fit=crop&w=2400&q=80';

// Kashmiri Boon (Chinar) Leaf SVG Component
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

// Traditional Khatamband Geometric Lattice Border
const KhatambandBorder = () => (
  <div className="w-full h-3 flex items-center justify-center overflow-hidden opacity-40">
    <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />
  </div>
);

export default function Home() {
  const [isPortalModalOpen, setPortalModalOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#07120D] text-[#F5F2EB] selection:bg-[#D4AF37]/30 selection:text-[#FFF]">
      <SiteHeader hideSignIn={true} />

      {/* PORTAL SELECTION MODAL */}
      {isPortalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-4xl bg-gradient-to-b from-[#0F291E] via-[#0A1A13] to-[#060F0B] border-2 border-[#D4AF37]/40 rounded-3xl shadow-[0_0_60px_rgba(212,175,55,0.2)] overflow-hidden relative">
            
            {/* Khatamband corner accents */}
            <div className="absolute top-0 left-0 w-24 h-24 border-t-2 border-l-2 border-[#D4AF37]/60 rounded-tl-3xl pointer-events-none" />
            <div className="absolute top-0 right-0 w-24 h-24 border-t-2 border-r-2 border-[#D4AF37]/60 rounded-tr-3xl pointer-events-none" />
            
            <button 
              onClick={() => setPortalModalOpen(false)}
              className="absolute top-5 right-5 p-2.5 text-[#D4AF37] hover:text-white bg-[#0A1A13] border border-[#D4AF37]/30 hover:border-[#D4AF37] rounded-full transition-all z-20 shadow-lg"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="pt-10 pb-6 px-8 text-center relative z-10">
              <div className="flex items-center justify-center gap-3 mb-2">
                <ChinarLeaf className="w-7 h-7" color="#D4AF37" />
                <span className="text-[#D4AF37] tracking-[0.25em] text-xs uppercase font-serif font-bold">Kashroot Gateway</span>
                <ChinarLeaf className="w-7 h-7 rotate-180" color="#D4AF37" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-serif font-extrabold text-[#FFFDF8] tracking-wide">
                Choose Your Portal
              </h2>
              <p className="text-[#D4AF37]/80 text-sm mt-1 font-light">Access your dedicated trade portal or management dashboard</p>
              <KhatambandBorder />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 p-8 pt-2">
              {[
                { title: 'Farmer Portal', desc: 'Manage orchards, crops & direct mandi listings.', href: '/farmer/dashboard', icon: Sprout, tone: 'from-[#0C3827] to-[#061C13]', border: 'border-[#2ecc71]/40', iconColor: '#4ADE80' },
                { title: 'Buyer Portal', desc: 'Direct sourcing of authenticated Kashmiri produce.', href: '/buyer/dashboard', icon: ShoppingCart, tone: 'from-[#3A220E] to-[#1C1006]', border: 'border-[#E59866]/40', iconColor: '#FDBA74' },
                { title: 'Kissan Tools', desc: 'Orchard equipment, sprayers & horti supplies.', href: '/kissan-tools/dashboard', icon: Tractor, tone: 'from-[#381118] to-[#1C080C]', border: 'border-[#E76F51]/40', iconColor: '#F87171' },
                { title: 'Price Comparison', desc: 'Live rates across Sopore, Shopian & Narwal mandis.', href: '/compare-prices', icon: PackageSearch, tone: 'from-[#0C3827] to-[#061C13]', border: 'border-[#2ecc71]/40', iconColor: '#4ADE80' },
                { title: 'Rental Marketplace', desc: 'Cold storage space, tractors & pruning gear.', href: '/rental', icon: Store, tone: 'from-[#3A220E] to-[#1C1006]', border: 'border-[#E59866]/40', iconColor: '#FDBA74' },
                { title: 'Admin Governance', desc: 'Quality audit, escrow verification & KYC.', href: '/admin/dashboard', icon: ShieldCheck, tone: 'from-[#381118] to-[#1C080C]', border: 'border-[#E76F51]/40', iconColor: '#F87171' },
                { title: 'Orchard Health', desc: 'Plot risk map, photo diagnosis & spray logs.', href: '/orchard-health', icon: Activity, tone: 'from-[#0F3524] to-[#05150E]', border: 'border-[#2ecc71]/40', iconColor: '#4ADE80' },
                { title: 'Season Planner', desc: 'Pruning calendar & profit ROI calculator.', href: '/season-planner', icon: CalendarDays, tone: 'from-[#381118] to-[#1C080C]', border: 'border-[#E76F51]/40', iconColor: '#F87171' },
                { title: 'Traceability & Quality', desc: 'Origin scanner, temp log & grade history.', href: '/traceability', icon: QrCode, tone: 'from-[#063B41] to-[#042427]', border: 'border-[#14B8A6]/40', iconColor: '#2DD4BF' },
              ].map((item, idx) => (
                <Link 
                  href={item.href} 
                  key={idx} 
                  className={`group relative p-6 rounded-2xl bg-gradient-to-b ${item.tone} border ${item.border} hover:border-[#D4AF37] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(212,175,55,0.15)] flex flex-col justify-between`}
                >
                  <div>
                    <div className="w-12 h-12 rounded-xl bg-black/40 border border-[#D4AF37]/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <item.icon className="w-6 h-6" style={{ color: item.iconColor }} />
                    </div>
                    <h3 className="text-lg font-serif font-bold text-white group-hover:text-[#D4AF37] transition-colors flex items-center gap-1.5">
                      {item.title}
                      <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-[#D4AF37]" />
                    </h3>
                    <p className="text-xs text-[#E2DAC8]/70 mt-1.5 leading-relaxed">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HERO SECTION */}
      <main id="main-content" className="flex-1">
        <HeroShowcase onEnterPortals={() => setPortalModalOpen(true)} />

        <ScrollScenes />
      </main>

      <SiteFooter />
    </div>
  );
}