import { createContext, useContext } from 'react';
import type { DesktopProjectStore } from './desktop-project-store.js';

export const DesktopProjectStoreContext = createContext<DesktopProjectStore | null>(null);

export const useDesktopProjectStore = (): DesktopProjectStore => {
  const store = useContext(DesktopProjectStoreContext);
  if (!store) throw new Error('useDesktopProjectStore must be used within a DesktopProjectStoreContext provider');
  return store;
};
