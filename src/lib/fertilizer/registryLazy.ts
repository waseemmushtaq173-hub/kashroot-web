/**
 * The typed reference lists (src/lib/gov-agro-registry.ts) are about 3 MB of script. They are fetched the first time a
 * check needs them, not with the page: the home page and the TrueScan page open without them, and phones on a slow
 * network are not held up by a list nobody has asked about yet. The import is shared, so it is fetched once.
 */
import type * as Registry from '@/lib/gov-agro-registry';

export type RegistryModule = typeof Registry;

let loading: Promise<RegistryModule> | null = null;

export function loadRegistry(): Promise<RegistryModule> {
  if (!loading) {
    loading = import('@/lib/gov-agro-registry').catch((err) => {
      // A failed fetch (offline) must not be remembered: the next check tries again.
      loading = null;
      throw err;
    });
  }
  return loading;
}
