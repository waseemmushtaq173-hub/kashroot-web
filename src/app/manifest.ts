import type { MetadataRoute } from 'next';

/** Lets Chrome (and Android) install KashRoot like an app: "Install KashRoot". */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KashRoot — orchards, mandi rates & safe trade',
    short_name: 'KashRoot',
    description: 'Live mandi rates, weather, orchard health and escrow-protected trade for growers, buyers and sellers.',
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
  };
}
