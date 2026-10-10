/**
 * /login/<portal> — one dedicated sign-in per portal (farmer, buyer, seller,
 * kissan, rental, logistics, tracking, dealer, expert, admin). Unknown
 * portals 404.
 *
 * `params` and `searchParams` are Promises in this Next version. `returnTo` is
 * accepted as an alias of `next` for older links.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { RoleLoginForm } from '@/components/auth/RoleLoginForm';
import { isPortalId, PORTAL_IDS, PORTALS } from '@/lib/auth/roles';

interface LoginPageProps {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export function generateStaticParams() {
  return PORTAL_IDS.map((role) => ({ role }));
}

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const { role } = await params;
  return { title: isPortalId(role) ? `${PORTALS[role].label} sign in` : 'Sign in' };
}

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

export default async function RoleLoginPage({ params, searchParams }: LoginPageProps) {
  const { role } = await params;
  if (!isPortalId(role)) notFound();

  const query = await searchParams;
  return <RoleLoginForm portal={role} next={first(query.next) ?? first(query.returnTo)} verified={first(query.verified) === '1'} />;
}
