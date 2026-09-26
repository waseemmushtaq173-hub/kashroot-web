/**
 * Auth API — typed wrappers for Module 1 endpoints
 *
 * Endpoint source: kashroot-api/src/modules/auth/
 * DTOs verified against Module 1 source:
 *   RegisterDto       POST /auth/register
 *   LoginDto          POST /auth/login
 *   VerifyOtpDto      POST /auth/otp/verify
 *   ResendOtpDto      POST /auth/otp/resend
 *   MfaSetupResponse  POST /auth/mfa/setup    (REGIONAL_ADMIN, PLATFORM_ADMIN only)
 *   MfaVerifyDto      POST /auth/mfa/verify
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
  otp:   string;
}

export interface ResendOtpDto {
  email: string;
}

export interface MfaVerifyDto {
  totp: string;
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
  verified: boolean;
  message:  string;
}

export interface MfaSetupResponse {
  qrCodeDataUrl: string;  // data:image/png;base64,... for QR code display
  secret:        string;  // TOTP secret (show once, user must save it)
}

export interface MfaVerifyResponse {
  accessToken: string;
  user:        AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
}

// ── API calls ─────────────────────────────────────────────────────────────
export const authApi = {
  register:      (dto: RegisterDto)    => api.post<{ message: string }>('/auth/register', dto),
  login:         (dto: LoginDto)       => api.post<LoginResponse>('/auth/login', dto),
  verifyOtp:     (dto: VerifyOtpDto)   => api.post<OtpVerifyResponse>('/auth/otp/verify', dto),
  resendOtp:     (dto: ResendOtpDto)   => api.post<{ message: string }>('/auth/otp/resend', dto),
  mfaSetup:      ()                    => api.post<MfaSetupResponse>('/auth/mfa/setup'),
  mfaVerify:     (dto: MfaVerifyDto)   => api.post<MfaVerifyResponse>('/auth/mfa/verify', dto),
  refresh:       ()                    => api.post<RefreshResponse>('/auth/refresh'),
  logout:        ()                    => api.post<void>('/auth/logout'),
};
