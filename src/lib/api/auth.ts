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
import { loginHref, portalForRole, type PortalId } from '@/lib/auth/roles';
import { supabase, supabaseConfigured } from '@/lib/supabase';

function confirmRedirect(role: RegisterDto['role'], from?: PortalId): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const portal = from ?? portalForRole(role) ?? 'farmer';
  return `${window.location.origin}${loginHref(portal)}?verified=1`;
}

const NOT_SET_UP = 'Sign-in is not set up on this site yet: the owner must add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel and redeploy.';

/** Plain-language versions of Supabase auth errors. */
function friendlyAuthError(message: string | undefined, fallback: string): string {
  // Setup problems explained by the /api/supabase proxy: show them as written.
  if (message?.startsWith('[setup] ')) return message.slice(8);
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid api key') || m.includes('no api key')) return 'The sign-in key saved for this site is wrong. In Supabase open Project Settings → API Keys, copy the anon (publishable) key, put it in Vercel as NEXT_PUBLIC_SUPABASE_ANON_KEY and redeploy.';
  if (m.includes('email not confirmed')) return 'Your email is not confirmed yet. Open the confirmation link we emailed you (check Spam/Promotions too), then sign in.';
  if (m.includes('invalid login credentials')) return 'Wrong email or password. If you have not created an account yet, use Create an account.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Sign in instead, or use Forgot password.';
  if (m.includes('error sending') || m.includes('not authorized') || (m.includes('email address') && m.includes('invalid'))) return 'We could not send the confirmation email to this address. Check the address, or try again in a few minutes.';
  if (m.includes('email rate limit')) return 'Too many sign-up emails were sent in the last hour. Please try again a little later.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a few minutes and try again.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'New sign-ups are switched off on this site right now.';
  if (m.includes('weak') || m.includes('pwned')) return 'That password is too easy to guess. Choose a stronger one.';
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
  role:     'FARMER' | 'BUYER' | 'SELLER' | 'PROVIDER' | 'EXPERT';
  fullName: string;
  phone?:   string;
  /** The portal the person signed up from; the confirmation link returns there. */
  portal?:  PortalId;
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
  /** The email already had a KashRoot account: this portal was added to it. */
  joinedExisting?: boolean;
}

/** Portals anyone can add to their own account; staff roles are granted by an admin. */
export const SELF_JOIN_ROLES = ['FARMER', 'BUYER', 'SELLER', 'PROVIDER'] as const;

type MetaUser = { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> };

/** Every role on an account: the sign-up role, portals added later, and admin-set roles. */
export function rolesOf(user: MetaUser | null | undefined): string[] {
  const meta = user?.user_metadata ?? {};
  const listed = Array.isArray(meta.roles) ? meta.roles.filter((r): r is string => typeof r === 'string') : [];
  const single = [meta.role, user?.app_metadata?.role].filter((r): r is string => typeof r === 'string');
  return [...new Set([...single, ...listed])];
}

/** Adds a portal role to the signed-in account (kept in user_metadata.roles). */
async function addRoleToSession(role: string, extra: Record<string, unknown> = {}): Promise<string[]> {
  const { data } = await supabase.auth.getUser();
  const roles = [...new Set([...rolesOf(data.user), role])];
  const { error } = await supabase.auth.updateUser({ data: { ...extra, roles } });
  if (error) throw new Error(friendlyAuthError(error.message, 'Could not add this portal to your account.'));
  return roles;
}

