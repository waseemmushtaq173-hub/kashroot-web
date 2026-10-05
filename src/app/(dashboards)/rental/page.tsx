'use client';

import { Tractor, Calendar, MapPin, Search } from 'lucide-react';

const RENTALS = [
  {
    title: "Mahindra 475 DI Tractor",
    owner: "Zahoor Ahmad",
    location: "Baramulla",
    rate: "₹800 / day",
    status: "Available",
    type: "Machinery"
  },
  {
    title: "Cold Storage Space (100 Boxes)",
    owner: "Valley Fresh Storage",
    location: "Lassipora",
    rate: "₹15 / box / month",
    status: "Available",
    type: "Storage"
  },
  {
    title: "Heavy Duty Power Weeder",
    owner: "Farooq Agri Services",
    location: "Shopian",
    rate: "₹400 / day",
    status: "Booked until Friday",
    type: "Equipment"
  }
];

export default function RentalMarketplacePage() {
  return (
    <main className="kr-container py-10 flex-1">
      <div className="bg-[#E76F51] text-white p-8 md:p-10 rounded-2xl mb-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
          <Tractor className="w-96 h-96" />
        </div>
        <h1 className="font-heading text-4xl font-bold mb-3 relative z-10">Agricultural Rental Hub</h1>
        <p className="text-xl text-white/90 max-w-2xl font-light relative z-10">
          List your idle machinery for rent, or find heavy equipment and cold storage space available nearby.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search tractors, cold storage, sprayers..." 
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#E76F51] focus:border-[#E76F51] outline-none transition-shadow"
          />
        </div>
        <select className="px-4 py-3 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-[#E76F51] outline-none">
          <option>All Locations</option>
          <option>Baramulla</option>
          <option>Shopian</option>
          <option>Lassipora</option>
        </select>
        <button className="bg-[#1B4332] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#1B4332]/90 transition-colors shadow-lg">
          List an Item
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {RENTALS.map((rental, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-lg transition-all group">
            <div className="h-48 bg-gray-100 flex items-center justify-center border-b border-gray-200 group-hover:bg-gray-200 transition-colors">
              <Tractor className="w-16 h-16 text-gray-400" />
            </div>
            <div className="p-6">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#E76F51]">{rental.type}</span>
                <span className={`text-xs px-2 py-1 rounded font-bold ${rental.status === 'Available' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                  {rental.status}
                </span>
              </div>
              <h2 className="text-xl font-bold text-[#1B4332] mb-4">{rental.title}</h2>
              
              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-gray-400" /> Location: {rental.location}
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4 text-gray-400" /> Owner: {rental.owner}
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <span className="text-lg font-extrabold text-gray-900">{rental.rate}</span>
                <button 
                  disabled={rental.status !== 'Available'} 
                  onClick={() => alert(`Booking request sent for ${rental.title}. Your user ID has been securely linked to this transaction.`)}
                  className="bg-[#E76F51] hover:bg-[#D4A373] disabled:opacity-50 disabled:hover:bg-[#E76F51] text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Book Now
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
