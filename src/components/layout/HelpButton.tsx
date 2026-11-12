'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LifeBuoy, Mic, Phone, ShieldCheck } from 'lucide-react';

import { Btn, Modal, PORTAL_THEMES } from '@/components/portal/kit';
import { NEVER_ASKS } from '@/lib/supportEmail';

/**
 * "Help & support" in every top bar (the site header, a portal's header and
 * the portal shell). Opens a drawer with the direct helpline (Kisan Call
 * Centre, Government of India), the in-app help desk, the multilingual voice
 * guide and the standing security rule. 44 px or more; on a phone the words
 * shorten to "Help" (its name for screen readers stays "Help & support").
 */
export function HelpButton({ size = 'md', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Help & support"
        data-help-button
        className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl bg-white/90 px-3 font-semibold text-slate-800 no-underline shadow-sm ring-1 ring-slate-900/10 transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${size === 'lg' ? 'h-12 text-base lg:h-11 lg:text-sm' : 'min-h-11 text-sm'} ${className}`}
      >
        <LifeBuoy className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
        <span className="sm:hidden">Help</span>
        <span className="hidden sm:inline">Help &amp; support</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Help & support">
        <div className="space-y-3 overflow-y-auto px-6 pb-6">
          <a
            href="tel:18001801551"
            className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 no-underline ring-1 ring-emerald-200 transition hover:bg-emerald-100"
          >
            <Phone className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden />
            <span>
              <span className="block font-semibold text-emerald-950">Helpline: 1800-180-1551</span>
              <span className="block text-sm text-emerald-900/80">Kisan Call Centre (Government of India), every day 6 am–10 pm — Kashmiri, Urdu, Hindi, English.</span>
            </span>
          </a>

          <Link
            href="/support"
            className="flex items-center gap-3 rounded-2xl bg-white p-4 no-underline ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <LifeBuoy className="h-6 w-6 shrink-0 text-sky-700" aria-hidden />
            <span>
              <span className="block font-semibold text-slate-900">Ask KashRoot</span>
              <span className="block text-sm text-slate-600">Common problems, check my request, and the help desk that answers you here in the app.</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <Mic className="h-6 w-6 shrink-0 text-amber-700" aria-hidden />
            <p className="text-sm text-amber-950">
              <strong className="font-semibold">Voice guide in your language.</strong> Tap the floating mic (bottom-right of every page) and ask in Kashmiri, Urdu, Hindi or English — it answers out loud.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-slate-100 p-4 ring-1 ring-slate-200">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden />
            <p className="text-sm text-slate-700">{NEVER_ASKS}</p>
          </div>

          <Btn theme={PORTAL_THEMES.farmer} className="w-full min-h-11" onClick={() => setOpen(false)}>
            Done
          </Btn>
        </div>
      </Modal>
    </>
  );
}
