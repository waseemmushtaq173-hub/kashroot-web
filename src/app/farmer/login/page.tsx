import React from 'react';
import Link from 'next/link';

export default function FarmerLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1595815771614-ade9d652a65d?auto=format&fit=crop&q=80')] bg-cover bg-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md p-8 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Grower Portal</h1>
          <p className="text-white/80">Welcome back, Kissan! Sign in to manage your harvest and listings.</p>
        </div>
        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/90 mb-1">Mobile Number</label>
            <input type="tel" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-green-400 focus:ring-1 focus:ring-green-400 focus:outline-none" placeholder="+91 XXXXX XXXXX" />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/90 mb-1">Password / OTP</label>
            <input type="password" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:border-green-400 focus:ring-1 focus:ring-green-400 focus:outline-none" placeholder="Enter password or OTP" />
          </div>
          <button type="button" className="w-full py-3 mt-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold transition-colors">
            Sign In to Farm
          </button>
        </form>
        <p className="text-center text-sm text-white/60 mt-6">
          <Link href="/" className="hover:text-white transition-colors">← Back to Gateway</Link>
        </p>
      </div>
    </div>
  );
}
