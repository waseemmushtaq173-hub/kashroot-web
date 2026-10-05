import { BadgeCheck, MapPin, TrendingDown, Clock } from 'lucide-react';

const COMPARISONS = [
  {
    category: "Packaging",
    item: "Apple Corrugated Box (Universal 10kg)",
    dealers: [
      { name: "Kashmir Packaging Co.", location: "Sopore", price: "₹45/box", verified: true, updated: "2 hours ago" },
      { name: "Valley Traders", location: "Shopian", price: "₹48/box", verified: true, updated: "5 hours ago" },
      { name: "Global Corrugates", location: "Lassipora", price: "₹42/box", verified: false, updated: "1 day ago" }
    ]
  },
  {
    category: "Agrochemicals",
    item: "DAP Fertilizer (50kg Bag)",
    dealers: [
      { name: "Zamindar Agri Center", location: "Baramulla", price: "₹1,350", verified: true, updated: "1 hour ago" },
      { name: "Kissan Hub", location: "Pulwama", price: "₹1,365", verified: true, updated: "4 hours ago" },
      { name: "National Fertilizers", location: "Srinagar", price: "₹1,380", verified: true, updated: "2 days ago" }
    ]
  }
];

export default function ComparePricesPage() {
  return (
    <main className="kr-container py-10">
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 text-white p-8 md:p-10 rounded-2xl mb-8 shadow-xl">
        <h1 className="font-heading text-4xl font-bold mb-3">Price Comparison Hub</h1>
        <p className="text-xl text-blue-100 max-w-2xl font-light">
          Compare real-time rates for farm essentials across authorized dealers in your district.
        </p>
      </div>

      <div className="space-y-8">
        {COMPARISONS.map((comp, i) => (
          <section key={i} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-1 block">{comp.category}</span>
                <h2 className="text-xl font-bold text-gray-900">{comp.item}</h2>
              </div>
              <button className="hidden sm:flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <TrendingDown className="w-4 h-4" /> Filter by Lowest Price
              </button>
            </div>
            
            <div className="divide-y divide-gray-100">
              {comp.dealers.map((dealer, j) => (
                <div key={j} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-blue-50/50 transition-colors">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900 text-lg">{dealer.name}</h3>
                      {dealer.verified && (
                        <div title="Verified Dealer">
                          <BadgeCheck className="w-5 h-5 text-green-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {dealer.location}</span>
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Updated {dealer.updated}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end w-full sm:w-auto">
                    <span className="text-2xl font-bold text-[#E76F51]">{dealer.price}</span>
                    <button className="mt-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white px-6 py-2 rounded-lg font-medium text-sm transition-colors w-full sm:w-auto">
                      Contact Dealer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
