import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The vendor context lives on `globalThis`, not in module scope: this package can end up loaded twice in one process
 * (a runner bundle next to the host's copy, a registry install next to a workspace one) and two `AsyncLocalStorage`
 * instances would never see each other's `run()`.
 */
const STORAGE_KEY = Symbol.for('falang.egress.vendor');

type TGlobalWithStorage = typeof globalThis & { [STORAGE_KEY]?: AsyncLocalStorage<string> };

const getStorage = (): AsyncLocalStorage<string> => {
  const holder = globalThis as TGlobalWithStorage;
  holder[STORAGE_KEY] ??= new AsyncLocalStorage<string>();
  return holder[STORAGE_KEY];
};

/** Runs `fn` (and every async continuation it starts) on behalf of `vendor`. */
export const runWithEgressVendor = <T>(vendor: string, fn: () => T): T => getStorage().run(vendor, fn);

/** The vendor whose code is currently executing, if any. */
export const getEgressVendor = (): string | undefined => getStorage().getStore();
