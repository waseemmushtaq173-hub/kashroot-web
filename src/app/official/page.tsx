import Link from 'next/link';
import type { Metadata } from 'next';

import { InfoPage } from '@/components/layout/InfoPage';
import { SITE_URL, SOCIAL_LINKS } from '@/lib/site';
import { NEVER_ASKS, SUPPORT_EMAIL, supportMailto } from '@/lib/supportEmail';

export const metadata: Metadata = {
  title: 'Official KashRoot contacts',
  description: `KashRoot's only website, email address and support channels — and what KashRoot never asks for. Official email: ${SUPPORT_EMAIL}.`,
};

const link = 'inline-flex min-h-11 items-center font-semibold text-emerald-800 underline break-all';

/**
 * KashRoot's only official addresses, so a fake website, email or caller is
 * easy to tell apart. Linked from the footer, Help & support, terms and privacy.
 */
export default function OfficialPage() {
  const host = new URL(SITE_URL).host;
  return (
    <InfoPage title="Official KashRoot contacts" intro="The only places KashRoot speaks from. Anything else using our name is not us.">
      <section>
        <h2>Website</h2>
        <p>
          <a className={link} href={SITE_URL}>
            {host}
          </a>
          <br />
          Sign in only on this address. Check the address bar before typing a password.
        </p>
      </section>
      <section>
        <h2>Email</h2>
        <p>
          <a className={link} href={supportMailto()}>
            {SUPPORT_EMAIL}
          </a>
          <br />
          KashRoot’s emails — help replies, security notices, sign-in and password-reset emails — come only from this address. An email from any other address that claims to be KashRoot is fake: do not open its links, and forward it to us.
        </p>
      </section>
      <section>
        <h2>Help</h2>
        <p>
          <Link className={link} href="/support">
            Help &amp; support
          </Link>{' '}
          — answers to read or hear, and Ask KashRoot to reach a person, who replies or calls you back. It works without signing in.
        </p>
      </section>
      <section>
        <h2>Social pages</h2>
        <ul>
          {SOCIAL_LINKS.map((s) => (
            <li key={s.href}>
              <a className={link} href={s.href} target="_blank" rel="noopener noreferrer me">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>What KashRoot never asks for</h2>
        <p className="rounded-2xl bg-amber-50 p-4 font-semibold text-amber-950 ring-1 ring-amber-200">{NEVER_ASKS}</p>
        <ul className="mt-3">
          <li>KashRoot never holds your money: buyers pay sellers directly, and cold stores are paid by the farmer.</li>
          <li>KashRoot support will never change your email, phone or payment details because someone asked by phone or message — you change them yourself, signed in.</li>
          <li>Someone asking for a code “to verify you” or “to release a payment” is a fraud. Hang up and write to us.</li>
        </ul>
      </section>
    </InfoPage>
  );
}
