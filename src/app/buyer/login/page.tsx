import { redirect } from 'next/navigation';

/** Kept so old links keep working: the buyer sign-in now lives at /login/buyer. */
export default function LegacyBuyerLoginRedirect() {
  redirect('/login/buyer');
}
