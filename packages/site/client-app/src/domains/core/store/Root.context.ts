import { createContext, useContext } from "react";
import { RootStore } from "./Root.store";

// Use React context to make your store available in your application
export const RootContext = createContext({} as RootStore);
export const RootProvider = RootContext.Provider;
export const useRoot = () => useContext(RootContext);
