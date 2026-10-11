import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My work & pay',
  description: 'Mandi rates you posted and farmers you answered on KashRoot, what was accepted, and your payments.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
