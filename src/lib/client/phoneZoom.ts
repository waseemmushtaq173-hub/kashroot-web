'use client';

/**
 * Phones show the 800px-wide page shrunk to fit the screen (app/layout.tsx).
 * Anything fixed to the screen (the microphone button, the portal's bottom bar) is grown back by
 * the same amount with CSS `zoom`, so it is phone-sized: big enough to tap and read.
 */
import { useSyncExternalStore } from 'react';

function onScale(change: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', change);
  return () => vv?.removeEventListener('resize', change);
}
const readScale = () => Math.min(1, Math.max(0.25, window.visualViewport?.scale ?? 1));

/** The factor to grow screen-fixed things by: 1 on a normal screen, about 2 on a phone showing the page at half size. */
export function usePhoneZoom(): number {
  const scale = useSyncExternalStore(onScale, readScale, () => 1);
  return scale < 0.95 ? 1 / scale : 1;
}
