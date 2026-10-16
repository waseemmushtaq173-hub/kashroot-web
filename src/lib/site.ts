/**
 * The public address of the site, for search engines and link previews.
 * NEXT_PUBLIC_SITE_URL wins (set it when you add your own domain); on Vercel
 * the production domain is used; otherwise the current vercel.app address.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
  'https://kashroot-web.vercel.app'
).replace(/\/$/, '');

/**
 * KashRoot's own pages on other sites. Shown in the footer and given to
 * search engines (schema.org sameAs) so they know these belong to KashRoot.
 */
export const SOCIAL_LINKS: { label: string; href: string }[] = [
  { label: 'Instagram', href: 'https://www.instagram.com/kash_root/' },
];
