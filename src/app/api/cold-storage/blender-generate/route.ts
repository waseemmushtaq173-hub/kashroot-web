/**
 * /api/cold-storage/blender-generate — the owner's save → the Blender
 * 5.2.3 LTS generator. When the owner saves the chambers (the wizard step
 * 3), the portal fires this route with the very payload that was saved: it
 * launches the installed Blender headless (scripts/blender_generate_coldstore.py)
 * and three artifacts land in public/models/:
 *
 *   coldstore_kit.glb                six instancing prototypes (crate, bin,
 *                                    apples, rack post/beam, evaporator)
 *   coldstore_facility_twin.glb      the whole measured facility, built by
 *                                    the package's own geometry builder
 *   coldstore_metadata.json          generator identity + capacity totals
 *
 * Nothing invents a number: sizes and totals are the generator's own
 * (`[bgen] RESULT …`), echoed verbatim. On the deployed site the artifacts
 * ship statically — this route answers with an honest no (503) and the
 * already-shipped GLBs keep the 3D views fed.
 */
import { NextResponse } from 'next/server';

import { ipLimited, tooMany } from '@/lib/server/sign';

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/** The three artifacts the Blender generator must leave in public/models/. */
const ARTIFACTS = [
  { name: 'coldstore_kit.glb', role: 'kit GLB (six instancing prototypes)' },
  { name: 'coldstore_facility_twin.glb', role: 'facility GLB (Blender-built scene)' },
  { name: 'coldstore_metadata.json', role: 'generator + capacity metadata' },
];

/** The generator needs at least one chamber with length, width and height. */
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

/** Blender: env override, then the usual installs. Every path is built at
 * run time — a rooted literal here is a build-time foldable one, and this
 * route knows nothing of the file system at build time. */
function findBlender(): string | null {
  const sep = process.platform === 'win32' ? '\\' : '/';
  if (process.env.BLENDER_EXE && existsSync(process.env.BLENDER_EXE)) {
    return process.env.BLENDER_EXE;
  }
  if (process.platform === 'win32') {
    const base = `${process.env['ProgramFiles'] ?? ''}${sep}Blender Foundation`;
    try {
      const newest = readdirSync(base)
        .filter((d) => /^blender\W/i.test(d))
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

/** Run the generator against a payload and reply with its own RESULT line. */
export async function POST(request: Request) {
  if (process.env.VERCEL === '1') {
    return NextResponse.json(
      { ok: false, error: 'The twin is generated on the store machine where Blender lives, not on the deployed site (there the shipped GLBs are used as they are).' },
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

  const sep = process.platform === 'win32' ? '\\' : '/';
  const root = process.cwd();
  const script = [root, 'scripts', 'blender_generate_coldstore.py'].join(sep);
  if (!existsSync(script)) {
    return NextResponse.json({ ok: false, error: 'generator script missing (scripts/blender_generate_coldstore.py)' }, { status: 500 });
  }
  const blender = findBlender();
  if (!blender) {
    return NextResponse.json(
      { ok: false, error: 'Blender is not installed (looked: BLENDER_EXE, then the usual install folders). The web keeps its procedural kit meanwhile.' },
      { status: 500 },
    );
  }

  const tmp = path.join(tmpdir(), `kashroot-bgen-${Date.now()}.json`);
  try {
    writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    const res = await new Promise<{ code: number; out: string; err: string }>((resolve) => {
      const child = spawn(blender, ['--background', '--python', script, '--', tmp, '--out-dir', [root, 'public', 'models'].join(sep)] /*turbopackIgnore: true*/, {
        cwd: root,
        env: { ...process.env, KASHROOT_BRIDGE_PAYLOAD_FILE: tmp, KASHROOT_BRIDGE_OUT: [root, 'public', 'models'].join(sep) },
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk: string | Buffer) => (out += String(chunk)));
      child.stderr.on('data', (chunk: string | Buffer) => (err += String(chunk)));
      child.on('error', (e) => resolve({ code: -1, out, err: `${err}${e.message}` }));
      child.on('close', (code) => resolve({ code: code ?? -1, out, err }));
    });
    const line = res.out.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('[bgen] RESULT '));
    let bgen: { ok?: boolean } & Record<string, unknown> | null = null;
    if (line) {
      try {
        bgen = JSON.parse(line.slice('[bgen] RESULT '.length)) as { ok?: boolean } & Record<string, unknown>;
      } catch {
        bgen = null;
      }
    }
    if (res.code !== 0 || !bgen?.ok) {
      return NextResponse.json(
        { ok: false, error: 'Blender run failed', detail: (res.err || res.out).slice(-1200), bgen },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, ...bgen });
  } finally {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // a temp left behind on a locked file is harmless
    }
  }
}

/** Pipeline status: artifacts with sizes + where Blender was found. */
export async function GET(request: Request) {
  if (ipLimited(request, 'blender-generate', 60)) return tooMany();
  const sep = process.platform === 'win32' ? '\\' : '/';
  const root = process.cwd();
  const models = [root, 'public', 'models'].join(sep);
  const describe = (a: { name: string; role: string }) => {
    const p = [models, a.name].join(sep);
    const on = existsSync(p);
    return {
      name: a.name,
      role: a.role,
      bytes: on ? statSync(p).size : null,
      updatedAt: on ? statSync(p).mtime.toISOString() : null,
    };
  };
  if (process.env.VERCEL === '1') {
    return NextResponse.json(
      { runtime: 'static', note: 'On this deployed site the twin files are the ones generated with Blender on the store machine and shipped in public/models.', artifacts: ARTIFACTS.map(describe) },
      { status: 503 },
    );
  }
  return NextResponse.json({ runtime: 'local', artifacts: ARTIFACTS.map(describe), blender: findBlender() });
}
