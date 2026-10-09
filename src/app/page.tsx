'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Tractor,
  Sprout,
  Store,
  ShieldCheck,
  X,
  ChevronRight,
  Activity,
  CalendarDays,
  QrCode
} from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';
import { HeroShowcase } from '@/components/layout/HeroShowcase';
import { MainTools } from '@/components/ui/MainTools';

/*
 * Homepage structure:
 *   1. HeroShowcase — full-screen crossfading Kashmir slideshow
 *   2. MainTools    — EXACTLY 3 tools (Escrow, Live Mandi Rates, Price Comparison)
 *
 * Portal access (Farmer / Buyer / Kissan / …) is reached from the header's
 * glassmorphic Portal Selector menu — never as cards in the hero.
 */

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
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-emerald-50 via-white to-amber-50 text-slate-900 selection:bg-emerald-200 selection:text-emerald-950">
      <SiteHeader hideSignIn={true} onOpenPortals={() => setPortalModalOpen(true)} />

      {/* GLASSMORPHIC PORTAL SELECTOR */}
      {isPortalModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/25 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setPortalModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Portal selector"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl bg-white/90 text-slate-800 backdrop-blur-xl border border-white rounded-3xl shadow-xl overflow-hidden relative max-h-[90vh] overflow-y-auto"
          >
            {/* Khatamband corner accents */}
            <div className="absolute top-0 left-0 w-24 h-24 border-t-2 border-l-2 border-[#D4AF37]/60 rounded-tl-3xl pointer-events-none" />
            <div className="absolute top-0 right-0 w-24 h-24 border-t-2 border-r-2 border-[#D4AF37]/60 rounded-tr-3xl pointer-events-none" />
            
            <button 
              onClick={() => setPortalModalOpen(false)}
              className="absolute top-5 right-5 p-2.5 text-amber-800 hover:text-amber-950 bg-white border border-slate-200 hover:border-[#D4AF37] rounded-full transition-all z-20 shadow-lg"
              aria-label="Close portal selector"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="pt-10 pb-6 px-8 text-center relative z-10">
              <div className="flex items-center justify-center gap-3 mb-2">
                <ChinarLeaf className="w-7 h-7" color="#D4AF37" />
                <span className="text-[#F4C77B] tracking-[0.25em] text-xs uppercase font-serif font-bold">Kashroot Gateway</span>
                <ChinarLeaf className="w-7 h-7 rotate-180" color="#D4AF37" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-serif font-extrabold text-slate-900 tracking-wide">
                Choose Your Portal
              </h2>
              <p className="text-slate-600 text-sm mt-1 font-light">Access your dedicated trade portal or management dashboard</p>
              <KhatambandBorder />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 p-8 pt-2">
              {[
                { title: 'Farmer Portal', desc: 'Manage orchards, crops & direct mandi listings.', href: '/farmer/login', icon: Sprout, tone: 'border-[#4ADE80]/40', iconColor: '#4ADE80' },
                { title: 'Buyer Portal', desc: 'Direct sourcing of authenticated Kashmiri produce.', href: '/buyer/login', icon: Store, tone: 'border-[#F4C77B]/40', iconColor: '#F4C77B' },
                { title: 'Seller Portal', desc: 'Manage verified listings, stock and supplier offers.', href: '/seller/login', icon: Store, tone: 'border-[#F4C77B]/40', iconColor: '#B45309' },
                { title: 'Kissan Tools', desc: 'Orchard equipment, sprayers & horti supplies.', href: '/login/kissan-tools', icon: Tractor, tone: 'border-[#F87171]/40', iconColor: '#F87171' },
                { title: 'Rental Marketplace', desc: 'Cold storage space, tractors & pruning gear.', href: '/login/rental', icon: Store, tone: 'border-[#F4C77B]/40', iconColor: '#F4C77B' },
                { title: 'Admin Governance', desc: 'Quality audit, escrow verification & KYC.', href: '/login/admin', icon: ShieldCheck, tone: 'border-[#F87171]/40', iconColor: '#F87171' },
                { title: 'Orchard Health', desc: 'Plot risk map, photo diagnosis & spray logs.', href: '/orchard-health', icon: Activity, tone: 'border-[#4ADE80]/40', iconColor: '#4ADE80' },
                { title: 'Season Planner', desc: 'Pruning calendar & profit ROI calculator.', href: '/season-planner', icon: CalendarDays, tone: 'border-[#F87171]/40', iconColor: '#F87171' },
                { title: 'Traceability & Quality', desc: 'Origin scanner, temp log & grade history.', href: '/traceability', icon: QrCode, tone: 'border-[#7DD3FC]/40', iconColor: '#7DD3FC' },
              ].map((item, idx) => (
                <Link 
                  href={item.href} 
                  key={idx} 
                  className={`group relative p-6 rounded-2xl bg-white/80 hover:bg-white border ${item.tone} hover:border-[#D4AF37] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between`}
                >
                  <div>
                    <div className="w-12 h-12 rounded-xl bg-amber-50 border border-slate-200 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <item.icon className="w-6 h-6" style={{ color: item.iconColor }} />
                    </div>
                    <h3 className="text-lg font-serif font-bold text-slate-900 group-hover:text-amber-800 transition-colors flex items-center gap-1.5">
                      {item.title}
                      <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-[#F4C77B]" />
                    </h3>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MAIN */}
      <main id="main-content" className="flex-1">
        <HeroShowcase onEnterPortals={() => setPortalModalOpen(true)} />

        <MainTools />
      </main>

      <SiteFooter />
    </div>
  );
}
