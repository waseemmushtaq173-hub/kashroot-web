import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PortalLoginForm } from '@/components/auth/PortalLoginForm';
import {
  ACCENT_BADGE,
  ACCENT_HEADING,
  ACCENT_LINK,
  ACCENT_PAGE,
  SHARED_LOGIN_PORTALS,
  portalBySlug,
  sanitizePath,
  withReturnTo,
} from '@/lib/auth/portals';

/**
 * Shared sign-in page for the partner and staff portals. The three trade
 * portals keep their own designed pages and redirect here-to-there, so every
 * role in the registry has exactly one reachable sign-in route.
 */
export function generateStaticParams() {
  return SHARED_LOGIN_PORTALS.map(({ slug }) => ({ portal: slug }));
}

export default async function SharedPortalLogin({
  params,
  searchParams,
}: {
  params: Promise<{ portal: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { portal: slug } = await params;
  const { returnTo } = await searchParams;
  const destination = sanitizePath(returnTo);
  const portal = portalBySlug(slug);
  if (!portal) notFound();
  if (portal.primary) redirect(portal.loginHref);

  const Icon = portal.icon;

  return (
    <main className={`min-h-screen flex items-center justify-center px-4 py-12 ${ACCENT_PAGE[portal.accent]}`}>
      <section className="w-full max-w-md rounded-3xl border border-white bg-white/85 p-8 shadow-xl backdrop-blur-xl text-slate-800">
        <div className="mb-7 text-center">
          <span className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${ACCENT_BADGE[portal.accent]}`}>
            <Icon className="h-6 w-6" />
          </span>
          <h1 className={`text-3xl font-bold ${ACCENT_HEADING[portal.accent]}`}>{portal.label}</h1>
          <p className="mt-2 text-slate-600">{portal.detail}</p>
        </div>
        <PortalLoginForm role={portal.role} returnTo={destination} />
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href={withReturnTo('/login', destination)} className={ACCENT_LINK[portal.accent]}>← All sign-in options</Link>
        </p>
      </section>
    </main>
  );
}
