'use client';

/**
 * /account/business — the business admin console on a plain page (older links and emails).
 * The Business admin portal itself is /business/dashboard (same console inside the portal shell).
 */
import { BusinessConsole } from '@/components/business/BusinessConsole';
import { InfoPage } from '@/components/layout/InfoPage';

export default function BusinessPage() {
  return (
    <InfoPage title="Business admin" intro="Run your cold store, dealership, shop or team with the people who work with you. Each business sees only its own people and details.">
      <BusinessConsole />
    </InfoPage>
  );
}
