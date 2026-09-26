import type { Metadata } from 'next';
import Image from 'next/image';

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
        className="hidden md:flex md:w-1/2 lg:w-[55%] flex-col justify-between
                   bg-kr-secondary-900 text-white p-10 lg:p-14"
        aria-hidden="true"
      >
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
            Kashmir&rsquo;s produce,
            <br />
            <span className="text-kr-primary-400">the world&rsquo;s table.</span>
          </h1>
          <p className="text-kr-neutral-300 text-body-lg max-w-sm">
            Connect directly with verified Kashmiri farmers. No middlemen,
            transparent pricing, and end-to-end trade compliance.
          </p>
          {/* Trust stats */}
          <div className="grid grid-cols-3 gap-6 pt-4 border-t border-kr-secondary-700">
            {[
              { value: '2,400+', label: 'Verified farmers' },
              { value: '48', label: 'Export regions' },
              { value: '₹0', label: 'Middleman fee' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="font-heading text-h3 text-kr-primary-400">{stat.value}</p>
                <p className="text-caption text-kr-neutral-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-caption text-kr-neutral-500">
          &copy; {new Date().getFullYear()} KashRoot Technologies Pvt. Ltd.
        </p>
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
