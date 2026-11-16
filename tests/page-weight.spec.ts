/**
 * Page weight: the 3D libraries (three.js, drei: about 0.7 MB of script) and the typed TrueScan lists (about 2.6 MB)
 * are fetched when something on screen needs them, not with every dashboard. Source guards, no server needed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });

test('the 3D apple box is only ever imported through its lazy wrapper', () => {
  const offenders = files(join(process.cwd(), 'src'))
    .filter((f) => !/components[\\/]three[\\/]AppleBox3D(Lazy)?\.tsx$/.test(f))
    .filter((f) => /from '[^']*\/AppleBox3D'/.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
  const lazy = readFileSync(join(process.cwd(), 'src/components/three/AppleBox3DLazy.tsx'), 'utf8');
  expect(lazy).toContain("import('./AppleBox3D')");
  expect(lazy).toContain('ssr: false');
  // "Loose / Crate Packed" has no layer count: nothing is shown and nothing is fetched.
  expect(lazy).toContain('singleLayerCount(String(layers)) === null) return null');
});
