'use client';

import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { useState } from 'react';
import { Check, Info, Settings, ShieldCheck } from 'lucide-react';

const TOOLS = [
  { id: 't1', name: 'KisanCraft Mini Tiller', price: 42000, hp: '5 HP', fuel: 'Petrol', idealFor: '< 2 acres', warranty: '1 Year' },
  { id: 't2', name: 'Mahindra JIVO 245', price: 485000, hp: '24 HP', fuel: 'Diesel', idealFor: '2 - 10 acres', warranty: '2 Years' },
  { id: 't3', name: 'Sonalika DI 35', price: 550000, hp: '39 HP', fuel: 'Diesel', idealFor: '> 10 acres', warranty: '3 Years' }
];

export default function ToolComparisonPage() {
  const [farmSize, setFarmSize] = useState('');
  const [recommendedId, setRecommendedId] = useState<string | null>(null);

  const handleAdvise = () => {
    if (farmSize === 'small') setRecommendedId('t1');
    else if (farmSize === 'medium') setRecommendedId('t2');
    else if (farmSize === 'large') setRecommendedId('t3');
  };

  return (
    <div className="flex min-h-screen flex-col bg-kr-bg-page theme-seller">
      <SiteHeader />
      <main className="flex-1 kr-container py-10">
        <h1 className="font-heading text-h1 text-kr-text-primary mb-2">Compare Tools & Machinery</h1>
        <p className="text-body text-kr-text-secondary mb-8">Side-by-side specification grid for informed purchasing.</p>

        <div className="kr-card bg-kr-fill-brand-subtle p-6 mb-8 border border-kr-border-brand">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <label className="block text-label text-kr-text-primary mb-1">What is your farm size?</label>
              <select className="kr-input w-full" value={farmSize} onChange={(e) => setFarmSize(e.target.value)}>
                <option value="">Select size...</option>
                <option value="small">Less than 2 acres</option>
                <option value="medium">2 to 10 acres</option>
                <option value="large">More than 10 acres</option>
              </select>
            </div>
            <button onClick={handleAdvise} className="kr-btn-primary whitespace-nowrap">
              Advise Me
            </button>
          </div>
          {recommendedId && (
            <div className="mt-4 p-3 bg-kr-bg-surface border-l-4 border-kr-border-brand flex items-start gap-3">
              <Check className="text-kr-text-brand w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="text-body-sm font-medium">Recommendation</p>
                <p className="text-caption text-kr-text-secondary">
                  Based on your farm size, we recommend the <strong>{TOOLS.find(t => t.id === recommendedId)?.name}</strong>.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse text-left border border-kr-border-default bg-kr-bg-surface">
            <thead>
              <tr className="bg-kr-bg-sunken border-b border-kr-border-default">
                <th className="p-4 text-label text-kr-text-secondary font-medium w-48">Feature</th>
                {TOOLS.map(t => (
                  <th key={t.id} className={`p-4 font-heading text-h4 ${recommendedId === t.id ? 'text-kr-text-brand bg-kr-fill-brand-subtle' : 'text-kr-text-primary'}`}>
                    {t.name}
                    {recommendedId === t.id && <span className="ml-2 inline-block kr-badge kr-badge-published">Recommended</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-kr-border-default">
              <tr>
                <td className="p-4 text-body-sm text-kr-text-secondary font-medium">Price</td>
                {TOOLS.map(t => (
                  <td key={`price-${t.id}`} className="p-4 font-mono font-bold text-kr-text-primary">
                    ₹{t.price.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="p-4 text-body-sm text-kr-text-secondary font-medium flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Horsepower
                </td>
                {TOOLS.map(t => <td key={`hp-${t.id}`} className="p-4 text-body-sm text-kr-text-primary">{t.hp}</td>)}
              </tr>
              <tr>
                <td className="p-4 text-body-sm text-kr-text-secondary font-medium flex items-center gap-2">
                  <Info className="w-4 h-4" /> Fuel Type
                </td>
                {TOOLS.map(t => <td key={`fuel-${t.id}`} className="p-4 text-body-sm text-kr-text-primary">{t.fuel}</td>)}
              </tr>
              <tr>
                <td className="p-4 text-body-sm text-kr-text-secondary font-medium">Ideal Farm Size</td>
                {TOOLS.map(t => <td key={`ideal-${t.id}`} className="p-4 text-body-sm text-kr-text-primary">{t.idealFor}</td>)}
              </tr>
              <tr>
                <td className="p-4 text-body-sm text-kr-text-secondary font-medium flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Warranty
                </td>
                {TOOLS.map(t => <td key={`war-${t.id}`} className="p-4 text-body-sm text-kr-text-primary">{t.warranty}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
