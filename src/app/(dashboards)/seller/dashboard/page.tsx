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
      
      <div className="kr-empty-state bg-kr-bg-surface border border-kr-border-default">
        <PenTool className="w-10 h-10 text-kr-text-disabled mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">No hardware listings yet.</p>
        <button className="kr-btn-primary kr-btn-sm">
          List Machinery
        </button>
      </div>
    </main>
  );
}
