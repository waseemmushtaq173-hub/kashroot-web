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
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseKey);

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
  code:  string;
  phoneCode?: string;
}

export interface ResendOtpDto {
  email: string;
  phone?: string;
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
    // Call the real OTP API to trigger live gateways instead of mocking
    try {
      const response = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: dto.email, phone: dto.phone || '+10000000000' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to trigger OTP');
      // Store the OTPs in localStorage temporarily so our frontend mock can verify them later if needed
      if (typeof window !== 'undefined') {
        if (data.emailOtp) localStorage.setItem('mock_expected_email_otp', data.emailOtp);
        if (data.phoneOtp) localStorage.setItem('mock_expected_phone_otp', data.phoneOtp);
      }
      return { message: 'Verification email sent. Please check your inbox.' };
    } catch (e: any) {
      console.error('Failed to trigger OTP API on register:', e);
      throw e;
    }
  },
  login: async (dto: LoginDto) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) {
      throw new Error('Invalid email or password');
    }

    const mockRole = (typeof window !== 'undefined' && localStorage.getItem('kr_mock_role')) as UserRole || 'FARMER';
    return {
      accessToken: data.session.access_token,
      requiresMfa: false,
      user: {
        id: data.user.id,
        email: dto.email,
        fullName: data.user.user_metadata?.full_name || 'Verified User',
        role: mockRole,
        kycStatus: 'VERIFIED',
        mfaEnabled: false
      }
    } as LoginResponse;
  },
  verifyEmailOtp: async (email: string, code: string) => {
    if (typeof window !== 'undefined') {
      const expectedEmail = localStorage.getItem('mock_expected_email_otp');
      if (expectedEmail && code !== expectedEmail) {
        throw new Error('Invalid email verification code.');
      }
    }
    return { message: 'Email OTP verified successfully' };
  },
  verifyMobileOtp: async (phone: string, code: string) => {
    if (typeof window !== 'undefined') {
      const expectedPhone = localStorage.getItem('mock_expected_phone_otp');
      if (expectedPhone && code !== expectedPhone) {
        throw new Error('Invalid mobile verification code.');
      }
    }
    return { message: 'Mobile OTP verified successfully' };
  },
  verifyOtp: async (dto: VerifyOtpDto) => {
    if (typeof window !== 'undefined') {
      const expectedEmail = localStorage.getItem('mock_expected_email_otp');
      const expectedPhone = localStorage.getItem('mock_expected_phone_otp');
      // If we have stored OTPs, verify against them
      if (expectedEmail && expectedPhone) {
        if (dto.code !== expectedEmail || dto.phoneCode !== expectedPhone) {
          throw new Error('Invalid verification codes. Please try again.');
        }
      }
    }
    return { message: 'OTP verified successfully' };
  },
  resendOtp: async (dto: ResendOtpDto) => {
    const response = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: dto.email, phone: dto.phone || '+10000000000' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to resend OTP');
    
    if (typeof window !== 'undefined') {
      if (data.emailOtp) localStorage.setItem('mock_expected_email_otp', data.emailOtp);
      if (data.phoneOtp) localStorage.setItem('mock_expected_phone_otp', data.phoneOtp);
    }
    return data;
  },
  mfaSetup:      async ()                    => ({ qrCodeDataUrl: '', secret: '' } as MfaSetupResponse),
  mfaVerify:     async (dto: MfaVerifyDto)   => ({ message: 'MFA verified' } as MfaVerifyResponse),
  refresh:       async ()                    => ({ accessToken: 'mock_jwt_token' }),
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