'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { Calendar, Briefcase, Clock, ShieldCheck, Check } from 'lucide-react';
import { useState } from 'react';

export default function ServiceDetailsPage({ params }: { params: { id: string } }) {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [isBooked, setIsBooked] = useState(false);

  const handleBooking = () => {
    if (selectedDate && selectedTime) {
      setIsBooked(true);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-kr-bg-page theme-provider">
      <SiteHeader />
      <main className="flex-1 kr-container py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-8">
            <div>
              <p className="text-caption text-kr-text-secondary uppercase tracking-wide mb-1">Service Profile</p>
              <h1 className="font-heading text-display text-kr-text-primary mb-4">Drone Spraying (Pesticides)</h1>
              <div className="flex gap-4 mb-6">
                <span className="kr-badge kr-badge-published">Available</span>
                <span className="text-body-sm text-kr-text-secondary flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-kr-text-brand" /> Verified Provider
                </span>
              </div>
              <p className="text-body-lg text-kr-text-secondary">
                Professional agricultural drone spraying service covering up to 20 acres per day. 
                Saves time, reduces chemical exposure, and ensures uniform crop coverage.
              </p>
            </div>
            
            <div className="kr-card bg-kr-bg-surface p-6">
              <h3 className="font-heading text-h3 text-kr-text-primary mb-4">Service Details</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Briefcase className="w-5 h-5 text-kr-text-brand mt-0.5" />
                  <div>
                    <p className="text-body-sm font-medium text-kr-text-primary">Provider</p>
                    <p className="text-body-sm text-kr-text-secondary">Kashmir AgriDrones</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-kr-text-brand mt-0.5" />
                  <div>
                    <p className="text-body-sm font-medium text-kr-text-primary">Duration</p>
                    <p className="text-body-sm text-kr-text-secondary">Depends on acreage (Approx. 1 acre / 15 mins)</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          <div className="space-y-6">
            <div className="kr-card bg-kr-bg-surface p-6 border-2 border-kr-border-brand shadow-kr-card-lg">
              <h3 className="font-heading text-h3 text-kr-text-primary mb-2">Book Service</h3>
              <p className="font-mono text-display font-bold text-kr-text-primary mb-6">
                ₹1,200 <span className="text-body text-kr-text-secondary font-sans font-normal">/ acre</span>
              </p>

              {isBooked ? (
                <div className="p-4 bg-kr-fill-brand-subtle border border-kr-border-brand text-center">
                  <Check className="w-8 h-8 text-kr-text-brand mx-auto mb-2" />
                  <p className="font-medium text-kr-text-primary">Booking Requested!</p>
                  <p className="text-body-sm text-kr-text-secondary mt-1">The provider will confirm your slot shortly.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-label text-kr-text-primary mb-1">Select Date</label>
                    <input type="date" className="kr-input w-full" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-label text-kr-text-primary mb-1">Select Time Slot</label>
                    <select className="kr-input w-full" value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)}>
                      <option value="">Choose a time...</option>
                      <option value="morning">Morning (8 AM - 12 PM)</option>
                      <option value="afternoon">Afternoon (1 PM - 5 PM)</option>
                    </select>
                  </div>
                  <button 
                    className="kr-btn-primary w-full flex justify-center gap-2 mt-4" 
                    onClick={handleBooking}
                    disabled={!selectedDate || !selectedTime}
                  >
                    <Calendar className="w-4 h-4" /> Request Booking
                  </button>
                  <p className="text-caption text-center text-kr-text-secondary">You won&apos;t be charged yet.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
