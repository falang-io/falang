import { action, makeObservable, observable, runInAction } from 'mobx';
import { workflowApi, type IApiDocumentLock } from './api-client.js';

const POLL_MS = 5000;

export interface IDocumentLockConflict {
  readonly documentId: string;
  readonly lockExpiresAt: string;
  /** `Date.now()` at the moment this conflict was recorded — distinguishes two conflicts on the same document from a `reaction` watching this field, since the object identity alone wouldn't. */
  readonly at: number;
}

/**
 * Polls `GET /projects/:id/documents/locks` every 5s while a project workspace is open — see
 * ADR 0029 (private)'s "Document locks" decision. Owned by
 * `WorkflowStore` (one per open project, created/disposed in its constructor/`dispose()` — not a
 * separate `useEffect`-owned React resource, which sidesteps the `useMemo`/dispose StrictMode
 * mismatch documented for `LiveRunStore`/`DebugSessionStore` in this same package). Mirrors
 * `LiveRunStore`'s own setTimeout-recursion polling shape (no generation guard needed here — there
 * is only ever one thing being polled, the whole project's locks, never swapped mid-flight the way
 * `LiveRunStore`'s watched run can be).
 */
export class DocumentLocksStore {
  /** `documentId -> ISO expiry` for every actively locked document, as of the last successful poll. */
  readonly lockedUntilByDocumentId = observable.map<string, string>();
  @observable pollError: string | null = null;
  /** Bumped by `markLockedFromConflict` — `ProjectWorkspace` reacts to this to show a one-off antd message ("show an antd message and mark the document locked until the next poll"). `null` until the first conflict. */
  @observable lastConflict: IDocumentLockConflict | null = null;

  private readonly projectId: string;
  /** Notified after every successful poll and after `markLockedFromConflict` — `WorkflowStore` wires this to `ProjectSync.onLocksChanged`, which resumes any save suspended while its document was locked. */
  private readonly onChange?: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(projectId: string, onChange?: () => void) {
    this.projectId = projectId;
    this.onChange = onChange;
    makeObservable(this);
    this.poll();
  }

  isLocked(documentId: string): boolean {
    return this.lockedUntilByDocumentId.has(documentId);
  }

  /** `undefined` if `documentId` isn't currently locked. */
  lockExpiresAt(documentId: string): string | undefined {
    return this.lockedUntilByDocumentId.get(documentId);
  }

  /**
   * Reacts to a 409 the client itself just hit (a race the 5s poll hadn't caught up with yet) —
   * marks the document locked right away instead of waiting for the next poll.
   */
  @action markLockedFromConflict(documentId: string, lockExpiresAt: string): void {
    this.lockedUntilByDocumentId.set(documentId, lockExpiresAt);
    this.lastConflict = { documentId, lockExpiresAt, at: Date.now() };
    this.onChange?.();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    try {
      const locks = await workflowApi.getDocumentLocks(this.projectId);
      if (this.disposed) return;
      runInAction(() => {
        this.lockedUntilByDocumentId.replace(locks.map((lock: IApiDocumentLock) => [lock.documentId, lock.expiresAt]));
        this.pollError = null;
      });
      this.onChange?.();
    } catch (error) {
      if (this.disposed) return;
      runInAction(() => {
        this.pollError = error instanceof Error ? error.message : 'Failed to read document locks';
      });
    }
    if (this.disposed) return;
    this.timer = setTimeout(() => this.poll(), POLL_MS);
  }
}
