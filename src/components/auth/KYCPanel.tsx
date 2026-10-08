"use client";

import React, { useState, useEffect } from 'react';

interface KYCPanelProps {
  isOpen: boolean;
  onComplete: () => void;
}

export default function KYCPanel({ isOpen, onComplete }: KYCPanelProps) {
  const [step, setStep] = useState(1);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    setIsVisible(isOpen);
  }, [isOpen]);

  if (!isVisible) return null;

  return (
    <div className="w-full flex justify-center mb-8 relative z-50">
      <div className="w-full max-w-lg p-8 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(31,38,135,0.37)] text-white relative">
        <h2 className="text-2xl font-semibold mb-6">Complete Your KYC</h2>

        {/* Stepper */}
        <div className="flex justify-between mb-8 relative before:content-[''] before:absolute before:top-1/2 before:left-0 before:w-full before:h-0.5 before:bg-white/20 before:-z-10">
          {[1, 2, 3].map((s) => (
            <div 
              key={s} 
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-lg transition-colors ${
                step >= s 
                  ? 'bg-blue-600 text-white border border-blue-400' 
                  : 'bg-black/40 text-white/50 border border-white/10'
              }`}
            >
              {s}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="mb-8 min-h-[220px]">
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-xl font-medium text-white/90">Step 1: Profile Information</h3>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Full Name</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-white/30" 
                  placeholder="Enter your full name" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Date of Birth</label>
                <input 
                  type="date" 
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all text-white/90" 
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-xl font-medium text-white/90">Step 2: Identity Verification</h3>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Aadhaar Number</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-white/30" 
                  placeholder="XXXX XXXX XXXX" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">PAN Number</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-white/30 uppercase" 
                  placeholder="ABCDE1234F" 
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-xl font-medium text-white/90">Step 3: Bank Details</h3>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Account Number</label>
                <input 
                  type="password" 
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-white/30" 
                  placeholder="Enter Account Number" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">IFSC Code</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-white/30 uppercase" 
                  placeholder="e.g. HDFC0001234" 
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between mt-8 border-t border-white/10 pt-6">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
            className="px-6 py-2.5 rounded-xl font-medium text-white/80 bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Back
          </button>
          <button
            onClick={() => {
              if (step < 3) {
                setStep(s => s + 1);
              } else {
                onComplete();
              }
            }}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium shadow-lg shadow-blue-500/25 transition-all"
          >
            {step === 3 ? 'Complete KYC' : 'Next Step'}
          </button>
        </div>
      </div>
    </div>
  );
}
