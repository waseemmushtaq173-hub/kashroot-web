/**
 * Freeing a mesh's look safely. A three.js mesh holds one material or an
 * array of them (the unit cooler in fixtures.ts has three). On an array,
 * `.map` is Array.prototype.map — a function, so `material.map?.dispose()`
 * does not stop at the `?.` and throws "map?.dispose is not a function",
 * which ends the scene's cleanup before the renderer is freed. Everything
 * here goes one material at a time and frees only real textures.
 *
 * No three.js import: this runs in the model tests without a browser.
 */

/** Every texture slot a standard material can carry. */
const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'envMap', 'lightMap', 'displacementMap'] as const;

/** One material or an array of them, as a list (nothing: an empty list). */
export function materialsOf(matOrArray: unknown): object[] {
  const list = Array.isArray(matOrArray) ? matOrArray : matOrArray ? [matOrArray] : [];
  return list.filter((m): m is object => Boolean(m) && typeof m === 'object');
}

/**
 * Free a mesh's material or materials and their textures. `keep` holds what
 * belongs to someone else (the kit's shared materials and textures): those
 * are left alone, also inside an array.
 */
export function disposeMaterialSafely(matOrArray: unknown, keep?: ReadonlySet<unknown>): void {
  for (const mat of materialsOf(matOrArray)) {
    if (keep?.has(mat)) continue;
    const m = mat as Record<string, unknown>;
    for (const key of TEXTURE_KEYS) {
      const tex = m[key] as { dispose?: unknown } | null | undefined;
      if (tex && typeof tex === 'object' && !keep?.has(tex) && typeof tex.dispose === 'function') (tex as { dispose: () => void }).dispose();
    }
    if (typeof m.dispose === 'function') (m as { dispose: () => void }).dispose();
  }
}
