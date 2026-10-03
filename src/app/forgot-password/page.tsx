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
      <div className="min-h-screen flex items-center justify-center bg-stone-50 px-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-stone-200 shadow-sm space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Reset password</h1>
          <p className="text-stone-600 text-sm mt-1">
            Enter your account email and mobile number and we'll send you instructions to reset your password.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error}
          </div>
        )}

        {success ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-center space-y-3">
            <p className="font-medium">OTP successfully sent to mobile number and email!</p>
            <p className="text-sm">We've sent a 6-digit verification code to <strong className="font-semibold">{phone}</strong> and <strong className="font-semibold">{email}</strong>.</p>
            <Link href={`/verify-otp?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`} className="block w-full bg-emerald-600 text-white py-2 rounded-lg mt-4 hover:bg-emerald-700">
              Go to Verification
            </Link>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Email address</label>
              <input
                type="email"
                placeholder="waseem@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900 mb-4"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Mobile Number</label>
              <input
                type="tel"
                placeholder="+91 9999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-stone-300 rounded-lg text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-stone-900 text-white py-3 px-4 rounded-lg font-medium hover:bg-black transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Key className="w-5 h-5" />}
              Send reset instructions
            </button>

            <div className="text-center pt-2">
              <Link href="/login" className="text-sm text-stone-500 hover:text-stone-900 font-medium">
                ← Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}