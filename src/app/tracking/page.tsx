'use client';

import { useState } from 'react';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { Truck, MapPin, Package, Clock, Search, Navigation } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function TrackingPortalPage() {
  const [vehicleNo, setVehicleNo] = useState('');
  const [tracking, setTracking] = useState(false);

  const handleTrack = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleNo.trim()) return;
    setTracking(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-kr-bg-page">
      <SiteHeader />
      <main className="flex-1 kr-container py-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Truck className="w-8 h-8 text-kr-text-brand" />
            <h1 className="font-heading text-h1 text-kr-text-primary">Mandi Transit Dispatch Live Tracking</h1>
          </div>
          <p className="text-body-lg text-kr-text-secondary mb-8">
            Track your high-value cargo (apples, walnuts, saffron) in real-time as it travels to APMC Mandis across India.
          </p>

          <form onSubmit={handleTrack} className="flex flex-col sm:flex-row gap-3 mb-10">
            <input
              type="text"
              placeholder="Enter Vehicle Registration No (e.g. JK01-AB-1234)"
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
              className="kr-input flex-1 uppercase"
              required
            />
            <button type="submit" className="kr-btn-primary flex justify-center items-center gap-2">
              <Search className="w-5 h-5" /> Track Vehicle
            </button>
          </form>

          {tracking && (
            <div className="kr-glass rounded-xl shadow-md border border-kr-border-default overflow-hidden">
              {/* Top status bar */}
              <div className="bg-kr-text-brand text-white p-4 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="kr-glass/20 px-3 py-1 rounded text-sm font-semibold tracking-wide">EN ROUTE</span>
                  <span className="font-medium text-lg uppercase">{vehicleNo}</span>
                </div>
                <div className="flex gap-4 text-sm opacity-90">
                  <span className="flex items-center gap-1"><Package className="w-4 h-4" /> Grade-A Apples</span>
                  <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> Azadpur Mandi, Delhi</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3">
                {/* Left panel: Info */}
                <div className="p-6 border-r border-kr-border-default bg-kr-bg-sunken space-y-6">
                  <div>
                    <p className="text-caption text-kr-text-secondary uppercase mb-1">Driver Details</p>
                    <p className="font-medium text-kr-text-primary">Tariq Ahmed</p>
                    <p className="text-sm text-kr-text-secondary">+91 98765 43210</p>
                  </div>
                  <div>
                    <p className="text-caption text-kr-text-secondary uppercase mb-1">Owner / Transporter</p>
                    <p className="font-medium text-kr-text-primary">Kashmir Valley Logistics</p>
                  </div>
                  <div>
                    <p className="text-caption text-kr-text-secondary uppercase mb-1">Route Info</p>
                    <div className="space-y-3 mt-3">
                      <div className="flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-kr-text-disabled mt-1.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Sopore Fruit Mandi (Origin)</p>
                          <p className="text-xs text-kr-text-secondary">Dep: Oct 02, 18:30 IST</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mt-1.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-emerald-700">Near Udhampur (Current)</p>
                          <p className="text-xs text-kr-text-secondary">Updated 2 mins ago</p>
                        </div>
                      </div>
                      <div className="flex gap-3 opacity-50">
                        <div className="w-2 h-2 rounded-full border-2 border-kr-text-disabled mt-1.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">Azadpur Mandi, Delhi (Dest)</p>
                          <p className="text-xs">Est. Arrival: Oct 04, 04:00 IST</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right panel: Map */}
                <div className="col-span-2 relative bg-kr-bg-sunken min-h-[400px]">
                  {/* Fake map using an iframe to OpenStreetMap */}
                  <iframe 
                    width="100%" 
                    height="100%" 
                    frameBorder="0" 
                    scrolling="no" 
                    marginHeight={0} 
                    marginWidth={0} 
                    src="https://www.openstreetmap.org/export/embed.html?bbox=74.8519%2C32.7093%2C75.2519%2C33.1093&amp;layer=mapnik&amp;marker=32.9093%2C75.0519"
                    className="absolute inset-0 w-full h-full"
                    title="Live Tracking Map"
                  />
                  
                  <div className="absolute top-4 right-4 kr-glass px-3 py-2 rounded-lg shadow-md flex items-center gap-2 text-sm font-medium text-emerald-700 border border-kr-border-default">
                    <Navigation className="w-4 h-4" /> Live GPS Active
                  </div>
                  
                  {/* Status overlay bar at bottom */}
                  <div className="absolute bottom-4 left-4 right-4 kr-glass/95 backdrop-blur px-4 py-3 rounded-lg shadow-lg border border-kr-border-default flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-kr-text-brand" />
                      <div>
                        <p className="text-sm font-medium">Next checkpoint: Lakhanpur Toll</p>
                        <p className="text-xs text-kr-text-secondary">Expected in 3.5 hours</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-kr-text-primary">68 km/h</p>
                      <p className="text-xs text-kr-text-secondary">Current Speed</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
