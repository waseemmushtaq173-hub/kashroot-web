import { redirect } from 'next/navigation';

/** The seller studio became the seller portal; keep old links working. */
export default function SellerStudioPage() {
  redirect('/seller/dashboard');
}
