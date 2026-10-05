import type { Metadata } from 'next';
import Image from 'next/image';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { template: '%s | KashRoot', default: 'KashRoot' },
  description: 'Kashmir\'s global agri-trade platform — connecting farmers to buyers worldwide.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <a
        href="#auth-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50
                   focus:px-4 focus:py-2 focus:bg-kr-fill-brand focus:text-white focus:rounded-md
                   focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Brand panel — exactly 50% width on desktop */}
      <div
        className="hidden lg:flex w-1/2 flex-col justify-center relative bg-[#1B4332] text-white overflow-hidden"
        aria-hidden="true"
      >
        {/* Subtle Kashmiri Chinar leaf pattern overlay */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3C!-- Chinar Leaf Sketch --%3E%3Cpath d='M100 20 C 110 40, 140 30, 160 50 C 150 70, 180 80, 160 110 C 140 105, 130 130, 110 150 C 105 130, 95 130, 90 150 C 70 130, 60 105, 40 110 C 20 80, 50 70, 40 50 C 60 30, 90 40, 100 20 Z' opacity='0.7'/%3E%3Cpath d='M100 80 L 100 150 M100 100 L 125 75 M100 115 L 75 95' opacity='0.5'/%3E%3C/svg>")`,
            backgroundSize: '200px 200px',
            backgroundPosition: 'center',
            backgroundRepeat: 'repeat',
            backgroundBlendMode: 'overlay',
          }}
        />
        
        <div className="relative z-10 flex flex-col justify-center h-full p-12 xl:p-24">
          <div className="flex items-center gap-3 mb-8">
            <div
              className="w-12 h-12 rounded-xl bg-[#E76F51] flex items-center justify-center shadow-lg"
              aria-hidden="true"
            >
              <span className="text-white font-heading font-bold text-2xl">K</span>
            </div>
            <span className="font-heading font-bold text-3xl text-white">KashRoot</span>
          </div>

          <div className="space-y-6">
            <h1 className="font-heading text-5xl font-extrabold text-white leading-tight">
              Where Harvest Meets Opportunity.
            </h1>
            <p className="text-[#E76F51] text-xl font-medium">
              Join the digital hub connecting Kashmiri farmers to buyers, modern tools, and intelligent agricultural insights.
            </p>
          </div>
        </div>
      </div>

      {/* Form container — exactly 50% width on desktop, 100% on mobile */}
      <main
        id="auth-main"
        className="flex w-full lg:w-1/2 items-center justify-center bg-kr-bg-page px-4 py-12 sm:px-8"
      >
        <div className="w-full max-w-md mx-auto flex flex-col items-center">
          {/* Mobile-only logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8" aria-hidden="true">
            <div className="w-10 h-10 rounded-lg bg-[#1B4332] flex items-center justify-center shadow-md">
              <span className="text-white font-heading font-bold text-xl">K</span>
            </div>
            <span className="font-heading font-bold text-2xl text-kr-text-primary">KashRoot</span>
          </div>

          {/* Centered Form content */}
          <div className="w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
