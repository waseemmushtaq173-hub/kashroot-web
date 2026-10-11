/**
 * GET /api/ai/check — sends Claude one tiny test question and reports what
 * Anthropic answered (or the exact error), so a failing assistant can be
 * traced. Never returns the key. Costs a fraction of a paisa per check.
 */
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { claudeClient, MODEL, throttled } from '@/lib/server/claude';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (throttled(req, 5)) return NextResponse.json({ error: 'Too many checks. Wait a minute.' }, { status: 429 });
  const client = claudeClient(30_000);
  const key = process.env.ANTHROPIC_API_KEY?.trim() ?? '';
  if (!client) return NextResponse.json({ ok: false, model: MODEL, problem: 'ANTHROPIC_API_KEY is not set for this deployment.' });
  try {
    const r = await client.messages.create({ model: MODEL, max_tokens: 64, messages: [{ role: 'user', content: 'Reply with the single word OK.' }] });
    const text = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(' ').trim();
    return NextResponse.json({ ok: true, model: r.model, reply: text, stop_reason: r.stop_reason });
  } catch (err) {
    const e = err as { status?: number; error?: { error?: { type?: string; message?: string } }; message?: string };
    return NextResponse.json({
      ok: false,
      model: MODEL,
      // Enough to recognise the key without revealing it.
      key: key ? `${key.slice(0, 10)}…${key.slice(-4)} (${key.length} characters)` : 'missing',
      workspace: process.env.ANTHROPIC_WORKSPACE_ID?.trim() || 'not set',
      status: e.status ?? null,
      type: e.error?.error?.type ?? (err instanceof Anthropic.APIConnectionError ? 'connection_error' : null),
      message: e.error?.error?.message ?? e.message ?? String(err),
    });
  }
}
