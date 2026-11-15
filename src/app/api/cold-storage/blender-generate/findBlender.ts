/**
 * findBlender — local development only. Returns path to Blender executable.
 * Uses dynamic imports to avoid Turbopack static analysis.
 */
import { existsSync, readdirSync } from 'node:fs';
import { sep } from 'node:path';

/** Blender: env override, then the usual installs. */
export async function findBlender(): Promise<string | null> {
  if (process.env.BLENDER_EXE && existsSync(process.env.BLENDER_EXE)) {
    return process.env.BLENDER_EXE;
  }
  if (process.platform === 'win32') {
    const base = `${process.env['ProgramFiles'] ?? ''}${sep}Blender Foundation`;
    try {
      const newest = readdirSync(base)
        .filter((d: string) => /^blender\W/i.test(d))
        .sort()
        .reverse()
        .at(0);
      const exe = newest ? `${base}${sep}${newest}${sep}blender.exe` : null;
      if (exe && existsSync(exe)) return exe;
    } catch {
      // no install folder here
    }
    return null;
  }
  const exe =
    process.platform === 'darwin'
      ? `${sep}Applications${sep}Blender.app${sep}Contents${sep}MacOS${sep}Blender`
      : `${sep}usr${sep}bin${sep}blender`;
  return existsSync(exe) ? exe : null;
}

/** The generator needs at least one chamber with length, width and height. */
export function badPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return 'body must be a JSON object';
  const chambers = (payload as { chambers?: unknown }).chambers;
  if (!Array.isArray(chambers) || chambers.length === 0) return 'body.chambers: at least one chamber is required';
  for (const [i, c] of (chambers as unknown[]).entries()) {
    const ch = c as Record<string, unknown>;
    const has = (k: string) => typeof ch[k] === 'number' && Number.isFinite(ch[k]);
    if (!has('length') || !has('width') || !has('height')) return `body.chambers[${i}]: needs length, width and height in metres`;
  }
  return null;
}