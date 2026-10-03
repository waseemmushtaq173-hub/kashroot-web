import { Calendar, Briefcase, MapPin, Search } from 'lucide-react';
import Link from 'next/link';

export default function ProviderDashboardPage() {
  return (
    <main className="kr-container py-6 md:py-10">
      <h1 className="font-heading text-h1 text-kr-text-primary mb-1">
        Rental & Service Provider Dashboard
      </h1>
      <p className="text-body text-kr-text-secondary mb-6">
        Manage your rental equipment calendar and service requests.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="kr-card bg-kr-bg-surface flex items-center gap-3 p-4">
          <Calendar className="w-5 h-5 text-kr-text-brand shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-kr-text-primary">Schedule</p>
            <p className="text-caption text-kr-text-secondary">Bookings & availability</p>
          </div>
        </div>
        <div className="kr-card bg-kr-bg-surface flex items-center gap-3 p-4">
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
