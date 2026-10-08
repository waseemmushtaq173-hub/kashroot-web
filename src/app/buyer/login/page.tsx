import React from 'react';
import Link from 'next/link';

export default function BuyerLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1566323420067-2713f019f206?auto=format&fit=crop&q=80')] bg-cover bg-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md p-8 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Buyer Portal</h1>
          <p className="text-white/80">Source premium Kashmiri produce directly from the source.</p>
        </div>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/90 mb-1">Email or Corporate ID</label>
            <input type="text" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-[#F4C77B] focus:ring-1 focus:ring-[#F4C77B] focus:outline-none" placeholder="buyer@company.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/90 mb-1">Password</label>
            <input type="password" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-[#F4C77B] focus:ring-1 focus:ring-[#F4C77B] focus:outline-none" placeholder="Enter secure password" />
          </div>
          <button type="button" className="w-full py-3 mt-4 rounded-xl bg-[#F4C77B] hover:bg-[#e0b466] text-gray-900 font-bold transition-colors">
            Access Market
          </button>
        </form>
        <p className="text-center text-sm text-white/60 mt-6">
          <Link href="/" className="hover:text-white transition-colors">← Back to Gateway</Link>
        </p>
      </div>
    </div>
  );
}
