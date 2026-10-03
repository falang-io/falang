import * as path from 'node:path';

// Lets a project's queue move on once the previous op settles (success or failure); the real
// outcome is the promise `withProjectLock` returns to its caller.
// oxlint-disable-next-line no-empty-function
const noop = (): void => {};

const tails = new Map<string, Promise<unknown>>();

/**
 * Runs `op` after every previously queued operation on the same project has settled (FIFO, one at a
 * time per `path.resolve(projectDir)`). A document's path on disk depends on its name/folder, so any
 * operation that reads the manifest and then writes (or resolves a file path from it) must not
 * interleave with another one — e.g. an autosave's `writeDocument` resolving the old path while a
 * `renameDocument` moves the file would leave a stray duplicate at the old path. An op's failure never
 * poisons the chain; the map entry is dropped once the chain drains.
 *
 * Not re-entrant: an op running under the lock must never call another locked export (use the
 * `…Unlocked` internals). This is an in-process lock only — another process editing the same project
 * folder (e.g. `@falang/desktop-mcp`, a separate stdio process) is not covered.
 */
export const withProjectLock = <T>(projectDir: string, op: () => Promise<T>): Promise<T> => {
  const key = path.resolve(projectDir);
  const previous = tails.get(key) ?? Promise.resolve();
  const started = previous.then(op, op);
  const tail = started.then(noop, noop);
  tails.set(key, tail);
  const cleanup = (): void => {
    if (tails.get(key) === tail) tails.delete(key);
  };
  tail.then(cleanup, cleanup);
  return started;
};
