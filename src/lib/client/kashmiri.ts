'use client';

import { useEffect, useState } from 'react';

import { loadKsPhrases } from '@/lib/db/kashmiri';
import { ksText } from '@/lib/kashmiri/phrases';

/** ksText, re-rendered once the editors' corrected sentences have loaded. */
export function useKsText(): typeof ksText {
  const [, loaded] = useState(0);
  useEffect(() => {
    let live = true;
    void loadKsPhrases().then(() => live && loaded((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);
  return ksText;
}
