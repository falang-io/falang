import { promises as fs } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

/** How long to wait for `shell.openPath` before treating the folder as opened. */
export const OPEN_FOLDER_TIMEOUT_MS = 2000;

export interface IOpenFolderDeps {
  /** `shell.openPath`: resolves to an error message, or `''` on success. */
  openPath: (dir: string) => Promise<string>;
  /** Defaults to `fs.stat`. */
  stat?: (dir: string) => Promise<{ isDirectory(): boolean }>;
  timeoutMs?: number;
}

/**
 * Opens `dir` in the system file manager; resolves to an error message or `null`. On Linux (Electron 43, GNOME)
 * `shell.openPath` opens the folder but its promise never settles, so a missing answer after `timeoutMs` counts as
 * success — the only errors we can still report reliably are the ones checked up front (no such directory).
 */
export const openFolder = async (dir: string, deps: IOpenFolderDeps): Promise<string | null> => {
  const stat = deps.stat ?? ((target: string) => fs.stat(target));
  try {
    const info = await stat(dir);
    if (!info.isDirectory()) return `Not a directory: ${dir}`;
  } catch {
    return `Folder not found: ${dir}`;
  }
  const abort = new AbortController();
  // Aborted once the race is decided; the rejection that causes is swallowed here.
  const timeout = delay(deps.timeoutMs ?? OPEN_FOLDER_TIMEOUT_MS, '', { signal: abort.signal }).catch(() => '');
  try {
    const error = await Promise.race([deps.openPath(dir), timeout]);
    return error === '' ? null : error;
  } finally {
    abort.abort();
  }
};
