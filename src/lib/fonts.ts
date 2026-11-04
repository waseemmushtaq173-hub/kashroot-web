import { Playfair_Display } from 'next/font/google';

/**
 * The display serif: the KashRoot wordmark and every title (font-display, styles/design-tokens,
 * through --font-display-serif set on <html> in the root layout).
 */
export const brandSerif = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'], display: 'swap', variable: '--font-display-serif' });
