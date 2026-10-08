'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { User, ShieldCheck, Landmark, Upload, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';

export function KYCOnboardingPanel({
  isOpen,
  onComplete
}: {
  isOpen: boolean;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    role: 'FARMER',
    location: '',
    docType: 'AADHAAR',
    docNumber: '',
    accName: '',
    accNumber: '',
    ifsc: '',
  });

  if (!isOpen) return null;

  const handleNext = () => setStep((s) => Math.min(s + 1, 3));
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    setLoading(true);
    // Simulate API call for KYC submission
    setTimeout(() => {
      setLoading(false);
      onComplete();
    }, 1500);
  };

  const updateForm = (key: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--kr-dal-teal,#0E7C86)]/30 bg-black/40 backdrop-blur-md shadow-[0_0_40px_rgba(14,124,134,0.15)] flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-[var(--kr-pir-panjal-navy,#0B1F3A)] to-[var(--kr-dal-teal,#0E7C86)] p-6 border-b border-white/10 shrink-0">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-[var(--kr-saffron-gold,#E8A317)]" />
            Complete Full KYC
          </h2>
          <p className="text-white/80 mt-1 text-sm">
            Unlock payments, escrow, and verified badges.
          </p>

          {/* Progress Bar */}
          <div className="flex items-center gap-2 mt-6">
            {[1, 2, 3].map((num) => (
              <div key={num} className="flex-1">
                <div className={`h-1.5 rounded-full transition-colors ${step >= num ? 'bg-[var(--kr-saffron-gold,#E8A317)]' : 'bg-white/20'}`} />
                <div className={`text-xs mt-2 font-medium ${step >= num ? 'text-white' : 'text-white/40'}`}>
                  {num === 1 && 'Profile'}
                  {num === 2 && 'Identity'}
                  {num === 3 && 'Bank'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 flex-1 overflow-y-auto space-y-6 text-white">
          
          {/* STEP 1: Profile Details */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2 mb-2 text-[var(--kr-saffron-gold,#E8A317)]">
                <User className="w-5 h-5" />
                <h3 className="text-lg font-bold">Profile Details</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">Full Name</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--kr-dal-teal,#0E7C86)] focus:ring-1 focus:ring-[var(--kr-dal-teal,#0E7C86)] transition-all"
                    placeholder="Enter your full name as per Govt ID"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1.5">Primary Role</label>
                    <select 
                      value={formData.role}
                      onChange={(e) => updateForm('role', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--kr-dal-teal,#0E7C86)] transition-all appearance-none"
                    >
                      <option value="FARMER" className="bg-[#0B1F3A]">Farmer / Producer</option>
                      <option value="BUYER" className="bg-[#0B1F3A]">Buyer / Exporter</option>
                      <option value="SELLER" className="bg-[#0B1F3A]">Seller / Input Dealer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1.5">Location (District)</label>
                    <input 
                      type="text"
                      value={formData.location}
                      onChange={(e) => updateForm('location', e.target.value)} 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--kr-dal-teal,#0E7C86)] transition-all"
                      placeholder="e.g. Pulwama, Baramulla"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Identity Verification */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2 mb-2 text-[var(--kr-saffron-gold,#E8A317)]">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="text-lg font-bold">Identity Verification</h3>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1.5">Document Type</label>
                    <select 
                      value={formData.docType}
                      onChange={(e) => updateForm('docType', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[var(--kr-dal-teal,#0E7C86)] transition-all appearance-none"
                    >
                      <option value="AADHAAR" className="bg-[#0B1F3A]">Aadhaar Card</option>
                      <option value="PAN" className="bg-[#0B1F3A]">PAN Card</option>
                      <option value="GSTIN" className="bg-[#0B1F3A]">GSTIN (Business)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1.5">Document Number</label>
                    <input 
                      type="text" 
                      value={formData.docNumber}
                      onChange={(e) => updateForm('docNumber', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--kr-dal-teal,#0E7C86)] transition-all uppercase"
                      placeholder="Enter ID Number"
                    />
                  </div>
                </div>

                <div className="mt-4 border-2 border-dashed border-white/20 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-white/5 transition-colors cursor-pointer group">
                  <div className="bg-white/10 p-3 rounded-full mb-3 group-hover:bg-[var(--kr-dal-teal,#0E7C86)] transition-colors">
                    <Upload className="w-6 h-6 text-white" />
                  </div>
                  <p className="font-medium text-sm text-white mb-1">Click to upload document photo</p>
                  <p className="text-xs text-white/50">PNG, JPG or PDF (Max. 5MB)</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Bank Details */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-2 mb-2 text-[var(--kr-saffron-gold,#E8A317)]">
                <Landmark className="w-5 h-5" />
                <h3 className="text-lg font-bold">Escrow Payout Account</h3>
              </div>
              <p className="text-sm text-white/60 mb-4">
                This account will be used to securely receive payouts from escrow and buyers.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1.5">Account Holder Name</label>
                  <input 
                    type="text" 
                    value={formData.accName}
                    onChange={(e) => updateForm('accName', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--kr-dal-teal,#0E7C86)] transition-all"
                    placeholder="Exact name on bank account"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1.5">Account Number</label>
                    <input 
                      type="password" 
                      value={formData.accNumber}
                      onChange={(e) => updateForm('accNumber', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--kr-dal-teal,#0E7C86)] transition-all font-mono"
                      placeholder="••••••••••••"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-1.5">IFSC Code</label>
                    <input 
                      type="text" 
                      value={formData.ifsc}
                      onChange={(e) => updateForm('ifsc', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--kr-dal-teal,#0E7C86)] transition-all font-mono uppercase"
                      placeholder="e.g. SBIN0001234"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-black/40 border-t border-white/10 shrink-0 flex items-center justify-between">
          <Button 
            variant="ghost" 
            onClick={step === 1 ? undefined : handlePrev}
            className={`text-white/70 hover:text-white ${step === 1 ? 'opacity-0 pointer-events-none' : ''}`}
          >
            <ChevronLeft className="w-4 h-4 mr-2" /> Back
          </Button>

          {step < 3 ? (
            <Button variant="primary" onClick={handleNext} className="bg-[var(--kr-dal-teal,#0E7C86)] hover:bg-[#0b636b] text-white px-6">
              Next Step <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button 
              variant="primary" 
              onClick={handleSubmit} 
              disabled={loading}
              className="bg-[var(--kr-saffron-gold,#E8A317)] hover:bg-[#B37A0B] text-black font-bold px-8"
            >
              {loading ? (
                <span className="flex items-center gap-2">Verifying...</span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Submit KYC
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
