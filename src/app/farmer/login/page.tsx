import Link from 'next/link';
import { PortalLoginForm } from '@/components/auth/PortalLoginForm';
import { ACCENT_LINK, sanitizePath } from '@/lib/auth/portals';

export default async function FarmerLogin({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { returnTo } = await searchParams;
  const destination = sanitizePath(returnTo);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-lime-100 via-emerald-50 to-white px-4">
      <div className="w-full max-w-md p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-white shadow-xl text-slate-800">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-emerald-950 mb-2">Farmer Login</h1>
          <p className="text-slate-600">Manage your orchard, harvest listings, and crop support from one place.</p>
        </div>
        <PortalLoginForm role="FARMER" accent="emerald" returnTo={destination} />
        <p className="text-center text-sm text-slate-500 mt-6">
          <Link href="/" className={`transition-colors ${ACCENT_LINK.emerald}`}>← Back to Gateway</Link>
        </p>
      </div>
    </div>
  );
}
