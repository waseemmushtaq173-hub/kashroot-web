'use client';

import { useState } from 'react';
import { Tractor, Calendar, MapPin, Search, PlusCircle, CheckCircle2, List, ShieldCheck } from 'lucide-react';

type Tab = 'discovery' | 'owner' | 'ledger';

const RENTALS = [
  { id: 1, title: 'Mahindra 475 DI Tractor', category: 'Tractor', owner: 'Zahoor Ahmad', location: 'Baramulla', rate: '₹800/day', status: 'Available', withOperator: true },
  { id: 2, title: 'Cold Storage Space (100 Boxes)', category: 'Cold Storage Space', owner: 'Valley Fresh Storage', location: 'Lassipora', rate: '₹15/box/month', status: 'Available', withOperator: false },
  { id: 3, title: 'Heavy Duty Power Weeder', category: 'Power Weeder', owner: 'Farooq Agri', location: 'Shopian', rate: '₹400/day', status: 'Booked', withOperator: false }
];

const LEDGER = [
  { id: 'RNT-9283', equipment: 'Mahindra 475 DI', owner: 'Zahoor Ahmad (Baramulla)', renter: 'Altaf Lone (K-ID: 8829)', dates: 'Oct 10 - Oct 12', status: 'Handed Over / In Use' },
  { id: 'RNT-1192', equipment: 'Hydraulic Sprayer', owner: 'Zahoor Ahmad (Baramulla)', renter: 'Gulzar Bhat (K-ID: 1102)', dates: 'Oct 08 - Oct 09', status: 'Returned & Inspected' },
  { id: 'RNT-3094', equipment: 'Apple Crates (500)', owner: 'Zahoor Ahmad (Baramulla)', renter: 'Tariq Dar (K-ID: 4401)', dates: 'Oct 15 - Oct 30', status: 'Pending Approval' }
];

