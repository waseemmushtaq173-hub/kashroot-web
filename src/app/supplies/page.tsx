import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';
import { SuppliesBrowser } from '@/components/supplies/SuppliesBrowser';

export const metadata: Metadata = {
  title: 'Horticulture & agriculture supplies — KashRoot',
  description:
    'Compare packaging, machinery and input prices across suppliers for valley horticulture. See every offer for the same item side by side.',
};

/**
 * Server component so this route can export `metadata`; the interactive
 * catalogue lives in SuppliesBrowser, which is the only part that needs to be
 * a client component.
 */
export default function SuppliesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-kr-bg-page">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <SuppliesBrowser />
      </main>
      <SiteFooter />
    </div>
  );
}
