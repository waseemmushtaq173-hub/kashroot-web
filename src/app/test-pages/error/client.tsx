'use client';

/** Fails while rendering, on purpose: reads `replace` of something that is not there. */
export function Boom() {
  const missing = undefined as unknown as string;
  return <p>{missing.replace('a', 'b')}</p>;
}
