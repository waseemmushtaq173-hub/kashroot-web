import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kashmiri Lab',
  description: 'Native Kashmiri speakers teach the KashRoot assistant proper Kashmiri.',
  robots: { index: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
