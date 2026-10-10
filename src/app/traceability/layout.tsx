import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Produce traceability',
  description: 'Follow a batch of produce from orchard to buyer.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
