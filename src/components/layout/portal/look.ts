/**
 * What the portal frame adds to the PORTAL_THEMES palette: the ink of the
 * valley drawn behind the page (mountains, lake, shikara) and the deep
 * gradient of the one highlighted card (first stat card, app card). The
 * chinar leaves keep the theme's own `leaf` colour.
 *
 * Every class is a complete literal string so Tailwind keeps it; white text on
 * each `feature` gradient stays above 4.5:1.
 */
import type { PortalThemeId } from '@/components/portal/kit';

export interface ShellLook {
  /** Line and fill colour of the valley motif. */
  ink: string;
  /** Deep gradient behind white text. */
  feature: string;
}

/** Each portal's own season colours, over the one KashRoot frame (see BRAND in components/portal/kit). */
export const SHELL_LOOK: Record<PortalThemeId, ShellLook> = {
  farmer: { ink: '#0B4D3B', feature: 'bg-gradient-to-br from-emerald-800 via-emerald-900 to-[#04241D] ring-1 ring-amber-300/40' },
  buyer: { ink: '#134E4A', feature: 'bg-gradient-to-br from-teal-800 via-teal-900 to-[#04211E] ring-1 ring-teal-300/40' },
  seller: { ink: '#78350F', feature: 'bg-gradient-to-br from-amber-800 via-amber-900 to-[#2B1503] ring-1 ring-amber-300/40' },
  kissan: { ink: '#14532A', feature: 'bg-gradient-to-br from-green-800 via-green-900 to-[#0B2413] ring-1 ring-green-300/40' },
  rental: { ink: '#0C4A6E', feature: 'bg-gradient-to-br from-sky-800 via-sky-950 to-[#031E30] ring-1 ring-sky-300/40' },
  provider: { ink: '#312E81', feature: 'bg-gradient-to-br from-indigo-800 via-indigo-950 to-[#13103A] ring-1 ring-indigo-300/40' },
  dealer: { ink: '#451A03', feature: 'bg-gradient-to-br from-amber-900 via-stone-900 to-[#221203] ring-1 ring-amber-300/40' },
  admin: { ink: '#172554', feature: 'bg-gradient-to-br from-blue-900 via-[#0B1F3A] to-[#050E22] ring-1 ring-blue-300/40' },
  tracking: { ink: '#075985', feature: 'bg-gradient-to-br from-sky-800 via-sky-900 to-[#031E30] ring-1 ring-sky-300/40' },
  trader: { ink: '#3B0764', feature: 'bg-gradient-to-br from-violet-800 via-violet-950 to-[#1E0B33] ring-1 ring-violet-300/40' },
  expert: { ink: '#881337', feature: 'bg-gradient-to-br from-rose-800 via-rose-950 to-[#330713] ring-1 ring-rose-300/40' },
};

/** The look for a theme name as pages pass it (unknown names fall back like resolveTheme). */
export function shellLook(theme: string): ShellLook {
  return theme in SHELL_LOOK ? SHELL_LOOK[theme as PortalThemeId] : SHELL_LOOK.farmer;
}

/** "Ghulam Nabi Dar" → "GN"; one word → its first letter. Works for any script. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (w: string) => Array.from(w)[0] ?? '';
  return (words.length > 1 ? first(words[0]) + first(words[1]) : first(words[0] ?? '')).toUpperCase();
}
