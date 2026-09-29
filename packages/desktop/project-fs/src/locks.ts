import { readSidecar, writeSidecar } from './sidecar.js';

/**
 * Document locks — ADR 0029 (private)'s "one source of editing at a
 * time" model: an MCP tool call auto-acquires a lock on `set_document`, never releases it itself
 * (the skill tells the agent to `unlock_document` when done), and a TTL (`DEFAULT_LOCK_TTL_MS`,
 * owned by the MCP host, not this package) guarantees a crashed agent can't lock a user out for
 * good. This package only knows the on-disk shape and pure helpers over it — acquiring/renewing/
 * releasing a lock is the MCP host's job (phase E), same as `@falang/mcp-core`'s own lock helpers
 * over the same `IDocumentLock` shape (`isLockActive`/`acquireLock`/`renewLock`/`releaseLock`) —
 * this file doesn't depend on that package (Phase B has no dependency on it) and doesn't duplicate
 * its logic beyond the one read-side filter (`getActiveLock`) the filesystem watcher/renderer need.
 */
export interface IDocumentLock {
  documentId: string;
  /** Opaque MCP session/process id — never a user-facing name. */
  owner: string;
  /** ISO 8601. */
  acquiredAt: string;
  /** ISO 8601 — `acquiredAt` + TTL, renewed by every tool call touching the document by the same owner. */
  expiresAt: string;
}

interface ILocksSidecar {
  locks: IDocumentLock[];
}

/**
 * The sidecar "name" passed to `readSidecar`/`writeSidecar` (which appends `.json` itself) —
 * same pattern as the Arduino debug session's `DEBUG_BREAKPOINTS_SIDECAR_NAME` ('.falang-debug'),
 * so the file that actually lands on disk is `.falang-locks.json`, matching the ADR's own text.
 */
export const LOCKS_SIDECAR_NAME = '.falang-locks';

const isExpired = (lock: IDocumentLock, now: number): boolean => new Date(lock.expiresAt).getTime() <= now;

/** Missing sidecar → `[]`. Expired entries are filtered out relative to `now` (default `Date.now()`) — an expired lock is treated as absent everywhere, no separate sweeper needed. */
export const readLocks = async (projectDir: string, now: number = Date.now()): Promise<IDocumentLock[]> => {
  const sidecar = await readSidecar<ILocksSidecar>(projectDir, LOCKS_SIDECAR_NAME);
  const locks = sidecar?.locks ?? [];
  return locks.filter((lock) => !isExpired(lock, now));
};

export const writeLocks = async (projectDir: string, locks: readonly IDocumentLock[]): Promise<void> => {
  await writeSidecar<ILocksSidecar>(projectDir, LOCKS_SIDECAR_NAME, { locks: [...locks] });
};

/** The active (non-expired) lock for one document, or `null` if there isn't one. Pure — takes an already-read `locks` array rather than re-reading the sidecar, so a caller holding a fresh `readLocks()` result (or the filesystem watcher's cached copy) doesn't pay for a second read. */
export const getActiveLock = (
  locks: readonly IDocumentLock[],
  documentId: string,
  now: number = Date.now(),
): IDocumentLock | null => {
  const lock = locks.find((candidate) => candidate.documentId === documentId);
  if (!lock || isExpired(lock, now)) return null;
  return lock;
};
