/**
 * Kashmiri answers. Every Kashmiri reply from the assistant goes through here:
 *
 *   1. Standing rules for writing Kashmiri (Koshur) — not Urdu — go into the
 *      AI's instructions (kashmiriSystem).
 *   2. The reply is checked for Urdu-only words (ہے، نہیں، آپ …); if it reads
 *      as Urdu it is rewritten once in Kashmiri (finishKashmiri).
 *
 * KASHMIRI_MODEL (optional, Vercel) makes Kashmiri answers use a stronger
 * model than the everyday one. Server-only.
 */
import 'server-only';

import type Anthropic from '@anthropic-ai/sdk';

import { urduSigns } from '@/lib/kashmiri/text';
import { LANGUAGE, MODEL, speechInstruction, splitSpeech, textOf } from '@/lib/server/claude';

/** The model for Kashmiri answers: KASHMIRI_MODEL when set (e.g. claude-sonnet-5-5), else the everyday one. */
export const KS_MODEL = (() => {
  const m = process.env.KASHMIRI_MODEL?.trim();
  return m && /^claude-[a-z0-9.-]+$/.test(m) ? m : MODEL;
})();

/** Where Kashmiri differs from Urdu — the mistakes that make an answer read as Urdu. */
const KASHMIRI_RULES = `Write real Kashmiri (Koshur) as people in the Valley speak it — not Urdu with a few Kashmiri words:
- Use Kashmiri's own grammar words: چھُ / چھےٚ / چھِ for "is / are" (never ہے / ہیں), نہٕ for "not" (never نہیں), تُہۍ for polite "you" (never آپ), تہٕ for "and" (never اور), منٛز for "in" (never میں).
- Kashmiri puts the verb second in the sentence; Urdu puts it last. Follow Kashmiri word order.
- Polite requests take the Kashmiri ending ـِو, as in کٔرِو and وُچھِو.
- Spell words the Kashmiri way, with Kashmiri letters and vowel marks (ٲ، ۄ، ٕ، ٚ، ؠ), not plain Urdu spelling.
- Use the everyday words a grower in Kashmir uses. Where people normally say the English or Urdu word (app, UPI, mandi rate, cold store), keep that word.`;

/** Standing instructions for Kashmiri replies — the same for every question, so they can be cached. */
export function kashmiriSystem(): string {
  return `Kashmiri replies: the person chose Kashmiri. Answer only in ${LANGUAGE.ks} — whatever language they asked in, and also when you quote prices, weather or KashRoot's buttons (keep only the button names, numbers and units as they are). Never answer in Urdu, Hindi or English, and never mix them in.\n\n${KASHMIRI_RULES}`;
}

/** Rewrites text that came out as Urdu into Kashmiri. */
async function rewrite(client: Anthropic, text: string, wantDevanagari: boolean): Promise<{ text: string; speech?: string } | null> {
  const response = await client.beta.messages.create({
    model: KS_MODEL,
    max_tokens: 3000,
    system: `You correct text that should be Kashmiri (Koshur) but has Urdu words or Urdu grammar in it. Rewrite all of it in ${LANGUAGE.ks}. Keep the meaning, numbers, prices, units, place names and English button names exactly as they are. Output only the corrected Kashmiri.${wantDevanagari ? ` ${speechInstruction('ks')}` : ''}\n\n${KASHMIRI_RULES}`,
    messages: [{ role: 'user', content: text }],
    output_config: { effort: 'medium' },
  });
  const full = textOf(response.content);
  return full ? splitSpeech(full) : null;
}

/** The last step for every Kashmiri reply: rewritten once if it reads as Urdu. */
export async function finishKashmiri(
  text: string,
  opts: { client: Anthropic | null; wantDevanagari?: boolean; speech?: string },
): Promise<{ reply: string; speech?: string; rewritten: boolean }> {
  let reply = text;
  let speech = opts.speech;
  let rewritten = false;
  const before = urduSigns(reply);
  if (before.leaks && opts.client) {
    const fixed = await rewrite(opts.client, reply, Boolean(opts.wantDevanagari)).catch(() => null);
    if (fixed?.text) {
      const after = urduSigns(fixed.text);
      if (!after.leaks || after.found.length < before.found.length) {
        reply = fixed.text;
        // The old Devanagari copy belongs to the old wording.
        speech = fixed.speech;
        rewritten = true;
      }
    }
  }
  return { reply, ...(speech ? { speech } : {}), rewritten };
}
