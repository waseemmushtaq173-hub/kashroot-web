/**
 * /register/<portal> — each portal's own create-account page. It looks like
 * that portal's sign-in (same story, colours and 3D valley) and the account
 * type is fixed by the portal, so nobody is asked which kind they want.
 * Admin has no self sign-up; unknown portals 404.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PortalAuthFrame } from '@/components/auth/PortalAuthFrame';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { isPortalId, PORTALS, SIGNUP_PORTALS } from '@/lib/auth/roles';

interface Props {
  params: Promise<{ portal: string }>;
}

export function generateStaticParams() {
  return SIGNUP_PORTALS.map((portal) => ({ portal }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { portal } = await params;
  return { title: isPortalId(portal) ? `Create a ${PORTALS[portal].label} account` : 'Create an account' };
}

export default async function PortalRegisterPage({ params }: Props) {
  const { portal } = await params;
  if (!isPortalId(portal) || !SIGNUP_PORTALS.includes(portal)) notFound();
  return (
    <PortalAuthFrame portal={portal} labelledBy="signup-heading">
      <SignUpForm portal={portal} headingId="signup-heading" />
    </PortalAuthFrame>
  );
}
