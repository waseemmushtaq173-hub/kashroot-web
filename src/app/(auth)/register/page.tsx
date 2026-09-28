'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AlertCircle, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { authApi, type RegisterDto } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

export default function RegisterPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'FARMER' | 'BUYER'>('FARMER');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterDto & { confirmPassword: string }>({
    defaultValues: {
      role: 'FARMER',
    },
  });

  const password = watch('password', '');

  const registerMutation = useMutation({
    mutationFn: (dto: RegisterDto) => authApi.register(dto),
    onSuccess: (_, variables) => {
      setSuccess(true);
      setTimeout(() => {
        router.push(`/verify-otp?email=${encodeURIComponent(variables.email)}`);
      }, 1500);
    },
  });

  const onSubmit = ({ confirmPassword, ...dto }: RegisterDto & { confirmPassword: string }) => {
    dto.role = selectedRole;
    registerMutation.mutate(dto);
  };

  const errorMsg = registerMutation.error instanceof ApiError
    ? registerMutation.error.messages[0]
    : registerMutation.error ? 'Registration failed. Please try again.' : null;

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <CheckCircle2 style={{ width: '3rem', height: '3rem', color: '#16a34a', margin: '0 auto 1rem' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>Account created!</h2>
        <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>We've sent a verification code to your email. Redirecting…</p>
        <Loader2 className="animate-spin" style={{ width: '1.25rem', height: '1.25rem', color: '#d97706', margin: '1rem auto 0' }} />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '440px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.25rem' }}>Create your account</h1>
      <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '2rem' }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: '#d97706', fontWeight: 600, textDecoration: 'underline' }}>
          Sign in
        </Link>
      </p>

      {errorMsg && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <AlertCircle style={{ width: '1rem', height: '1rem', marginTop: '0.125rem', flexShrink: 0 }} />
          <p style={{ fontSize: '0.875rem', margin: 0 }}>{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Role selector */}
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>I am a</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {(['FARMER', 'BUYER'] as const).map((r) => {
              const isSelected = selectedRole === r;
              return (
                <div
                  key={r}
                  onClick={() => {
                    setSelectedRole(r);
                    setValue('role', r);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem',
                    border: isSelected ? '2px solid #d97706' : '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#fffbeb' : '#ffffff',
                    boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>{r === 'FARMER' ? '🌾' : '🛒'}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                    {r === 'FARMER' ? 'Farmer / Grower' : 'Buyer / Importer'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Full name */}
        <div>
          <label htmlFor="fullName" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Full name</label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            style={{ width: '100%', padding: '0.625rem 0.875rem', border: errors.fullName ? '1px solid #ef4444' : '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.95rem', backgroundColor: '#ffffff', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
            {...register('fullName', {
              required: 'Full name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
            })}
          />
          {errors.fullName && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.fullName.message}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="reg-email" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Email address</label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            style={{ width: '100%', padding: '0.625rem 0.875rem', border: errors.email ? '1px solid #ef4444' : '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.95rem', backgroundColor: '#ffffff', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
            })}
          />
          {errors.email && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.email.message}</p>}
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>
            Phone number <span style={{ color: '#9ca3af', fontWeight: 'normal' }}>(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.95rem', backgroundColor: '#ffffff', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
            {...register('phone')}
          />
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>Used for SMS notifications. We never share your number.</p>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="reg-password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="reg-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              style={{ width: '100%', padding: '0.625rem 2.5rem 0.625rem 0.875rem', border: errors.password ? '1px solid #ef4444' : '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.95rem', backgroundColor: '#ffffff', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'At least 8 characters' },
                pattern: {
                  value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                  message: 'Must include uppercase, lowercase, and a number',
                },
              })}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
            >
              {showPw ? <EyeOff style={{ width: '1.1rem', height: '1.1rem' }} /> : <Eye style={{ width: '1.1rem', height: '1.1rem' }} />}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>Min. 8 characters with uppercase, lowercase, and a number.</p>
          {errors.password && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.password.message}</p>}
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="confirm-password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.375rem' }}>Confirm password</label>
          <input
            id="confirm-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            style={{ width: '100%', padding: '0.625rem 0.875rem', border: errors.confirmPassword ? '1px solid #ef4444' : '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.95rem', backgroundColor: '#ffffff', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (v) => v === password || 'Passwords do not match',
            })}
          />
          {errors.confirmPassword && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>{errors.confirmPassword.message}</p>}
        </div>

        <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
          By creating an account you agree to our{' '}
          <Link href="/terms" style={{ color: '#d97706', textDecoration: 'underline' }}>Terms of Service</Link>
          {' '}and{' '}
          <Link href="/privacy" style={{ color: '#d97706', textDecoration: 'underline' }}>Privacy Policy</Link>.
        </p>

        <button
          type="submit"
          disabled={registerMutation.isPending}
          style={{
            width: '100%',
            padding: '0.75rem 1rem',
            backgroundColor: '#d97706',
            color: '#ffffff',
            fontWeight: 600,
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '1rem',
          }}
        >
          {registerMutation.isPending ? (
            <><Loader2 className="animate-spin" style={{ width: '1.2rem', height: '1.2rem' }} /> Creating account…</>
          ) : 'Create account'}
        </button>
      </form>
    </div>
  );
}