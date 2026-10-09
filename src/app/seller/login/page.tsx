import Link from 'next/link';
import { Store } from 'lucide-react';
import { PortalLoginForm } from '@/components/auth/PortalLoginForm';
import { sanitizePath } from '@/lib/auth/portals';

export default async function SellerLogin({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { returnTo } = await searchParams;
  const destination = sanitizePath(returnTo);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-100 via-orange-50 to-white px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-white bg-white/85 p-8 shadow-xl backdrop-blur-xl">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800"><Store /></span>
          <h1 className="text-3xl font-bold text-amber-950">Seller Login</h1>
          <p className="mt-2 text-slate-600">Manage your catalogue, stock, and verified supplier offers.</p>
        </div>
        <PortalLoginForm role="SELLER" accent="amber" returnTo={destination} />
        <p className="mt-6 text-center text-sm text-slate-500"><Link href="/" className="hover:text-amber-800">← Back to KashRoot</Link></p>
      </section>
    </main>
  );
}
