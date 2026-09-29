import { createContext, useContext } from 'react';
import type { DependencyContainer } from 'tsyringe';

export const ContainerContext = createContext<DependencyContainer | null>(null);
export const ContainerProvider = ContainerContext.Provider;
export const useContainer = (): DependencyContainer | null => useContext(ContainerContext);
