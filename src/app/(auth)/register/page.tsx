'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AlertCircle, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { authApi, type RegisterDto } from '@/lib/api/auth';
import { loginHref } from '@/lib/auth/roles';
import { ApiError } from '@/lib/api/client';
import axios from 'axios';

export default function RegisterPage() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'FARMER' | 'BUYER'>('FARMER');

  // Dual OTP States
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [expectedEmailOtp, setExpectedEmailOtp] = useState('');
  const [emailOtpInput, setEmailOtpInput] = useState('');
  const [emailTimer, setEmailTimer] = useState(0);
  const [emailError, setEmailError] = useState('');

  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [isSendingPhone, setIsSendingPhone] = useState(false);
  const [expectedPhoneOtp, setExpectedPhoneOtp] = useState('');
  const [phoneOtpInput, setPhoneOtpInput] = useState('');
  const [phoneTimer, setPhoneTimer] = useState(0);
  const [phoneError, setPhoneError] = useState('');
  const [phoneDevMode, setPhoneDevMode] = useState(false);

  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    let interval: any;
    if (emailTimer > 0) interval = setInterval(() => setEmailTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [emailTimer]);

  useEffect(() => {
    let interval: any;
    if (phoneTimer > 0) interval = setInterval(() => setPhoneTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [phoneTimer]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterDto & { confirmPassword: string }>({
    defaultValues: {
      role: 'FARMER',
    },
  });

  const emailValue = watch('email', '');
  const phoneValue = watch('phone', '');
  const password = watch('password', '');

  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  const registerMutation = useMutation({
    mutationFn: (dto: RegisterDto) => authApi.register(dto),
    onSuccess: (result, variables) => {
      setSuccess(true);
      setNeedsEmailConfirmation(result.needsEmailConfirmation);
      // Sending them to /login would land on the partner and staff form; each
      // role has its own sign-in. Skip the redirect entirely while the email
      // is unconfirmed, because signing in would fail until the link is used.
      if (result.needsEmailConfirmation) return;
      const role = variables.role === 'BUYER' ? 'buyer' : 'farmer';
      setTimeout(() => {
        router.push(loginHref(role));
      }, 2000);
    },
  });

  const onSubmit = ({ confirmPassword, ...dto }: RegisterDto & { confirmPassword: string }) => {
    dto.role = selectedRole;
    registerMutation.mutate(dto);
  };

  const handleSendEmailOtp = async () => {
    setEmailError('');
    if (!emailValue || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      setEmailError('Please enter a valid email address first.');
      return;
    }
    setIsSendingEmail(true);
    try {
      console.log('Frontend sending OTP request for:', emailValue);
      const res = await axios.post('/api/auth/otp/email', { email: emailValue });
      if (res.data.emailOtp) {
        setExpectedEmailOtp(res.data.emailOtp);
        setEmailOtpSent(true);
        setEmailTimer(30);
      }
    } catch (err: any) {
      setEmailError(err.response?.data?.message || 'Failed to send email OTP');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendPhoneOtp = async () => {
    setPhoneError('');
    setPhoneDevMode(false);
    if (!phoneValue || phoneValue.length < 10) {
      setPhoneError('Please enter a valid mobile number first.');
      return;
    }
    setIsSendingPhone(true);
    try {
      const res = await axios.post('/api/auth/otp/sms', { phone: phoneValue });
      if (res.data.phoneOtp) {
        setExpectedPhoneOtp(res.data.phoneOtp);
        setPhoneOtpSent(true);
        setPhoneTimer(30);
        if (res.data.isMock) {
          setPhoneDevMode(true);
        }
      }
    } catch (err: any) {
      setPhoneError(err.response?.data?.message || 'Failed to send SMS OTP');
    } finally {
      setIsSendingPhone(false);
    }
  };

  const errorMsg = registerMutation.error instanceof ApiError
    ? registerMutation.error.messages[0]
    : registerMutation.error instanceof Error 
    ? registerMutation.error.message 
    : registerMutation.error ? 'Registration failed. Please try again.' : null;

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <CheckCircle2 style={{ width: '3rem', height: '3rem', color: '#16a34a', margin: '0 auto 1rem' }} />
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>Account created!</h2>
        {needsEmailConfirmation ? (
          <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>
            Check your inbox and click the confirmation link, then sign in.
          </p>
        ) : (
          <>
            <p style={{ color: '#4b5563', marginTop: '0.5rem' }}>You have successfully registered. Redirecting to sign in…</p>
            <Loader2 className="animate-spin" style={{ width: '1.25rem', height: '1.25rem', color: '#d97706', margin: '1rem auto 0' }} />
          </>
        )}
      </div>
    );
  }

  const isFormValid = isEmailVerified && isPhoneVerified && agreedToTerms;

  return (
    <div className="kr-glass shadow-2xl shadow-gray-200/50 rounded-[2rem] p-8 sm:p-10 border border-kr-border-default max-w-md w-full mx-auto relative z-10">
      <h1 className="text-4xl font-extrabold text-[#1B4332] tracking-tight mb-2">Create your account</h1>
      <p className="text-sm text-kr-text-secondary mb-8">
        Already have an account?{' '}
        <Link href="/login" className="text-[#E76F51] font-semibold hover:text-[#D65A3D] transition-colors">
          Sign in
        </Link>
      </p>

      {errorMsg && (
        <div className="bg-kr-badge-rejected-bg border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium mb-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="m-0">{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* Role selector */}
        <div>
          <label className="text-sm font-semibold text-kr-text-primary mb-1.5 block">I am a</label>
          <div className="grid grid-cols-2 gap-3">
            {(['FARMER', 'BUYER'] as const).map((r) => {
              const isSelected = selectedRole === r;
              return (
                <div
                  key={r}
                  onClick={() => {
                    setSelectedRole(r);
                    setValue('role', r);
                  }}
                  className={`border-2 rounded-xl p-4 font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    isSelected
                      ? 'bg-[#1B4332]/5 border-[#1B4332] text-[#1B4332] shadow-sm ring-1 ring-[#1B4332]'
                      : 'kr-glass border-kr-border-default text-kr-text-secondary hover:border-[#1B4332]/30 hover:shadow-md'
                  }`}
                >
                  <span className="text-2xl">{r === 'FARMER' ? '🌾' : '🛒'}</span>
                  <span className="text-sm">
                    {r === 'FARMER' ? 'Farmer' : 'Buyer'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Full name */}
        <div>
          <label htmlFor="fullName" className="text-sm font-semibold text-kr-text-primary mb-1.5 block">Full name</label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            className="w-full px-4 py-3.5 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none"
            {...register('fullName', {
              required: 'Full name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
            })}
          />
          {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName.message}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="reg-email" className="text-sm font-semibold text-kr-text-primary mb-1.5 block">Email address</label>
          <div className="flex gap-2">
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              disabled={isEmailVerified}
              className="flex-1 px-4 py-3.5 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none disabled:opacity-70"
              {...register('email', {
                required: 'Email is required',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
              })}
            />
            {!isEmailVerified && (
              <button
                type="button"
                onClick={handleSendEmailOtp}
                disabled={isSendingEmail || emailTimer > 0}
                className="kr-btn-ghost text-kr-primary-600 hover:text-kr-primary-700 hover:bg-kr-fill-brand-subtle font-bold whitespace-nowrap px-4 py-3.5 rounded-xl shrink-0 disabled:opacity-50 transition-colors"
              >
                {isSendingEmail ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : emailTimer > 0 ? `Wait ${emailTimer}s` : 'Send OTP'}
              </button>
            )}
            {isEmailVerified && (
              <div className="px-4 py-3.5 kr-glass border border-kr-border-default text-emerald-700 font-semibold rounded-xl flex items-center justify-center whitespace-nowrap">
                <CheckCircle2 className="w-5 h-5 mr-1" /> Verified
              </div>
            )}
          </div>
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          {emailError && <p className="text-red-500 text-xs mt-1">{emailError}</p>}
          
          {emailOtpSent && !isEmailVerified && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="Enter Email OTP"
                value={emailOtpInput}
                onChange={(e) => setEmailOtpInput(e.target.value)}
                className="flex-1 px-4 py-3.5 rounded-xl border border-kr-border-default kr-glass text-emerald-900 placeholder-emerald-400 focus:bg-kr-bg-surface focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (emailOtpInput === expectedEmailOtp) {
                    setIsEmailVerified(true);
                    setEmailError('');
                  } else {
                    setEmailError('Invalid Email OTP');
                  }
                }}
                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors"
              >
                Verify
              </button>
            </div>
          )}
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="text-sm font-semibold text-kr-text-primary mb-1.5 block">Mobile Number</label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center border border-kr-border-default bg-kr-bg-sunken rounded-xl overflow-hidden focus-within:kr-glass focus-within:ring-2 focus-within:ring-[#1B4332]/50 focus-within:border-[#1B4332] transition-all duration-200">
              <span className="pl-4 pr-2 text-kr-text-secondary font-medium">+91</span>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                disabled={isPhoneVerified}
                placeholder="9876543210"
                className="w-full py-3.5 pr-4 bg-transparent text-kr-text-primary placeholder:text-kr-text-disabled outline-none disabled:opacity-70"
                {...register('phone', { required: 'Mobile number is required' })}
              />
            </div>
            {!isPhoneVerified && (
              <button
                type="button"
                onClick={handleSendPhoneOtp}
                disabled={isSendingPhone || phoneTimer > 0}
                className="kr-btn-ghost text-kr-primary-600 hover:text-kr-primary-700 hover:bg-kr-fill-brand-subtle font-bold whitespace-nowrap px-4 py-3.5 rounded-xl shrink-0 disabled:opacity-50 transition-colors"
              >
                {isSendingPhone ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : phoneTimer > 0 ? `Wait ${phoneTimer}s` : 'Send OTP'}
              </button>
            )}
            {isPhoneVerified && (
              <div className="px-4 py-3.5 kr-glass border border-kr-border-default text-emerald-700 font-semibold rounded-xl flex items-center justify-center whitespace-nowrap">
                <CheckCircle2 className="w-5 h-5 mr-1" /> Verified
              </div>
            )}
          </div>
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
          {phoneError && <p className="text-red-500 text-xs mt-1">{phoneError}</p>}

          {phoneOtpSent && !isPhoneVerified && (
            <div className="mt-3 flex flex-col gap-2">
              {phoneDevMode && (
                <div className="text-sm text-blue-600 kr-glass px-3 py-2 rounded-lg font-medium border border-kr-border-default">
                  Dev Mode Active: Check terminal for OTP code.
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter Mobile OTP"
                  value={phoneOtpInput}
                  onChange={(e) => setPhoneOtpInput(e.target.value)}
                  className="flex-1 px-4 py-3.5 rounded-xl border border-kr-border-default kr-glass text-emerald-900 placeholder-emerald-400 focus:bg-kr-bg-surface focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (phoneOtpInput === expectedPhoneOtp) {
                      setIsPhoneVerified(true);
                      setPhoneError('');
                    } else {
                      setPhoneError('Invalid Mobile OTP');
                    }
                  }}
                  className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors"
                >
                  Verify
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="reg-password" className="text-sm font-semibold text-kr-text-primary mb-1.5 block">Password</label>
          <div className="relative">
            <input
              id="reg-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              className="w-full px-4 py-3.5 pr-10 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'At least 8 characters' },
                pattern: {
                  value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
                  message: 'Must include uppercase, lowercase, and a number',
                },
              })}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-3.5 text-kr-text-disabled hover:text-kr-text-secondary transition-colors"
            >
              {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
        </div>

        {/* Confirm password */}
        <div>
          <label htmlFor="confirm-password" className="text-sm font-semibold text-kr-text-primary mb-1.5 block">Confirm password</label>
          <input
            id="confirm-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            className="w-full px-4 py-3.5 rounded-xl border border-kr-border-default bg-kr-bg-sunken text-kr-text-primary placeholder:text-kr-text-disabled focus:bg-kr-bg-surface focus:ring-2 focus:ring-[#1B4332]/50 focus:border-[#1B4332] transition-all duration-200 outline-none"
            {...register('confirmPassword', {
              required: 'Please confirm your password',
              validate: (v) => v === password || 'Passwords do not match',
            })}
          />
          {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>}
        </div>

        {/* T&C Checkbox */}
        <div className="flex items-center mt-4">
          <input
            type="checkbox"
            id="terms"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="w-4 h-4 text-[#1B4332] border-kr-border-default rounded focus:ring-[#1B4332]"
          />
          <label htmlFor="terms" className="ml-2 block text-sm text-kr-text-primary">
            I agree to the <Link href="/terms" className="text-[#E76F51] hover:underline">Terms & Conditions</Link> & <Link href="/privacy" className="text-[#E76F51] hover:underline">Privacy Policy</Link>
          </label>
        </div>

        <button
          type="submit"
          disabled={!isFormValid || registerMutation.isPending}
          className="w-full py-4 mt-4 bg-gradient-to-r from-[#E76F51] to-[#F4A261] hover:from-[#D65A3D] hover:to-[#E76F51] text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:-translate-y-0 disabled:hover:shadow-lg"
        >
          {registerMutation.isPending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Creating account…</>
          ) : 'Signup'}
        </button>
      </form>
    </div>
  );
}
