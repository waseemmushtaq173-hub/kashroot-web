/**
 * What the portal frame adds to each PORTAL_THEMES palette: the ink of the
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

export const SHELL_LOOK: Record<PortalThemeId, ShellLook> = {
  farmer: { ink: '#065F46', feature: 'bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-950' },
  buyer: { ink: '#075985', feature: 'bg-gradient-to-br from-sky-700 via-sky-800 to-indigo-950' },
  seller: { ink: '#92400E', feature: 'bg-gradient-to-br from-amber-700 via-orange-800 to-orange-950' },
  kissan: { ink: '#7C2D12', feature: 'bg-gradient-to-br from-orange-700 via-orange-800 to-stone-900' },
  rental: { ink: '#5B21B6', feature: 'bg-gradient-to-br from-violet-700 via-violet-800 to-purple-950' },
  provider: { ink: '#115E59', feature: 'bg-gradient-to-br from-teal-700 via-teal-800 to-cyan-950' },
  dealer: { ink: '#9F1239', feature: 'bg-gradient-to-br from-rose-700 via-rose-800 to-red-950' },
  admin: { ink: '#3730A3', feature: 'bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900' },
  tracking: { ink: '#155E75', feature: 'bg-gradient-to-br from-cyan-700 via-cyan-800 to-sky-950' },
  trader: { ink: '#115E59', feature: 'bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-950' },
  expert: { ink: '#6B21A8', feature: 'bg-gradient-to-br from-purple-700 via-purple-800 to-fuchsia-950' },
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
