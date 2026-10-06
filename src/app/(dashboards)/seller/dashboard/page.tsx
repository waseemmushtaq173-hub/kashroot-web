import { Package, Truck, PenTool, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';

export default function SellerDashboardPage() {
  return (
    <main className="kr-container py-6 md:py-10">
      <div className="bg-orange-800 text-orange-50 p-6 md:p-8 mb-8 border-l-8 border-orange-950 shadow-md">
        <h1 className="font-heading text-display text-white mb-2">
          Hardware Seller Dashboard
        </h1>
        <p className="text-body-lg text-orange-100">
          Manage your tools, machinery inventory, and hardware sales.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="kr-card bg-kr-bg-surface flex items-center gap-3 p-4">
          <LayoutDashboard className="w-5 h-5 text-kr-text-brand shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Overview</p>
            <p className="text-caption text-kr-text-secondary">Sales & performance</p>
          </div>
        </div>
        <div className="kr-card bg-kr-bg-surface flex items-center gap-3 p-4">
          <PenTool className="w-5 h-5 text-kr-text-brand shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Hardware Catalog</p>
            <p className="text-caption text-kr-text-secondary">Add & edit tools</p>
          </div>
        </div>
        <div className="kr-card bg-kr-bg-surface flex items-center gap-3 p-4">
          <Package className="w-5 h-5 text-kr-text-brand shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Orders</p>
            <p className="text-caption text-kr-text-secondary">Manage fulfillment</p>
          </div>
        </div>
      </div>
      
      <div className="kr-empty-state bg-kr-bg-surface border border-kr-border-default mb-8">
        <PenTool className="w-10 h-10 text-kr-text-disabled mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">No hardware listings yet.</p>
        <button className="kr-btn-primary kr-btn-sm">
          List Machinery
        </button>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Payout Settings (Escrow)</h2>
        <p className="text-sm text-gray-600 mb-6">Securely configure your bank details to receive automatic escrow payouts when buyers confirm delivery.</p>
        
        <form className="max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={(e) => { e.preventDefault(); alert("Payout settings updated securely."); }}>
          <div className="col-span-1 md:col-span-2">
            <label className="block text-sm font-bold text-gray-700 mb-1">Account Holder Name</label>
            <input required type="text" className="kr-input w-full" placeholder="As per bank records" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Bank Account Number</label>
            <input required type="password" text-security="disc" className="kr-input w-full" placeholder="••••••••••••" />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">IFSC Code</label>
            <input required type="text" className="kr-input w-full uppercase" placeholder="e.g. SBIN0001234" />
          </div>
          <div className="col-span-1 md:col-span-2">
            <label className="block text-sm font-bold text-gray-700 mb-1">UPI ID (Optional)</label>
            <input type="text" className="kr-input w-full" placeholder="yourname@bank" />
          </div>
          <div className="col-span-1 md:col-span-2 mt-2 border-t border-gray-100 pt-6">
            <button type="submit" className="bg-[#1B4332] hover:bg-[#153424] text-white px-6 py-3 rounded-xl font-bold transition-colors">
              Save Payout Configuration
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
