/**
 * Retired: the seller mock-up that lived here never signed anyone in. The real
 * seller sign-in is /login/seller, so this route redirects there and keeps any
 * existing links and bookmarks working.
 *
 * `next` / `returnTo` are carried across so a deep link survives the hop; both
 * are validated by safeNextPath before they are used.
 */
import { redirect } from 'next/navigation';

import { firstParam, loginHref, safeNextPath } from '@/lib/auth/roles';

export default async function SellerLoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const requested = firstParam(query.next) ?? firstParam(query.returnTo);
  const next = safeNextPath(requested, '') || undefined;
  redirect(loginHref('seller', next));
}
