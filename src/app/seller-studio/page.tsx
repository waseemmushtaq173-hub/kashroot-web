import Link from 'next/link';
import { DynamicBackdrop } from '@/components/layout/DynamicBackdrop';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { PlusCircle, Search, Edit3, Trash2, ArrowRight } from 'lucide-react';

const mockListings = [
  { id: 'LST-0912', crop: 'Apple', variety: 'Kullu Delicious', grade: 'Premium', price: '₹1200 / Box', status: 'Live', date: 'Oct 07' },
  { id: 'LST-0913', crop: 'Saffron', variety: 'Mongra', grade: 'A++', price: '₹2.5L / Kg', status: 'Draft', date: 'Oct 08' },
  { id: 'LST-0889', crop: 'Walnut', variety: 'Kaghzi', grade: 'Grade A', price: '₹800 / Kg', status: 'Sold Out', date: 'Sep 29' },
];

export default function SellerStudio() {
  return (
    <div className="flex min-h-screen flex-col">
      <DynamicBackdrop />
      <SiteHeader hideSignIn={false} />
      
      <main className="container mx-auto px-6 py-10 relative z-10 flex-1 text-[#F5F2EB]">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif font-black text-[#FFFDF8] drop-shadow-lg">
              Seller Studio
            </h1>
            <p className="text-lg text-[#E2DAC8] mt-2 font-light">Manage your orchard's inventory and live mandi listings.</p>
          </div>
          <Link href="/farmer/dashboard" className="text-[var(--kr-saffron-gold)] hover:text-[var(--kr-chinar-amber)] transition-colors flex items-center gap-2">
            Back to Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Listing Wizard (Left Column) */}
          <div className="lg:col-span-1 space-y-6">
            <div className="p-6 rounded-3xl bg-black/40 backdrop-blur-md border border-[var(--kr-saffron-gold)]/40 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--kr-saffron-gold)] to-[var(--kr-chinar-amber)] opacity-10 rounded-full blur-2xl pointer-events-none" />
              <h2 className="text-2xl font-serif font-bold text-white mb-6 flex items-center gap-2">
                <PlusCircle className="w-6 h-6 text-[var(--kr-saffron-gold)]" /> Create Listing
              </h2>
              
              <form className="space-y-4 relative z-10" onSubmit={(e) => e.preventDefault()}>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Crop Type</label>
                  <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--kr-saffron-gold)] transition-colors">
                    <option className="bg-[#07120D]">Apple</option>
                    <option className="bg-[#07120D]">Saffron</option>
                    <option className="bg-[#07120D]">Walnut</option>
                    <option className="bg-[#07120D]">Cherry</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Variety</label>
                  <input type="text" placeholder="e.g., Kullu Delicious" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--kr-saffron-gold)] transition-colors placeholder:text-white/30" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Grade</label>
                    <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--kr-saffron-gold)] transition-colors">
                      <option className="bg-[#07120D]">Premium</option>
                      <option className="bg-[#07120D]">Grade A</option>
                      <option className="bg-[#07120D]">Grade B</option>
                      <option className="bg-[#07120D]">Grade C</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1">Quantity</label>
                    <input type="number" placeholder="e.g., 200" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--kr-saffron-gold)] transition-colors placeholder:text-white/30" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Price (Expected)</label>
                  <input type="text" placeholder="₹ per unit" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--kr-saffron-gold)] transition-colors placeholder:text-white/30" />
                </div>
                
                <button className="w-full mt-4 bg-gradient-to-r from-[var(--kr-saffron-gold)] to-[var(--kr-chinar-amber)] hover:from-[var(--kr-chinar-amber)] hover:to-[#B84B1F] text-white font-bold py-3.5 rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-[1.02]">
                  Publish to Mandi
                </button>
              </form>
            </div>
          </div>

          {/* Manage Listings (Right Column) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 rounded-3xl bg-black/40 backdrop-blur-md border border-white/10 shadow-lg min-h-[500px]">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h2 className="text-2xl font-serif font-bold text-white">Your Inventory</h2>
                <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input type="text" placeholder="Search listings..." className="w-full sm:w-64 bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-white/30 transition-colors placeholder:text-white/30" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-3 px-4 text-xs font-semibold text-white/60 uppercase tracking-wider">Listing</th>
                      <th className="py-3 px-4 text-xs font-semibold text-white/60 uppercase tracking-wider">Details</th>
                      <th className="py-3 px-4 text-xs font-semibold text-white/60 uppercase tracking-wider">Status</th>
                      <th className="py-3 px-4 text-xs font-semibold text-white/60 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockListings.map((listing, idx) => (
                      <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                        <td className="py-4 px-4">
                          <p className="font-bold text-white">{listing.crop}</p>
                          <p className="text-xs text-white/50">{listing.id}</p>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-sm text-white/80">{listing.variety} • {listing.grade}</p>
                          <p className="text-xs font-medium text-[var(--kr-saffron-gold)]">{listing.price}</p>
                        </td>
                        <td className="py-4 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border
                            ${listing.status === 'Live' ? 'bg-[var(--kr-orchard-green)]/20 border-[var(--kr-orchard-green)]/30 text-[var(--kr-orchard-green)]' : ''}
                            ${listing.status === 'Draft' ? 'bg-white/10 border-white/20 text-white/70' : ''}
                            ${listing.status === 'Sold Out' ? 'bg-[var(--kr-chinar-amber)]/20 border-[var(--kr-chinar-amber)]/30 text-[var(--kr-chinar-amber)]' : ''}
                          `}>
                            {listing.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button className="p-2 text-white/40 hover:text-white transition-colors"><Edit3 className="w-4 h-4" /></button>
                          <button className="p-2 text-white/40 hover:text-[var(--kr-chinar-amber)] transition-colors"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
        </div>
      </main>
      
      <SiteFooter />
    </div>
  );
}
