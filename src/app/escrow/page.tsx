'use client';

import { useState, useEffect } from 'react';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { ShieldCheck, Lock, CheckCircle, Truck, Package, Clock } from 'lucide-react';
import Link from 'next/link';

interface EscrowTransaction {
  id: string;
  date: string;
  item: string;
  seller: string;
  amount: string;
  status: 'FUNDS_IN_ESCROW' | 'DISPATCHED' | 'DELIVERED' | 'COMPLETED';
}

const MOCK_TRANSACTIONS: EscrowTransaction[] = [
  { id: 'KR-94821', date: 'Oct 5, 2026', item: 'Apple Corrugated Box (Universal 10kg)', seller: 'Kashmir Packaging Co.', amount: '₹14,500', status: 'DISPATCHED' },
  { id: 'KR-73291', date: 'Oct 3, 2026', item: 'DAP Fertilizer (50kg)', seller: 'Zamindar Agri Center', amount: '₹22,700', status: 'FUNDS_IN_ESCROW' },
  { id: 'KR-10294', date: 'Sep 28, 2026', item: 'Gala Apples (Grade A) - 50 Boxes', seller: 'Shopian Orchards', amount: '₹45,000', status: 'COMPLETED' },
];

export default function EscrowPage() {
  const [isAuth, setIsAuth] = useState(false);
  const [transactions, setTransactions] = useState<EscrowTransaction[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAuth(!!token);
    
    // Simulate fetching active transactions
    setTransactions(MOCK_TRANSACTIONS);
  }, []);

  const handleReleasePayment = (id: string) => {
    setTransactions(prev => prev.map(t => 
      t.id === id ? { ...t, status: 'COMPLETED' } : t
    ));
  };

  const getStatusBadge = (status: EscrowTransaction['status']) => {
    switch(status) {
      case 'FUNDS_IN_ESCROW':
        return <span className="px-3 py-1 bg-kr-fill-brand-subtle text-kr-text-warning rounded-full text-xs font-bold flex items-center gap-1 w-max"><Lock className="w-3 h-3" /> FUNDS IN ESCROW</span>;
      case 'DISPATCHED':
        return <span className="px-3 py-1 bg-kr-fill-brand-subtle text-kr-text-brand rounded-full text-xs font-bold flex items-center gap-1 w-max"><Truck className="w-3 h-3" /> DISPATCHED</span>;
      case 'DELIVERED':
        return <span className="px-3 py-1 bg-kr-fill-brand-subtle text-kr-text-brand rounded-full text-xs font-bold flex items-center gap-1 w-max"><Package className="w-3 h-3" /> DELIVERED</span>;
      case 'COMPLETED':
        return <span className="px-3 py-1 bg-kr-badge-published-bg text-kr-badge-published-text rounded-full text-xs font-bold flex items-center gap-1 w-max"><CheckCircle className="w-3 h-3" /> COMPLETED</span>;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <SiteHeader hideSignIn={false} />
      
      <main className="kr-container py-10 flex-1">
        <div className="bg-gradient-to-r from-[#1B4332] to-[#153424] text-white p-8 md:p-10 rounded-2xl mb-8 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="relative z-10">
            <h1 className="font-heading text-4xl font-bold mb-3 flex items-center gap-3">
              <ShieldCheck className="w-10 h-10 text-[#E76F51]" /> Active Escrow Dashboard
            </h1>
            <p className="text-xl text-white/90 max-w-2xl font-light">
              Manage your protected transactions. Funds are held securely by KashRoot until delivery is verified.
            </p>
          </div>
          <div className="absolute top-0 right-0 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
            <ShieldCheck className="w-96 h-96" />
          </div>
        </div>

        {!isAuth ? (
          <div className="kr-glass p-10 rounded-2xl shadow-sm border border-kr-border-default text-center max-w-2xl mx-auto my-12">
            <Lock className="w-16 h-16 text-kr-text-disabled mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-kr-text-primary mb-2">Sign in to view your Escrow Wallet</h2>
            <p className="text-kr-text-secondary mb-6">You must be logged in to manage your secure transactions and release payments.</p>
            <Link href="/escrow/auth" className="inline-block bg-[#1B4332] hover:bg-[#153424] text-white px-8 py-3 rounded-xl font-bold transition-colors">
              Sign In
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-kr-text-primary">Your Transactions</h2>
              <span className="text-sm text-kr-text-secondary font-medium">{transactions.length} Active Orders</span>
            </div>

            {transactions.length === 0 ? (
              <div className="kr-glass p-10 rounded-2xl shadow-sm border border-kr-border-default text-center">
                <Package className="w-12 h-12 text-kr-text-disabled mx-auto mb-3" />
                <p className="text-kr-text-secondary font-medium">No active transactions in escrow.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {transactions.map((tx) => (
                  <div key={tx.id} className="kr-glass rounded-2xl shadow-sm border border-kr-border-default p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center hover:shadow-md transition-shadow">
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm text-kr-text-secondary bg-kr-bg-sunken px-2 py-1 rounded">{tx.id}</span>
                        <span className="flex items-center gap-1 text-sm text-kr-text-secondary"><Clock className="w-4 h-4" /> {tx.date}</span>
                        {getStatusBadge(tx.status)}
                      </div>
                      
                      <div>
                        <h3 className="text-xl font-bold text-kr-text-primary">{tx.item}</h3>
                        <p className="text-kr-text-secondary flex items-center gap-2 mt-1">
                          Seller: <span className="font-semibold text-kr-text-primary">{tx.seller}</span>
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col md:items-end w-full md:w-auto gap-4 border-t md:border-t-0 pt-4 md:pt-0 border-kr-border-default">
                      <div className="text-2xl font-bold text-[#E76F51]">{tx.amount}</div>
                      
                      {(tx.status === 'FUNDS_IN_ESCROW' || tx.status === 'DISPATCHED' || tx.status === 'DELIVERED') && (
                        <button 
                          onClick={() => handleReleasePayment(tx.id)}
                          className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                          <CheckCircle className="w-4 h-4" /> Verify Delivery & Release Payment
                        </button>
                      )}
                      
                      {tx.status === 'COMPLETED' && (
                        <span className="text-sm font-bold text-kr-badge-published-text bg-kr-badge-published-bg px-4 py-2 rounded-lg border border-green-200 inline-block text-center">
                          Payment Released ✓
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
