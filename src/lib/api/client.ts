/**
 * KashRoot API Client
 *
 * Axios instance pre-configured for the KashRoot backend (Modules 1–6).
 * ALL React Query hooks MUST use this client.
 * Do NOT hand-roll fetch() + useState/useEffect data fetching anywhere.
 *
 * BASE URL : NEXT_PUBLIC_API_URL env var (e.g. http://localhost:3001/api/v1)
 *
 * AUTH FLOW
 * ---------
 * 1. Login → backend sets httpOnly refresh-token cookie + returns accessToken.
 * 2. We store accessToken in memory (not localStorage) via the auth store.
 * 3. Request interceptor attaches Bearer token from the in-memory store.
 * 4. Response interceptor: on 401, attempt silent /auth/refresh, retry once.
 * 5. If refresh fails, clear auth state and redirect to /login.
 *
 * ERROR SHAPE (from Module 1 NestJS ExceptionFilter)
 * ---------------------------------------------------
 * { statusCode: number, message: string|string[], error: string }
 * ApiError unwraps this for React Query error handling.
 */

import axios, { AxiosError, type AxiosInstance } from 'axios';

// ── In-memory token store (not localStorage — avoids XSS exposure) ────────
let _accessToken: string | null = null;
export const tokenStore = {
  get: () => _accessToken,
  set: (t: string | null) => { _accessToken = t; },
  clear: () => { _accessToken = null; },
};

// ── Axios instance ────────────────────────────────────────────────────────
export const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // Send httpOnly refresh-token cookie
});

// ── Request interceptor: attach JWT Bearer ────────────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: silent refresh on 401 ───────────────────────────
let _refreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(toApiError(error));
    }

    // If already refreshing, queue the retry
    if (_refreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push((token) => {
          if (!token) { reject(toApiError(error)); return; }
          original.headers.Authorization = `Bearer ${token}`;
          resolve(apiClient(original));
        });
      });
    }

    original._retry = true;
    _refreshing = true;

    try {
      const { data } = await axios.post<{ accessToken: string }>(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/auth/refresh`,
        {},
        { withCredentials: true },
      );
      tokenStore.set(data.accessToken);
      _refreshQueue.forEach((cb) => cb(data.accessToken));
      _refreshQueue = [];
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(original);
    } catch(error) {
      tokenStore.clear();
      _refreshQueue.forEach((cb) => cb(null));
      _refreshQueue = [];
      // Redirect to login (works in client components; server redirects handled separately)
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return Promise.reject(toApiError(error));
    } finally {
      _refreshing = false;
    }
  },
);

// ── ApiError: typed error class for React Query ───────────────────────────
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly messages: string[];
  public readonly error: string;

  constructor(statusCode: number, message: string | string[], error: string) {
    const msg = Array.isArray(message) ? message[0] : message;
    super(msg);
    this.statusCode  = statusCode;
    this.messages    = Array.isArray(message) ? message : [message];
    this.error       = error;
    this.name        = 'ApiError';
  }
}

function toApiError(err: AxiosError): ApiError {
  const data = err.response?.data as any;
  return new ApiError(
    data?.statusCode ?? err.response?.status ?? 0,
    data?.message   ?? err.message,
    data?.error     ?? 'Unknown error',
  );
}

// ── Typed request helpers ────────────────────────────────────────────────
export const api = {
  get:    <T>(url: string, config?: object) => apiClient.get<T>(url, config).then(r => r.data),
  post:   <T>(url: string, data?: unknown, config?: object) => apiClient.post<T>(url, data, config).then(r => r.data),
  put:    <T>(url: string, data?: unknown, config?: object) => apiClient.put<T>(url, data, config).then(r => r.data),
  patch:  <T>(url: string, data?: unknown, config?: object) => apiClient.patch<T>(url, data, config).then(r => r.data),
  delete: <T>(url: string, config?: object) => apiClient.delete<T>(url, config).then(r => r.data),
};
