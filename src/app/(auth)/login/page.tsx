import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { ACCENT_BADGE, PORTALS, sanitizePath, withReturnTo } from '@/lib/auth/portals';

const primary = PORTALS.filter((portal) => portal.primary);
const partner = PORTALS.filter((portal) => !portal.primary);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { verified, returnTo } = await searchParams;
  const justVerified = (Array.isArray(verified) ? verified[0] : verified) === '1';
  // The dashboard guard sends people here with where they were headed.
  const destination = sanitizePath(returnTo);

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-4 py-16 text-slate-900">
      <section className="mx-auto max-w-5xl">
        <p className="text-center text-sm font-bold uppercase tracking-[0.22em] text-emerald-700">KashRoot Portals</p>
        <h1 className="mt-3 text-center text-4xl font-extrabold tracking-tight sm:text-5xl">Choose your sign-in</h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-slate-600">Select the workspace that matches your role to continue.</p>

        {justVerified && (
          <p role="status" className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Email verified. Pick your portal below to sign in.
          </p>
        )}

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {primary.map(({ label, detail, loginHref, icon: Icon, accent }) => (
            <Link key={loginHref} href={withReturnTo(loginHref, destination)} className="group rounded-3xl border border-white bg-white/80 p-7 shadow-lg transition hover:-translate-y-1 hover:shadow-xl">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${ACCENT_BADGE[accent]}`}><Icon className="h-6 w-6" /></span>
              <h2 className="mt-5 text-xl font-bold">{label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{detail}</p>
              <span className="mt-6 inline-block font-semibold text-emerald-800 group-hover:underline">Continue →</span>
            </Link>
          ))}
        </div>

        <h2 className="mt-14 text-center text-sm font-bold uppercase tracking-[0.18em] text-slate-500">Partner &amp; staff portals</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {partner.map(({ label, detail, loginHref, icon: Icon, accent }) => (
            <Link key={loginHref} href={withReturnTo(loginHref, destination)} className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white/70 p-5 transition hover:border-slate-300 hover:bg-white hover:shadow-md">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ACCENT_BADGE[accent]}`}><Icon className="h-5 w-5" /></span>
              <span>
                <span className="block font-bold group-hover:underline">{label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-600">{detail}</span>
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-slate-500"><Link href="/" className="hover:text-emerald-800">Back to KashRoot</Link></p>
      </section>
    </main>
  );
}
