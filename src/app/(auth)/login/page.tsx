/**
 * /login — sign-in for the roles with no dedicated page: Admin, Expert, Kissan
 * Partner, Logistics and Rental.
 *
 * Farmers, buyers and sellers each have their own page under /login/<role>, so
 * `?role=FARMER|BUYER|SELLER` is redirected there rather than offered in the
 * picker. Links to all three sit above the form as well, since this is where
 * the API client's 401 handler sends everyone.
 *
 * Provider is in the picker although the integration brief named only Admin,
 * Expert, Kissan Partner and Rental: /provider/dashboard is guarded on the
 * PROVIDER role, so leaving it out would make that dashboard unreachable — the
 * exact gap the previous commit fixed.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { OtherRolesLoginForm, type RoleOption } from '@/components/auth/OtherRolesLoginForm';
import { PORTALS } from '@/lib/auth/portals';
import { firstParam, loginRoleForSessionRole, loginHref, safeNextPath } from '@/lib/auth/roles';

export const metadata: Metadata = {
  title: 'Partner & staff sign-in',
};

/**
 * Everything except the three roles with a page of their own, reduced to the
 * fields the client form needs: the registry's `icon` is a React component and
 * functions cannot be passed to a Client Component.
 */
const OTHER_PORTALS: RoleOption[] = PORTALS.filter((portal) => !portal.primary).map(
  ({ role, accountLabel, dashboard, accent }) => ({ role, accountLabel, dashboard, accent }),
);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const requestedNext = firstParam(query.next) ?? firstParam(query.returnTo);
  const next = safeNextPath(requestedNext, '') || undefined;

  // A dedicated role asked for by name goes to its own page.
  const requestedRole = firstParam(query.role);
  const dedicated = loginRoleForSessionRole(requestedRole?.toUpperCase());
  if (dedicated) redirect(loginHref(dedicated, next));

  const preselected = OTHER_PORTALS.some((portal) => portal.role === requestedRole?.toUpperCase())
    ? requestedRole!.toUpperCase()
    : OTHER_PORTALS[0].role;

  return <OtherRolesLoginForm portals={OTHER_PORTALS} initialRole={preselected} next={next} />;
}
