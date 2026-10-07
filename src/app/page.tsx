'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  Tractor,
  Sprout,
  Store,
  ShoppingCart,
  ShieldCheck,
  PackageSearch,
  X,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';

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
        <section className="relative isolate min-h-[44rem] md:min-h-[48rem] flex items-center overflow-hidden border-b border-[#D4AF37]/30">
          {/* Authentic Dal Lake / Shikara Backdrop */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center scale-105"
            style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
          />
          {/* Deep Royal Emerald & Saffron Vignette */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-[#05140D] via-[#071911]/90 to-[#081710]/40"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_20%_40%,rgba(212,175,55,0.12),transparent_70%)]"
          />

          <div className="container mx-auto px-6 md:px-12 relative z-10 py-24 max-w-7xl">
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#0B2418]/90 border border-[#D4AF37]/50 shadow-[0_0_20px_rgba(212,175,55,0.2)] mb-6">
              <ChinarLeaf className="w-4 h-4" color="#D4AF37" />
              <span className="text-[#D4AF37] text-xs font-serif font-bold tracking-[0.2em] uppercase">
                Jammu & Kashmir Premier Agri-Exchange
              </span>
            </div>

            <h1 className="max-w-4xl font-serif text-5xl md:text-7xl font-black text-[#FFFDF8] leading-[1.1] drop-shadow-2xl">
              Where Harvest Meets{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E76F51] via-[#F4A261] to-[#E9C46A] italic">
                Opportunity.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg md:text-xl text-[#F2ECE1]/90 font-sans font-normal leading-relaxed drop-shadow">
              Direct farm-gate trade for Kashmir&apos;s heritage produce—Grade-A Delicious Apples, Pure Saffron, Walnuts, and Almonds. Escrow protected, verified at the source.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full max-w-md">
              <button 
                onClick={() => setPortalModalOpen(true)}
                className="group relative inline-flex items-center justify-center gap-3 bg-gradient-to-r from-[#C85A17] via-[#D35400] to-[#E67E22] hover:from-[#D4AF37] hover:to-[#B8972E] text-[#FFF] py-4 px-8 rounded-2xl font-serif font-bold text-lg shadow-[0_10px_35px_rgba(200,90,23,0.4)] border border-[#FFD79E]/40 transition-all duration-300 hover:scale-[1.03]"
              >
                <span>Enter Kashroot Portals</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform" />
              </button>
            </div>
          </div>
        </section>

        {/* AN ECOSYSTEM FOR GROWTH - Kashmiri Heritage Section */}
        <section className="relative py-28 px-6 bg-gradient-to-b from-[#063b27] via-[#094731] to-[#04281a]">
          
          {/* Subtle Golden Chinar watermark in the corner */}
          <div className="absolute top-8 right-8 opacity-10 pointer-events-none">
            <ChinarLeaf className="w-96 h-96" color="#D4AF37" />
          </div>

          <div className="container mx-auto max-w-6xl relative z-10">
            {/* Header with authentic carved border */}
            <div className="text-center max-w-3xl mx-auto mb-20">
              <div className="flex items-center justify-center gap-3 mb-3">
                <ChinarLeaf className="w-5 h-5" color="#D4AF37" />
                <span className="text-[#D4AF37] font-serif text-xs font-bold uppercase tracking-[0.3em]">Direct From The Valley</span>
                <ChinarLeaf className="w-5 h-5 rotate-180" color="#D4AF37" />
              </div>
              <h2 className="text-4xl sm:text-5xl font-serif font-black text-[#FFFDF8] tracking-tight mb-4">
                An Ecosystem for Growth
              </h2>
              <div className="mt-6 flex items-center justify-center gap-2">
                <span className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[#D4AF37]" />
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                <span className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[#D4AF37]" />
              </div>
            </div>

            {/* 3 Premium Heritage Feature Boxes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Box 1: Kashmiri Emerald (Pashmina Forest) */}
              <Link href="/escrow" className="block relative group rounded-3xl p-8 bg-gradient-to-b from-[#0F3524] via-[#092318] to-[#05150E] border-2 border-[#2ECC71]/30 hover:border-[#D4AF37] shadow-[0_15px_40px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-2">
                <div className="absolute top-4 right-4 opacity-20 group-hover:opacity-40 transition-opacity">
                  <ChinarLeaf className="w-12 h-12" color="#2ECC71" />
                </div>
                <div className="w-16 h-16 rounded-2xl bg-[#09291C] border border-[#2ECC71]/50 flex items-center justify-center mb-7 shadow-[0_0_25px_rgba(46,204,113,0.25)]">
                  <ShieldCheck className="w-8 h-8 text-[#4ADE80]" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-[#FFFDF8] mb-3 group-hover:text-[#D4AF37] transition-colors break-words">
                  Secure Escrow
                </h3>
                <p className="text-[#C5BAA8] text-sm leading-relaxed break-words">
                  Consignment payments are locked safely in escrow and disbursed directly to farmers upon digital gate-pass verification at terminal mandis.
                </p>
                <div className="mt-8 pt-4 border-t border-[#D4AF37]/15 flex items-center text-xs font-serif font-bold text-[#D4AF37] tracking-wider uppercase break-words">
                  Verified Trust Protocol →
                </div>
              </Link>

              {/* Box 2: Zaffran Saffron / Burgundy */}
              <Link href="/mandi-weather" className="block relative group rounded-3xl p-8 bg-gradient-to-b from-[#3B141C] via-[#240A10] to-[#120408] border-2 border-[#E76F51]/30 hover:border-[#D4AF37] shadow-[0_15px_40px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-2">
                <div className="absolute top-4 right-4 opacity-20 group-hover:opacity-40 transition-opacity">
                  <ChinarLeaf className="w-12 h-12" color="#E76F51" />
                </div>
                <div className="w-16 h-16 rounded-2xl bg-[#290B12] border border-[#E76F51]/50 flex items-center justify-center mb-7 shadow-[0_0_25px_rgba(231,111,81,0.25)]">
                  <Store className="w-8 h-8 text-[#FB7185]" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-[#FFFDF8] mb-3 group-hover:text-[#D4AF37] transition-colors break-words">
                  Live Mandi Sync
                </h3>
                <p className="text-[#C5BAA8] text-sm leading-relaxed break-words">
                  Real-time price feeds directly from Fruit Mandi Sopore, Parimpora Srinagar, Shopian, and Azadpur Delhi with daily trend projections.
                </p>
                <div className="mt-8 pt-4 border-t border-[#D4AF37]/15 flex items-center text-xs font-serif font-bold text-[#D4AF37] tracking-wider uppercase break-words">
                  Live Daily Rates →
                </div>
              </Link>

              {/* Box 3: Kashmiri Walnut Amber */}
              <Link href="/compare-prices" className="block relative group rounded-3xl p-8 bg-gradient-to-b from-[#3A2610] via-[#221609] to-[#120B04] border-2 border-[#D4AF37]/30 hover:border-[#D4AF37] shadow-[0_15px_40px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-2">
                <div className="absolute top-4 right-4 opacity-20 group-hover:opacity-40 transition-opacity">
                  <ChinarLeaf className="w-12 h-12" color="#D4AF37" />
                </div>
                <div className="w-16 h-16 rounded-2xl bg-[#261807] border border-[#D4AF37]/50 flex items-center justify-center mb-7 shadow-[0_0_25px_rgba(212,175,55,0.25)]">
                  <PackageSearch className="w-8 h-8 text-[#FBBF24]" />
                </div>
                <h3 className="font-serif text-2xl font-bold text-[#FFFDF8] mb-3 group-hover:text-[#D4AF37] transition-colors break-words">
                  Input Price Match
                </h3>
                <p className="text-[#C5BAA8] text-sm leading-relaxed break-words">
                  Compare rates on genuine fungicides, orchard spray oils, pruning shears, and universal cardboard apple packaging boxes.
                </p>
                <div className="mt-8 pt-4 border-t border-[#D4AF37]/15 flex items-center text-xs font-serif font-bold text-[#D4AF37] tracking-wider uppercase break-words">
                  Orchard Essentials →
                </div>
              </Link>

            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}