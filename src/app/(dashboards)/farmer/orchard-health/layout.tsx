import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Orchard health check',
  description: 'Check your orchard for common pests, diseases and nutrient problems and get next steps.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
