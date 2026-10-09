import { redirect } from 'next/navigation';

/** Kept so old links keep working: the farmer sign-in now lives at /login/farmer. */
export default function LegacyFarmerLoginRedirect() {
  redirect('/login/farmer');
}
