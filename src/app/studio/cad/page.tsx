import type { Metadata } from 'next';

import { CadStudio } from '@/features/cad/components/CadStudio';

export const metadata: Metadata = {
  title: 'Design Studio',
  description: 'Kashroot Design Studio: 3D CAD for cold stores, warehouses and post-harvest equipment.',
  // Beta: kept out of search results until the modelling tools are in.
  robots: { index: false, follow: false },
};

export default function DesignStudioPage() {
  return <CadStudio />;
}
