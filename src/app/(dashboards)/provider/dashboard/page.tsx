import { Calendar, Briefcase, MapPin, Search } from 'lucide-react';
import Link from 'next/link';

export default function ProviderDashboardPage() {
  return (
    <main className="kr-container py-6 md:py-10">
      <div className="bg-blue-600 text-blue-50 p-6 md:p-8 mb-8 border-l-8 border-blue-900 shadow-md">
        <h1 className="font-heading text-display text-white mb-2">
          Service Provider Dashboard
        </h1>
        <p className="text-body-lg text-blue-100">
          Manage your rental equipment calendar and service requests.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="kr-card kr-glass-amber kr-pattern-chinar bg-kr-bg-surface flex items-center gap-3 p-4">
          <Calendar className="w-5 h-5 text-kr-text-brand shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Schedule</p>
            <p className="text-caption text-kr-text-secondary">Bookings & availability</p>
          </div>
        </div>
        <div className="kr-card kr-glass-amber kr-pattern-chinar bg-kr-bg-surface flex items-center gap-3 p-4">
          <Briefcase className="w-5 h-5 text-kr-text-brand shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Services</p>
            <p className="text-caption text-kr-text-secondary">Manage offerings</p>
          </div>
        </div>
      </div>
      
      <div className="kr-empty-state bg-kr-bg-surface border border-kr-border-default">
        <Briefcase className="w-10 h-10 text-kr-text-disabled mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">No services active.</p>
        <button className="kr-btn-primary kr-btn-sm">
          Add Rental or Service
        </button>
      </div>
    </main>
  );
}
