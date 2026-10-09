import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { template: '%s | KashRoot', default: 'KashRoot' },
  description: 'The agri-trade platform connecting growers to buyers across India.',
};

/**
 * Shell for the shared auth pages (/login, /register, /verify-otp, /mfa-setup):
 * a decorative brand panel on the left at desktop widths, the form on the right.
 *
 * The brand panel used to carry `kr-hero-premium kr-pattern-chinar`, and the
 * form column `bg-kr-bg-sunken` with `text-kr-text-primary` — all of which
 * resolve to --kr-* CSS variables that globals.css never defines. The panel
 * therefore had no background at all, and the form column's text fell back to
 * the near-white colour inherited from <body>, which is why it read as blank.
 * Both are now explicit.
 *
 * The dedicated role sign-ins at /login/<role> sit outside this route group on
 * purpose: they bring their own full-bleed story panel.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <a
        href="#auth-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                   focus:rounded-md focus:bg-emerald-700 focus:px-4 focus:py-2 focus:text-sm
                   focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>

      {/* Brand panel — exactly 50% width on desktop */}
      <div
        className="relative hidden w-1/2 flex-col justify-center overflow-hidden bg-gradient-to-br from-emerald-100 via-lime-50 to-teal-100 lg:flex"
        aria-hidden="true"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.75),transparent_60%)]"
        />

        <div className="relative z-10 flex h-full flex-col justify-center p-12 xl:p-24">
          <div className="mb-8 flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-600/30"
              aria-hidden="true"
            >
              <span className="font-heading text-2xl font-bold text-white">K</span>
            </div>
            <span className="font-heading text-3xl font-bold text-slate-900">KashRoot</span>
          </div>

          <div className="space-y-6">
            <h1 className="font-heading text-5xl font-extrabold leading-tight text-slate-900">
              Where harvest meets opportunity.
            </h1>
            <p className="text-xl font-medium text-emerald-900">
              The digital hub connecting growers to buyers, modern tools and practical agricultural insight.
            </p>
          </div>
        </div>
      </div>

      {/* Form container — exactly 50% width on desktop, 100% on mobile */}
      <main
        id="auth-main"
        className="flex w-full items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-12 text-slate-900 sm:px-8 lg:w-1/2"
      >
        <div className="mx-auto flex w-full max-w-md flex-col items-center">
          {/* Mobile-only logo */}
          <div className="mb-8 flex items-center gap-2 lg:hidden" aria-hidden="true">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md">
              <span className="font-heading text-xl font-bold text-white">K</span>
            </div>
            <span className="font-heading text-2xl font-bold text-slate-900">KashRoot</span>
          </div>

          <div className="w-full">{children}</div>
        </div>
      </main>
    </div>
  );
}
