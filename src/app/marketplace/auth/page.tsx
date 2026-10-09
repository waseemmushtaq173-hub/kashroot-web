import { redirect } from 'next/navigation';

export default function MarketplaceAuthRedirect() {
  redirect('/login');
}
