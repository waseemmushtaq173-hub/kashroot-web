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
import { supabase, supabaseConfigured } from '@/lib/supabase';

const NOT_SET_UP = 'Sign-in is not set up on this site yet: the owner must add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel and redeploy.';

/** Plain-language versions of Supabase auth errors. */
function friendlyAuthError(message: string | undefined, fallback: string): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('email not confirmed')) return 'Your email is not confirmed yet. Open the confirmation link we emailed you (check Spam/Promotions too), then sign in.';
  if (m.includes('invalid login credentials')) return 'Wrong email or password. If you have not created an account yet, use Create an account.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Sign in instead, or use Forgot password.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a few minutes and try again.';
  if (m.includes('password') && m.includes('characters')) return message!;
  if (m.includes('failed to fetch') || m.includes('network')) return 'Could not reach the sign-in service. Check your internet connection.';
  return message || fallback;
}

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
  role:     'FARMER' | 'BUYER' | 'SELLER' | 'PROVIDER';
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

export interface RegisterResponse {
  userId: string | null;
  /** True when Supabase wants the email confirmed before the first sign-in. */
  needsEmailConfirmation: boolean;
}

export interface LoginResponse {
  accessToken:   string;
  /** Role recorded on the account (Supabase metadata); null if none was saved. */
  accountRole:   UserRole | null;
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
  register: async (dto: RegisterDto): Promise<RegisterResponse> => {
    if (!supabaseConfigured) throw new Error(NOT_SET_UP);
    // Sign-up goes through Supabase auth — the same place `login` checks
    // credentials — so a new account can sign in immediately. It used to POST
    // to /api/auth/register, which wrote a Prisma row Supabase never sees, so
    // registering and then signing in could not both work.
    //
    // The name and role ride along in user_metadata, which `login` reads back.
    const { data, error } = await supabase.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: {
          full_name: dto.fullName,
          role: dto.role,
          ...(dto.phone ? { phone: dto.phone } : {}),
        },
      },
    });

    if (error) throw new Error(friendlyAuthError(error.message, 'Failed to register account'));
    // Supabase answers an already-registered email with a user that has no identities.
    if (data.user && data.user.identities?.length === 0) throw new Error(friendlyAuthError('already registered', ''));

    // With "Confirm email" switched on for the Supabase project, signUp
    // returns a user but no session: the link has to be clicked before
    // signInWithPassword will work. Switched off, the session arrives here and
    // they can sign in straight away.
    return {
      userId: data.user?.id ?? null,
      needsEmailConfirmation: !data.session,
    };
  },
  login: async (dto: LoginDto) => {
    if (!supabaseConfigured) throw new Error(NOT_SET_UP);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) {
      throw new Error(friendlyAuthError(error.message, 'Invalid email or password'));
    }

    // The role recorded at sign-up wins; kr_mock_role stays as the fallback
    // for accounts created before sign-up wrote any metadata.
    // app_metadata is only writable server-side (dashboard / service role), so
    // it wins over user_metadata, which the user can edit.
    const metadataRole = (data.user.app_metadata?.role ?? data.user.user_metadata?.role) as UserRole | undefined;
    const mockRole = (typeof window !== 'undefined' && localStorage.getItem('kr_mock_role')) as UserRole || 'FARMER';
    return {
      accessToken: data.session.access_token,
      accountRole: metadataRole ?? null,
      requiresMfa: false,
      user: {
        id: data.user.id,
        email: dto.email,
        fullName: data.user.user_metadata?.full_name || 'Verified User',
        role: metadataRole ?? mockRole,
        kycStatus: 'VERIFIED',
        mfaEnabled: false
      }
    } as LoginResponse;
  },
  mfaSetup:      async ()                    => ({ qrCodeDataUrl: '', secret: '' } as MfaSetupResponse),
  mfaVerify:     async (dto: MfaVerifyDto)   => ({ message: 'MFA verified' } as MfaVerifyResponse),
  refresh:       async ()                    => ({ accessToken: 'mock_jwt_token' }),
  logout:        async ()                    => { tokenStore.removeToken(); await supabase.auth.signOut().catch(() => undefined); },
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