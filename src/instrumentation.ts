/**
 * Runs once when a server instance starts (Next.js instrumentation).
 *
 * Refuses to start when a server secret has been put where it would reach
 * every browser: a NEXT_PUBLIC_* variable is built into the pages, so a
 * Supabase service-role or secret key there (or a "secret" name) would be
 * published to anyone. Better the deploy fails than the key leaks.
 *
 * Warns, without stopping, about settings that are missing: the site still
 * works, with that part switched off, and the log says which.
 */

/** A Supabase key's role: "anon", "service_role"… (JWT keys); null for the newer publishable keys. */
function jwtRole(key: string): string | null {
  const part = key.split('.')[1];
  if (!part) return null;
  try {
    return (JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const problems: string[] = [];
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('NEXT_PUBLIC_') || !value) continue;
    if (/SECRET|SERVICE_ROLE|PRIVATE|PASSWORD/i.test(name)) problems.push(`${name} looks like a secret, but NEXT_PUBLIC_ variables are sent to every browser.`);
    if (/^sb_secret_/.test(value.trim()) || jwtRole(value.trim()) === 'service_role') problems.push(`${name} holds a Supabase secret / service-role key, which must never reach browsers.`);
  }
  if (problems.length) {
    throw new Error(`KashRoot will not start: ${problems.join(' ')} Move it to a variable without NEXT_PUBLIC_ in Vercel, and rotate the key in Supabase.`);
  }

  const missing = (names: string[]) => names.filter((n) => !process.env[n]?.trim());
  const needed = missing(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  if (needed.length) console.warn(`[setup] ${needed.join(', ')} not set: sign-in and every portal are off.`);
  const helpful: Record<string, string> = {
    KYC_DB_SECRET: 'identity checks are not recorded; shared rate limits and kept copies of outside sources use this server only',
    ANTHROPIC_API_KEY: 'the assistant answers in basic mode and photo checks are off',
    OTP_SECRET: 'one-time codes use a key derived from the provider secrets',
  };
  for (const name of missing(Object.keys(helpful))) console.warn(`[setup] ${name} not set: ${helpful[name]}.`);
}
