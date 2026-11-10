/**
 * /api/cold-storage/blender-sync — the owner's Cold Storage portal ↔ the
 * Blender digital-twin bridge. The bridge (scripts/blender_kashroot_bridge.py)
 * is the one code path that turns the owner's own measurements into the web's
 * twin: it runs under plain Python (this route) or inside Blender itself (the
 * VS Code Blender extension) and writes the same three artifacts into
 * public/models/:
 *
 *   kashroot_facility_twin.glb        the whole store as a real glTF binary
 *   kashroot_rack_stack.glb           one high-detail instanced rack bay
 *   kashroot_coldstore_metadata.json  the exact capacity, layout, grower totals
 *
 * Nothing here invents a number: the totals in the reply are the pipeline's
 * own (`[bridge] RESULT …`), read back verbatim. The artifacts ship statically
 * — a deployed site reads them from public/, so this route answers with a
 * clear no on Vercel (where spawning Python and writing the repo is not a
 * thing) and the full answer on the owner machine and in dev.
 */
import { NextResponse } from 'next/server';

import { ipLimited, tooMany } from '@/lib/server/sign';

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/** The three artifacts the bridge must leave in public/models/. */
const ARTIFACTS = [
  { name: 'kashroot_facility_twin.glb', role: 'facility GLB (whole store)' },
  { name: 'kashroot_rack_stack.glb', role: 'rack-stack GLB (instanced bay)' },
  { name: 'kashroot_coldstore_metadata.json', role: 'capacity + layout metadata' },
];

/** The owner payload needs at least chambers with a length, width and height each. */
function badPayload(payload: unknown): string | null {
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

/** A python command that answers (where.exe, else the bare name from PATH). */
function findPython(): string {
  try {
    const out = execFileSync('where.exe', ['python'], { encoding: 'utf8', timeout: 5000 });
    const hit = out.split(/\r?\n/).find((l) => l.toLowerCase().endsWith('python.exe'));
    if (hit) return hit.trim();
  } catch {
    // no python on PATH at all; the run's own error is the right reply then
  }
  return 'python';
}

/** Blender, for the VS Code Blender session: settings, PATH, then the usual installs.
 * Every path is built at run time: a rooted literal here is a Turbopack-foldable
 * one, and this route knows nothing of the file system at build time. */
function findBlender(root: string): { found: boolean; where: string | null } {
  const sep = process.platform === 'win32' ? '\\' : '/';
  // The project's own .vscode settings ("blender.executablePath") speak first:
  try {
    const cfgPath = [root || '', '.vscode', 'settings.json'].join(sep);
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) as { 'blender.executablePath'?: string };
    const p = cfg['blender.executablePath'];
    if (p && existsSync(p)) return { found: true, where: p };
  } catch {
    // no settings, fine
  }
  // A Blender on the PATH (blender --background … runs the bridge as the CLI):
  try {
    const out = execFileSync('where.exe', ['blender'], { encoding: 'utf8', timeout: 5000 });
    const hit = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).sort().at(-1);
    if (hit) return { found: true, where: hit };
  } catch {
    // nothing on the PATH
  }
  // The Windows install folder ('C:\Program Files\Blender Foundation\Blender N\blender.exe');
  // the version folder comes from the disk itself, newest first.
  if (process.platform === 'win32') {
    const base = `${process.env['ProgramFiles'] ?? ''}${sep}Blender Foundation`;
    try {
      const newest = readdirSync(base)
        .filter((d) => /^blender\W/i.test(d))
        .sort()
        .reverse()
        .at(0);
      const exe = newest ? `${base}${sep}${newest}${sep}blender.exe` : null;
      if (exe && existsSync(exe)) return { found: true, where: exe };
    } catch {
      // no install folder here
    }
    return { found: false, where: null };
  }
  const exe = process.platform === 'darwin' ? `/Applications${sep}Blender.app${sep}Contents${sep}MacOS${sep}Blender` : `${sep}usr${sep}bin${sep}blender`;
  return { found: existsSync(exe), where: existsSync(exe) ? exe : null };
}

/** Run the bridge against a payload and reply with its own RESULT line. */
export async function POST(request: Request) {
  if (process.env.VERCEL === '1') {
    return NextResponse.json(
      { ok: false, error: `The twin's artifacts are generated on the store's machine, not on the deployed site. Run the bridge where the repository lives (dev, or VS Code → Blender).` },
      { status: 503 },
    );
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'body must be JSON' }, { status: 400 });
  }
  const bad = badPayload(payload);
  if (bad) return NextResponse.json({ ok: false, error: bad }, { status: 400 });

  const root = process.cwd();
  const script = path.join(root, 'scripts', 'blender_kashroot_bridge.py');
  if (!existsSync(script)) return NextResponse.json({ ok: false, error: 'bridge script missing (scripts/blender_kashroot_bridge.py)' }, { status: 500 });

  const tmp = path.join(tmpdir(), `kashroot-bridge-${Date.now()}.json`);
  try {
    writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    const res = await new Promise<{ code: number; out: string; err: string }>((resolve) => {
      // Not tracing the project for the child process: python and the script live on the
      // owner machine, not in the server bundle.
      const child = spawn(/* turbopackIgnore: true */ findPython(), [script, '--', tmp, '--out-dir', path.join(root, 'public', 'models')], {
        cwd: root,
        env: { ...process.env, KASHROOT_BRIDGE_PAYLOAD_FILE: tmp, KASHROOT_BRIDGE_OUT: path.join(root, 'public', 'models') },
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk: string | Buffer) => (out += String(chunk)));
      child.stderr.on('data', (chunk: string | Buffer) => (err += String(chunk)));
      child.on('error', (e) => resolve({ code: -1, out, err: `${err}${e.message}` }));
      child.on('close', (code) => resolve({ code: code ?? -1, out, err }));
    });
    const line = res.out.split(/\r?\n/).filter((l) => l.startsWith('[bridge]')).at(-1);
    let bridge: unknown = null;
    if (line?.startsWith('[bridge] ')) {
      try {
        bridge = JSON.parse(line.slice(9));
      } catch {
        bridge = null;
      }
    }
    if (res.code !== 0 || !bridge) {
      return NextResponse.json(
        { ok: false, error: 'bridge run failed', detail: (res.err || res.out).slice(-1200), bridge },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, ...(bridge as object) });
  } finally {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // a temp left behind on a locked file is harmless
    }
  }
}

/** Pipeline status: the artifacts with sizes, and where Blender (and so the live scene build) is. */
export async function GET(request: Request) {
  if (ipLimited(request, 'blender-sync', 60)) return tooMany();
  const root = process.cwd();
  const models = path.join(root, 'public', 'models');
  const artifacts = ARTIFACTS.map((a) => {
    const p = path.join(models, a.name);
    const on = existsSync(p);
    return {
      name: a.name,
      role: a.role,
      bytes: on ? statSync(p).size : null,
      updatedAt: on ? statSync(p).mtime.toISOString() : null,
    };
  });
  return NextResponse.json({ runtime: 'local', artifacts, blender: findBlender(root) });
}
