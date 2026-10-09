/** Buyer sign-in — lake azure, email-first: "Source authentic produce". */
import { ShoppingBag } from 'lucide-react';

import { RoleLoginForm, type RoleLoginTheme } from './RoleLoginForm';

const BUYER_THEME: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-sky-50 via-white to-indigo-50',
  glowA: 'bg-sky-300/40',
  glowB: 'bg-indigo-200/40',
  story: 'bg-gradient-to-br from-sky-100/80 via-indigo-50/60 to-white/30',
  iconTile: 'bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-lg shadow-indigo-500/30',
  eyebrow: 'text-sky-800',
  bullet: 'text-sky-600',
  button: 'bg-sky-700 text-white shadow-sky-700/25 hover:bg-sky-800',
  link: 'text-sky-800 hover:text-sky-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-sky-700',
  inputFocus: 'focus:ring-sky-500',
};

export function BuyerLogin({ next, verified }: { next?: string; verified?: boolean }) {
  return (
    <RoleLoginForm
      role="buyer"
      next={next}
      verified={verified}
      icon={<ShoppingBag className="h-6 w-6" aria-hidden />}
      eyebrow="Buyer portal"
      headline="Source authentic produce"
      description="Buy saffron, premium apples and dry fruits direct from verified growers — your payment stays in escrow until the goods arrive."
      highlights={['Verified growers and traders', 'Compare offers side by side', 'Escrow protection on every order']}
      identifierLabel="Work email"
      identifierPlaceholder="you@company.com"
      theme={BUYER_THEME}
    />
  );
}
