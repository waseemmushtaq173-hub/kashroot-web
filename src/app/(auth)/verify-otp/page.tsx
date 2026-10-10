import { redirect } from 'next/navigation';

/** The old "dev mode" OTP page is gone: sign-up now uses Supabase's confirmation email. */
export default function VerifyOtpRedirect() {
  redirect('/login');
}
