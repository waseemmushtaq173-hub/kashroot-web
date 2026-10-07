import { ShoppingBag, Star, Calendar, Search, Truck, FileText } from 'lucide-react';
import Link from 'next/link';

export default function BuyerDashboardPage() {
  return (
    <main className="kr-container py-6 md:py-10">
      <div className="kr-hero-premium kr-pattern-chinar p-8 md:p-10 mb-8 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
          <ShoppingBag className="w-96 h-96" />
        </div>
        <h1 className="font-heading text-4xl md:text-5xl font-bold mb-3 relative z-10">
          Buyer Portal
        </h1>
        <p className="text-xl text-amber-50 max-w-2xl relative z-10 font-light">
          Manage your active purchase inquiries, supplier quotes, and track legitimate consignments.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Link href="/buyer/discover" className="kr-glass p-6 rounded-2xl border border-kr-border-default hover:border-amber-500 hover:shadow-lg transition-all group">
          <div className="w-12 h-12 bg-kr-fill-brand-subtle text-amber-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Search className="w-6 h-6" />
          </div>
          <p className="font-bold text-kr-text-primary text-lg">Marketplace</p>
          <p className="text-sm text-kr-text-secondary">Source authentic produce</p>
        </Link>
        <Link href="/buyer/appointments" className="kr-glass p-6 rounded-2xl border border-kr-border-default hover:border-amber-500 hover:shadow-lg transition-all group">
          <div className="w-12 h-12 bg-kr-fill-brand-subtle text-amber-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <FileText className="w-6 h-6" />
          </div>
          <p className="font-bold text-kr-text-primary text-lg">Purchase Inquiries</p>
          <p className="text-sm text-kr-text-secondary">Active quotes & negotiations</p>
        </Link>
        <Link href="/tracking" className="kr-glass p-6 rounded-2xl border border-kr-border-default hover:border-amber-500 hover:shadow-lg transition-all group">
          <div className="w-12 h-12 bg-kr-fill-brand-subtle text-amber-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Truck className="w-6 h-6" />
          </div>
          <p className="font-bold text-kr-text-primary text-lg">Consignment Tracking</p>
          <p className="text-sm text-kr-text-secondary">Live logistics monitoring</p>
        </Link>
        <div className="kr-glass p-6 rounded-2xl border border-kr-border-default hover:border-amber-500 hover:shadow-lg transition-all group cursor-pointer">
          <div className="w-12 h-12 bg-kr-fill-brand-subtle text-amber-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Star className="w-6 h-6" />
          </div>
          <p className="font-bold text-kr-text-primary text-lg">Saved Suppliers</p>
          <p className="text-sm text-kr-text-secondary">Your trusted farmer network</p>
        </div>
      </div>
      
      <div className="kr-glass rounded-2xl border border-kr-border-default p-10 text-center shadow-sm">
        <ShoppingBag className="w-16 h-16 text-kr-text-disabled mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-kr-text-primary mb-2">No Active Consignments</h3>
        <p className="text-kr-text-secondary mb-6 max-w-md mx-auto">You don't have any active purchases or pending shipments at the moment.</p>
        <Link href="/buyer/discover" className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold px-8 py-3 rounded-lg transition-colors">
          Browse Marketplace Produce
        </Link>
      </div>
    </main>
  );
}
