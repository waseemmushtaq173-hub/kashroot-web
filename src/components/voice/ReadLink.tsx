'use client';

/**
 * Reads the page address once (?crop=…&market=…) for a page the voice
 * assistant opened with its fields filled in. Inside its own Suspense, so
 * the rest of the page is still sent as ready HTML.
 */
import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

function Reader({ onRead }: { onRead: (params: URLSearchParams) => void }) {
  const params = useSearchParams();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    onRead(new URLSearchParams(params.toString()));
  }, [params, onRead]);
  return null;
}

export function ReadLink({ onRead }: { onRead: (params: URLSearchParams) => void }) {
  return (
    <Suspense fallback={null}>
      <Reader onRead={onRead} />
    </Suspense>
  );
}
