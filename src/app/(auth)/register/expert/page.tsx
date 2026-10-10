'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { AlertCircle, Loader2, UploadCloud, FileText } from 'lucide-react';
import { authApi } from '@/lib/api/auth';
import { tokenStore } from '@/lib/api/client';

export default function ExpertRegistrationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { register, handleSubmit } = useForm();

  const onSubmit = async (data: any) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Mocked Backend Request
      await new Promise(resolve => setTimeout(resolve, 600));

      // Save application state locally to mock backend behaviour
      if (typeof window !== 'undefined') {
        // Never keep credentials in browser storage.
        const { password: _password, ...profile } = data;
        const expertData = {
          ...profile,
          status: 'PENDING_VERIFICATION'
        };
        localStorage.setItem('expert_application', JSON.stringify(expertData));
        localStorage.setItem('kr_mock_role', 'EXPERT');
        
        // Auto-login to bypass OTP for this demo step as requested in prompt rules
        const res = await authApi.login({ email: data.email, password: data.password });
        if (res.accessToken) {
          localStorage.setItem('auth_token', res.accessToken);
          document.cookie = `auth_token=${res.accessToken}; path=/; max-age=86400; SameSite=Lax`;
          localStorage.setItem('user_role', 'EXPERT');
          document.cookie = `user_role=EXPERT; path=/; max-age=86400; SameSite=Lax`;
          localStorage.setItem('auth_email', data.email);
        }
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/expert');
      }, 1500);

    } catch (e: any) {
      setErrorMsg(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-8">
        <FileText className="w-12 h-12 text-kr-primary-600 mx-auto mb-4" />
        <h2 className="text-h2 font-heading text-kr-text-primary">Application Submitted</h2>
        <p className="text-kr-text-secondary mt-2">Your credentials are now under review. Redirecting...</p>
        <Loader2 className="animate-spin w-5 h-5 text-kr-primary-600 mx-auto mt-4" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-h2 font-heading text-kr-text-primary mb-1">Apply as an Expert</h1>
      <p className="text-body-sm text-kr-text-secondary mb-6">
        Join the KashRoot Knowledge Panel. Please submit your official credentials for verification.
      </p>

      {errorMsg && (
        <div className="bg-kr-badge-rejected-bg border border-kr-border-danger text-kr-badge-rejected-text p-3 rounded-md mb-6 flex gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Full Name</label>
            <input type="text" required {...register('fullName')} className="kr-input w-full" placeholder="Dr. Jane Doe" />
          </div>
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Email</label>
            <input type="email" required {...register('email')} className="kr-input w-full" placeholder="expert@university.edu" />
          </div>
        </div>

        <div>
          <label className="block text-label text-kr-text-primary mb-1">Password</label>
          <input type="password" required {...register('password')} className="kr-input w-full" placeholder="••••••••" />
        </div>

        <hr className="border-kr-border-default my-2" />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Degree / Qualification</label>
            <select required {...register('degree')} className="kr-input w-full">
              <option value="">Select Degree...</option>
              <option value="B.Sc Agriculture">B.Sc Agriculture</option>
              <option value="M.Sc Horticulture">M.Sc Horticulture</option>
              <option value="Ph.D Plant Pathology">Ph.D Plant Pathology</option>
              <option value="Ph.D Soil Science">Ph.D Soil Science</option>
            </select>
          </div>
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Institution</label>
            <select required {...register('institution')} className="kr-input w-full">
              <option value="">Select Institution...</option>
              <option value="SKUAST-K">SKUAST Kashmir</option>
              <option value="SKUAST-J">SKUAST Jammu</option>
              <option value="IARI">IARI New Delhi</option>
              <option value="PAU">Punjab Agricultural University</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Agronomist License No.</label>
            <input type="text" required {...register('license')} className="kr-input w-full" placeholder="e.g. AG-2023-991" />
          </div>
          <div>
            <label className="block text-label text-kr-text-primary mb-1">Years of Experience</label>
            <input type="number" required min="1" {...register('experience')} className="kr-input w-full" placeholder="e.g. 5" />
          </div>
        </div>

        <div>
          <label className="block text-label text-kr-text-primary mb-1">Primary Specialization</label>
          <select required {...register('specialization')} className="kr-input w-full">
            <option value="">Select Specialization...</option>
            <option value="Horticulture (Apples & Walnuts)">Horticulture (Apples & Walnuts)</option>
            <option value="Entomology / Pest Control">Entomology / Pest Control</option>
            <option value="Soil Health & Fertilizers">Soil Health & Fertilizers</option>
            <option value="Crop Science">Crop Science</option>
          </select>
        </div>

        <div className="border-2 border-dashed border-kr-border-default rounded-md p-4 text-center cursor-pointer hover:bg-kr-bg-sunken">
          <UploadCloud className="w-6 h-6 mx-auto text-kr-text-secondary mb-2" />
          <p className="text-body-sm text-kr-text-primary font-medium">Upload Certificate / ID Proof</p>
          <p className="text-caption text-kr-text-disabled">PDF, JPG, PNG up to 5MB</p>
          <input type="file" className="hidden" />
        </div>

        <button type="submit" disabled={loading} className="kr-btn-primary w-full flex justify-center items-center mt-6">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit Application'}
        </button>

        <p className="text-center text-caption text-kr-text-secondary mt-4">
          Already verified? <Link href="/login" className="text-kr-text-brand hover:underline font-medium">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
