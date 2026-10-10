import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pay after delivery',
  description: 'Buy and sell produce safely: order now, and pay the seller directly by UPI only after the goods reach you.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
