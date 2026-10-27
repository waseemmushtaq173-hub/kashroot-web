import type { MetadataRoute } from 'next';

/**
 * Lets Chrome (and Android) install KashRoot like an app: "Install KashRoot".
 * Installed, it opens with no signal too (public/sw.js); the shortcuts open
 * the pages most used in the field.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KashRoot — orchards, mandi rates & safe trade',
    short_name: 'KashRoot',
    description: 'Live mandi rates, weather, orchard health and pay-after-delivery trade for growers, buyers and sellers.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7fdf9',
    theme_color: '#047857',
    lang: 'en-IN',
    categories: ['business', 'productivity', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Mandi rates & weather', short_name: 'Mandi rates', url: '/mandi-weather', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Ask an expert', short_name: 'Ask expert', url: '/farmer/ask-expert', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
    ],
  };
}
