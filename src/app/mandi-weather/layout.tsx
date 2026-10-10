import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live mandi rates & weather',
  description: 'Today’s wholesale mandi prices from Agmarknet and a 7-day farm weather forecast for your area.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
