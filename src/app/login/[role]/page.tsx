/**
 * /login/farmer · /login/buyer · /login/seller — one dedicated sign-in per
 * role. Any other value 404s.
 *
 * Deliberately outside the (auth) route group: that group's layout wraps its
 * children in a half-width brand panel, and these pages carry their own
 * full-bleed story panel instead. /login itself still comes from
 * (auth)/login/page.tsx, which keeps the roles that have no dedicated page.
 *
 * `params` and `searchParams` are Promises from Next 15 on — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BuyerLogin } from '@/components/auth/BuyerLogin';
import { FarmerLogin } from '@/components/auth/FarmerLogin';
import { SellerLogin } from '@/components/auth/SellerLogin';
import { firstParam, isLoginRole, LOGIN_ROLES, ROLE_LABELS, type LoginRole } from '@/lib/auth/roles';

const LOGINS: Record<LoginRole, typeof FarmerLogin> = {
  farmer: FarmerLogin,
  buyer: BuyerLogin,
  seller: SellerLogin,
};

interface LoginPageProps {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export function generateStaticParams() {
  return LOGIN_ROLES.map((role) => ({ role }));
}

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const { role } = await params;
  return { title: isLoginRole(role) ? `${ROLE_LABELS[role]} sign in` : 'Sign in' };
}

export default async function RoleLoginPage({ params, searchParams }: LoginPageProps) {
  const { role } = await params;
  if (!isLoginRole(role)) notFound();

  // The dashboard guard sends `next`; the API client's 401 handler sends
  // `returnTo`. Either is honoured, and both are validated downstream.
  const query = await searchParams;
  const Login = LOGINS[role];
  return <Login next={firstParam(query.next) ?? firstParam(query.returnTo)} />;
}
