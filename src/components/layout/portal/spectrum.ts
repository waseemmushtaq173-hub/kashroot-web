/**
 * The soft spectrum of the phone menus (a portal's side panel, the Tracking menu): one pale colour for each entry, going round
 * red, orange, yellow, green, teal, blue, violet, pink. A chip behind the icon and a tint for the open entry, never a dark block,
 * so a menu is a rainbow on a light page and nothing shouts. Class names are written out so Tailwind keeps them.
 */
export const SPECTRUM = [
  { chip: 'bg-rose-100 text-rose-700', on: 'bg-rose-50 ring-rose-200' },
  { chip: 'bg-orange-100 text-orange-700', on: 'bg-orange-50 ring-orange-200' },
  { chip: 'bg-amber-100 text-amber-700', on: 'bg-amber-50 ring-amber-200' },
  { chip: 'bg-emerald-100 text-emerald-700', on: 'bg-emerald-50 ring-emerald-200' },
  { chip: 'bg-teal-100 text-teal-700', on: 'bg-teal-50 ring-teal-200' },
  { chip: 'bg-sky-100 text-sky-700', on: 'bg-sky-50 ring-sky-200' },
  { chip: 'bg-violet-100 text-violet-700', on: 'bg-violet-50 ring-violet-200' },
  { chip: 'bg-fuchsia-100 text-fuchsia-700', on: 'bg-fuchsia-50 ring-fuchsia-200' },
] as const;

/** The thin rainbow line along the top of a light panel (the one the site draws under its banners). */
export const RAINBOW_LINE = 'h-1 w-full bg-[linear-gradient(90deg,#fb7185,#fb923c,#fbbf24,#34d399,#2dd4bf,#38bdf8,#a78bfa,#e879f9)]';

/** The gentle tint behind a light panel. */
export const PANEL_TINT = 'bg-[linear-gradient(180deg,#fff7f5_0%,#f4faff_55%,#f8f5ff_100%)]';
