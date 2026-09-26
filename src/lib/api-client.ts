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

/** Perform a request against the API and parse the JSON response as `T`. */
export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { query, body, auth = true, headers, method, ...init } = options;

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const finalHeaders = new Headers(headers);

  // JSON bodies get an explicit Content-Type; FormData must NOT (the browser
  // sets the multipart boundary itself).
  if (body !== undefined && !isForm && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (!finalHeaders.has('Accept')) finalHeaders.set('Accept', 'application/json');

  if (auth) {
    const token = await tokenProvider();
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(buildUrl(path, query), {
    ...init,
    method: method ?? (body !== undefined ? 'POST' : 'GET'),
    headers: finalHeaders,
    // Ride the httpOnly refresh cookie along; the API's CORS allows credentials.
    credentials: init.credentials ?? 'include',
    body:
      body === undefined
        ? undefined
        : isForm
          ? (body as FormData)
          : JSON.stringify(body),
  });

  return parse<T>(res);
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
