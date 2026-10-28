'use client';

/**
 * The browser side of the "human pass" (lib/server/humanPass): does this
 * browser hold one (asked once a page), and the two page events —
 *   kr-need-human  something was refused for want of a pass: a HumanGate
 *                  on screen shows the "I am human" check;
 *   kr-human-pass  a pass was just given: work waiting for it can go on.
 */
let known: Promise<boolean> | null = null;

/** True when the check is off, or this browser holds a pass. */
export function humanPassReady(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(true);
  known ??= fetch('/api/human', { cache: 'no-store' })
    .then((r) => r.json())
    .then((d: { on?: boolean; pass?: boolean }) => !d.on || Boolean(d.pass))
    .catch(() => true);
  return known;
}

/** A request was refused for want of a pass: forget the cached answer and ask a gate to show the check. */
export function needHumanPass(): void {
  known = Promise.resolve(false);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kr-need-human'));
}

/** Hand the server a fresh Turnstile token; true when the pass was given. */
export async function claimHumanPass(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/human', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    if (!res.ok) return false;
    known = Promise.resolve(true);
    window.dispatchEvent(new Event('kr-human-pass'));
    return true;
  } catch {
    return false;
  }
}

/** Was this response a "do the human check first"? (It also tells the gates.) */
export async function refusedForPass(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const data = (await res.clone().json().catch(() => null)) as { needHuman?: boolean } | null;
  if (!data?.needHuman) return false;
  needHumanPass();
  return true;
}
