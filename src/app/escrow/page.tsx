import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { ShieldCheck, Lock, CheckCircle, Truck } from 'lucide-react';

export default function EscrowPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F9F7F1]">
      <SiteHeader hideSignIn={false} />
      <main className="kr-container py-10 flex-1">
        <div className="bg-[#1B4332] text-white p-8 md:p-10 rounded-2xl mb-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-20 pointer-events-none transform translate-x-1/4 -translate-y-1/4">
            <ShieldCheck className="w-96 h-96" />
          </div>
          <h1 className="font-heading text-4xl font-bold mb-3 relative z-10">KashRoot Secure Escrow</h1>
          <p className="text-xl text-white/90 max-w-2xl font-light relative z-10">
            Guaranteed payment protection for every agricultural transaction. We hold the funds until the goods are verified.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-12">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#1B4332]/10">
            <div className="w-14 h-14 bg-[#1B4332]/5 rounded-xl flex items-center justify-center mb-6">
              <Lock className="w-7 h-7 text-[#E76F51]" />
            </div>
            <h3 className="text-xl font-bold text-[#1B4332] mb-3">1. Buyer Deposits Funds</h3>
            <p className="text-gray-600 leading-relaxed">
              When an order is placed, the buyer's funds are securely locked in the KashRoot Escrow vault.
            </p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#1B4332]/10">
            <div className="w-14 h-14 bg-[#1B4332]/5 rounded-xl flex items-center justify-center mb-6">
              <Truck className="w-7 h-7 text-[#E76F51]" />
            </div>
            <h3 className="text-xl font-bold text-[#1B4332] mb-3">2. Farmer Ships Goods</h3>
            <p className="text-gray-600 leading-relaxed">
              With funds guaranteed, the farmer dispatches the consignment with complete peace of mind.
            </p>
          </div>
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#1B4332]/10">
            <div className="w-14 h-14 bg-[#1B4332]/5 rounded-xl flex items-center justify-center mb-6">
              <CheckCircle className="w-7 h-7 text-[#E76F51]" />
            </div>
            <h3 className="text-xl font-bold text-[#1B4332] mb-3">3. Funds Released</h3>
            <p className="text-gray-600 leading-relaxed">
              Upon successful delivery and quality verification by the buyer, funds are instantly released to the farmer.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
