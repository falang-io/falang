import { DocumentLockedError } from '../api-document-lock-error.js';

export interface IAgentLockTrackerDeps {
  /** This tab/session's own lock owner id — see `WorkflowStore.agentLockOwner`. */
  readonly owner: string;
  readonly lock: (documentId: string, owner: string) => Promise<unknown>;
  readonly unlock: (documentId: string, owner: string) => Promise<unknown>;
  /** A lock request 409'd (held by a *different* owner) — see `DocumentLocksStore.markLockedFromConflict`. */
  readonly onConflict: (documentId: string, lockExpiresAt: string) => void;
}

/**
 * Bookkeeping for the documents this tab's in-app editing agent holds a lock on for the duration of
 * one run (ADR 0034 §2.4, "Лок на время, пока агент держит чужую схему открытой") — kept as its own
 * class so it's testable without spinning up a real `WorkflowStore` (network calls, IndexedDB, …).
 * `acquire` is idempotent per run (only the first touch of a document sends a request); `releaseAll`
 * drains everything acquired since the last call, for `AgentModule`'s `onRunFinished` hook.
 */
export class AgentLockTracker {
  private readonly deps: IAgentLockTrackerDeps;
  private readonly lockedDocumentIds = new Set<string>();

  constructor(deps: IAgentLockTrackerDeps) {
    this.deps = deps;
  }

  /** This tab's own lock owner id for `documentId` if it currently holds a lock there, `null` otherwise — for `IProjectSyncLockHooks.getOwnLockOwner`. */
  ownerFor(documentId: string): string | null {
    return this.lockedDocumentIds.has(documentId) ? this.deps.owner : null;
  }

  acquire(documentId: string): void {
    if (this.lockedDocumentIds.has(documentId)) return;
    this.lockedDocumentIds.add(documentId);
    this.deps.lock(documentId, this.deps.owner).catch((error: unknown) => {
      if (error instanceof DocumentLockedError) this.deps.onConflict(documentId, error.lockExpiresAt);
    });
  }

  releaseAll(): void {
    const documentIds = [...this.lockedDocumentIds];
    this.lockedDocumentIds.clear();
    for (const documentId of documentIds) {
      // Best-effort: the lock's own TTL reclaims it even if this fails.
      // oxlint-disable-next-line no-empty-function
      this.deps.unlock(documentId, this.deps.owner).catch(() => {});
    }
  }
}