export default function RentalDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('discovery');

  return (
    <main className="kr-container py-6 md:py-10">
      <div className="bg-[#E76F51] text-white p-6 md:p-8 mb-8 border-l-8 border-[#1B4332] shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
          <Tractor className="w-64 h-64" />
        </div>
        <h1 className="font-heading text-4xl text-white mb-2 relative z-10">
          Equipment & Machinery Rental
        </h1>
        <p className="text-xl text-white/90 relative z-10">
          Discover available rentals, manage your listings, and track secure handovers.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 mb-8 overflow-x-auto">
        <button
          onClick={() => setActiveTab('discovery')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${activeTab === 'discovery' ? 'border-[#E76F51] text-[#E76F51]' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
        >
          <Search className="w-5 h-5" /> Renter Discovery Portal
        </button>
        <button
          onClick={() => setActiveTab('owner')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${activeTab === 'owner' ? 'border-[#E76F51] text-[#E76F51]' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
        >
          <PlusCircle className="w-5 h-5" /> Rent Out Machinery (Owner Panel)
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${activeTab === 'ledger' ? 'border-[#E76F51] text-[#E76F51]' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
        >
          <List className="w-5 h-5" /> Active Bookings & Handover
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'discovery' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
              <input type="text" placeholder="Search tractors, cold storage, sprayers..." className="kr-input w-full pl-10" />
            </div>
            <select className="kr-input">
              <option>All Locations</option>
              <option>Baramulla</option>
              <option>Shopian</option>
              <option>Lassipora</option>
            </select>
            <select className="kr-input">
              <option>All Categories</option>
              <option>Tractor</option>
              <option>Power Weeder</option>
              <option>Cold Storage Space</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {RENTALS.map(rental => (
              <div key={rental.id} className="kr-card flex flex-col group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#E76F51]">{rental.category}</span>
                  <span className={`text-xs px-2 py-1 rounded font-bold ${rental.status === 'Available' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    {rental.status}
                  </span>
                </div>
                <h3 className="font-bold text-xl text-[#1B4332] mb-3">{rental.title}</h3>
                
                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400" /> {rental.location}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <ShieldCheck className="w-4 h-4 text-gray-400" /> {rental.owner} (Verified)
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between pt-4 border-t border-gray-100">
                  <div>
                    <span className="text-lg font-extrabold text-gray-900">{rental.rate}</span>
                    {rental.withOperator && <p className="text-xs text-green-600 font-medium">+ Operator included</p>}
                  </div>
                  <button 
                    disabled={rental.status !== 'Available'}
                    onClick={() => alert(`Booking request sent for ${rental.title}. Your authenticated Kissan ID has been securely linked to this request.`)}
                    className="kr-btn-primary"
                  >
                    Request Booking
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'owner' && (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="kr-card bg-white shadow-sm border-gray-200">
              <h2 className="font-heading text-xl font-bold text-[#1B4332] mb-4">List New Equipment</h2>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert('Equipment listed successfully!'); }}>
                <div>
                  <label className="kr-label">Category</label>
                  <select className="kr-input w-full" required>
                    <option value="" disabled>Select...</option>
                    <option>Tractor</option>
                    <option>Power Weeder</option>
                    <option>Hydraulic Sprayer</option>
                    <option>Apple Crates</option>
                    <option>Cold Storage Space</option>
                  </select>
                </div>
                <div>
                  <label className="kr-label">Title / Description</label>
                  <input type="text" className="kr-input w-full" placeholder="e.g. Mahindra 475 DI" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="kr-label">Rate</label>
                    <input type="text" className="kr-input w-full" placeholder="₹ / day" required />
                  </div>
                  <div>
                    <label className="kr-label">Security Deposit</label>
                    <input type="text" className="kr-input w-full" placeholder="₹" required />
                  </div>
                </div>
                <div>
                  <label className="kr-label">Location (District/Tehsil)</label>
                  <input type="text" className="kr-input w-full" placeholder="e.g. Sopore" required />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="rounded text-[#E76F51] focus:ring-[#E76F51]" />
                  Operator included in rate
                </label>
                <button type="submit" className="kr-btn-primary w-full mt-2">Publish Listing</button>
              </form>
            </div>
          </div>
          
          <div className="lg:col-span-2 space-y-4">
            <h2 className="font-heading text-xl font-bold text-[#1B4332]">My Listed Machinery</h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Equipment</th>
                    <th className="px-4 py-3 font-medium">Rate</th>
                    <th className="px-4 py-3 font-medium">Status Toggle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-4"><p className="font-medium text-gray-900">Mahindra 475 DI Tractor</p>Baramulla</td>
                    <td className="px-4 py-4 font-medium">₹800/day</td>
                    <td className="px-4 py-4">
                      <select className="kr-input py-1 px-2 text-sm w-32 border-green-300 bg-green-50 text-green-800">
                        <option>Available</option>
                        <option>Rented Out</option>
                        <option>Maintenance</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-4"><p className="font-medium text-gray-900">Hydraulic Sprayer</p>Baramulla</td>
                    <td className="px-4 py-4 font-medium">₹300/day</td>
                    <td className="px-4 py-4">
                      <select className="kr-input py-1 px-2 text-sm w-32 border-amber-300 bg-amber-50 text-amber-800">
                        <option>Rented Out</option>
                        <option>Available</option>
                        <option>Maintenance</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-bold text-gray-900">Strict Rental Audit Ledger</h2>
            <p className="text-sm text-gray-500">Track custody and handovers between verified Kissan ID holders.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-6 py-3 font-medium">Tx ID</th>
                  <th className="px-6 py-3 font-medium">Equipment</th>
                  <th className="px-6 py-3 font-medium">Owner Identity</th>
                  <th className="px-6 py-3 font-medium">Renter Identity</th>
                  <th className="px-6 py-3 font-medium">Dates</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {LEDGER.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-mono text-gray-500">{tx.id}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{tx.equipment}</td>
                    <td className="px-6 py-4 text-gray-600">{tx.owner}</td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4 text-green-500" />
                        {tx.renter}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{tx.dates}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        tx.status === 'Handed Over / In Use' ? 'bg-blue-100 text-blue-800' :
                        tx.status === 'Returned & Inspected' ? 'bg-green-100 text-green-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
