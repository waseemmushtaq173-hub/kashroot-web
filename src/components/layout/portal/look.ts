/**
 * What the portal frame adds to the PORTAL_THEMES palette: the ink of the
 * valley drawn behind the page (mountains, lake, shikara) and the deep
 * gradient of the one highlighted card (first stat card, app card, the
 * avatar). The chinar leaves keep the theme's own `leaf` colour.
 *
 * Every class is a complete literal string so Tailwind keeps it; white text on
 * the `feature` gradient stays above 6:1.
 */
import type { PortalThemeId } from '@/components/portal/kit';

export interface ShellLook {
  /** Line and fill colour of the valley motif. */
  ink: string;
  /** Deep gradient behind white text. */
  feature: string;
}

/** Every portal wears the one KashRoot green (see BRAND in components/portal/kit). */
const FOREST: ShellLook = {
  ink: '#3730A3',
  feature: 'bg-gradient-to-br from-forest-mid via-forest to-forest-deep ring-1 ring-champagne/40',
};

export const SHELL_LOOK: Record<PortalThemeId, ShellLook> = {
  farmer: FOREST,
  buyer: FOREST,
  seller: FOREST,
  kissan: FOREST,
  rental: FOREST,
  provider: FOREST,
  dealer: FOREST,
  admin: FOREST,
  tracking: FOREST,
  trader: FOREST,
  expert: FOREST,
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
