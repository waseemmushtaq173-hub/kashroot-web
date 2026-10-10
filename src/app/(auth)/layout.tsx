import type { Metadata } from 'next';

import { AuthShell } from '@/components/auth/AuthShell';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { template: '%s | KashRoot', default: 'KashRoot' },
  description: 'The agri-trade platform connecting growers, buyers, sellers and transporters.',
};

/** Sign-up, password and chooser pages share the premium 3D frame. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
