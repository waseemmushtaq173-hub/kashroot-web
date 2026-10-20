'use client';

/**
 * How wide an element is on screen, in px (0 until it is known), kept up to
 * date as the window changes. The owner's drawings are drawn at that width,
 * so their words stay big enough to read on a phone.
 */
import { useCallback, useState } from 'react';

export function useWidth(): [(el: HTMLElement | null) => (() => void) | undefined, number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const watch = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return [ref, width];
}
