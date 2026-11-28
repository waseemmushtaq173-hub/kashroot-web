'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';

import { createCadStore, type CadState, type CadStore, type CadStoreOptions } from '@/features/cad/state/store';

const CadStoreContext = createContext<CadStore | null>(null);

/** One store per open workspace: leaving the page and coming back starts clean. */
export function CadStoreProvider({ children, options }: { children: ReactNode; options?: CadStoreOptions }) {
  const [store] = useState(() => createCadStore(options));
  return <CadStoreContext.Provider value={store}>{children}</CadStoreContext.Provider>;
}

export function useCadStoreApi(): CadStore {
  const store = useContext(CadStoreContext);
  if (!store) throw new Error('useCad must be used inside <CadStoreProvider>.');
  return store;
}

/** Read part of the workspace state; the component re-renders only when that part changes. */
export function useCad<T>(selector: (state: CadState) => T): T {
  return useStore(useCadStoreApi(), selector);
}
