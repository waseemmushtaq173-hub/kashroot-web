/**
 * Opening the identity check (KYC) from anywhere. Every portal page sits in
 * the dashboards layout, which holds the identity check window and opens it
 * on this event — so the Cold Storage, Dealer, Farmer and Buyer portals each
 * verify right where the person is, without going to another portal.
 */
export const OPEN_KYC = 'kr:kyc-open';

export function openIdentityCheck(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_KYC));
}

/** Does this message ask the person to verify their identity first? */
export const asksToVerify = (message: string) => /Verify your (identity|Aadhaar)/i.test(message);
