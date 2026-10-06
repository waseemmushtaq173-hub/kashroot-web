'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Mail, Phone, Lock, CheckCircle2, Building, MapPin, Truck, Store } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';

function MarketplaceAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRole = searchParams.get('role') || 'BUYER';
  
  // Registration Funnel States
  // 1: enter contact (email & phone)
  // 2: verify OTPs
  // 3: role-specific onboarding
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form Data
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  
  const [emailOtp, setEmailOtp] = useState('');
  const [smsOtp, setSmsOtp] = useState('');
  
  // Role Specific Data
  // Seller
  const [dealershipName, setDealershipName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  // Buyer
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pincode, setPincode] = useState('');

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Handlers
  const handleRequestOtps = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      // Mock API trigger for Emails/SMS OTP
      const emailRes = await fetch('/api/auth/otp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (!emailRes.ok) throw new Error('Failed to send email OTP');

      const smsRes = await fetch('/api/auth/otp/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      if (!smsRes.ok) throw new Error('Failed to send SMS OTP');

      setStep(2);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Verification system error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtps = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (emailOtp.length < 4 || smsOtp.length < 4) {
        throw new Error('Please enter complete OTP codes.');
      }
      // Verification Success! Proceed to finalizing registration
      setStep(3);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Invalid OTP. Please check your messages.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate final account creation
    setTimeout(() => {
      localStorage.setItem('auth_token', 'marketplace-secure-mock-jwt');
      localStorage.setItem('auth_email', email);
      localStorage.setItem('user_role', requestedRole);
      
      // Save specific onboarding data if needed
      if (requestedRole === 'SELLER') {
        localStorage.setItem('dealership_name', dealershipName);
        localStorage.setItem('gst_number', gstNumber);
      } else {
        localStorage.setItem('delivery_address', deliveryAddress);
        localStorage.setItem('delivery_pincode', pincode);
      }
      
      router.push('/compare-prices');
    }, 1000);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F9F7F1]">
      <SiteHeader hideSignIn={true} />
      
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-r from-[#1B4332] to-[#153424] p-8 text-white text-center">
            <ShieldCheck className="w-16 h-16 text-[#E76F51] mx-auto mb-4" />
            <h1 className="text-3xl font-heading font-bold mb-2">
              {requestedRole === 'SELLER' ? 'Dealer Registration' : 'Buyer Registration'}
            </h1>
            <p className="text-white/80 text-sm">Secure identity verification for the KashRoot Marketplace.</p>
          </div>

          <div className="p-8 md:p-10">
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-medium mb-6 text-center border border-red-100">
                {error}
              </div>
            )}

            {step === 1 && (
              <form onSubmit={handleRequestOtps} className="space-y-6">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Step 1: Contact Verification</h3>
                  <p className="text-sm text-gray-500 mt-2">Enter your active mobile and email. We will send strict verification codes to both.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Mobile Number</label>
                    <div className="flex flex-row items-center gap-3">
                      <div className="relative flex-1">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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
                    <label className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                    <div className="flex flex-row items-center gap-3">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleVerifyOtps} className="space-y-6">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-gray-900">Step 2: Dual Verification</h3>
                  <p className="text-sm text-gray-500 mt-2">Enter the distinct codes sent to your phone and email.</p>
                </div>

                <div className="space-y-5">
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <label className="block text-sm font-bold text-blue-900 mb-2">SMS OTP (sent to {phone})</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
                      <input 
                        type="text" 
                        required 
                        className="kr-input w-full pl-10 bg-white" 
                        placeholder="••••"
                        value={smsOtp}
                        onChange={(e) => setSmsOtp(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                    <label className="block text-sm font-bold text-purple-900 mb-2">Email OTP (sent to {email})</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
                      <input 
                        type="text" 
                        required 
                        className="kr-input w-full pl-10 bg-white" 
                        placeholder="••••"
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <button type="submit" disabled={loading} className="w-full bg-[#1B4332] hover:bg-[#153424] text-white py-4 px-4 rounded-xl font-bold transition-colors shadow-lg flex justify-center items-center gap-2">
                    {loading ? 'Verifying...' : <><CheckCircle2 className="w-5 h-5" /> Verify & Continue</>}
                  </button>
                </div>
              </form>
            )}

            {step === 3 && (
              <form onSubmit={handleCompleteOnboarding} className="space-y-5">
                <div className="text-center mb-6">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Step 3: {requestedRole === 'SELLER' ? 'Dealership Profile' : 'Delivery Profile'}</h3>
                  <p className="text-sm text-gray-500 mt-1">Almost there! Complete your profile to finalize registration.</p>
                </div>

                {requestedRole === 'SELLER' ? (
                  <>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                        <Store className="w-4 h-4 text-[#1B4332]" /> Dealership Name
                      </label>
                      <input 
                        type="text" 
                        required 
                        className="kr-input w-full" 
                        placeholder="e.g. Kashmir Agri Traders"
                        value={dealershipName}
                        onChange={(e) => setDealershipName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                        <Building className="w-4 h-4 text-[#1B4332]" /> GST / License Number (Optional)
                      </label>
                      <input 
                        type="text" 
                        className="kr-input w-full" 
                        placeholder="GSTIN or Trade License"
                        value={gstNumber}
                        onChange={(e) => setGstNumber(e.target.value)}
                      />
                      <p className="text-xs text-gray-500 mt-1">Verified sellers receive a trust badge on their listings.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                        <MapPin className="w-4 h-4 text-[#1B4332]" /> Default Delivery Address
                      </label>
                      <textarea 
                        required 
                        className="kr-input w-full min-h-[80px]" 
                        placeholder="Street address, village, district"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-2">
                        <Truck className="w-4 h-4 text-[#1B4332]" /> Pincode
                      </label>
                      <input 
                        type="text" 
                        required 
                        className="kr-input w-full" 
                        placeholder="e.g. 190001"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div className="pt-4 border-t border-gray-100">
                  <button type="submit" disabled={loading} className="w-full bg-[#E76F51] hover:bg-[#D4A373] text-white py-4 px-4 rounded-xl font-bold transition-colors shadow-lg">
                    {loading ? 'Finalizing...' : 'Complete & Return to Hub'}
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

export default function MarketplaceAuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <MarketplaceAuthContent />
    </Suspense>
  );
}
