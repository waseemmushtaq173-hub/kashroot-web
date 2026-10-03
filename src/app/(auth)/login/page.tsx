'use client';

export const dynamic = 'force-dynamic';import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogIn, Loader2, Eye, EyeOff } from 'lucide-react';
import { authApi, tokenStore } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';

import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified') === '1';
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await authApi.login({ email, password });
      
      if (data.accessToken) {
        tokenStore.setToken(data.accessToken, data.user?.role);
      }

      if (data.user?.role === 'FARMER') router.push('/farmer/dashboard');
      else if (data.user?.role === 'BUYER') router.push('/buyer/dashboard');
      else if (data.user?.role === 'SELLER') router.push('/seller/dashboard');
      else if (data.user?.role === 'PROVIDER') router.push('/provider/dashboard');
      else router.push('/horticulture/dashboard');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.messages[0] ?? 'Invalid email or password');
      } else {
        setError('Failed to sign in. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full bg-kr-bg-surface p-8 border border-kr-border-default shadow-kr-card-md space-y-6">
      <div>
        <h1 className="font-heading text-h1 text-kr-text-primary">Welcome back</h1>
        <p className="text-body-sm text-kr-text-secondary mt-1">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-kr-text-brand font-medium hover:underline">
            Create one free
          </Link>
        </p>
      </div>

      {verified && (
        <div className="p-3 bg-kr-fill-brand-subtle border border-kr-border-brand text-kr-text-brand text-sm">
          Email verified successfully! You can now log in.
        </div>
      )}

      {error && (
        <div className="kr-error-state p-3 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-label text-kr-text-primary mb-1">Email address</label>
          <input
            type="email"
            placeholder="farmer@kashroot.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="kr-input w-full"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-label text-kr-text-primary">Password</label>
            <Link href="/forgot-password" className="text-caption text-kr-text-secondary hover:text-kr-text-primary">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="kr-input w-full pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-kr-text-disabled hover:text-kr-text-secondary"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="kr-btn-primary w-full flex items-center justify-center gap-2 mt-4"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
          Sign in
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-kr-bg-page px-4">
      <Suspense fallback={<div>Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}