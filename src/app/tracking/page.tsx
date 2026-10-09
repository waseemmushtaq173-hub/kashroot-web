import { redirect } from 'next/navigation';

/** Public tracking link → the real tracker (it asks for sign-in if needed). */
export default function TrackingRedirect() {
  redirect('/tracking/dashboard');
}