export interface LoginResponse {
  accessToken:   string;
  /** Role recorded on the account (Supabase metadata); null if none was saved. */
  accountRole:   UserRole | null;
  /** Every portal role on the account, plus staff roles (ADMIN, EXPERT, DEALER). */
  accountRoles:  string[];
  /** Mobile number saved on the account, if any (for the sign-in OTP). */
  phone:         string | null;
  /** KYC already submitted from any device. */
  kycSubmitted:  boolean;
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
        // The confirmation link opens this site's sign-in for the chosen portal
        // (without it Supabase uses its "Site URL", often still localhost).
        emailRedirectTo: confirmRedirect(dto.role, dto.portal),
        data: {
          full_name: dto.fullName,
          role: dto.role,
          roles: [dto.role],
          ...(dto.phone ? { phone: dto.phone } : {}),
        },
      },
    });

    // Supabase answers an already-registered email with an error, or (when email
    // confirmation is on) with a user that has no identities. One email is one
    // KashRoot account: with the right password, this portal is added to it.
    const exists = (error && /already (been )?registered|already exists/i.test(error.message)) || (!error && data.user && data.user.identities?.length === 0);
    if (exists) {
      const joined = await supabase.auth.signInWithPassword({ email: dto.email, password: dto.password });
      if (joined.error) {
        const m = joined.error.message.toLowerCase();
        if (m.includes('email not confirmed')) throw new Error(friendlyAuthError(joined.error.message, ''));
        throw new Error('You already have a KashRoot account with this email (for another portal). To use the same account here, enter the password you made it with — or use Forgot password on the sign-in page.');
      }
      try {
        const meta = joined.data.user.user_metadata ?? {};
        await addRoleToSession(dto.role, {
          ...(meta.full_name ? {} : { full_name: dto.fullName }),
          ...(meta.phone || !dto.phone ? {} : { phone: dto.phone }),
        });
      } finally {
        await supabase.auth.signOut().catch(() => undefined);
      }
      return { userId: joined.data.user.id, needsEmailConfirmation: false, joinedExisting: true };
    }
    if (error) throw new Error(friendlyAuthError(error.message, 'Failed to register account'));

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
    // Staff roles (admin, expert, dealer) are granted by an admin in the database.
    const staff = await supabase.from('staff_roles').select('role').eq('user_id', data.user.id);
    const staffRoles = staff.error ? [] : (staff.data ?? []).map((r) => String(r.role));
    return {
      accessToken: data.session.access_token,
      accountRole: metadataRole ?? null,
      accountRoles: [...new Set([...rolesOf(data.user), ...staffRoles])],
      phone: (data.user.user_metadata?.phone as string | undefined) || data.user.phone || null,
      kycSubmitted: data.user.user_metadata?.kyc_status === 'submitted',
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
  /** Adds a portal (FARMER, BUYER, SELLER, PROVIDER) to the signed-in account. */
  addPortalRole: async (role: (typeof SELF_JOIN_ROLES)[number]): Promise<string[]> => {
    if (!supabaseConfigured) throw new Error(NOT_SET_UP);
    return addRoleToSession(role);
  },
  /** Sends the sign-up confirmation email again. */
  resendSignupEmail: async (email: string, role: RegisterDto['role'], portal?: PortalId) => {
    if (!supabaseConfigured) throw new Error(NOT_SET_UP);
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: confirmRedirect(role, portal) } });
    if (error) throw new Error(friendlyAuthError(error.message, 'Could not resend the email.'));
  },
  mfaSetup:      async ()                    => ({ qrCodeDataUrl: '', secret: '' } as MfaSetupResponse),
  mfaVerify:     async (dto: MfaVerifyDto)   => ({ message: 'MFA verified' } as MfaVerifyResponse),
  refresh:       async ()                    => ({ accessToken: 'mock_jwt_token' }),
  logout:        async ()                    => { tokenStore.removeToken(); await supabase.auth.signOut().catch(() => undefined); },
};
/** Roles saved at sign-in on this browser (see tokenStore.setToken). */
export function storedRoles(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const list = JSON.parse(localStorage.getItem('user_roles') ?? '[]');
    return Array.isArray(list) ? list.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

export const tokenStore = {
  getToken: () => (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null),
  setToken: (token: string, role?: string, roles?: string[]) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      document.cookie = `auth_token=${token}; path=/; max-age=86400; SameSite=Lax`;
      if (roles) localStorage.setItem('user_roles', JSON.stringify(roles));
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
      localStorage.removeItem('user_roles');
      document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
      document.cookie = 'user_role=; path=/; max-age=0; SameSite=Lax';
    }
  },
};