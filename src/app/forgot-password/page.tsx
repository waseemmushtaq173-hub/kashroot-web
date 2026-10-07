'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Key } from 'lucide-react';
import { authApi } from '@/lib/api/auth';
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault(); // Stops the browser from crashing with the HTML error
    setLoading(true);
    setError('');

    try {
      // Dispatch OTP via the API
      await authApi.resendOtp({ email, phone });
      
      setSuccess(true);
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = `/verify-otp?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`;
        }
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="min-h-screen flex items-center justify-center bg-kr-bg-sunken px-4">
      <div className="max-w-md w-full kr-glass shadow-2xl shadow-gray-200/50 rounded-[2rem] p-8 sm:p-10 border border-kr-border-default space-y-6">
        <div>
          <h1 className="text-4xl font-extrabold text-[#1B4332] tracking-tight mb-2">Reset password</h1>
          <p className="text-sm text-kr-text-secondary">
            Enter your account email and mobile number and we'll send you instructions to reset your password.
          </p>
        </div>

        {error && (
          <div className="bg-kr-badge-rejected-bg border border-red-100 text-kr-badge-rejected-text px-4 py-3 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {success ? (
          <div className="p-4 kr-glass border border-kr-border-default text-emerald-800 rounded-xl text-center space-y-3">
            <p className="font-bold">OTP successfully sent to mobile number and email!</p>
            <p className="text-sm">We've sent a 6-digit verification code to <strong className="font-semibold">{phone}</strong> and <strong className="font-semibold">{email}</strong>.</p>
            <Link href={`/verify-otp?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`} className="block w-full py-3.5 px-4 bg-gradient-to-r from-[#E76F51] to-[#F4A261] hover:from-[#D65A3D] hover:to-[#E76F51] text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all mt-4">
              Go to Verification
            </Link>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-kr-text-primary mb-1 block">Email address</label>
              <input
                type="email"
                placeholder="waseem@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none mb-4"
                required
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-kr-text-primary mb-1 block">Mobile Number</label>
              <input
                type="tel"
                placeholder="+91 9999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-2 bg-gradient-to-r from-[#E76F51] to-[#F4A261] hover:from-[#D65A3D] hover:to-[#E76F51] text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Key className="w-5 h-5" />}
              Send reset instructions
            </button>

            <div className="text-center pt-2">
              <Link href="/login" className="text-sm text-[#E76F51] font-semibold hover:text-[#D65A3D] transition-colors">
                ← Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
