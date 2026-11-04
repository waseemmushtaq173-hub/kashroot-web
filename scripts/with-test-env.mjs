#!/usr/bin/env node
/**
 * Runs a command with the LOCAL test environment (.env.test, from scripts/seed-demo.mjs) on top of
 * the usual settings, e.g. `node scripts/with-test-env.mjs npx next build --webpack`. Refuses if
 * .env.test points anywhere but this computer. Prints no values.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

if (!existsSync('.env.test')) {
  console.error('No .env.test: run `npx supabase start` and `node scripts/seed-demo.mjs` first.');
  process.exit(1);
}
const vars = Object.fromEntries(
  readFileSync('.env.test', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!['localhost', '127.0.0.1', '::1'].includes(new URL(vars.NEXT_PUBLIC_SUPABASE_URL ?? 'http://invalid').hostname)) {
  console.error('Refusing: .env.test does not point at a local Supabase.');
  process.exit(1);
}
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, ...vars } });
process.exit(r.status ?? 1);
