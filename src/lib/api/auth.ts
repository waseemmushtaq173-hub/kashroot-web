/**
 * Auth API — typed wrappers for Module 1 endpoints
 *
 * Endpoint source: kashroot-api/src/modules/auth/
 * DTOs verified against Module 1 source:
 *   RegisterDto       POST /auth/register
 *   LoginDto          POST /auth/login
 *   VerifyOtpDto      POST /auth/verify-otp
 *   ResendOtpDto      POST /auth/otp/resend
 *   MfaSetupResponse  POST /auth/mfa/setup    (REGIONAL_ADMIN, PLATFORM_ADMIN only)
 *   MfaVerifyDto      POST /auth/mfa/verify-setup
 *   RefreshResponse   POST /auth/refresh
 *
 * If any of these shapes change in the backend, update here and the
 * downstream hooks/screens will surface TypeScript errors immediately.
 */

import { api } from './client';

// ── Role enum (mirrors Module 1 UserRole) ─────────────────────────────────
export type UserRole =
  | 'FARMER'
  | 'BUYER'
  | 'REGIONAL_ADMIN'
  | 'PLATFORM_ADMIN';

// ── Request DTOs ─────────────────────────────────────────────────────────
export interface RegisterDto {
  email:    string;
  password: string;
  role:     'FARMER' | 'BUYER';
  fullName: string;
  phone?:   string;
}

export interface LoginDto {
  email:    string;
  password: string;
}

export interface VerifyOtpDto {
  email: string;
  /** Backend VerifyOtpDto field is `code` (validated @Length(6, 6)). */
  code:  string;
}

export interface ResendOtpDto {
  email: string;
}

export interface MfaVerifyDto {
  /** Backend reads this from the body as `totpCode`. */
  totpCode: string;
}

// ── Response shapes ───────────────────────────────────────────────────────
export interface AuthUser {
  id:        string;
  email:     string;
  fullName:  string;
  role:      UserRole;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NOT_SUBMITTED';
  mfaEnabled: boolean;
}

export interface LoginResponse {
  accessToken:   string;
  requiresMfa:   boolean;   // true for admin roles with MFA enabled
  user:          AuthUser;
}

export interface OtpVerifyResponse {
  message: string;
}

export interface MfaSetupResponse {
  qrCodeDataUrl: string;  // data:image/png;base64,... for QR code display
  secret:        string;  // TOTP secret (show once, user must save it)
}

export interface MfaVerifyResponse {
  message: string;
}

export interface RefreshResponse {
  accessToken: string;
}

// ── API calls ─────────────────────────────────────────────────────────────
export const authApi = {
  register:      (dto: RegisterDto)    => api.post<{ message: string }>('/auth/register', dto),
  login:         (dto: LoginDto)       => api.post<LoginResponse>('/auth/login', dto),
  verifyOtp:     (dto: VerifyOtpDto)   => api.post<OtpVerifyResponse>('/auth/verify-otp', dto),
  resendOtp:     (dto: ResendOtpDto)   => api.post<{ message: string }>('/auth/otp/resend', dto),
  mfaSetup:      ()                    => api.post<MfaSetupResponse>('/auth/mfa/setup'),
  mfaVerify:     (dto: MfaVerifyDto)   => api.post<MfaVerifyResponse>('/auth/mfa/verify-setup', dto),
  refresh:       ()                    => api.post<RefreshResponse>('/auth/refresh'),
  logout:        ()                    => api.post<void>('/auth/logout'),
};
export const tokenStore = {
  getToken: () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null),
  setToken: (token: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('token', token);
  },
  removeToken: () => {
    if (typeof window !== 'undefined') localStorage.removeItem('token');
  },
};