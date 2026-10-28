/**
 * GET /api/ai/check — sends Claude one tiny test question and reports what
 * Anthropic answered (or the exact error), so a failing assistant can be
 * traced. Never returns any part of the key or the workspace id (anyone can
 * call it). Costs a fraction of a paisa per check.
 */
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

import { aiLimited, claudeClient, MODEL } from '@/lib/server/claude';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (await aiLimited(req, 'check', 5, 30)) return NextResponse.json({ error: 'Too many checks. Wait a minute.' }, { status: 429 });
  const client = claudeClient(30_000);
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
      // This answer is public: nothing about the key or workspace, only what Anthropic said.
      workspace_set: Boolean(process.env.ANTHROPIC_WORKSPACE_ID?.trim()),
      status: e.status ?? null,
      type: e.error?.error?.type ?? (err instanceof Anthropic.APIConnectionError ? 'connection_error' : null),
      message: e.error?.error?.message ?? e.message ?? String(err),
    });
  }
}
