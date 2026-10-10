/**
 * /register — the general create-account page, for visitors who have not
 * picked a portal yet: they choose the account type here. Old links that
 * carry ?role= go straight to that portal's own create-account page, which
 * never asks again.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignUpForm } from '@/components/auth/SignUpForm';
import { AUTH_ROUTES, REGISTER_ROLES } from '@/lib/auth/roles';

export const metadata: Metadata = { title: 'Create an account' };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ role?: string | string[] }> }) {
  const { role } = await searchParams;
  const portal = REGISTER_ROLES.find((r) => r.role === (Array.isArray(role) ? role[0] : role))?.portal;
  if (portal) redirect(AUTH_ROUTES.register(portal));
  return <SignUpForm />;
}
