import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Compare produce prices',
  description: 'Compare prices for apples, walnuts, saffron and vegetables across verified growers and traders.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
