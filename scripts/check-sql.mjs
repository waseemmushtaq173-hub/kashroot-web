// KashRoot SQL consistency checks (run in CI):
//  1. supabase/RUN_THIS_ONCE.sql holds every migration in supabase/migrations, word for word.
//  2. A CHECK constraint set in more than one migration ("add constraint <name> check …") is set
//     identically in all of them — otherwise running RUN_THIS_ONCE.sql again replays an older,
//     shorter list over rows that only the newer list allows, and fails (ERROR 23514).
// Usage: node scripts/check-sql.mjs   (exit 1 on a problem)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'supabase/migrations';
const norm = (s) => s.replace(/\r\n/g, '\n');
const run = norm(readFileSync('supabase/RUN_THIS_ONCE.sql', 'utf8'));
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
let problems = 0;

for (const f of files) {
  if (!run.includes(norm(readFileSync(join(dir, f), 'utf8')).trim())) {
    console.log(`FAIL  ${f} is not in RUN_THIS_ONCE.sql word for word — copy it in again.`);
    problems++;
  }
}

const defs = new Map(); // constraint name → [{ file, def }]
for (const f of files) {
  const sql = norm(readFileSync(join(dir, f), 'utf8'));
  for (const m of sql.matchAll(/add constraint\s+(\w+)\s+check\s*(\([\s\S]*?\));/gi)) {
    const def = m[2].replace(/\s+/g, ' ').trim();
    defs.set(m[1], [...(defs.get(m[1]) ?? []), { file: f, def }]);
  }
}
for (const [name, list] of defs) {
  if (list.length > 1 && new Set(list.map((d) => d.def)).size > 1) {
    console.log(`FAIL  ${name} is set differently in: ${list.map((d) => d.file).join(', ')} — use one complete list in every one.`);
    problems++;
  }
}

console.log(problems ? `${problems} problem(s).` : `PASS  ${files.length} migrations in RUN_THIS_ONCE.sql word for word; every re-set check constraint identical.`);
process.exit(problems ? 1 : 0);
