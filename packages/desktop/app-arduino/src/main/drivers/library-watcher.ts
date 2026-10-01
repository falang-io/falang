import { promises as fs, watch, type FSWatcher } from 'node:fs';

// oxlint-disable-next-line no-empty-function
const noop = (): void => {};
const DEBOUNCE_MS = 300;
const OWN_WRITE_SUPPRESS_MS = 1000;

export interface ILibraryWatcher {
  stop: () => void;
  /** Call right after `main` itself wrote into the library, so the change does not echo back as an external one. */
  markOwnWrite: () => void;
}

/**
 * A debounced recursive `fs.watch` over the user's driver library (`userData/drivers`, ADR 0054 (private) §3) —
 * created if missing so a driver dropped in by hand is noticed even on a fresh install. `onChange` is
 * called once per burst of events.
 */
export const watchDriverLibrary = async (libraryDir: string, onChange: () => void): Promise<ILibraryWatcher> => {
  await fs.mkdir(libraryDir, { recursive: true });
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ownWriteAt = 0;
  let stopped = false;
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (stopped || Date.now() - ownWriteAt < OWN_WRITE_SUPPRESS_MS) return;
      onChange();
    }, DEBOUNCE_MS);
  };
  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(libraryDir, { recursive: true }, schedule);
    watcher.on('error', noop);
  } catch {
    watcher = null;
  }
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      watcher?.close();
    },
    markOwnWrite: () => {
      ownWriteAt = Date.now();
    },
  };
};
