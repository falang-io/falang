import { createContext, useContext } from 'react';
import type { ArduinoProjectStore } from './arduino-project-store.js';

export const ArduinoProjectStoreContext = createContext<ArduinoProjectStore | null>(null);

export const useArduinoProjectStore = (): ArduinoProjectStore => {
  const store = useContext(ArduinoProjectStoreContext);
  if (!store) throw new Error('useArduinoProjectStore must be used within an ArduinoProjectStoreContext provider');
  return store;
};
