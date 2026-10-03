import { ShoppingBag, Star, Calendar, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function BuyerDashboardPage() {
  return (
    <main className="kr-container py-6 md:py-10">
      <div className="bg-amber-500 text-amber-950 p-6 md:p-8 mb-8 border-l-8 border-amber-700 shadow-md">
        <h1 className="font-heading text-display text-amber-950 mb-2">
          Buyer Dashboard
        </h1>
        <p className="text-body-lg text-amber-900">
          Track your purchases, review farmers, and manage your supply chain.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Link href="/buyer/discover" className="kr-card hover:bg-kr-bg-sunken flex items-center gap-3 p-4 transition-colors">
          <Search className="w-5 h-5 text-kr-text-brand shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Discover</p>
            <p className="text-caption text-kr-text-secondary">Find new produce</p>
          </div>
        </Link>
        <Link href="/buyer/appointments" className="kr-card hover:bg-kr-bg-sunken flex items-center gap-3 p-4 transition-colors">
          <Calendar className="w-5 h-5 text-kr-text-brand shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Appointments</p>
            <p className="text-caption text-kr-text-secondary">Orchard visits</p>
          </div>
        </Link>
        <Link href="/orders" className="kr-card hover:bg-kr-bg-sunken flex items-center gap-3 p-4 transition-colors">
          <ShoppingBag className="w-5 h-5 text-kr-text-brand shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">My Orders</p>
            <p className="text-caption text-kr-text-secondary">Track shipments</p>
          </div>
        </Link>
        <div className="kr-card flex items-center gap-3 p-4">
          <Star className="w-5 h-5 text-kr-text-brand shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Saved Farmers</p>
            <p className="text-caption text-kr-text-secondary">Your trusted network</p>
          </div>
        </div>
      </div>
      
      <div className="kr-empty-state bg-kr-bg-surface border border-kr-border-default">
        <ShoppingBag className="w-10 h-10 text-kr-text-disabled mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">You haven't made any purchases yet.</p>
        <Link href="/buyer/discover" className="kr-btn-primary kr-btn-sm">
          Browse Marketplace
        </Link>
      </div>
    </main>
  );
}

// Needed because we use Lucide Search above but forgot to import it
import { Search } from 'lucide-react';
