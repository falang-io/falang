import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import {
  diffSnapshots,
  isSnapshotDirty,
  type ICommitInfo,
  type IProjectDiff,
  type IProjectSnapshot,
  type IVersionStore,
} from '@falang/versioning';

export type TCommitRef = ICommitInfo | 'working-copy';

export interface IVersionComparison {
  readonly left: TCommitRef | null;
  readonly right: TCommitRef | null;
  readonly diff: IProjectDiff;
  readonly leftSnapshot: IProjectSnapshot;
  readonly rightSnapshot: IProjectSnapshot;
}

export interface IVersionHistoryStoreParams {
  readonly store: IVersionStore;
  /** Called after a successful `restore()` — the host reloads the working copy into the editor (ADR 0025 (private), "When commits happen"). */
  readonly onRestored?: () => void;
}

/**
 * Drives `VersionHistoryPanel`/`VersionDiffView` (ADR 0025 (private)) over one
 * `IVersionStore` — host-neutral, no HTTP/IPC knowledge of its own. `commits` is always the full,
 * newest-first list from the store; `visibleCommits` applies the "hide auto-saved versions" filter
 * for the panel, always keeping the latest commit visible (named or not) so HEAD is never hidden.
 */
export class VersionHistoryStore {
  @observable.ref commits: ICommitInfo[] = [];
  @observable loading = false;
  @observable error: string | null = null;
  @observable showAuto = false;
  @observable.ref workingCopy: IProjectSnapshot | null = null;
  @observable.ref headSnapshot: IProjectSnapshot | null = null;
  /** `IVersionStore.hasExtraChanges` result — changes outside the document snapshot (e.g. driver files). */
  @observable extraChanges = false;
  @observable.ref comparison: IVersionComparison | null = null;

  private readonly store: IVersionStore;
  private readonly onRestored?: () => void;

  constructor(params: IVersionHistoryStoreParams) {
    this.store = params.store;
    this.onRestored = params.onRestored;
    makeObservable(this);
  }

  @computed get head(): ICommitInfo | null {
    return this.commits[0] ?? null;
  }

  /** Named commits plus the latest commit regardless of kind — so HEAD is never hidden behind the toggle. */
  @computed get visibleCommits(): ICommitInfo[] {
    if (this.showAuto) return this.commits;
    const head = this.head;
    return this.commits.filter((commit) => commit.kind === 'named' || commit.id === head?.id);
  }

  /** Whether the working copy differs from `HEAD` — `false` while nothing has loaded yet, or once there's no commit and no document. */
  @computed get dirty(): boolean {
    if (!this.workingCopy) return false;
    return this.extraChanges || isSnapshotDirty(this.headSnapshot, this.workingCopy);
  }

  @action setShowAuto(value: boolean): void {
    this.showAuto = value;
  }

  /** Loads the commit list, the working copy, and `HEAD`'s snapshot; refreshes the default (`HEAD` vs. working copy) comparison when a `HEAD` exists — see ADR 0025 (private), "Diff default". */
  async refresh(): Promise<void> {
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const [commits, workingCopy, extraChanges] = await Promise.all([
        this.store.listCommits(),
        this.store.getWorkingCopy(),
        this.store.hasExtraChanges?.() ?? false,
      ]);
      const headSnapshot = commits.length > 0 ? await this.store.getSnapshot(commits[0].id) : null;
      runInAction(() => {
        this.commits = commits;
        this.workingCopy = workingCopy;
        this.headSnapshot = headSnapshot;
        this.extraChanges = extraChanges;
      });
      if (commits.length > 0) {
        await this.compareHeadWithWorkingCopy();
      } else {
        runInAction(() => {
          this.comparison = null;
        });
      }
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Failed to load version history';
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /**
   * "Name the current version" (ADR 0025 (private), "Decisions (2026-09-17)" #2): commits the
   * working copy and names that new commit, or — when nothing changed since `HEAD` — names `HEAD`
   * itself instead. Returns the named commit, or `null` when there was nothing to name (no commit at
   * all yet and the working copy is empty).
   */
  commitNamed(message: string): Promise<ICommitInfo | null> {
    return this.runMutation(async () => {
      const created = await this.store.commit({ kind: 'named', message });
      const named = created ?? (this.head ? await this.store.nameCommit(this.head.id, message) : null);
      await this.refresh();
      return named;
    });
  }

  nameCommit(commitId: string, message: string): Promise<ICommitInfo> {
    return this.runMutation(async () => {
      const result = await this.store.nameCommit(commitId, message);
      await this.refresh();
      return result;
    });
  }

  /** Fetches both sides' snapshots and diffs them, setting `comparison`. */
  async compare(left: TCommitRef, right: TCommitRef): Promise<void> {
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const [leftSnapshot, rightSnapshot] = await Promise.all([this.snapshotForRef(left), this.snapshotForRef(right)]);
      const diff = diffSnapshots(leftSnapshot, rightSnapshot);
      runInAction(() => {
        this.comparison = { left, right, diff, leftSnapshot, rightSnapshot };
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Failed to load the comparison';
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /** The default comparison (ADR 0025 (private), "Diff default"): `HEAD` vs. the working copy, VS Code style. No-op (clears `comparison`) when there's no `HEAD` yet. */
  async compareHeadWithWorkingCopy(): Promise<void> {
    const head = this.head;
    if (!head) {
      runInAction(() => {
        this.comparison = null;
      });
      return;
    }
    await this.compare(head, 'working-copy');
  }

  @action closeComparison(): void {
    this.comparison = null;
  }

  restore(commitId: string): Promise<ICommitInfo> {
    return this.runMutation(async () => {
      const result = await this.store.restore(commitId);
      await this.refresh();
      this.onRestored?.();
      return result;
    });
  }

  private snapshotForRef(ref: TCommitRef): Promise<IProjectSnapshot> {
    return ref === 'working-copy' ? this.store.getWorkingCopy() : this.store.getSnapshot(ref.id);
  }

  /** Shared by every mutating action (`commitNamed`/`nameCommit`/`restore`): clears `error` up front, sets it (and rethrows, so a caller that does want to react to the rejection still can) on failure — the panel's own `<Alert>` picks up `error` either way. */
  private async runMutation<T>(mutate: () => Promise<T>): Promise<T> {
    runInAction(() => {
      this.error = null;
    });
    try {
      return await mutate();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Action failed';
      });
      throw error;
    }
  }
}
