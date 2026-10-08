'use client';

import { useState, useEffect } from 'react';
import { BadgeCheck, MapPin, TrendingDown, Clock, Plus, ShieldCheck, Truck, CreditCard, CheckCircle2 } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { useRouter } from 'next/navigation';

interface DealerListing {
  id: string;
  category: string;
  item: string;
  name: string;
  location: string;
  price: string;
  verified: boolean;
  updated: string;
  stock: string;
  image?: string;
}

const DEFAULT_LISTINGS: DealerListing[] = [
  { id: '1', category: "Packaging", item: "Apple Corrugated Box (Universal 10kg)", name: "Kashmir Packaging Co.", location: "Sopore", price: "145", verified: true, updated: "2 hours ago", stock: "5000" },
  { id: '2', category: "Packaging", item: "Apple Corrugated Box (Universal 10kg)", name: "Valley Traders", location: "Shopian", price: "148", verified: true, updated: "5 hours ago", stock: "2000" },
  { id: '3', category: "Packaging", item: "Apple Corrugated Box (Universal 10kg)", name: "Global Corrugates", location: "Lassipora", price: "142", verified: false, updated: "1 day ago", stock: "1500" },
  { id: '4', category: "Agrochemicals", item: "DAP Fertilizer (50kg Bag)", name: "Zamindar Agri Center", location: "Baramulla", price: "11350", verified: true, updated: "1 hour ago", stock: "200" },
  { id: '5', category: "Agrochemicals", item: "DAP Fertilizer (50kg Bag)", name: "Kissan Hub", location: "Pulwama", price: "11365", verified: true, updated: "4 hours ago", stock: "50" },
  { id: '6', category: "Agrochemicals", item: "DAP Fertilizer (50kg Bag)", name: "National Fertilizers", location: "Srinagar", price: "11380", verified: true, updated: "2 days ago", stock: "300" }
];

