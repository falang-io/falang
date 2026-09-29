/**
 * Whole-document agent-held locks — see ADR 0029 (private), "Document
 * locks — one source of editing at a time". `set_document` auto-acquires; the human editor only
 * observes. Every function here is pure over a `readonly IDocumentLock[]` (+ `now`, injected rather
 * than read from `Date.now()` so hosts and tests stay deterministic) — no storage, no timers.
 */
export interface IDocumentLock {
  readonly documentId: string;
  /** Opaque MCP session/process id — never a user-facing name. */
  readonly owner: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

export const DEFAULT_LOCK_TTL_MS = 5 * 60_000;

export type TLockOutcome =
  | { readonly ok: true; readonly locks: readonly IDocumentLock[] }
  | { readonly ok: false; readonly error: string };

export const isLockActive = (lock: IDocumentLock, now: number): boolean => new Date(lock.expiresAt).getTime() > now;

/** An expired lock is treated as absent — no sweeper is required for correctness (see `pruneExpired` for housekeeping only). */
export const findActiveLock = (
  locks: readonly IDocumentLock[],
  documentId: string,
  now: number,
): IDocumentLock | null => locks.find((lock) => lock.documentId === documentId && isLockActive(lock, now)) ?? null;

const withoutDocument = (locks: readonly IDocumentLock[], documentId: string): readonly IDocumentLock[] =>
  locks.filter((lock) => lock.documentId !== documentId);

/**
 * Acquires the lock on `documentId` for `owner`. Succeeds (creating or renewing) when the document is
 * unlocked, expired, or already held by the same `owner`; fails when an unexpired lock is held by a
 * different `owner`.
 */
export const acquireLock = (
  locks: readonly IDocumentLock[],
  params: { readonly documentId: string; readonly owner: string; readonly now: number; readonly ttlMs?: number },
): TLockOutcome => {
  const { documentId, owner, now, ttlMs = DEFAULT_LOCK_TTL_MS } = params;
  const active = findActiveLock(locks, documentId, now);
  if (active && active.owner !== owner) {
    return { error: `locked by another session until ${active.expiresAt}`, ok: false };
  }
  const nextLock: IDocumentLock = {
    acquiredAt: new Date(now).toISOString(),
    documentId,
    expiresAt: new Date(now + ttlMs).toISOString(),
    owner,
  };
  return { locks: [...withoutDocument(locks, documentId), nextLock], ok: true };
};

/**
 * Extends the TTL of a lock `owner` already actively holds. Unlike `acquireLock`, this fails (rather
 * than creating a fresh lock) when there is no active lock on `documentId` at all.
 */
export const renewLock = (
  locks: readonly IDocumentLock[],
  params: { readonly documentId: string; readonly owner: string; readonly now: number; readonly ttlMs?: number },
): TLockOutcome => {
  const { documentId, owner, now, ttlMs = DEFAULT_LOCK_TTL_MS } = params;
  const active = findActiveLock(locks, documentId, now);
  if (!active) return { error: `no active lock on ${documentId} to renew`, ok: false };
  if (active.owner !== owner) return { error: `locked by another session until ${active.expiresAt}`, ok: false };
  const nextLock: IDocumentLock = {
    acquiredAt: active.acquiredAt,
    documentId,
    expiresAt: new Date(now + ttlMs).toISOString(),
    owner,
  };
  return { locks: [...withoutDocument(locks, documentId), nextLock], ok: true };
};

/**
 * Releases the lock on `documentId`. Only the current owner can release a held lock (fails
 * otherwise); releasing an already-unheld document is a no-op success. Deliberately not `now`-aware —
 * matches ADR 0029 (private)'s own `releaseLock(locks, documentId, owner)`
 * signature; an expired-but-still-present row is released the same as an active one, same as it would
 * be treated as absent by `findActiveLock` anyway.
 */
export const releaseLock = (locks: readonly IDocumentLock[], documentId: string, owner: string): TLockOutcome => {
  const existing = locks.find((lock) => lock.documentId === documentId);
  if (existing && existing.owner !== owner) {
    return { error: `locked by another session until ${existing.expiresAt}`, ok: false };
  }
  return { locks: withoutDocument(locks, documentId), ok: true };
};

/** Housekeeping only — every read path above already treats an expired lock as absent. */
export const pruneExpired = (locks: readonly IDocumentLock[], now: number): readonly IDocumentLock[] =>
  locks.filter((lock) => isLockActive(lock, now));
