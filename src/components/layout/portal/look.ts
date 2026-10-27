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

/** Every portal shares the KashRoot look (see BRAND in components/portal/kit). */
const BRAND_LOOK: ShellLook = { ink: '#0B4D3B', feature: 'bg-gradient-to-br from-emerald-800 via-emerald-900 to-[#04241D] ring-1 ring-amber-300/40' };

export const SHELL_LOOK: Record<PortalThemeId, ShellLook> = {
  farmer: BRAND_LOOK,
  buyer: BRAND_LOOK,
  seller: BRAND_LOOK,
  kissan: BRAND_LOOK,
  rental: BRAND_LOOK,
  provider: BRAND_LOOK,
  dealer: BRAND_LOOK,
  admin: BRAND_LOOK,
  tracking: BRAND_LOOK,
  trader: BRAND_LOOK,
  expert: BRAND_LOOK,
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
