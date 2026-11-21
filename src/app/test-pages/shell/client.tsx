'use client';

import { useState } from 'react';
import { Package, ShoppingBag, Snowflake, Truck, Wallet } from 'lucide-react';

import { ChatBubble } from '@/components/advisory/ChatBubble';
import { PortalShell } from '@/components/layout/PortalShell';
import { SidebarGreeting } from '@/components/layout/portal/ShellSidebar';
import { shellLook } from '@/components/layout/portal/look';
import type { AdvisoryMessage } from '@/lib/db/advisory';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Package },
  { id: 'apples', label: 'My stored apples', icon: Snowflake },
  { id: 'orders', label: 'Orders', icon: ShoppingBag, count: 3 },
  { id: 'store', label: 'Cold storage', icon: Snowflake },
  { id: 'trucks', label: 'Trucks', icon: Truck },
  { id: 'money', label: 'Payments', icon: Wallet },
];

const NOW = new Date().toISOString();
const msg = (id: number, sender_role: AdvisoryMessage['sender_role'], sender_id: string, sender_name: string, body: string): AdvisoryMessage => ({
  id,
  request_id: 'r1',
  sender_role,
  sender_id,
  sender_name,
  body,
  created_at: NOW,
});

export function ShellTestPage() {
  const [tab, setTab] = useState('overview');
  return (
    <PortalShell
      theme="farmer"
      eyebrow="Test"
      title="Test page: the portal frame"
      description="Made-up names and labels only."
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      kpis={[
        { label: 'Orders', value: '12', trend: '3 waiting for you', onClick: () => setTab('orders') },
        { label: 'Boxes in store', value: '1,240' },
        { label: 'On the way', value: '2' },
        { label: 'Paid to you', value: '₹ 0' },
      ]}
    >
      <section aria-label="Sidebar greeting" className="mb-6 w-72 rounded-3xl bg-forest-deep py-4 text-white">
        <SidebarGreeting look={shellLook('farmer')} signedIn name="Sample Grower" nameReady />
      </section>
      <ol aria-label="Sample conversation" className="max-w-xl space-y-4">
        <ChatBubble message={msg(1, 'farmer', 'me', 'Sample Grower', 'My apple leaves have dark spots.')} mine asExpert={false} lang="en" />
        <ChatBubble message={msg(2, 'expert', 'ex', 'Sample Expert', 'Please tell me since when this is happening.')} mine={false} asExpert={false} lang="en" />
      </ol>
      <div className="mt-8 h-[60rem]" aria-hidden />
    </PortalShell>
  );
}
