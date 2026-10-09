/**
 * /login/farmer · /login/buyer · /login/seller — one dedicated sign-in per
 * portal, replacing the global "Welcome back" page. Any other role 404s.
 *
 * Lives outside the (auth) route group on purpose: that group's layout adds a
 * split brand panel, and these pages bring their own full-screen layout.
 *
 * `params` and `searchParams` are Promises in this Next version, so they are
 * awaited. `returnTo` is accepted as an alias of `next` because the dashboards
 * layout used that name before role logins existed.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BuyerLogin } from '@/components/auth/BuyerLogin';
import { FarmerLogin } from '@/components/auth/FarmerLogin';
import { SellerLogin } from '@/components/auth/SellerLogin';
import { isPortalRole, ROLE_LABELS, type PortalRole } from '@/lib/auth/roles';

const LOGINS: Record<PortalRole, typeof FarmerLogin> = {
  farmer: FarmerLogin,
  buyer: BuyerLogin,
  seller: SellerLogin,
};

interface LoginPageProps {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const { role } = await params;
  return { title: isPortalRole(role) ? `${ROLE_LABELS[role]} sign in | KashRoot` : 'Sign in | KashRoot' };
}

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

export default async function RoleLoginPage({ params, searchParams }: LoginPageProps) {
  const { role } = await params;
  if (!isPortalRole(role)) notFound();

  const query = await searchParams;
  const Login = LOGINS[role];
  return (
    <Login
      next={first(query.next) ?? first(query.returnTo)}
      verified={first(query.verified) === '1'}
    />
  );
}
