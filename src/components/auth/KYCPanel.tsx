"use client";

import React, { useState, useEffect } from 'react';
import { ShieldCheck, User, CreditCard, Building2, CheckCircle, Info, Eye, EyeOff } from 'lucide-react';

/**
 * An IFSC encodes the bank in its first four characters and the branch in its
 * last six. The bank code is a stable published mapping, so naming the bank
 * offline is a real lookup. The branch NAME is not derivable without a bank
 * directory, so this panel shows the branch code the user typed and never
 * invents a branch name, and never claims the account itself was verified —
 * that happens when KYC is reviewed.
 */
const BANK_NAMES: Record<string, string> = {
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  UTIB: 'Axis Bank',
  KKBK: 'Kotak Mahindra Bank',
  SBIN: 'State Bank of India',
  PUNB: 'Punjab National Bank',
  UBIN: 'Union Bank of India',
  CNRB: 'Canara Bank',
  BARB: 'Bank of Baroda',
  IDIB: 'Indian Bank',
  IOBA: 'Indian Overseas Bank',
  JAKA: 'Jammu & Kashmir Bank',
};

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Indian bank account numbers run 9-18 digits; the exact length varies by bank. */
const ACCOUNT_PATTERN = /^[0-9]{9,18}$/;

type IfscLookup =
  | { status: 'idle' }
  | { status: 'invalid' }
  | { status: 'unknown'; branchCode: string }
  | { status: 'resolved'; bank: string; branchCode: string };

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
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  
  const [accountNo, setAccountNo] = useState('');
  const [confirmAccountNo, setConfirmAccountNo] = useState('');
  const [showAccount, setShowAccount] = useState(false);
  const [ifsc, setIfsc] = useState('');
  const [ifscLookup, setIfscLookup] = useState<IfscLookup>({ status: 'idle' });

  useEffect(() => {
    setIsVisible(isOpen);
  }, [isOpen]);

  const accountValid = ACCOUNT_PATTERN.test(accountNo);
  const accountsMatch = accountNo === confirmAccountNo;
  const bankStepComplete = accountValid && accountsMatch && IFSC_PATTERN.test(ifsc);

  const handleIfscChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    setIfsc(value);
    if (value.length < 11) {
      setIfscLookup({ status: 'idle' });
      return;
    }
    if (!IFSC_PATTERN.test(value)) {
      setIfscLookup({ status: 'invalid' });
      return;
    }
    const bank = BANK_NAMES[value.slice(0, 4)];
    const branchCode = value.slice(5);
    setIfscLookup(bank ? { status: 'resolved', bank, branchCode } : { status: 'unknown', branchCode });
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
                    onChange={e => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    inputMode="numeric"
                    className="w-full px-4 py-3 rounded-xl bg-white/80 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400" 
                    placeholder="XXXX XXXX XXXX" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">PAN Card</label>
                  <input 
                    type="text" 
                    value={pan}
                    onChange={e => setPan(e.target.value.toUpperCase().slice(0, 10))}
                    className="w-full px-4 py-3 rounded-xl bg-white/80 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400 uppercase" 
                    placeholder="ABCDE1234F" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Aadhaar OTP verification</label>
                  <p className="mb-2 text-xs text-slate-500">A one-time code will be sent to the mobile number registered with Aadhaar.</p>
                  <div className="flex gap-2">
                    {otpVerified ? (
                      <button disabled className="px-4 py-3 bg-green-100 text-green-700 rounded-xl font-bold flex items-center gap-1 border border-green-200">
                        <CheckCircle className="w-4 h-4" /> Verified
                      </button>
                    ) : (
                      <>
                        <button type="button" disabled={aadhaar.length !== 12} onClick={() => setOtpSent(true)} className="px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold border border-blue-200 transition-colors whitespace-nowrap">Get OTP</button>
                        {otpSent && <input aria-label="6-digit OTP" inputMode="numeric" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="min-w-0 flex-1 px-4 py-3 rounded-xl bg-white border border-slate-200" placeholder="Enter 6-digit OTP" />}
                        {otpSent && <button type="button" disabled={otp.length !== 6} onClick={() => setOtpVerified(true)} className="px-4 py-3 bg-blue-100 hover:bg-blue-200 disabled:opacity-50 text-blue-700 rounded-xl font-bold border border-blue-200 transition-colors">Verify</button>}
                      </>
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
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="kyc-account" className="block text-sm font-bold text-slate-700">Account Number</label>
                    <button
                      type="button"
                      onClick={() => setShowAccount(v => !v)}
                      className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      {showAccount ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {showAccount ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input 
                    id="kyc-account"
                    type={showAccount ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="off"
                    value={accountNo}
                    onChange={e => setAccountNo(e.target.value.replace(/\D/g, '').slice(0, 18))}
                    className="w-full px-4 py-3 rounded-xl bg-white/80 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400 font-mono tracking-widest" 
                    placeholder="Enter Account Number" 
                  />
                  {accountNo.length > 0 && !accountValid && (
                    <p className="mt-1.5 text-xs font-semibold text-amber-700">Account numbers are 9 to 18 digits.</p>
                  )}
                </div>
                <div>
                  <label htmlFor="kyc-account-confirm" className="block text-sm font-bold text-slate-700 mb-1">Confirm Account Number</label>
                  <input 
                    id="kyc-account-confirm"
                    type={showAccount ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="off"
                    value={confirmAccountNo}
                    onChange={e => setConfirmAccountNo(e.target.value.replace(/\D/g, '').slice(0, 18))}
                    className="w-full px-4 py-3 rounded-xl bg-white/80 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400 font-mono tracking-widest" 
                    placeholder="Re-enter to confirm" 
                  />
                  {confirmAccountNo.length > 0 && !accountsMatch && (
                    <p role="alert" className="mt-1.5 text-xs font-semibold text-red-700">The two account numbers do not match.</p>
                  )}
                  {accountValid && accountsMatch && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle className="w-3.5 h-3.5" /> Both entries match.
                    </p>
                  )}
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
                  </div>
                </div>

                {ifscLookup.status === 'invalid' && (
                  <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    That is not a valid IFSC. The format is four letters, a zero, then six characters &mdash; for example HDFC0001234.
                  </p>
                )}

                {(ifscLookup.status === 'resolved' || ifscLookup.status === 'unknown') && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 animate-in fade-in zoom-in-95">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                      <Info className="w-4 h-4 shrink-0" /> Read from the code &mdash; not confirmed with the bank
                    </p>
                    <p className="mt-2 font-bold text-slate-800">
                      {ifscLookup.status === 'resolved'
                        ? ifscLookup.bank
                        : `Bank code ${ifsc.slice(0, 4)} is not in the offline list`}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Branch code {ifscLookup.branchCode}. The branch and the account holder&apos;s name are confirmed when your KYC is reviewed.
                    </p>
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
              if (step === 2 && (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) || !otpVerified)) return alert('Enter a valid PAN and verify the Aadhaar OTP');
              if (step < 3) {
                setStep(s => s + 1);
              } else {
                onComplete();
              }
            }}
            disabled={(step === 1 && !role) || (step === 3 && !bankStepComplete)}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 3 ? 'Complete KYC' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
