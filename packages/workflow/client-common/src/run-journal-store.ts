import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import { workflowApi } from './api-client.js';
import type { IApiRunJournalEntry } from './api-types.js';
import { lastJournalEntryId, mergeJournalEntries } from './run-journal-model.js';

export type TRunJournalSource =
  | { readonly kind: 'run'; readonly projectId: string; readonly workflowId: string; readonly runId: string }
  | { readonly kind: 'workflow'; readonly projectId: string; readonly workflowId: string };

const PAGE_LIMIT = 200;
/** Safety net against a misbehaving server answering `hasMore: true` forever. */
const MAX_PAGES_PER_FETCH = 50;

/**
 * Append-only list of one run's (or one workflow id's) journal entries, read incrementally with the `after`
 * cursor (ADR 0059 (private)). The drawer pages it with `loadMore`, the live panel's `LiveRunStore` calls
 * `fetchNew` on its timer. Entries are deduplicated by id; a fetch that fails sets `error` and keeps what is shown.
 */
export class RunJournalStore {
  @observable entries: IApiRunJournalEntry[] = [];
  @observable hasMore = false;
  @observable loading = false;
  @observable error: string | null = null;

  private requestSeq = 0;
  private disposed = false;

  readonly source: TRunJournalSource;

  constructor(source: TRunJournalSource) {
    this.source = source;
    makeObservable(this);
  }

  @computed get isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /** One page after the last seen entry (the "Load more" button, and the first load). */
  async loadMore(): Promise<void> {
    await this.fetchPage();
  }

  /** Everything new since the last call, page after page — the poll. Resolves to how many entries were added. */
  async fetchNew(): Promise<number> {
    const before = this.entries.length;
    await this.fetchPages(MAX_PAGES_PER_FETCH);
    return this.entries.length - before;
  }

  dispose(): void {
    this.disposed = true;
  }

  @action reset(): void {
    this.requestSeq += 1;
    this.entries = [];
    this.hasMore = false;
    this.error = null;
    this.loading = false;
  }

  /** Sequential on purpose: each page's cursor is the previous page's last id. */
  private async fetchPages(left: number): Promise<void> {
    if (left <= 0) return;
    const ok = await this.fetchPage();
    if (ok && this.hasMore) await this.fetchPages(left - 1);
  }

  private async fetchPage(): Promise<boolean> {
    if (this.disposed) return false;
    this.requestSeq += 1;
    const seq = this.requestSeq;
    const after = lastJournalEntryId(this.entries);
    const params = after === null ? { limit: PAGE_LIMIT } : { after, limit: PAGE_LIMIT };
    runInAction(() => {
      this.loading = true;
    });
    try {
      const page =
        this.source.kind === 'run'
          ? await workflowApi.getRunJournal(this.source.projectId, this.source.workflowId, this.source.runId, params)
          : await workflowApi.getWorkflowJournal(this.source.projectId, this.source.workflowId, params);
      if (this.disposed || seq !== this.requestSeq) return false;
      runInAction(() => {
        this.entries = mergeJournalEntries(this.entries, page.entries);
        this.hasMore = page.hasMore;
        this.error = null;
        this.loading = false;
      });
      return true;
    } catch (error) {
      if (this.disposed || seq !== this.requestSeq) return false;
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Failed to load the journal';
        this.loading = false;
      });
      return false;
    }
  }
}
