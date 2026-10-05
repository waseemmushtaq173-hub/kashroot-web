'use client';

import type { Metadata } from 'next';
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
    <div className="flex min-h-screen flex-col bg-[#F9F7F1]">
      <SiteHeader />

      {/* PORTAL SELECTION MODAL */}
      {isPortalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1B4332]/80 backdrop-blur-sm">
          <div className="bg-[#F9F7F1] w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setPortalModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-[#1B4332] hover:bg-[#1B4332]/10 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="p-8 text-center bg-[#1B4332] text-white">
              <h2 className="font-heading text-3xl font-bold mb-2">Choose Your Portal</h2>
              <p className="text-white/80">Select your destination to sign in or access tools directly.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-8">
              <Link href="/farmer/dashboard" className="flex flex-col items-center p-6 bg-white border-2 border-[#1B4332]/10 rounded-xl hover:border-[#E76F51] hover:shadow-lg transition-all group">
                <Sprout className="w-12 h-12 text-[#1B4332] group-hover:text-[#E76F51] mb-4 transition-colors" />
                <h3 className="font-heading text-xl font-bold text-[#1B4332] mb-1">Farmer Portal</h3>
                <p className="text-sm text-center text-gray-600">Manage orchards, listings & advisory.</p>
              </Link>
              
              <Link href="/buyer/dashboard" className="flex flex-col items-center p-6 bg-white border-2 border-[#1B4332]/10 rounded-xl hover:border-[#E76F51] hover:shadow-lg transition-all group">
                <ShoppingCart className="w-12 h-12 text-[#1B4332] group-hover:text-[#E76F51] mb-4 transition-colors" />
                <h3 className="font-heading text-xl font-bold text-[#1B4332] mb-1">Buyer Portal</h3>
                <p className="text-sm text-center text-gray-600">Source authentic Kashmiri produce.</p>
              </Link>
              
              <Link href="/kissan-tools/dashboard" className="flex flex-col items-center p-6 bg-white border-2 border-[#1B4332]/10 rounded-xl hover:border-[#E76F51] hover:shadow-lg transition-all group">
                <Tractor className="w-12 h-12 text-[#1B4332] group-hover:text-[#E76F51] mb-4 transition-colors" />
                <h3 className="font-heading text-xl font-bold text-[#1B4332] mb-1">Kissan Tools</h3>
                <p className="text-sm text-center text-gray-600">Agri & Horti supplies and equipment.</p>
              </Link>
              
              <Link href="/compare-prices" className="flex flex-col items-center p-6 bg-white border-2 border-[#1B4332]/10 rounded-xl hover:border-[#E76F51] hover:shadow-lg transition-all group">
                <PackageSearch className="w-12 h-12 text-[#1B4332] group-hover:text-[#E76F51] mb-4 transition-colors" />
                <h3 className="font-heading text-xl font-bold text-[#1B4332] mb-1">Price Comparison</h3>
                <p className="text-sm text-center text-gray-600">Compare market rates for farm essentials.</p>
              </Link>
              
              <Link href="/rental" className="flex flex-col items-center p-6 bg-white border-2 border-[#1B4332]/10 rounded-xl hover:border-[#E76F51] hover:shadow-lg transition-all group">
                <Store className="w-12 h-12 text-[#1B4332] group-hover:text-[#E76F51] mb-4 transition-colors" />
                <h3 className="font-heading text-xl font-bold text-[#1B4332] mb-1">Rental Marketplace</h3>
                <p className="text-sm text-center text-gray-600">Rent machinery, cold storage & equipment.</p>
              </Link>
              
              <Link href="/admin/dashboard" className="flex flex-col items-center p-6 bg-white border-2 border-[#1B4332]/10 rounded-xl hover:border-[#E76F51] hover:shadow-lg transition-all group">
                <ShieldCheck className="w-12 h-12 text-[#1B4332] group-hover:text-[#E76F51] mb-4 transition-colors" />
                <h3 className="font-heading text-xl font-bold text-[#1B4332] mb-1">Admin Portal</h3>
                <p className="text-sm text-center text-gray-600">System oversight and user management.</p>
              </Link>
            </div>
          </div>
        </div>
      )}

      <main id="main-content" className="flex-1">
        <section className="relative isolate flex min-h-[40rem] items-center overflow-hidden md:min-h-[45rem]">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[#1B4332] bg-cover bg-center"
            style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-[#1B4332]/95 via-[#1B4332]/80 to-transparent"
          />

          <div className="kr-container relative w-full py-24 md:py-32 flex flex-col items-start text-left">
            <span className="inline-block py-1 px-3 rounded-full bg-[#D4A373]/20 border border-[#D4A373]/50 text-[#D4A373] text-sm font-semibold tracking-wider mb-6">
              KASHMIR'S PREMIER AGRI-NETWORK
            </span>
            <h1 className="max-w-4xl font-heading font-extrabold text-5xl md:text-7xl text-white leading-tight drop-shadow-lg">
              Where Harvest Meets <span className="text-[#E76F51]">Opportunity.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-xl text-white/90 font-light leading-relaxed drop-shadow-md">
              Trade authentic Kashmiri produce direct from verified growers. Access vital tools, compare input prices, and track your consignments seamlessly.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full max-w-md">
              <button 
                onClick={() => setPortalModalOpen(true)}
                className="w-full justify-center flex items-center gap-2 bg-[#E76F51] hover:bg-[#D4A373] text-white py-4 px-8 rounded-xl font-bold text-lg shadow-xl shadow-[#E76F51]/20 transition-all hover:scale-[1.02]"
              >
                Sign In / Choose Portal
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </section>

        {/* Feature Grid with rich aesthetic */}
        <section className="py-20 bg-[#F9F7F1] relative overflow-hidden">
          {/* Subtle Chinar Motif Background */}
          <div className="absolute top-0 right-0 opacity-5 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
            <svg width="600" height="600" viewBox="0 0 24 24" fill="none" stroke="#1B4332" strokeWidth="0.5">
              <path d="M12 2L9 8h6L12 2z M12 22l3-6H9l3 6z M2 12l6-3v6L2 12z M22 12l-6-3v6l6-3z M6.5 6.5L10 10V6H6.5z M17.5 6.5L14 10V6h3.5z M6.5 17.5L10 14v4H6.5z M17.5 17.5L14 14v4h3.5z" />
            </svg>
          </div>
          
          <div className="kr-container relative">
            <div className="text-center mb-16">
              <h2 className="font-heading text-4xl text-[#1B4332] font-bold">An Ecosystem for Growth</h2>
              <p className="mt-4 text-gray-600 text-lg max-w-2xl mx-auto">Everything from seed to sale, built specifically for the needs of Kashmiri agriculture.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { title: 'Secure Escrow', desc: 'Funds held safely until consignments are verified.', icon: ShieldCheck },
                { title: 'Live Mandi Sync', desc: 'Real-time rates from Sopore, Shopian, and Azadpur.', icon: Store },
                { title: 'Equipment Rental', desc: 'Rent machinery and storage directly from local owners.', icon: Tractor },
              ].map((feature, i) => (
                <div key={i} className="bg-white p-8 rounded-2xl shadow-sm border border-[#1B4332]/10 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <div className="w-14 h-14 bg-[#1B4332]/5 rounded-xl flex items-center justify-center mb-6">
                    <feature.icon className="w-7 h-7 text-[#E76F51]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#1B4332] mb-3">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
