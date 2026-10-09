import { redirect } from 'next/navigation';

/** The old logistics demo page → the real Logistics portal. */
export default function LogisticsRedirect() {
  redirect('/provider/dashboard');
}
