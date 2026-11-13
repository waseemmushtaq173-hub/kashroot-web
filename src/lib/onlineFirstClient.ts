'use client';

export type ServiceErrorKind =
  | 'NONE'
  | 'DEVICE_NETWORK_UNAVAILABLE'
  | 'BACKEND_API_UNAVAILABLE'
  | 'SUPABASE_UNAVAILABLE'
  | 'AUTH_SESSION_EXPIRED'
  | 'REQUEST_ERROR';

export interface ClassifiedServiceError {
  kind: ServiceErrorKind;
  userMessage: string;
  status?: number;
}

export function clearLegacyOfflineStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (
        k &&
        (k.includes('offline') ||
          k.includes('saved_data') ||
          k.includes('sync_queue') ||
          k.includes('pending_actions'))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // Ignore storage access errors
  }

  // Unregister any legacy offline-intercepting service workers
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        for (const reg of regs) {
          reg.unregister();
        }
      })
      .catch(() => {});
  }
}

export function classifyFetchError(error: unknown, httpStatus?: number): ClassifiedServiceError {
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      kind: 'AUTH_SESSION_EXPIRED',
      userMessage: 'Your session has expired or requires sign-in. Please verify your account.',
      status: httpStatus,
    };
  }
  if (httpStatus && httpStatus >= 500) {
    return {
      kind: 'BACKEND_API_UNAVAILABLE',
      userMessage: `Server endpoint returned HTTP ${httpStatus}. Please retry in a moment.`,
      status: httpStatus,
    };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      kind: 'DEVICE_NETWORK_UNAVAILABLE',
      userMessage: 'Your device reports no active internet connection. Check mobile data or Wi-Fi.',
    };
  }
  return {
    kind: 'REQUEST_ERROR',
    userMessage: error instanceof Error ? error.message : 'Request could not be completed.',
    status: httpStatus,
  };
}
