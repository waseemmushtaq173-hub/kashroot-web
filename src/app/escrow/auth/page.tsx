import { redirect } from 'next/navigation';

/** Escrow uses each portal's own sign-in, then real KYC — no separate escrow login. */
export default function EscrowAuthRedirect() {
  redirect('/login?next=/escrow');
}
