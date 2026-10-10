import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Escrow-protected trade',
  description: 'Buy and sell produce safely: payment is held by KashRoot and released only on delivery.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
