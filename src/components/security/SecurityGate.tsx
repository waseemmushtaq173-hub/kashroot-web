'use client';

import type { ReactNode } from 'react';

/**
 * Auth forms render immediately. The visible Google checkbox belongs to the
 * form-level HumanCheck; this component remains as a compatibility wrapper for
 * callers that still pass the old gate props.
 */
export function SecurityGate({ children }: { place: string; onPass?: () => void; children: ReactNode }) {
  return <>{children}</>;
}