export default function ComparePricesPage() {
  const router = useRouter();
  const [listings, setListings] = useState<DealerListing[]>([]);
  const [isAuth, setIsAuth] = useState(false);
  const [userRole, setUserRole] = useState('');
  const [userName, setUserName] = useState('');

  // Modals & Flows
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<DealerListing | null>(null);
  const [lowestFilter, setLowestFilter] = useState<Record<string, boolean>>({});

  // Escrow & Order State
  const [orderStatus, setOrderStatus] = useState<'IDLE' | 'DELIVERY_FORM' | 'ESCROW_LOCKED' | 'COMPLETED'>('IDLE');
  
  // Forms
  const [newProduct, setNewProduct] = useState({ title: '', category: 'Packaging', price: '', stock: '', location: '', image: '' });
  const [deliveryDetails, setDeliveryDetails] = useState({ name: '', phone: '', address: '', district: '', pincode: '' });

  useEffect(() => {
    // Load auth state
    const token = localStorage.getItem('auth_token');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAuth(!!token);
    setUserRole(localStorage.getItem('user_role') || '');
    setUserName(localStorage.getItem('auth_email') || 'User');

    // Load listings from mock API (localStorage)
    const stored = localStorage.getItem('kr_mock_dealer_listings');
    if (stored) {
      setListings(JSON.parse(stored));
    } else {
      setListings(DEFAULT_LISTINGS);
      localStorage.setItem('kr_mock_dealer_listings', JSON.stringify(DEFAULT_LISTINGS));
    }
  }, []);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const entry: DealerListing = {
      id: Date.now().toString(),
      category: newProduct.category,
      item: newProduct.title,
      name: userName.split('@')[0] + ' Enterprises', // Mock dealer name
      location: newProduct.location,
      price: newProduct.price,
      verified: true,
      updated: 'Just now',
      stock: newProduct.stock,
      image: newProduct.image
    };
    const updated = [entry, ...listings];
    setListings(updated);
    localStorage.setItem('kr_mock_dealer_listings', JSON.stringify(updated));
    setShowAddModal(false);
  };

  const handleOrderClick = (product: DealerListing) => {
    setSelectedProduct(product);
    if (!isAuth) {
      setShowAuthPrompt(true);
    } else {
      setOrderStatus('DELIVERY_FORM');
      setShowOrderModal(true);
    }
  };

  const handleConfirmOrder = () => {
    setOrderStatus('ESCROW_LOCKED');
  };

  const handleReleaseEscrow = () => {
    setOrderStatus('COMPLETED');
  };

  // Group listings by category and item
  const groupedListings = listings.reduce((acc, curr) => {
    const key = `${curr.category}:::${curr.item}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(curr);
    return acc;
  }, {} as Record<string, DealerListing[]>);

  const canAddProduct = isAuth && (userRole === 'SELLER' || userRole === 'DEALER');

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-sky-50 to-white text-slate-800">
      <SiteHeader hideSignIn={false} />
      
      <main className="kr-container py-10 flex-1 relative z-10">
        <div className="bg-gradient-to-r from-sky-100 to-blue-50 text-slate-900 p-8 md:p-10 rounded-2xl mb-8 shadow-lg border border-white/60 backdrop-blur-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="font-heading text-4xl font-bold mb-3 text-sky-900">Price Comparison Hub</h1>
            <p className="text-xl text-slate-700 max-w-2xl font-medium">
              Compare real-time rates for farm essentials across authorized dealers. Direct home delivery guaranteed with Escrow protection.
            </p>
          </div>
          {canAddProduct ? (
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plus className="w-5 h-5" /> Add New Product
            </button>
          ) : !isAuth ? (
            <button 
              onClick={() => setShowAuthPrompt(true)}
              className="bg-white/80 hover:bg-white text-sky-900 px-6 py-3 rounded-xl font-bold shadow-md border border-sky-200 flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              List Your Products
            </button>
          ) : null}
        </div>

        <div className="space-y-8">
          {Object.entries(groupedListings).map(([key, groupDealers], i) => {
            const [category, item] = key.split(':::');
            const isLowestFiltered = lowestFilter[key];
            
            let displayDealers = [...groupDealers];
            if (isLowestFiltered) {
              displayDealers.sort((a, b) => {
                const priceA = parseFloat(a.price.replace(/[^\d.]/g, '')) || 0;
                const priceB = parseFloat(b.price.replace(/[^\d.]/g, '')) || 0;
                return priceA - priceB;
              });
            }

            return (
              <section key={i} className="kr-glass rounded-2xl shadow-sm border border-kr-border-default overflow-hidden">
                <div className="bg-kr-bg-sunken border-b border-kr-border-default px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-1 block">{category}</span>
                    <h2 className="text-xl font-bold text-kr-text-primary">{item}</h2>
                  </div>
                  <button 
                    onClick={() => setLowestFilter(prev => ({ ...prev, [key]: !prev[key] }))}
                    className={`flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isLowestFiltered 
                        ? 'kr-glass border-kr-border-brand text-kr-text-brand' 
                        : 'kr-glass border-kr-border-default hover:bg-kr-bg-sunken text-kr-text-primary'
                    }`}
                  >
                    <TrendingDown className="w-4 h-4" /> {isLowestFiltered ? 'Unfilter Lowest' : 'Filter Lowest'}
                  </button>
                </div>
                
                <div className="divide-y divide-gray-100">
                  {displayDealers.map((dealer) => (
                    <div key={dealer.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 hover:bg-kr-bg-sunken transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-kr-text-primary text-lg">{dealer.name}</h3>
                          {dealer.verified && <span title="Verified Dealer"><BadgeCheck className="w-5 h-5 text-green-500" /></span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-kr-text-secondary">
                          <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {dealer.location}</span>
                          <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Updated {dealer.updated}</span>
                          <span className="flex items-center gap-1 text-kr-text-brand kr-glass px-2 py-0.5 rounded-full border border-blue-200">Stock: {dealer.stock}</span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col md:items-end w-full md:w-auto gap-3">
                        <div className="text-2xl font-bold text-[#E76F51]">₹{dealer.price}</div>
                        <div className="flex w-full md:w-auto gap-2">
                          <button className="flex-1 md:flex-none kr-glass border-2 border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332]/5 px-4 py-2 rounded-lg font-bold text-sm transition-colors hidden">
                            Contact
                          </button>
                          <button 
                            onClick={() => handleOrderClick(dealer)}
                            className="flex-1 md:flex-none bg-[#1B4332] hover:bg-[#153424] text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-md"
                          >
                            <ShieldCheck className="w-4 h-4" /> Order Now
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </main>
      <SiteFooter />

      {/* Role-Based Auth Panel Modal */}
      {showAuthPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="kr-glass rounded-2xl p-8 max-w-sm w-full shadow-2xl relative text-center">
            <ShieldCheck className="w-16 h-16 text-[#E76F51] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-kr-text-primary mb-2">Are you here to Buy or Sell?</h2>
            <p className="text-kr-text-secondary mb-6">Choose your account type to proceed with KashRoot Escrow.</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  localStorage.setItem('user_role', 'BUYER');
                  router.push('/marketplace/auth?role=BUYER');
                }}
                className="w-full bg-[#1B4332] hover:bg-[#153424] text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                I am a Buyer
              </button>
              <button 
                onClick={() => {
                  localStorage.setItem('user_role', 'SELLER');
                  router.push('/marketplace/auth?role=SELLER');
                }}
                className="w-full border-2 border-[#1B4332] text-[#1B4332] hover:bg-kr-bg-sunken font-bold py-3 px-4 rounded-xl transition-colors"
              >
                I am a Dealer/Seller
              </button>
              <button 
                onClick={() => setShowAuthPrompt(false)}
                className="w-full bg-kr-bg-sunken hover:bg-kr-bg-sunken text-kr-text-primary font-bold py-3 px-4 rounded-xl transition-colors mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order & Delivery Details Modal */}
      {showOrderModal && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="kr-glass rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-8">
            <div className="bg-[#1B4332] p-6 text-white">
              <h2 className="text-2xl font-bold">Checkout & Escrow</h2>
              <p className="text-blue-100">Secure checkout for {selectedProduct.item}</p>
            </div>
            
            <div className="p-6 sm:p-8">
              {orderStatus === 'DELIVERY_FORM' && (
                <div className="space-y-6">
                  <div className="kr-glass border border-blue-200 rounded-xl p-4 flex gap-4">
                    <ShieldCheck className="w-8 h-8 text-blue-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-blue-900">Direct home delivery guaranteed with Escrow protection.</h4>
                      <p className="text-sm text-kr-text-brand mt-1">Your funds are held safely until you receive and verify the order.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="col-span-full">
                      <label className="block text-sm font-bold text-kr-text-primary mb-1">Full Name</label>
                      <input type="text" className="kr-input w-full" value={deliveryDetails.name} onChange={e => setDeliveryDetails({...deliveryDetails, name: e.target.value})} placeholder="Receiver Name" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-kr-text-primary mb-1">10-digit Phone</label>
                      <input type="tel" className="kr-input w-full" value={deliveryDetails.phone} onChange={e => setDeliveryDetails({...deliveryDetails, phone: e.target.value})} placeholder="9999999999" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-kr-text-primary mb-1">District</label>
                      <input type="text" className="kr-input w-full" value={deliveryDetails.district} onChange={e => setDeliveryDetails({...deliveryDetails, district: e.target.value})} placeholder="e.g., Srinagar" />
                    </div>
                    <div className="col-span-full">
                      <label className="block text-sm font-bold text-kr-text-primary mb-1">Street Address</label>
                      <textarea className="kr-input w-full py-2" rows={2} value={deliveryDetails.address} onChange={e => setDeliveryDetails({...deliveryDetails, address: e.target.value})} placeholder="House No, Street, Landmark" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-kr-text-primary mb-1">Pincode</label>
                      <input type="text" className="kr-input w-full" value={deliveryDetails.pincode} onChange={e => setDeliveryDetails({...deliveryDetails, pincode: e.target.value})} placeholder="190001" />
                    </div>
                  </div>

                  <div className="border-t border-kr-border-default pt-6 flex justify-end gap-3">
                    <button onClick={() => setShowOrderModal(false)} className="px-6 py-2 rounded-lg font-bold text-kr-text-secondary hover:bg-kr-bg-sunken">Cancel</button>
                    <button onClick={handleConfirmOrder} className="px-6 py-2 bg-[#E76F51] hover:bg-[#D4A373] text-white rounded-lg font-bold flex items-center gap-2 shadow-md">
                      <CreditCard className="w-5 h-5" /> Pay ₹{selectedProduct.price} to Escrow
                    </button>
                  </div>
                </div>
              )}

              {orderStatus === 'ESCROW_LOCKED' && (
                <div className="space-y-8 py-4">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-kr-fill-brand-subtle rounded-full flex items-center justify-center mx-auto mb-4">
                      <ShieldCheck className="w-8 h-8 text-amber-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-kr-text-primary">ESCROW_LOCKED</h3>
                    <p className="text-kr-text-secondary">Your funds are safe. Order ID: #KR-{selectedProduct?.id}</p>
                  </div>

                  <div className="space-y-4 max-w-md mx-auto relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-white bg-green-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] kr-glass p-4 rounded-xl border border-kr-border-default shadow-sm">
                        <h4 className="font-bold text-kr-text-primary">Step 1</h4>
                        <p className="text-sm text-kr-text-secondary">Funds secured in KashRoot Escrow</p>
                      </div>
                    </div>
                    
                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-white bg-blue-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                        <Truck className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] kr-glass p-4 rounded-xl border border-blue-200 shadow-sm kr-glass/30">
                        <h4 className="font-bold text-blue-900">Step 2</h4>
                        <p className="text-sm text-kr-text-brand">Dealer dispatches order to delivery address</p>
                      </div>
                    </div>

                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-white bg-kr-bg-sunken text-kr-text-secondary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                        <BadgeCheck className="w-5 h-5" />
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] kr-glass p-4 rounded-xl border border-kr-border-default shadow-sm">
                        <h4 className="font-bold text-kr-text-secondary">Step 3</h4>
                        <p className="text-sm text-kr-text-secondary">Buyer inspects & verifies goods upon arrival</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center border-t border-kr-border-default pt-6">
                    <p className="text-sm text-kr-text-secondary mb-4 text-center">Once you receive the goods and verify their quality, click below to release the funds to the dealer.</p>
                    <button onClick={handleReleaseEscrow} className="w-full max-w-sm px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 transition-all">
                      <CheckCircle2 className="w-5 h-5" /> Confirm Delivery & Release Payment
                    </button>
                  </div>
                </div>
              )}

              {orderStatus === 'COMPLETED' && (
                <div className="text-center py-8">
                  <div className="w-20 h-20 bg-kr-badge-published-bg rounded-full flex items-center justify-center mx-auto mb-6">
                    <BadgeCheck className="w-10 h-10 text-green-600" />
                  </div>
                  <h3 className="text-3xl font-heading font-bold text-kr-text-primary mb-2">Order COMPLETED!</h3>
                  <p className="text-kr-text-secondary mb-8 max-w-md mx-auto">Payment has been released to {selectedProduct.name}. Thank you for using KashRoot Secure Escrow.</p>
                  <button onClick={() => setShowOrderModal(false)} className="px-8 py-3 kr-hero-premium kr-pattern-chinar rounded-xl font-bold hover:bg-[#153424] transition-colors">
                    Back to Hub
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal (For Dealers) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="kr-glass rounded-2xl max-w-md w-full shadow-2xl overflow-hidden my-8">
            <div className="bg-[#1B4332] p-5 text-white flex justify-between items-center">
              <h2 className="text-xl font-bold">Add Dealer Listing</h2>
              <button onClick={() => setShowAddModal(false)} className="text-white/70 hover:text-white">✕</button>
            </div>
            
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-kr-text-primary mb-1">Product Title</label>
                <input required type="text" className="kr-input w-full" value={newProduct.title} onChange={e => setNewProduct({...newProduct, title: e.target.value})} placeholder="e.g. Apple Corrugated Box 10kg" />
              </div>
              <div>
                <label className="block text-sm font-bold text-kr-text-primary mb-1">Category</label>
                <select className="kr-input w-full" value={newProduct.category} onChange={e => setNewProduct({...newProduct, category: e.target.value})}>
                  <option>Packaging</option>
                  <option>Agrochemicals</option>
                  <option>Machinery</option>
                  <option>Supplies</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-kr-text-primary mb-1">Price per unit (₹)</label>
                  <input required type="number" className="kr-input w-full" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} placeholder="150" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-kr-text-primary mb-1">Stock Quantity</label>
                  <input required type="number" className="kr-input w-full" value={newProduct.stock} onChange={e => setNewProduct({...newProduct, stock: e.target.value})} placeholder="5000" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-kr-text-primary mb-1">District / Location</label>
                <input required type="text" className="kr-input w-full" value={newProduct.location} onChange={e => setNewProduct({...newProduct, location: e.target.value})} placeholder="Sopore" />
              </div>
              <div>
                <label className="block text-sm font-bold text-kr-text-primary mb-1">Image URL (Optional)</label>
                <input type="url" className="kr-input w-full" value={newProduct.image} onChange={e => setNewProduct({...newProduct, image: e.target.value})} placeholder="https://..." />
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-kr-border-default">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-5 py-2 rounded-lg font-bold text-kr-text-secondary hover:bg-kr-bg-sunken">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-[#E76F51] hover:bg-[#D4A373] text-white rounded-lg font-bold shadow-md">Publish Listing</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
