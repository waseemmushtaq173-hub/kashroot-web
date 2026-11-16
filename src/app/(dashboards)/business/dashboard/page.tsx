'use client';

/**
 * The Business admin portal: the owners, managers and staff of a cold store,
 * dealership, shop or helper team sign in here (/login/business), apart from
 * the customer portals. Each business sees only its own people and details;
 * what a person may do comes from their role in it (owner / manager / staff),
 * checked again in the database.
 */
import { BusinessConsole } from '@/components/business/BusinessConsole';
import { PortalShell } from '@/components/layout/PortalShell';
import { INFO_BODY } from '@/components/layout/InfoPage';

export default function BusinessDashboardPage() {
  return (
    <PortalShell
      title="Business admin"
      description="Run your cold store, dealership, shop or team with the people who work with you. Each business sees only its own people and details."
      eyebrow="Business admin"
      theme="business"
    >
      <div className={`${INFO_BODY} lg:col-span-2`}>
        <BusinessConsole />
      </div>
    </PortalShell>
  );
}
