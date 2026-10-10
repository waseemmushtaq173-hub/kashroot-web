/**
 * Reads the Supabase settings forgivingly. Values pasted into Vercel often
 * carry quotes, spaces, a missing https://, an API path (/rest/v1) or even the
 * dashboard address — all of which make every sign-in fail with "Failed to
 * fetch". This turns them into the bare project origin.
 */
const unquote = (v?: string) => (v ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim();

/** `https://<ref>.supabase.co` (or a custom domain), or null when unusable. */
export function supabaseOrigin(raw?: string): string | null {
  let value = unquote(raw);
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    // The dashboard address: supabase.com/dashboard/project/<ref>/…
    const ref = /^(?:www\.)?supabase\.com$/i.test(url.hostname) ? /\/project\/([a-z0-9]+)/i.exec(url.pathname)?.[1] : null;
    return ref ? `https://${ref.toLowerCase()}.supabase.co` : url.origin;
  } catch {
    return null;
  }
}

export const supabaseAnonKey = (raw?: string) => unquote(raw);
