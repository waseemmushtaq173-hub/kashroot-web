/** Where to go after the unlock: only an Admin or team page of this site — never another address, never the unlock page again. */
export function safeTeamNext(raw: string | null): string {
  if (!raw || raw.startsWith('//') || /[\\\s]/.test(raw)) return '/admin/dashboard';
  if (!/^\/(admin|team)(\/|\?|$)/.test(raw) || /^\/team\/unlock(\/|\?|$)/.test(raw)) return '/admin/dashboard';
  return raw;
}
