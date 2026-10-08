'use client';
import { Button } from "@/components/ui/Button";
import { useState } from 'react';
import { Tractor, MapPin, Search, PlusCircle, List, ShieldCheck } from 'lucide-react';
import { PortalShell } from '@/components/layout/PortalShell';

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

  const kpis = [
    { label: "Active Listings", value: "34", trend: "Available near you" },
    { label: "Your Bookings", value: "1", trend: "Pending approval" },
  ];

  const navItems = [
    { label: "Discovery", href: "/rental/dashboard", icon: Search, active: activeTab === 'discovery' },
    { label: "List Equipment", href: "#", icon: PlusCircle, active: activeTab === 'owner' },
    { label: "Ledger", href: "#", icon: List, active: activeTab === 'ledger' },
  ];

  return (
    <PortalShell
      title="Machinery Rental"
      description="Discover available rentals, manage your listings, and track secure handovers."
      theme="kissan"
      kpis={kpis}
      navItems={navItems}
      bgImage="https://images.unsplash.com/photo-1592982537447-6f296d9b3014?auto=format&fit=crop&w=2400&q=80"
    >
      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--primary)]/20 mb-8 overflow-x-auto scrollbar-none">
        <Button
          onClick={() => setActiveTab('discovery')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all kr-focus-ring ${activeTab === 'discovery' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-white/60 hover:text-white hover:bg-white/5'}`}
        >
          <Search className="w-4 h-4" /> Renter Discovery
        </Button>
        <Button
          onClick={() => setActiveTab('owner')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all kr-focus-ring ${activeTab === 'owner' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-white/60 hover:text-white hover:bg-white/5'}`}
        >
          <PlusCircle className="w-4 h-4" /> Owner Panel
        </Button>
        <Button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all kr-focus-ring ${activeTab === 'ledger' ? 'border-[var(--primary)] text-[var(--primary)] bg-[var(--primary)]/5' : 'border-transparent text-white/60 hover:text-white hover:bg-white/5'}`}
        >
          <List className="w-4 h-4" /> Active Bookings
        </Button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'discovery' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3.5 w-5 h-5 text-white/40" />
              <input type="text" placeholder="Search tractors, cold storage, sprayers..." className="w-full pl-10 bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] outline-none transition-all" />
            </div>
            <select className="bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white outline-none">
              <option>All Locations</option>
              <option>Baramulla</option>
              <option>Shopian</option>
              <option>Lassipora</option>
            </select>
            <select className="bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white outline-none">
              <option>All Categories</option>
              <option>Tractor</option>
              <option>Power Weeder</option>
              <option>Cold Storage Space</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {RENTALS.map(rental => (
              <div key={rental.id} className="p-6 rounded-2xl bg-black/30 backdrop-blur-md border border-[var(--primary)]/20 hover:border-[var(--primary)] transition-all shadow-md flex flex-col group">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--primary)]">{rental.category}</span>
                  <span className={`text-xs px-2 py-1 rounded font-bold ${rental.status === 'Available' ? 'bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/50' : 'bg-amber-500/20 text-amber-400 border border-amber-500/50'}`}>
                    {rental.status}
                  </span>
                </div>
                <h3 className="font-bold text-xl text-white mb-3 group-hover:text-[var(--primary)] transition-colors">{rental.title}</h3>
                
                <div className="space-y-2 mb-6">
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <MapPin className="w-4 h-4 text-white/40" /> {rental.location}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/70">
                    <ShieldCheck className="w-4 h-4 text-[var(--primary)]" /> {rental.owner} (Verified)
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between pt-4 border-t border-white/10">
                  <div>
                    <span className="text-lg font-extrabold text-white">{rental.rate}</span>
                    {rental.withOperator && <p className="text-xs text-[var(--primary)] font-medium">+ Operator included</p>}
                  </div>
                  <Button 
                    disabled={rental.status !== 'Available'}
                    onClick={() => alert(`Booking request sent for ${rental.title}. Your authenticated Kissan ID has been securely linked to this request.`)}
                    className="bg-[var(--primary)] hover:brightness-110 text-white font-bold"
                  >
                    Request
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'owner' && (
        <div className="grid lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="lg:col-span-1">
            <div className="p-6 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-sm">
              <h2 className="text-xl font-bold text-white mb-6">List New Equipment</h2>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert('Equipment listed successfully!'); }}>
                <div>
                  <label className="block text-sm font-bold text-white mb-1.5">Category</label>
                  <select className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2 text-white outline-none" required>
                    <option value="" disabled>Select...</option>
                    <option>Tractor</option>
                    <option>Power Weeder</option>
                    <option>Hydraulic Sprayer</option>
                    <option>Cold Storage Space</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-white mb-1.5">Title / Description</label>
                  <input type="text" className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2 text-white outline-none" placeholder="e.g. Mahindra 475 DI" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-white mb-1.5">Rate (₹/day)</label>
                    <input type="text" className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2 text-white outline-none" placeholder="₹" required />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-white mb-1.5">Deposit (₹)</label>
                    <input type="text" className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2 text-white outline-none" placeholder="₹" required />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-white mb-1.5">Location</label>
                  <input type="text" className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-2 text-white outline-none" placeholder="e.g. Sopore" required />
                </div>
                <label className="flex items-center gap-2 text-sm text-white mt-4">
                  <input type="checkbox" className="rounded bg-black/50 border-white/20 text-[var(--primary)]" />
                  Operator included in rate
                </label>
                <Button type="submit" className="bg-[var(--primary)] hover:brightness-110 text-white w-full mt-4 font-bold rounded-xl py-3">Publish Listing</Button>
              </form>
            </div>
          </div>
          
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold text-white">My Listed Machinery</h2>
            <div className="rounded-xl overflow-hidden shadow-sm border border-white/10 bg-black/30 backdrop-blur-md">
              <table className="w-full text-left text-sm">
                <thead className="bg-black/40 border-b border-white/10 text-white/60">
                  <tr>
                    <th className="px-6 py-4 font-medium">Equipment</th>
                    <th className="px-6 py-4 font-medium">Rate</th>
                    <th className="px-6 py-4 font-medium">Status Toggle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="px-6 py-4"><p className="font-medium text-white">Mahindra 475 DI Tractor</p><span className="text-white/50 text-xs">Baramulla</span></td>
                    <td className="px-6 py-4 font-medium text-white/80">₹800/day</td>
                    <td className="px-6 py-4">
                      <select className="bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/50 py-1 px-2 text-sm w-32 rounded font-bold outline-none">
                        <option>Available</option>
                        <option>Rented Out</option>
                        <option>Maintenance</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4"><p className="font-medium text-white">Hydraulic Sprayer</p><span className="text-white/50 text-xs">Baramulla</span></td>
                    <td className="px-6 py-4 font-medium text-white/80">₹300/day</td>
                    <td className="px-6 py-4">
                      <select className="bg-amber-500/20 text-amber-400 border border-amber-500/50 py-1 px-2 text-sm w-32 rounded font-bold outline-none">
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
        <div className="rounded-xl overflow-hidden shadow-sm border border-white/10 bg-black/30 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="px-6 py-5 border-b border-white/10 bg-black/40">
            <h2 className="font-bold text-white text-lg">Strict Rental Audit Ledger</h2>
            <p className="text-sm text-white/60 mt-1">Track custody and handovers between verified Kissan ID holders.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-black/20 border-b border-white/10 text-white/60">
                <tr>
                  <th className="px-6 py-4 font-medium">Tx ID</th>
                  <th className="px-6 py-4 font-medium">Equipment</th>
                  <th className="px-6 py-4 font-medium">Owner Identity</th>
                  <th className="px-6 py-4 font-medium">Renter Identity</th>
                  <th className="px-6 py-4 font-medium">Dates</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {LEDGER.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-mono text-white/40">{tx.id}</td>
                    <td className="px-6 py-4 font-medium text-white">{tx.equipment}</td>
                    <td className="px-6 py-4 text-white/60">{tx.owner}</td>
                    <td className="px-6 py-4 text-white/60">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[var(--primary)]" />
                        {tx.renter}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-white/60">{tx.dates}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded text-xs font-bold border ${
                        tx.status === 'Handed Over / In Use' ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' :
                        tx.status === 'Returned & Inspected' ? 'bg-[var(--primary)]/20 text-[var(--primary)] border-[var(--primary)]/50' :
                        'bg-blue-500/20 text-blue-400 border-blue-500/50'
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
    </PortalShell>
  );
}
