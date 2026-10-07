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
  const initialRole = searchParams.get('role') || 'FARMER';
  
  const [selectedRole, setSelectedRole] = useState(initialRole);
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
      // The login function must bind the selected role directly.
      const targetRole = selectedRole;
      let targetRoute = '/farmer/dashboard';
      if (targetRole === 'BUYER') targetRoute = '/buyer/dashboard';
      else if (targetRole === 'ADMIN') targetRoute = '/admin/dashboard';
      else if (targetRole === 'EXPERT') targetRoute = '/expert';
      else if (targetRole === 'KISSAN_PARTNER') targetRoute = '/kissan-tools/dashboard';
      else if (targetRole === 'RENTAL') targetRoute = '/rental/dashboard';

      if (data.accessToken) {
        tokenStore.setToken(data.accessToken, targetRole);
        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_email', email);
          localStorage.setItem('user_role', targetRole);
          document.cookie = `user_role=${targetRole}; path=/; max-age=86400; SameSite=Lax`;
        }
      }

      router.push(targetRoute);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.messages[0] ?? 'Invalid email or password');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to sign in. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full kr-glass/95 backdrop-blur-md shadow-2xl rounded-3xl p-8 sm:p-10 border border-white/20 space-y-6 z-10 relative">
      <div>
        <h1 className="text-4xl font-extrabold text-[#1B4332] tracking-tight">Welcome back</h1>
        <p className="text-sm text-kr-text-secondary mt-2">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-[#E76F51] font-semibold hover:text-[#D65A3D] transition-colors">
            Create one free
          </Link>
        </p>
      </div>

      {verified && (
        <div className="p-3 bg-kr-fill-brand-subtle border border-kr-border-brand text-kr-text-brand text-sm rounded-xl">
          Email verified successfully! You can now log in.
        </div>
      )}

      {error && (
        <div className="kr-error-state p-3 text-sm rounded-xl">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-kr-text-primary mb-1 block">Account Type <span className="text-red-500">*</span></label>
          <select
            className="w-full px-4 py-3 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none mb-4"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            required
          >
            <option value="FARMER">Farmer</option>
            <option value="ADMIN">Admin</option>
            <option value="BUYER">Buyer</option>
            <option value="EXPERT">Expert</option>
            <option value="KISSAN_PARTNER">Kissan Partner (Agri/Horti)</option>
            <option value="RENTAL">Equipment / Machinery Rental</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-semibold text-kr-text-primary mb-1 block">Email address</label>
          <input
            type="email"
            placeholder="farmer@kashroot.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-semibold text-kr-text-primary block">Password</label>
            <Link href="/forgot-password" className="text-sm text-[#E76F51] font-semibold hover:text-[#D65A3D] transition-colors">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-kr-text-disabled hover:text-kr-text-secondary transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-gradient-to-r from-[#E76F51] to-[#F4A261] hover:from-[#D65A3D] hover:to-[#E76F51] text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 text-lg mt-6"
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
    <Suspense fallback={<div className="flex items-center justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
