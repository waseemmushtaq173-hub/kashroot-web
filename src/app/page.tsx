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
  X
} from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1715457573748-8e8a70b2c1be?auto=format&fit=crop&w=2400&q=80';

export default function Home() {
  const [isPortalModalOpen, setPortalModalOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-transparent font-sans selection:bg-[#D4AF37]/30">
      <SiteHeader hideSignIn={true} />

      {/* PORTAL SELECTION MODAL */}
      {isPortalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05130e]/80 backdrop-blur-md">
          <div className="w-full max-w-4xl bg-[#0a0e1a]/90 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay backdrop-blur-md border border-[#D4AF37]/20 rounded-2xl shadow-[0_0_30px_rgba(212,175,55,0.1)] overflow-hidden relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setPortalModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-full transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="p-8 text-center bg-gradient-to-b from-[#0E2E20]/50 to-transparent">
              <h2 className="text-3xl font-bold mb-2 text-[#D4AF37] font-serif">Choose Your Portal</h2>
              <p className="text-gray-300">Select your destination to sign in or access tools directly.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-8">
              {/* Farmer Portal - Emerald */}
              <Link href="/farmer/dashboard" className="flex flex-col items-center p-6 bg-gradient-to-b from-[#0E2E20]/80 to-[#0a0e1a]/80 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay backdrop-blur-md border border-[#D4AF37]/20 shadow-[0_0_20px_rgba(212,175,55,0.05)] rounded-xl hover:border-[#D4AF37]/40 hover:shadow-lg transition-all group">
                <Sprout className="w-12 h-12 text-[#D4AF37] group-hover:text-[#E05A3E] mb-4 transition-colors" />
                <h3 className="text-xl font-bold text-[#f3f4f6] mb-1">Farmer Portal</h3>
                <p className="text-sm text-center text-[#D4AF37]/70">Manage orchards, listings & advisory.</p>
              </Link>
              
              {/* Buyer Portal - Amber */}
              <Link href="/buyer/dashboard" className="flex flex-col items-center p-6 bg-gradient-to-b from-[#2E1E0E]/80 to-[#0a0e1a]/80 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay backdrop-blur-md border border-[#D4AF37]/20 shadow-[0_0_20px_rgba(212,175,55,0.05)] rounded-xl hover:border-[#D4AF37]/40 hover:shadow-lg transition-all group">
                <ShoppingCart className="w-12 h-12 text-[#D4AF37] group-hover:text-[#E05A3E] mb-4 transition-colors" />
                <h3 className="text-xl font-bold text-[#f3f4f6] mb-1">Buyer Portal</h3>
                <p className="text-sm text-center text-[#D4AF37]/70">Source authentic Kashmiri produce.</p>
              </Link>
              
              {/* Kissan Tools - Burgundy */}
              <Link href="/kissan-tools/dashboard" className="flex flex-col items-center p-6 bg-gradient-to-b from-[#2D0B12]/80 to-[#0a0e1a]/80 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay backdrop-blur-md border border-[#D4AF37]/20 shadow-[0_0_20px_rgba(212,175,55,0.05)] rounded-xl hover:border-[#D4AF37]/40 hover:shadow-lg transition-all group">
                <Tractor className="w-12 h-12 text-[#D4AF37] group-hover:text-[#E05A3E] mb-4 transition-colors" />
                <h3 className="text-xl font-bold text-[#f3f4f6] mb-1">Kissan Tools</h3>
                <p className="text-sm text-center text-[#D4AF37]/70">Agri & Horti supplies and equipment.</p>
              </Link>
              
              {/* Price Comparison - Emerald */}
              <Link href="/compare-prices" className="flex flex-col items-center p-6 bg-gradient-to-b from-[#0E2E20]/80 to-[#0a0e1a]/80 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay backdrop-blur-md border border-[#D4AF37]/20 shadow-[0_0_20px_rgba(212,175,55,0.05)] rounded-xl hover:border-[#D4AF37]/40 hover:shadow-lg transition-all group">
                <PackageSearch className="w-12 h-12 text-[#D4AF37] group-hover:text-[#E05A3E] mb-4 transition-colors" />
                <h3 className="text-xl font-bold text-[#f3f4f6] mb-1">Price Comparison</h3>
                <p className="text-sm text-center text-[#D4AF37]/70">Compare market rates for farm essentials.</p>
              </Link>
              
              {/* Rental - Amber */}
              <Link href="/rental" className="flex flex-col items-center p-6 bg-gradient-to-b from-[#2E1E0E]/80 to-[#0a0e1a]/80 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay backdrop-blur-md border border-[#D4AF37]/20 shadow-[0_0_20px_rgba(212,175,55,0.05)] rounded-xl hover:border-[#D4AF37]/40 hover:shadow-lg transition-all group">
                <Store className="w-12 h-12 text-[#D4AF37] group-hover:text-[#E05A3E] mb-4 transition-colors" />
                <h3 className="text-xl font-bold text-[#f3f4f6] mb-1">Rental Marketplace</h3>
                <p className="text-sm text-center text-[#D4AF37]/70">Rent machinery, cold storage & equipment.</p>
              </Link>
              
              {/* Admin - Burgundy */}
              <Link href="/admin/dashboard" className="flex flex-col items-center p-6 bg-gradient-to-b from-[#2D0B12]/80 to-[#0a0e1a]/80 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay backdrop-blur-md border border-[#D4AF37]/20 shadow-[0_0_20px_rgba(212,175,55,0.05)] rounded-xl hover:border-[#D4AF37]/40 hover:shadow-lg transition-all group">
                <ShieldCheck className="w-12 h-12 text-[#D4AF37] group-hover:text-[#E05A3E] mb-4 transition-colors" />
                <h3 className="text-xl font-bold text-[#f3f4f6] mb-1">Admin Portal</h3>
                <p className="text-sm text-center text-[#D4AF37]/70">System oversight and user management.</p>
              </Link>
            </div>
          </div>
        </div>
      )}

      <main id="main-content" className="flex-1">
        <section className="relative isolate flex min-h-[40rem] items-center overflow-hidden md:min-h-[45rem]">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-[#05130e] via-[#05130e]/80 to-transparent"
          />

          <div className="container mx-auto px-4 md:px-8 relative w-full py-24 md:py-32 flex flex-col items-start text-left">
            <span className="inline-block py-1 px-3 rounded-full bg-[#D4AF37]/10 backdrop-blur-md border border-[#D4AF37]/30 text-[#D4AF37] text-sm font-semibold tracking-wider mb-6">
              KASHMIR'S PREMIER AGRI-NETWORK
            </span>
            <h1 className="max-w-4xl font-serif font-extrabold text-5xl md:text-7xl text-[#f3f4f6] leading-tight drop-shadow-lg">
              Where Harvest Meets <span className="text-[#E05A3E]">Opportunity.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-xl text-gray-300 font-light leading-relaxed drop-shadow-md">
              Trade authentic Kashmiri produce direct from verified growers. Access vital tools, compare input prices, and track your consignments seamlessly.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full max-w-md">
              <button 
                onClick={() => setPortalModalOpen(true)}
                className="w-full justify-center flex items-center gap-2 bg-[#E05A3E] hover:bg-[#D4AF37] text-white py-4 px-8 rounded-xl font-bold text-lg shadow-[0_0_20px_rgba(224,90,62,0.3)] transition-all hover:scale-[1.02] border border-[#D4AF37]/20"
              >
                Sign In / Choose Portal
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </section>

        {/* Feature Grid — Premium Glassmorphism Section */}
        <section className="py-24 relative overflow-hidden border-t border-[#D4AF37]/10">
          <div className="container mx-auto px-4 md:px-8 relative z-10">
            <div className="bg-[#0a0e1a]/60 backdrop-blur-md border border-[#D4AF37]/20 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay rounded-3xl px-6 py-10 md:p-12 text-center mb-16 shadow-[0_0_30px_rgba(212,175,55,0.05)]">
              <h2 className="font-serif text-4xl text-[#D4AF37] font-bold">An Ecosystem for Growth</h2>
              <p className="mt-4 text-gray-300 text-lg max-w-2xl mx-auto">Everything from seed to sale, built specifically for the needs of Kashmiri agriculture with authentic papier-mâché inspired design.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Card 1 - Emerald */}
              <Link href="/escrow" className="bg-gradient-to-b from-[#0E2E20]/80 to-[#0a0e1a]/80 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay backdrop-blur-md border border-[#D4AF37]/20 shadow-[0_0_20px_rgba(212,175,55,0.05)] block p-8 rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(212,175,55,0.15)] group">
                <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-6 bg-[#0a0e1a]/50 border border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.1)]">
                  <ShieldCheck className="w-8 h-8 text-[#D4AF37]" />
                </div>
                <h3 className="text-2xl font-bold text-[#f3f4f6] mb-3 group-hover:text-[#D4AF37] transition-colors">Secure Escrow</h3>
                <p className="text-gray-400 leading-relaxed text-base">Funds held safely until consignments are verified, ensuring trust across the valley.</p>
              </Link>

              {/* Card 2 - Burgundy */}
              <Link href="/mandi-weather" className="bg-gradient-to-b from-[#2D0B12]/80 to-[#0a0e1a]/80 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay backdrop-blur-md border border-[#D4AF37]/20 shadow-[0_0_20px_rgba(212,175,55,0.05)] block p-8 rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(212,175,55,0.15)] group">
                <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-6 bg-[#0a0e1a]/50 border border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.1)]">
                  <Store className="w-8 h-8 text-[#D4AF37]" />
                </div>
                <h3 className="text-2xl font-bold text-[#f3f4f6] mb-3 group-hover:text-[#D4AF37] transition-colors">Live Mandi Sync</h3>
                <p className="text-gray-400 leading-relaxed text-base">Real-time agricultural rates from Sopore, Shopian, and Azadpur wholesale markets.</p>
              </Link>

              {/* Card 3 - Amber */}
              <Link href="/compare-prices" className="bg-gradient-to-b from-[#2E1E0E]/80 to-[#0a0e1a]/80 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')] bg-blend-overlay backdrop-blur-md border border-[#D4AF37]/20 shadow-[0_0_20px_rgba(212,175,55,0.05)] block p-8 rounded-2xl cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_0_30px_rgba(212,175,55,0.15)] group">
                <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-6 bg-[#0a0e1a]/50 border border-[#D4AF37]/30 shadow-[0_0_15px_rgba(212,175,55,0.1)]">
                  <PackageSearch className="w-8 h-8 text-[#D4AF37]" />
                </div>
                <h3 className="text-2xl font-bold text-[#f3f4f6] mb-3 group-hover:text-[#D4AF37] transition-colors">Price Comparison</h3>
                <p className="text-gray-400 leading-relaxed text-base">Compare current market rates for essential farming inputs, tools, and heavy machinery.</p>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}