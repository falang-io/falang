import { computed, makeObservable, observable, runInAction } from 'mobx';
import { workflowApi, type IApiTask, type TTaskStatus } from './api-client.js';

const POLL_MS = 30_000;

const errorMessage = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

export interface ITaskFilters {
  readonly status?: TTaskStatus;
  readonly projectId?: string;
}

/**
 * Human-in-the-loop tasks (ADR 0040 (private)) — backs the standalone
 * Tasks page (`GET /tasks`, owner-scoped across every project) and, filtered by `projectId`, the
 * project workspace's own "Tasks" view. Unlike `FilesStore` (never polls — see its own doc comment),
 * a task can be resolved from outside this tab entirely (a public `/t/<token>` link, or another of
 * this user's own tabs) so `start()` opts into 30s polling of the current filters, same
 * setTimeout-recursion shape as `ScheduleStatusStore`/`DocumentLocksStore` — a page/component calls it
 * from a `useEffect` and `stop()`s on cleanup, rather than this store deciding on its own when it's
 * "active".
 */
export class TasksStore {
  @observable tasks: IApiTask[] = [];
  @observable loading = false;
  @observable error: string | null = null;

  private filters: ITaskFilters = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private disposed = false;

  constructor() {
    makeObservable(this);
  }

  /** How many of the currently-loaded tasks are `'open'` — the toolbar/project-list Tasks button's `Badge` count. */
  @computed get openCount(): number {
    return this.tasks.filter((task) => task.status === 'open').length;
  }

  async load(filters: ITaskFilters = {}): Promise<void> {
    this.filters = filters;
    runInAction(() => {
      this.loading = true;
      this.error = null;
    });
    try {
      const tasks = await workflowApi.listTasks(filters);
      runInAction(() => {
        this.tasks = [...tasks];
      });
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to load tasks');
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async resolve(id: string, answer: string, data?: string | number | boolean): Promise<IApiTask> {
    try {
      const updated = await workflowApi.resolveTask(id, { answer, data });
      runInAction(() => {
        this.tasks = this.tasks.map((task) => (task.id === updated.id ? updated : task));
      });
      return updated;
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, 'Failed to resolve task');
      });
      throw error;
    }
  }

  /** Begins polling the last (or given) filters every 30s — a no-op if already active or disposed. */
  start(filters?: ITaskFilters): void {
    if (this.disposed || this.active) return;
    if (filters) this.filters = filters;
    this.active = true;
    this.scheduleNext();
  }

  stop(): void {
    this.active = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.poll(), POLL_MS);
  }

  private async poll(): Promise<void> {
    if (this.disposed || !this.active) return;
    await this.load(this.filters);
    if (this.disposed || !this.active) return;
    this.scheduleNext();
  }
}
