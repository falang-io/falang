import { makeObservable, observable, reaction, runInAction, type IReactionDisposer } from 'mobx';
import type { IScheduleStatusReader } from '@falang/workflow-scheme';
import { workflowApi, type IApiSchedule } from './api-client.js';

const POLL_MS = 30_000;

/**
 * Polls `GET /projects/:id/schedules` every 30s while the project has at least one `trigger-function`
 * bound to a `schedule-*` trigger — never otherwise, so a project with no schedules never touches this
 * endpoint at all (see ADR 0037 (private) §7). Owned by `WorkflowStore` (one per
 * open project, registered on its own container as `TOKEN_SCHEDULE_STATUS` so
 * `TriggerFunctionBodyBlockComponent` reads it without `@falang/workflow-scheme` depending on this
 * package — same shape as `DocumentLocksStore`'s own setTimeout-recursion polling).
 *
 * Start/stop is driven by a MobX `reaction` over `getHasScheduleTrigger` (typically reading
 * `WorkflowStore.documents`, an observable array) rather than an always-on timer that just skips its
 * own fetch — so adding/removing the project's last schedule trigger starts/stops polling immediately,
 * without waiting up to 30s for a wasted tick to notice.
 */
export class ScheduleStatusStore implements IScheduleStatusReader {
  private readonly byDocumentId = observable.map<string, IApiSchedule[]>();
  @observable pollError: string | null = null;

  private readonly projectId: string;
  private readonly reactionDisposer: IReactionDisposer;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private active = false;

  constructor(projectId: string, getHasScheduleTrigger: () => boolean) {
    this.projectId = projectId;
    makeObservable(this);
    this.reactionDisposer = reaction(
      getHasScheduleTrigger,
      (hasScheduleTrigger) => this.setActive(hasScheduleTrigger),
      {
        fireImmediately: true,
      },
    );
  }

  /** `IScheduleStatusReader.getStatus` — every env this document has a reconciled schedule for, as of the last successful poll. Empty (not stale/loading state) until the first poll completes. */
  getStatus(documentId: string): readonly IApiSchedule[] {
    return this.byDocumentId.get(documentId) ?? [];
  }

  dispose(): void {
    this.disposed = true;
    this.reactionDisposer();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setActive(active: boolean): void {
    this.active = active;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (active) this.poll();
  }

  private async poll(): Promise<void> {
    if (this.disposed || !this.active) return;
    try {
      const schedules = await workflowApi.listSchedules(this.projectId);
      if (this.disposed || !this.active) return;
      runInAction(() => {
        const grouped = new Map<string, IApiSchedule[]>();
        for (const schedule of schedules) {
          const forDocument = grouped.get(schedule.documentId) ?? [];
          forDocument.push(schedule);
          grouped.set(schedule.documentId, forDocument);
        }
        this.byDocumentId.replace(grouped);
        this.pollError = null;
      });
    } catch (error) {
      if (this.disposed || !this.active) return;
      runInAction(() => {
        this.pollError = error instanceof Error ? error.message : 'Failed to load schedules';
      });
    }
    if (this.disposed || !this.active) return;
    this.timer = setTimeout(() => this.poll(), POLL_MS);
  }
}
