import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Orchard season planner',
  description: 'Month-by-month orchard tasks for apples, walnuts, cherries and more.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
