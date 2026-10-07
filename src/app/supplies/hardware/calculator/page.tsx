'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { Calculator, AlertTriangle } from 'lucide-react';

function CalculatorLogic() {
  const params = useSearchParams();
  const initialPrice = Number(params.get('price')) || 485000;
  const toolName = params.get('tool') || 'Heavy Machinery';

  const [buyPrice, setBuyPrice] = useState(initialPrice);
  const [dailyRent, setDailyRent] = useState(initialPrice * 0.005); // roughly 0.5% per day
  const [daysPerYear, setDaysPerYear] = useState(15);
  const [lifespanYears, setLifespanYears] = useState(5);
  const [maintenanceYearly, setMaintenanceYearly] = useState(initialPrice * 0.02);

  const totalBuyCost = buyPrice + (maintenanceYearly * lifespanYears);
  const totalRentCost = dailyRent * daysPerYear * lifespanYears;

  const isBuyingBetter = totalBuyCost < totalRentCost;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="kr-card bg-kr-bg-surface p-6">
        <h2 className="font-heading text-h3 text-kr-text-primary mb-6">Input Variables</h2>
        
        <div className="space-y-5">
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Equipment Purchase Price (₹)</label>
            <input type="number" className="kr-input w-full" value={buyPrice} onChange={(e) => setBuyPrice(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Yearly Maintenance (₹)</label>
            <input type="number" className="kr-input w-full" value={maintenanceYearly} onChange={(e) => setMaintenanceYearly(Number(e.target.value))} />
          </div>
          <div className="kr-divider my-2"></div>
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Daily Rental Rate (₹)</label>
            <input type="number" className="kr-input w-full" value={dailyRent} onChange={(e) => setDailyRent(Number(e.target.value))} />
          </div>
          <div className="kr-divider my-2"></div>
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Usage Days per Year</label>
            <input type="range" min="1" max="100" className="w-full" value={daysPerYear} onChange={(e) => setDaysPerYear(Number(e.target.value))} />
            <div className="text-right text-caption text-kr-text-secondary mt-1">{daysPerYear} days</div>
          </div>
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Expected Lifespan (Years)</label>
            <input type="range" min="1" max="15" className="w-full" value={lifespanYears} onChange={(e) => setLifespanYears(Number(e.target.value))} />
            <div className="text-right text-caption text-kr-text-secondary mt-1">{lifespanYears} years</div>
          </div>
        </div>
      </div>

      <div className="kr-card bg-kr-bg-sunken p-6 flex flex-col justify-center border border-kr-border-default">
        <h2 className="font-heading text-h3 text-kr-text-primary mb-6 flex items-center gap-2">
          <Calculator className="text-kr-text-brand" /> Cost Projection ({lifespanYears} Years)
        </h2>
        
        <div className="space-y-6 mb-8">
          <div>
            <p className="text-caption text-kr-text-secondary tracking-wide uppercase mb-1">Total Cost to Buy</p>
            <p className="font-mono text-display-lg text-kr-text-primary">
              ₹{totalBuyCost.toLocaleString()}
            </p>
            <p className="text-caption text-kr-text-secondary">Includes {lifespanYears} yrs maintenance</p>
          </div>
          <div>
            <p className="text-caption text-kr-text-secondary tracking-wide uppercase mb-1">Total Cost to Rent</p>
            <p className="font-mono text-display-lg text-kr-text-primary">
              ₹{totalRentCost.toLocaleString()}
            </p>
            <p className="text-caption text-kr-text-secondary">At {daysPerYear} days/yr</p>
          </div>
        </div>

        <div className={`p-4 border-l-4 ${isBuyingBetter ? 'bg-kr-fill-brand-subtle border-kr-border-brand' : 'bg-kr-badge-pending-bg border-kr-warning-500'}`}>
          <p className="text-body-lg font-medium text-kr-text-primary flex items-center gap-2">
            {isBuyingBetter ? 'Recommendation: BUY' : 'Recommendation: RENT'}
          </p>
          <p className="text-body-sm text-kr-text-secondary mt-1">
            {isBuyingBetter 
              ? `You save ₹${(totalRentCost - totalBuyCost).toLocaleString()} by buying the equipment upfront instead of renting it for ${daysPerYear} days a year.`
              : `You save ₹${(totalBuyCost - totalRentCost).toLocaleString()} by renting the equipment only when needed, avoiding capital lock-up and maintenance.`}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  return (
    <div className="flex min-h-screen flex-col bg-kr-bg-page theme-seller">
      <SiteHeader />
      <main className="flex-1 kr-container py-10">
        <h1 className="font-heading text-h1 text-kr-text-primary mb-2">Buy vs. Rent Calculator</h1>
        <p className="text-body text-kr-text-secondary mb-8">Model your total cost of ownership to make a smart capital decision.</p>
        
        <Suspense fallback={<div>Loading calculator...</div>}>
          <CalculatorLogic />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
