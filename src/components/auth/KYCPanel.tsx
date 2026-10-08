"use client";

import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, CreditCard, Building2, Smartphone, CheckCircle, Search } from 'lucide-react';

interface KYCPanelProps {
  isOpen: boolean;
  onComplete: () => void;
}

export default function KYCPanel({ isOpen, onComplete }: KYCPanelProps) {
  const [step, setStep] = useState(1);
  const [isVisible, setIsVisible] = useState(isOpen);
  
  // Form State
  const [role, setRole] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  
  const [accountNo, setAccountNo] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankDetails, setBankDetails] = useState<{ bank: string; branch: string } | null>(null);
  const [isCheckingIfsc, setIsCheckingIfsc] = useState(false);

  useEffect(() => {
    setIsVisible(isOpen);
  }, [isOpen]);

  // Mock IFSC Validation Function
  const checkIFSC = async (code: string) => {
    if (code.length < 11) return;
    setIsCheckingIfsc(true);
    try {
      // Trying public razorpay IFSC API
      const response = await fetch(`https://ifsc.razorpay.com/${code}`);
      if (response.ok) {
        const data = await response.json();
        setBankDetails({ bank: data.BANK, branch: data.BRANCH });
      } else {
        // Mock fallback if API fails
        setTimeout(() => {
          setBankDetails({ bank: "Jammu & Kashmir Bank", branch: "Srinagar Main" });
        }, 800);
      }
    } catch (e) {
      // Fallback
      setBankDetails({ bank: "HDFC Bank", branch: "Lal Chowk" });
    } finally {
      setIsCheckingIfsc(false);
    }
  };

  const handleIfscChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setIfsc(val);
    setBankDetails(null);
    if (val.length === 11) {
      checkIFSC(val);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="w-full flex justify-center mb-8 relative z-50">
      <div className="w-full max-w-xl p-8 rounded-3xl bg-white/70 backdrop-blur-2xl border border-white/80 shadow-[0_8px_32px_0_rgba(31,38,135,0.1)] text-slate-800 relative">
        
        <div className="flex items-center gap-3 mb-8 pb-4 border-b border-slate-200">
          <ShieldCheck className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">KashRoot Smart KYC</h2>
            <p className="text-sm text-slate-500">Secure verification for marketplace access</p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex justify-between mb-8 relative before:content-[''] before:absolute before:top-1/2 before:left-0 before:w-full before:h-0.5 before:bg-slate-200 before:-z-10">
          {[1, 2, 3].map((s) => (
            <div 
              key={s} 
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm transition-all ${
                step >= s 
                  ? 'bg-blue-600 text-white border-2 border-white ring-4 ring-blue-100' 
                  : 'bg-white text-slate-400 border border-slate-200'
              }`}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-[260px]">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-500" /> Select Your Role
              </h3>
              <p className="text-sm text-slate-500 mb-4">Choose how you will interact on the KashRoot platform.</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {['Farmer', 'Buyer', 'Seller'].map(r => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className={`p-4 rounded-2xl border-2 text-center transition-all ${
                      role === r 
                        ? 'border-blue-500 bg-blue-50/50 shadow-md scale-[1.02]' 
                        : 'border-slate-200 bg-white/50 hover:border-blue-200 hover:bg-white'
                    }`}
                  >
                    <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2 ${role === r ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                      {r === 'Farmer' && <User size={20} />}
                      {r === 'Buyer' && <Building2 size={20} />}
                      {r === 'Seller' && <CreditCard size={20} />}
                    </div>
                    <span className={`font-bold ${role === r ? 'text-blue-700' : 'text-slate-600'}`}>{r}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-500" /> Identity Verification
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Aadhaar Number</label>
                  <input 
                    type="text" 
                    value={aadhaar}
                    onChange={e => setAadhaar(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/80 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400" 
                    placeholder="XXXX XXXX XXXX" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">PAN Card</label>
                  <input 
                    type="text" 
                    value={pan}
                    onChange={e => setPan(e.target.value.toUpperCase())}
                    className="w-full px-4 py-3 rounded-xl bg-white/80 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400 uppercase" 
                    placeholder="ABCDE1234F" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Phone Verification</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Smartphone className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                      <input 
                        type="tel" 
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/80 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400" 
                        placeholder="+91 Mobile Number" 
                      />
                    </div>
                    {otpVerified ? (
                      <button disabled className="px-4 py-3 bg-green-100 text-green-700 rounded-xl font-bold flex items-center gap-1 border border-green-200">
                        <CheckCircle className="w-4 h-4" /> Verified
                      </button>
                    ) : otpSent ? (
                      <button onClick={() => setOtpVerified(true)} className="px-4 py-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-xl font-bold border border-blue-200 transition-colors">
                        Verify OTP
                      </button>
                    ) : (
                      <button onClick={() => setOtpSent(true)} className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold border border-slate-200 transition-colors whitespace-nowrap">
                        Send SMS OTP
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-500" /> Bank Details
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Account Number</label>
                  <input 
                    type="password" 
                    value={accountNo}
                    onChange={e => setAccountNo(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/80 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400 font-mono tracking-widest" 
                    placeholder="Enter Account Number" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">IFSC Code</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={ifsc}
                      onChange={handleIfscChange}
                      maxLength={11}
                      className="w-full px-4 py-3 rounded-xl bg-white/80 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400 uppercase font-mono" 
                      placeholder="e.g. HDFC0001234" 
                    />
                    {isCheckingIfsc && (
                      <Search className="absolute right-4 top-3.5 w-5 h-5 text-blue-400 animate-pulse" />
                    )}
                  </div>
                </div>

                {bankDetails && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex gap-3 animate-in fade-in zoom-in-95">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-green-800">{bankDetails.bank}</p>
                      <p className="text-sm text-green-700">{bankDetails.branch} Branch</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between mt-8 pt-6 border-t border-slate-200">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
            className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Back
          </button>
          <button
            onClick={() => {
              if (step === 1 && !role) return alert('Please select a role');
              if (step < 3) {
                setStep(s => s + 1);
              } else {
                onComplete();
              }
            }}
            disabled={(step === 1 && !role) || (step === 3 && !bankDetails)}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 3 ? 'Complete KYC' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
