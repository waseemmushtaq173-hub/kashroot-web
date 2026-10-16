/**
 * The public address of the site, for search engines and link previews.
 * NEXT_PUBLIC_SITE_URL wins (set it when you add your own domain); on Vercel
 * the production domain is used; otherwise the current vercel.app address.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
  // The same value as Vercel exposes it to the browser.
  (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
  'https://kashroot-web.vercel.app'
).replace(/\/$/, '');

/**
 * The address for links people share or scan — QR codes, tracking and driver
 * links, sign-in emails. A one-off Vercel deployment address
 * (kashroot-web-abc123-team.vercel.app) becomes the real address, so a link
 * never opens an old copy of the site or Vercel's login wall. Your own
 * computer (localhost) keeps its address, for testing.
 */
export function publicOrigin(): string {
  if (typeof window === 'undefined') return SITE_URL;
  const { origin, hostname } = window.location;
  return hostname.endsWith('.vercel.app') ? SITE_URL : origin;
}

/**
 * KashRoot's own pages on other sites. Shown in the footer and given to
 * search engines (schema.org sameAs) so they know these belong to KashRoot.
 */
export const SOCIAL_LINKS: { label: string; href: string }[] = [
  { label: 'Instagram', href: 'https://www.instagram.com/kash_root/' },
  { label: 'Facebook', href: 'https://www.facebook.com/share/1Eqiz9C8wy/' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/kashroot-3103a3444/' },
];
