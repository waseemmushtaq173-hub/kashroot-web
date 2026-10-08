/**
 * Central API client for the Kashroot web app — a thin `fetch` wrapper that:
 *  - prepends the API base URL (`NEXT_PUBLIC_API_URL`, already /api/v1-prefixed)
 *    to every request path,
 *  - attaches the Bearer access token from a pluggable provider (wired to the
 *    auth context at app start via `setAuthTokenProvider`),
 *  - sends credentials so the httpOnly refresh cookie rides along (the API sets
 *    CORS `credentials: true`),
 *  - parses JSON responses and throws a typed `ApiError` on any non-2xx.
 *
 * Both JSON and multipart bodies are supported: pass a plain object/array and it
 * is JSON-encoded; pass a `FormData` and it is sent as-is (we never set
 * Content-Type for it — the browser adds the multipart boundary).
 */

/**
 * Backend base URL, including the `/api/v1` global prefix.
 *
 * NOTE: the NestJS API listens on port 3001; Next.js dev runs on 3000. The
 * default therefore targets 3001, not this frontend's own origin. Override per
 * environment with `NEXT_PUBLIC_API_URL` (see `.env.local`).
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** Error carrying the HTTP status so callers can branch (401 -> re-auth, etc.). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Parsed error body (object or text), when the server sent one. */
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Pluggable access-token source. Defaults to "no token" until wired up. */
type TokenProvider = () => string | null | Promise<string | null>;
let tokenProvider: TokenProvider = () => null;

/**
 * Register how the client obtains the current access token. Call once at app
 * start with an accessor into the auth context / secure storage.
 */
export function setAuthTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Query-string params; `undefined`/`null`/`''` entries are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON body (plain object/array) OR a `FormData` for multipart uploads. */
  body?: unknown;
  /** Set `false` to skip the Authorization header (public endpoints). */
  auth?: boolean;
}

import { toast } from 'sonner';

/** Perform a request against the API and parse the JSON response as `T`. */
export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
  retries = 1
): Promise<T> {
  const { query, body, auth = true, headers, method = body !== undefined ? 'POST' : 'GET', ...init } = options;

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const finalHeaders = new Headers(headers);

  if (body !== undefined && !isForm && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (!finalHeaders.has('Accept')) finalHeaders.set('Accept', 'application/json');

  if (auth) {
    const token = await tokenProvider();
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  // Idempotency key for money-moving (POST/PUT/PATCH to specific routes)
  const isMoneyMoving = path.includes('/escrow') || path.includes('/payments') || path.includes('/checkout');
  if (isMoneyMoving && ['POST', 'PUT', 'PATCH'].includes(method) && !finalHeaders.has('Idempotency-Key')) {
    finalHeaders.set('Idempotency-Key', `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(buildUrl(path, query), {
      ...init,
      method,
      headers: finalHeaders,
      credentials: init.credentials ?? 'include',
      signal: controller.signal,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
    
    clearTimeout(timeoutId);
    return await parse<T>(res);
  } catch (err: any) {
    clearTimeout(timeoutId);
    
    // Retry logic for safe requests or network errors
    const isSafe = ['GET', 'HEAD', 'OPTIONS'].includes(method);
    if ((err.name === 'AbortError' || err.message.includes('fetch')) && retries > 0 && isSafe) {
      return apiFetch(path, options, retries - 1);
    }

    // Global error toast
    const errorId = `ERR-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const status = err instanceof ApiError ? err.status : 'NETWORK';
    const message = err instanceof ApiError ? err.message : 'Network error or timeout';
    
    // Only toast if not explicitly silenced
    if (finalHeaders.get('X-Silent-Error') !== 'true') {
      toast.error(`Error ${status}: ${message}`, {
        description: `Error ID: ${errorId}. Please try again or contact support.`,
        action: { label: 'Try again', onClick: () => apiFetch(path, options, 0) }
      });
    }
    
    throw err;
  }
}

/** Convenience verbs over {@link apiFetch}. */
export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};

/** Join the base URL, path, and an optional query object into a full URL. */
function buildUrl(
  path: string,
  query?: ApiRequestOptions['query'],
): string {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const rel = path.startsWith('/') ? path : `/${path}`;
  if (!query) return `${base}${rel}`;
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${base}${rel}?${qs}` : `${base}${rel}`;
}

/** Parse a response body as JSON, throwing {@link ApiError} on non-2xx. */
async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errBody = await readBody(res);
    throw new ApiError(res.status, messageFrom(errBody, res.statusText), errBody);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Non-JSON 2xx (rare here) — hand back the raw text.
    return text as unknown as T;
  }
}

/** Read a body defensively as parsed JSON, falling back to raw text / null. */
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Extract a human message from a Nest-style error body (`{ message }`). */
function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (Array.isArray(m)) return m.join(', ');
    if (typeof m === 'string' && m) return m;
  }
  return fallback || 'Request failed';
}
