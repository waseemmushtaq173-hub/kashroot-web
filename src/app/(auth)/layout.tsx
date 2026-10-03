import type { Metadata } from 'next';
import Image from 'next/image';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { template: '%s | KashRoot', default: 'KashRoot' },
  description: 'Kashmir\'s global agri-trade platform — connecting farmers to buyers worldwide.',
};

/**
 * AuthLayout
 *
 * Shared layout for all auth screens: login, register, verify-otp, mfa-setup.
 * Two-column on desktop (brand panel left, form right).
 * Single column (form only) on mobile — brand panel hidden at < md.
 *
 * Accessibility:
 *   - Main landmark wraps the form column.
 *   - Skip-to-main link at top of page for keyboard users.
 *   - No decorative images in the tab order (aria-hidden on brand panel visuals).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-kr-bg-page">
      {/* Skip-to-main link (WCAG 2.4.1) */}
      <a
        href="#auth-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50
                   focus:px-4 focus:py-2 focus:bg-kr-fill-brand focus:text-white focus:rounded-md
                   focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Brand panel — hidden on mobile */}
      <div
        className="hidden md:flex md:w-1/2 lg:w-[55%] relative flex-col justify-between
                   bg-kr-secondary-900 text-white overflow-hidden"
        aria-hidden="true"
      >
        {/* Custom Sketched Chinar & Shikara Background */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3C!-- Chinar Leaf Sketch --%3E%3Cpath d='M100 20 C 110 40, 140 30, 160 50 C 150 70, 180 80, 160 110 C 140 105, 130 130, 110 150 C 105 130, 95 130, 90 150 C 70 130, 60 105, 40 110 C 20 80, 50 70, 40 50 C 60 30, 90 40, 100 20 Z' opacity='0.7'/%3E%3Cpath d='M100 80 L 100 150 M100 100 L 125 75 M100 115 L 75 95' opacity='0.5'/%3E%3C!-- Shikara Sketch --%3E%3Cpath d='M30 160 Q 100 180, 170 160 L 150 175 Q 100 185, 50 175 Z' opacity='0.8'/%3E%3Cpath d='M70 165 L 70 140 L 130 140 L 130 168' opacity='0.6'/%3E%3Cpath d='M70 140 Q 100 120, 130 140' opacity='0.6'/%3E%3Cpath d='M110 140 L 110 167' opacity='0.4'/%3E%3C/svg>")`,
            backgroundSize: '300px 300px',
            backgroundPosition: 'center',
            backgroundRepeat: 'repeat',
            backgroundBlendMode: 'overlay',
          }}
        />
        
        {/* Foreground Content */}
        <div className="relative z-10 flex flex-col justify-between h-full p-10 lg:p-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg bg-kr-primary-500 flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="text-white font-heading font-bold text-lg">K</span>
            </div>
            <span className="font-heading font-bold text-xl text-white">KashRoot</span>
          </div>

          {/* Hero text */}
          <div className="space-y-6">
            <h1 className="font-heading text-h1 text-white leading-tight">
              <strong>Where Harvest Meets Opportunity</strong>
            </h1>
            <p className="text-kr-neutral-300 text-body-lg max-w-sm">
              Connect directly with verified agricultural buyers and sellers. No middlemen,
              transparent pricing, and end-to-end trade compliance.
            </p>
          </div>

          {/* Footer */}
          <p className="text-caption text-kr-neutral-500">
            &copy; {new Date().getFullYear()} KashRoot Technologies Pvt. Ltd.
          </p>
        </div>
      </div>

      {/* Form column */}
      <main
        id="auth-main"
        className="flex-1 flex flex-col items-center justify-center
                   px-4 py-10 sm:px-8 md:px-12 lg:px-16
                   bg-kr-bg-page"
      >
        {/* Mobile-only logo */}
        <div className="md:hidden flex items-center gap-2 mb-8" aria-hidden="true">
          <div className="w-8 h-8 rounded-md bg-kr-primary-500 flex items-center justify-center">
            <span className="text-white font-heading font-bold">K</span>
          </div>
          <span className="font-heading font-bold text-lg text-kr-text-primary">KashRoot</span>
        </div>

        {/* Auth form card */}
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>
    </div>
  );
}
