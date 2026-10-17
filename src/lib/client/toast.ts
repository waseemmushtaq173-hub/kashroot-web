/**
 * KashRoot's toasts: sonner's, plus help with the identity check. An error
 * that asks the person to verify gets a "Verify now" button that opens the
 * check right here (identityCheck.ts). While a pop-up window is open the
 * page around it cannot be tapped (toasts included), so there the check
 * opens straight away, above the window.
 */
import { toast as sonner, type ExternalToast } from 'sonner';

import { asksToVerify, openIdentityCheck } from '@/lib/client/identityCheck';

const inWindow = () => {
  try {
    return Boolean(document.querySelector('dialog:modal'));
  } catch {
    return false;
  }
};

const error: typeof sonner.error = (message, data?: ExternalToast) => {
  if (typeof message !== 'string' || !asksToVerify(message)) return sonner.error(message, data);
  if (inWindow()) {
    openIdentityCheck();
    return sonner.error('Verify your identity first: the identity check is open now (about a minute). Then try again.', { duration: 10000, ...data });
  }
  return sonner.error(message, { duration: 12000, action: { label: 'Verify now', onClick: () => openIdentityCheck() }, ...data });
};

export const toast: typeof sonner = Object.assign((...args: Parameters<typeof sonner>) => sonner(...args), sonner, { error });
