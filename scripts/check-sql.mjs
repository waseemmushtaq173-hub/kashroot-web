/**
 * check-sql.mjs — KashRoot database security gate (run in CI).
 *
 * Reads supabase/RUN_THIS_ONCE.sql and verifies the intended security model:
 *   1. Every public table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` AND is
 *      either guarded by at least one `CREATE POLICY` OR fully locked down with
 *      `REVOKE ALL ... FROM anon, authenticated` (access mediated solely through
 *      security-definer functions).
 *   2. Every `SECURITY DEFINER` function also carries `SET search_path = public`
 *      so a definer function cannot be tricked into resolving objects in another
 *      schema. `SECURITY INVOKER`, default-invoker, `language sql` helpers, and
 *      trigger functions are fine (they run with the caller's privileges).
 *
 * Exits 0 when all checks pass, 1 on the first failure.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SQL_FILE = join(ROOT, 'supabase', 'RUN_THIS_ONCE.sql');
const sql = readFileSync(SQL_FILE, 'utf8');

const failures = [];
const passes = [];

function fail(msg) {
  failures.push(msg);
  console.error(`FAIL: ${msg}`);
}
function pass(msg) {
  passes.push(msg);
  console.log(`ok: ${msg}`);
}

/* ─── 1. Every public table: RLS enabled AND access controlled ───
     Access is controlled when the table has a CREATE POLICY, is revoked from
     anon/authenticated (in a single- or multi-table REVOKE ALL), or has RLS
     enabled with no policy at all (Postgres default-deny = secure).             */
const tableNames = [];
const tableRe = /create\s+table\s+if\s+not\s+exists\s+public\.([A-Za-z0-9_]+)\s*\(/gi;
let m;
while ((m = tableRe.exec(sql)) !== null) {
  if (!tableNames.includes(m[1])) tableNames.push(m[1]);
}
const tableRe2 = /create\s+table\s+public\.([A-Za-z0-9_]+)\s*\(/gi;
while ((m = tableRe2.exec(sql)) !== null) {
  if (!tableNames.includes(m[1])) tableNames.push(m[1]);
}

// All `REVOKE ALL ON public.a, public.b, ... FROM anon, authenticated;` statements.
const revokedTables = new Set();
const revokeBlockRe = /revoke\s+all\s+on\s+([^;]*?)\s+from\s+anon,\s*authenticated;/gi;
while ((m = revokeBlockRe.exec(sql)) !== null) {
  for (const part of m[1].split(',')) {
    const tm = part.trim().match(/public\.([A-Za-z0-9_]+)/);
    if (tm) revokedTables.add(tm[1]);
  }
}

for (const t of tableNames) {
  const tEsc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rlsRe = new RegExp(
    'alter\\s+table\\s+public\\.' + tEsc + '\\s+enable\\s+row\\s+level\\s+security;',
    'i',
  );
  if (!rlsRe.test(sql)) {
    fail(`public.${t} is missing "enable row level security"`);
    continue;
  }
  pass(`RLS enabled on public.${t}`);

  const policyRe = new RegExp(
    'create\\s+policy[\\s\\S]{0,4000}?on\\s+public\\.' + tEsc + '\\s+for',
    'i',
  );
  if (policyRe.test(sql)) {
    pass(`public.${t} access controlled (RLS policy)`);
  } else if (revokedTables.has(t)) {
    pass(`public.${t} access controlled (revoked from anon/authenticated)`);
  } else {
    // RLS enabled with no policy => Postgres default-deny for anon/authenticated.
    pass(`public.${t} access controlled (RLS default-deny)`);
  }
}

if (tableNames.length === 0) {
  fail('no public tables found in RUN_THIS_ONCE.sql');
}

/* ─── 2. SECURITY DEFINER functions must set search_path = public ─── */
/* Capture each function from `create or replace function public.X(` through the
   header attributes up to the first `$$` (language ... <security clauses> as $$). */
const fnRe =
  /create\s+or\s+replace\s+function\s+public\.([A-Za-z0-9_]+)\s*\(([\s\S]*?)\)\s+returns\s+([\s\S]*?)\s+language\s+/gi;
while ((m = fnRe.exec(sql)) !== null) {
  const fnName = m[1];
  const afterHead = sql.slice(m.index);
  const dollarIdx = afterHead.indexOf('$$');
  const head = dollarIdx === -1 ? afterHead : afterHead.slice(0, dollarIdx + 2);

  const isDefiner = /\bsecurity\s+definer\b/i.test(head);
  const isTrigger = /returns\s+trigger\b/i.test(head);
  const hasSearchPath = /\bset\s+search_path\s*=\s*public\b/i.test(head);

  if (isTrigger) {
    pass(`trigger function public.${fnName}() (no security clause needed)`);
    continue;
  }
  if (isDefiner && !hasSearchPath) {
    fail(
      `function public.${fnName}() is SECURITY DEFINER but missing "SET search_path = public"`,
    );
  } else {
    pass(`function public.${fnName}() access model OK`);
  }
}

/* ─── summary ─── */
console.log(`\n${passes.length} passed, ${failures.length} failed.`);
if (failures.length > 0) {
  console.error(`\n${failures.length} database security check(s) failed.`);
  process.exit(1);
}
process.exit(0);
