'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Mail, Phone, Lock, ChevronRight, CheckCircle2, User, Banknote } from 'lucide-react';
import Link from 'next/link';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';

export default function EscrowAuthPage() {
  const router = useRouter();
  
  // Registration Funnel States
  // 1: initial selection (login or create)
  // 2: enter contact (email & phone)
  // 3: verify OTPs
  // 4: final details
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form Data
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  
  const [emailOtp, setEmailOtp] = useState('');
  const [smsOtp, setSmsOtp] = useState('');
  
  const [name, setName] = useState('');
  const [role, setRole] = useState('BUYER');
  const [bankAccount, setBankAccount] = useState('');

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Handlers
  const handleRequestOtps = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      // Trigger Email OTP
      const emailRes = await fetch('/api/auth/otp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (!emailRes.ok) throw new Error('Failed to send email OTP');

      // Trigger SMS OTP
      const smsRes = await fetch('/api/auth/otp/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      if (!smsRes.ok) throw new Error('Failed to send SMS OTP');

      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Verification system error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtps = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      // In a real app, we would verify against the backend.
      // Mocking validation logic here:
      if (emailOtp.length < 4 || smsOtp.length < 4) {
        throw new Error('Please enter complete OTP codes.');
      }
      
      // Verification Success! Proceed to finalizing registration
      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Invalid OTP. Please check your messages.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate final secure account creation
    setTimeout(() => {
      localStorage.setItem('auth_token', 'escrow-secure-mock-jwt');
      localStorage.setItem('auth_email', email);
      localStorage.setItem('user_role', role);
      localStorage.setItem('is_escrow_verified', 'true');
      router.push('/escrow');
    }, 1000);
  };

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <SiteHeader hideSignIn={true} />
      
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-xl kr-glass rounded-3xl shadow-xl overflow-hidden border border-kr-border-default">
          <div className="bg-gradient-to-r from-[#1B4332] to-[#153424] p-8 text-white text-center">
            <ShieldCheck className="w-16 h-16 text-[#E76F51] mx-auto mb-4" />
            <h1 className="text-3xl font-heading font-bold mb-2">Escrow Authentication</h1>
            <p className="text-white/80 text-sm">Strict identity verification required for KashRoot Escrow.</p>
          </div>

          <div className="p-8 md:p-10">
            {error && (
              <div className="bg-kr-badge-rejected-bg text-kr-badge-rejected-text p-4 rounded-xl text-sm font-medium mb-6 text-center border border-red-100">
                {error}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <Link 
                  href="/login"
                  className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-kr-border-default hover:border-[#1B4332] hover:bg-kr-bg-sunken transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-kr-bg-sunken rounded-full flex items-center justify-center group-hover:bg-[#1B4332]/10">
                      <User className="w-6 h-6 text-kr-text-secondary group-hover:text-[#1B4332]" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-bold text-kr-text-primary text-lg">Login to Existing Account</h3>
                      <p className="text-sm text-kr-text-secondary">Sign in using your standard KashRoot credentials</p>
                    </div>
                  </div>
                  <ChevronRight className="text-kr-text-disabled group-hover:text-[#1B4332]" />
                </Link>

                <button 
                  onClick={() => setStep(2)}
                  className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-[#1B4332] bg-[#1B4332]/5 hover:bg-[#1B4332]/10 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#1B4332] rounded-full flex items-center justify-center">
                      <ShieldCheck className="w-6 h-6 text-white" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-bold text-[#1B4332] text-lg">Create Secure Escrow Account</h3>
                      <p className="text-sm text-[#1B4332]/70">Strict KYC & dual-OTP verification required</p>
                    </div>
                  </div>
                  <ChevronRight className="text-[#1B4332]" />
                </button>
              </div>
            )}

            {step === 2 && (
              <form onSubmit={handleRequestOtps} className="space-y-6">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-kr-text-primary">Step 1: Contact Verification</h3>
                  <p className="text-sm text-kr-text-secondary mt-2">Enter your active mobile and email. We will send strict verification codes to both.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-kr-text-primary mb-2">Mobile Number</label>
                    <div className="flex flex-row items-center gap-3">
                      <div className="relative flex-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-kr-text-disabled" />
                        <input 
                          type="tel" 
                          required 
                          className="kr-input w-full pl-10" 
                          placeholder="10-digit number"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                      <button 
                        type="submit" 
                        disabled={loading || !phone} 
                        className="kr-btn-ghost text-kr-primary-600 hover:text-kr-primary-700 hover:bg-kr-fill-brand-subtle font-bold whitespace-nowrap px-4 py-2 shrink-0 disabled:opacity-50 transition-colors"
                      >
                        {loading ? 'Sending...' : 'Send OTP'}
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-bold text-kr-text-primary mb-2">Email Address</label>
                    <div className="flex flex-row items-center gap-3">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-kr-text-disabled" />
                        <input 
                          type="email" 
                          required 
                          className="kr-input w-full pl-10" 
                          placeholder="your@email.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                      <button 
                        type="submit" 
                        disabled={loading || !email} 
                        className="kr-btn-ghost text-kr-primary-600 hover:text-kr-primary-700 hover:bg-kr-fill-brand-subtle font-bold whitespace-nowrap px-4 py-2 shrink-0 disabled:opacity-50 transition-colors"
                      >
                        {loading ? 'Sending...' : 'Send OTP'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-kr-border-default">
                  <button type="button" onClick={() => setStep(1)} className="w-full py-3 px-4 rounded-xl font-bold text-kr-text-secondary bg-kr-bg-sunken hover:bg-kr-bg-sunken transition-colors">
                    Back
                  </button>
                </div>
              </form>
            )}

            {step === 3 && (
              <form onSubmit={handleVerifyOtps} className="space-y-6">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-kr-text-primary">Step 2: Dual Verification</h3>
                  <p className="text-sm text-kr-text-secondary mt-2">Enter the distinct codes sent to your phone and email.</p>
                </div>

                <div className="space-y-5">
                  <div className="kr-glass p-4 rounded-xl border border-kr-border-default">
                    <label className="block text-sm font-bold text-blue-900 mb-2">SMS OTP (sent to {phone})</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
                      <input 
                        type="text" 
                        required 
                        className="kr-input w-full pl-10 kr-glass" 
                        placeholder="••••"
                        value={smsOtp}
                        onChange={(e) => setSmsOtp(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="kr-glass p-4 rounded-xl border border-purple-100">
                    <label className="block text-sm font-bold text-purple-900 mb-2">Email OTP (sent to {email})</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
                      <input 
                        type="text" 
                        required 
                        className="kr-input w-full pl-10 kr-glass" 
                        placeholder="••••"
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-kr-border-default">
                  <button type="submit" disabled={loading} className="w-full bg-[#1B4332] hover:bg-[#153424] text-white py-3.5 px-4 rounded-xl font-bold transition-colors shadow-lg flex justify-center items-center gap-2">
                    {loading ? 'Verifying...' : <><CheckCircle2 className="w-5 h-5" /> Verify & Continue</>}
                  </button>
                </div>
              </form>
            )}

            {step === 4 && (
              <form onSubmit={handleCompleteRegistration} className="space-y-5">
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-kr-badge-published-bg rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-kr-text-primary">Step 3: Account Details</h3>
                  <p className="text-sm text-kr-text-secondary mt-1">Identity verified. Finalize your Escrow profile.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-kr-text-primary mb-2">Full Legal Name</label>
                  <input 
                    type="text" 
                    required 
                    className="kr-input w-full" 
                    placeholder="As per bank records"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-kr-text-primary mb-2">Account Role</label>
                  <select 
                    className="kr-input w-full" 
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="BUYER">Buyer / Customer</option>
                    <option value="FARMER">Farmer</option>
                    <option value="DEALER">Dealer / Hardware Seller</option>
                  </select>
                </div>

                <div className="bg-kr-bg-sunken p-4 rounded-xl border border-kr-border-default">
                  <label className="flex items-center gap-2 text-sm font-bold text-kr-text-primary mb-2">
                    <Banknote className="w-4 h-4 text-[#1B4332]" /> Escrow Payout Account
                  </label>
                  <input 
                    type="password" 
                    className="kr-input w-full kr-glass" 
                    placeholder="Bank Account Number"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                  />
                  <p className="text-xs text-kr-text-secondary mt-2">Required for sellers to receive funds. Buyers can add this later.</p>
                </div>

                <div className="pt-4 border-t border-kr-border-default">
                  <button type="submit" disabled={loading} className="w-full bg-[#E76F51] hover:bg-[#D4A373] text-white py-4 px-4 rounded-xl font-bold transition-colors shadow-lg">
                    {loading ? 'Creating Account...' : 'Complete Registration'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
      
      <SiteFooter />
    </div>
  );
}
