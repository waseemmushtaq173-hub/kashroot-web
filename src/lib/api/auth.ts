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
  | 'SELLER'
  | 'PROVIDER'
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
  register: async (dto: RegisterDto) => {
    // Zero-delay instantaneous mockup
    return { message: 'Verification email sent. Please check your inbox.' };
  },
  login: async (dto: LoginDto) => {
    // Zero-delay instantaneous mockup
    const mockRole = (typeof window !== 'undefined' && localStorage.getItem('kr_mock_role')) as UserRole || 'FARMER';
    return {
      accessToken: 'mock_jwt_token_for_demo_purposes_only_12345',
      requiresMfa: false,
      user: {
        id: 'mock-user-1',
        email: dto.email,
        fullName: 'Demo User',
        role: mockRole,
        kycStatus: 'VERIFIED',
        mfaEnabled: false
      }
    } as LoginResponse;
  },
  verifyOtp: async (dto: VerifyOtpDto) => {
    // Zero-delay instantaneous mockup
    return { message: 'OTP verified successfully' };
  },
  resendOtp:     async (dto: ResendOtpDto)   => ({ message: 'OTP resent successfully' }),
  mfaSetup:      async ()                    => ({ qrCodeDataUrl: '', secret: '' } as MfaSetupResponse),
  mfaVerify:     async (dto: MfaVerifyDto)   => ({ message: 'MFA verified' } as MfaVerifyResponse),
  refresh:       async ()                    => ({ accessToken: 'mock_jwt_token_for_demo_purposes_only_12345' }),
  logout:        async ()                    => { tokenStore.removeToken(); },
};
export const tokenStore = {
  getToken: () => (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null),
  setToken: (token: string, role?: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      document.cookie = `auth_token=${token}; path=/; max-age=86400; SameSite=Lax`;
      if (role) {
        localStorage.setItem('user_role', role);
        document.cookie = `user_role=${role}; path=/; max-age=86400; SameSite=Lax`;
      }
    }
  },
  removeToken: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
      document.cookie = 'user_role=; path=/; max-age=0; SameSite=Lax';
    }
  },
};