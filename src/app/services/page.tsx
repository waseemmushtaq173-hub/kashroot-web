import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { Briefcase, Calendar, Star, MapPin } from 'lucide-react';
import Link from 'next/link';

export default function ServicesMarketplacePage() {
  const MOCK_SERVICES = [
    { id: 's1', name: 'Drone Spraying (Pesticides)', provider: 'Kashmir AgriDrones', rate: 1200, unit: 'per acre', rating: 4.8 },
    { id: 's2', name: 'Soil Health Testing & Analysis', provider: 'SKUAST Lab Network', rate: 800, unit: 'per sample', rating: 4.9 },
    { id: 's3', name: 'Tractor with Operator', provider: 'Amin Rentals', rate: 4500, unit: 'per day', rating: 4.5 },
    { id: 's4', name: 'Apple Pruning Expert', provider: 'Horticulture Specialists', rate: 2500, unit: 'per day', rating: 4.7 }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-kr-bg-page theme-provider">
      <SiteHeader />
      <main id="main-content" className="flex-1 kr-container py-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="font-heading text-display-xl text-kr-text-primary mb-2">
              Agricultural Services
            </h1>
            <p className="text-body-lg text-kr-text-secondary">
              Book skilled labor, agronomists, and equipment rentals on demand.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button className="kr-btn-secondary kr-btn-sm hidden">
              <MapPin className="w-4 h-4" /> Near Me
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {MOCK_SERVICES.map((service) => (
            <div key={service.id} className="kr-card bg-kr-bg-surface flex flex-col p-5 hover:shadow-kr-card-md transition-shadow">
              <div className="bg-kr-bg-sunken h-32 w-full mb-4 flex items-center justify-center text-kr-text-disabled">
                <Briefcase className="w-8 h-8" />
              </div>
              <div className="flex justify-between items-start mb-1">
                <p className="text-caption text-kr-text-secondary font-medium tracking-wide uppercase">{service.provider}</p>
                <div className="flex items-center gap-1 text-kr-text-brand">
                  <Star className="w-3 h-3 fill-current" />
                  <span className="text-caption font-bold text-kr-text-primary">{service.rating}</span>
                </div>
              </div>
              <h3 className="font-heading text-h4 text-kr-text-primary mb-2 line-clamp-2">{service.name}</h3>
              <p className="font-mono text-body-lg font-bold text-kr-text-brand mb-4">
                ₹{service.rate.toLocaleString('en-IN')} <span className="text-body-sm font-sans text-kr-text-secondary">/ {service.unit}</span>
              </p>
              <div className="mt-auto">
                <Link href={`/services/${service.id}`} className="kr-btn-primary kr-btn-sm w-full flex justify-center gap-2">
                  <Calendar className="w-4 h-4" /> Book Schedule
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
