import Link from 'next/link';
import { PortalLoginForm } from '@/components/auth/PortalLoginForm';
import { ACCENT_LINK, sanitizePath } from '@/lib/auth/portals';

export default async function BuyerLogin({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { returnTo } = await searchParams;
  const destination = sanitizePath(returnTo);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-white to-indigo-50 px-4">
      <div className="w-full max-w-md p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white shadow-xl text-slate-800">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-sky-950 mb-2">Buyer Login</h1>
          <p className="text-slate-600">Discover verified Kashmiri produce and source directly from trusted growers.</p>
        </div>
        <PortalLoginForm role="BUYER" accent="sky" returnTo={destination} />
        <p className="text-center text-sm text-slate-500 mt-6">
          <Link href="/" className={`transition-colors ${ACCENT_LINK.sky}`}>← Back to Gateway</Link>
        </p>
      </div>
    </div>
  );
}
