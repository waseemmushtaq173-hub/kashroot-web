import { FlaskConical, ClipboardCheck, AlertTriangle, PackageSearch } from 'lucide-react';
import Link from 'next/link';

export default function DealerDashboardPage() {
  return (
    <main className="kr-container py-6 md:py-10">
      <div className="bg-purple-600 text-purple-50 p-6 md:p-8 mb-8 border-l-8 border-purple-900 shadow-md">
        <h1 className="font-heading text-display text-white mb-2">
          Fertilizer & Pesticide Dealer Dashboard
        </h1>
        <p className="text-body-lg text-purple-100">
          Manage your agrochemical inventory, regulatory compliance, and batch verification codes.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="kr-card bg-white flex items-center gap-3 p-4">
          <FlaskConical className="w-5 h-5 text-purple-600 shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Inventory</p>
            <p className="text-caption text-kr-text-secondary">Stock levels</p>
          </div>
        </div>
        <div className="kr-card bg-white flex items-center gap-3 p-4">
          <ClipboardCheck className="w-5 h-5 text-purple-600 shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Compliance</p>
            <p className="text-caption text-kr-text-secondary">APMC & Licences</p>
          </div>
        </div>
        <Link href="/supplies/tester" className="kr-card bg-white hover:bg-kr-bg-sunken flex items-center gap-3 p-4 transition-colors">
          <PackageSearch className="w-5 h-5 text-purple-600 shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Tester Tool</p>
            <p className="text-caption text-kr-text-secondary">Verify batches</p>
          </div>
        </Link>
      </div>
      
      <div className="kr-empty-state bg-white border border-kr-border-default">
        <AlertTriangle className="w-10 h-10 text-kr-text-disabled mx-auto mb-2" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary font-medium">Compliance Notice</p>
        <p className="text-body-sm text-kr-text-disabled mb-4 max-w-sm mx-auto">
          Ensure all your registered fertilizer batch codes have been uploaded to the central KashRoot registry.
        </p>
        <button className="kr-btn-primary kr-btn-sm bg-purple-600 hover:bg-purple-700 text-white border-none">
          Upload Batch Manifest
        </button>
      </div>
    </main>
  );
}
