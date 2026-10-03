import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { PenTool, CheckCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function HardwareMarketplacePage() {
  const MOCK_TOOLS = [
    { id: 't1', name: 'KisanCraft Mini Tiller 5HP', brand: 'KisanCraft', price: 42000, condition: 'NEW' },
    { id: 't2', name: 'Stihl Handheld Sprayer SG 51', brand: 'Stihl', price: 6500, condition: 'NEW' },
    { id: 't3', name: 'Mahindra JIVO 245 Vineyard Tractor', brand: 'Mahindra', price: 485000, condition: 'REFURBISHED' }
  ];

  return (
    <div className="flex min-h-screen flex-col bg-kr-bg-page theme-seller">
      <SiteHeader />
      <main id="main-content" className="flex-1 kr-container py-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="font-heading text-display-xl text-kr-text-primary mb-2">
              Tool & Machinery Hardware
            </h1>
            <p className="text-body-lg text-kr-text-secondary">
              Direct access to verified suppliers for heavy machinery, implements, and sprayers.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Link href="/supplies/hardware/compare" className="kr-btn-secondary kr-btn-sm">
              <CheckCircle className="w-4 h-4" /> Compare Tools
            </Link>
            <Link href="/supplies/hardware/calculator" className="kr-btn-secondary kr-btn-sm">
              Buy vs Rent Calculator
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {MOCK_TOOLS.map((tool) => (
            <div key={tool.id} className="kr-card bg-kr-bg-surface flex flex-col p-5 hover:shadow-kr-card-md transition-shadow">
              <div className="bg-kr-bg-sunken h-48 w-full mb-4 flex items-center justify-center text-kr-text-disabled">
                <PenTool className="w-10 h-10" />
              </div>
              <div className="flex justify-between items-start mb-1">
                <p className="text-caption text-kr-text-secondary font-medium tracking-wide uppercase">{tool.brand}</p>
                <span className={`kr-badge ${tool.condition === 'NEW' ? 'kr-badge-published' : 'kr-badge-draft'}`}>
                  {tool.condition}
                </span>
              </div>
              <h3 className="font-heading text-h4 text-kr-text-primary mb-2 line-clamp-2">{tool.name}</h3>
              <p className="font-mono text-body-lg font-bold text-kr-text-brand mb-4">
                ₹{tool.price.toLocaleString('en-IN')}
              </p>
              <div className="mt-auto flex gap-2">
                <button className="kr-btn-primary kr-btn-sm flex-1">View Details</button>
                <Link href={`/supplies/hardware/calculator?price=${tool.price}&tool=${encodeURIComponent(tool.name)}`} className="kr-btn-ghost kr-btn-sm" title="Calculate Buy vs Rent">
                  Calculate
                </Link>
              </div>
            </div>
          ))}
        </div>
        
        <div className="kr-card bg-kr-fill-brand-subtle p-6 flex flex-col sm:flex-row items-center gap-6 justify-between">
          <div>
            <h3 className="font-heading text-h3 text-kr-text-primary mb-1">Not sure what to buy?</h3>
            <p className="text-body text-kr-text-secondary">Use our advisor to find the perfect equipment based on your farm size and crop.</p>
          </div>
          <Link href="/supplies/hardware/compare" className="kr-btn-primary shrink-0">
            Open Tool Advisor <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
