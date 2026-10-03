import { eventTracker } from './analytics/event-tracker.js';
import { action, computed, makeObservable, observable, runInAction } from 'mobx';
import type { IExecutionLocation, IExecutionPositionSource } from '@falang/scheme';
import {
  workflowApi,
  type IApiWorkflowPosition,
  type IApiWorkflowRunDetail,
  type IApiWorkflowRunSummary,
} from './api-client.js';

/** The execution the editor is currently following — enough to poll it and to label the panel before the first poll answers. */
export interface IWatchedRun {
  readonly workflowId: string;
  readonly runId: string;
  readonly workflowName: string;
  readonly env: 'dev' | 'prod';
  /** `'dev'`, or the published version number — see `IApiWorkflowRunSummary.version`. */
  readonly version: string;
}

export interface ILiveRunStoreHooks {
  /** Makes sure a dev build exists that reflects the current documents (building if needed); resolves `false` if that failed. */
  readonly ensureDevBuilt: () => Promise<boolean>;
}

const POSITION_POLL_MS = 1000;
const HISTORY_POLL_MS = 2000;
/** Temporal statuses that mean "still open" — everything else is terminal, so polling stops after one last fetch. */
const OPEN_STATUSES = new Set(['RUNNING']);

/**
 * Follows one execution of the open project — the toolbar's "Run" button and the runs drawer both
 * end up here (ADR 0022 (private)). Polls `GET .../position` about once a second (that's the
 * `ExecutionPositionModule`'s source: `location` is the innermost frame) and the run's Temporal
 * history every couple of seconds for the right-hand panel, until the execution closes. No push
 * channel exists in the backend today; one person watching one run is well within what polling
 * affords. Owned by `WorkflowStore`, one per open project.
 */
export class LiveRunStore implements IExecutionPositionSource {
  @observable watchedRun: IWatchedRun | null = null;
  @observable position: IApiWorkflowPosition | null = null;
  @observable detail: IApiWorkflowRunDetail | null = null;
  @observable isStarting = false;
  /** Failure of the last start attempt (build failed, backend unreachable, …) — build *compile* errors go through `ProjectSync.buildErrors` instead. */
  @observable startError: string | null = null;
  @observable pollError: string | null = null;

  private readonly projectId: string;
  private readonly hooks: ILiveRunStoreHooks;
  private positionTimer: ReturnType<typeof setTimeout> | null = null;
  private historyTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by every `watch`/`unwatch`, so a poll answer that lands after the watched run changed is dropped. */
  private generation = 0;

  constructor(projectId: string, hooks: ILiveRunStoreHooks) {
    this.projectId = projectId;
    this.hooks = hooks;
    makeObservable(this);
  }

  /** The innermost frame with a node — what the canvas highlights. `null` before the first statement, after the run closed without a failure position, or while nothing is watched. */
  @computed get location(): IExecutionLocation | null {
    const stack = this.position?.stack;
    if (!stack) return null;
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const frame = stack[index];
      if (frame.nodeId !== null) return { documentId: frame.documentId, nodeId: frame.nodeId };
    }
    return null;
  }

  @computed get isOpen(): boolean {
    return this.position !== null && OPEN_STATUSES.has(this.position.status);
  }

  /** The "Run" button: build if needed, terminate whatever else the dev stand is running, start, follow. */
  async startFunction(functionName: string, args: readonly unknown[]): Promise<boolean> {
    runInAction(() => {
      this.isStarting = true;
      this.startError = null;
    });
    try {
      if (!(await this.hooks.ensureDevBuilt())) return false;
      const started = await workflowApi.startDevRun(this.projectId, { functionName, args: [...args] });
      eventTracker.track('run_started');
      this.watch({
        workflowId: started.workflowId,
        runId: started.runId,
        workflowName: functionName,
        env: 'dev',
        version: 'dev',
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.startError = error instanceof Error ? error.message : 'Failed to start the run';
      });
      return false;
    } finally {
      runInAction(() => {
        this.isStarting = false;
      });
    }
  }

  /** Follows an execution picked from the runs drawer (dev or prod, open or already closed). */
  watchSummary(run: IApiWorkflowRunSummary): void {
    this.watch({
      workflowId: run.workflowId,
      runId: run.runId,
      workflowName: run.workflowName,
      env: run.env,
      version: run.version,
    });
  }

  /** Force-terminates the watched execution, then re-reads it so the panel shows the closed status. Throws on API failure (the caller shows it). */
  async terminateWatched(): Promise<void> {
    const run = this.watchedRun;
    if (!run) return;
    await workflowApi.terminateWorkflowRun(this.projectId, run.workflowId, run.runId);
    if (this.watchedRun === run) this.watch(run);
  }

  @action watch(run: IWatchedRun): void {
    this.clearTimers();
    this.generation += 1;
    this.watchedRun = run;
    this.position = null;
    this.detail = null;
    this.pollError = null;
    this.pollPosition(this.generation);
    this.pollHistory(this.generation);
  }

  @action unwatch(): void {
    this.clearTimers();
    this.generation += 1;
    this.watchedRun = null;
    this.position = null;
    this.detail = null;
    this.pollError = null;
  }

  dispose(): void {
    this.unwatch();
  }

  private clearTimers(): void {
    if (this.positionTimer) clearTimeout(this.positionTimer);
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.positionTimer = null;
    this.historyTimer = null;
  }

  private async pollPosition(generation: number): Promise<void> {
    const run = this.watchedRun;
    if (!run || generation !== this.generation) return;
    let keepPolling = true;
    try {
      const position = await workflowApi.getRunPosition(this.projectId, run.workflowId, run.runId);
      if (generation !== this.generation) return;
      runInAction(() => {
        this.position = position;
        this.pollError = null;
      });
      keepPolling = OPEN_STATUSES.has(position.status);
    } catch (error) {
      if (generation !== this.generation) return;
      runInAction(() => {
        this.pollError = error instanceof Error ? error.message : 'Failed to read the run position';
      });
    }
    if (keepPolling) {
      this.positionTimer = setTimeout(() => this.pollPosition(generation), POSITION_POLL_MS);
    }
  }

  private async pollHistory(generation: number): Promise<void> {
    const run = this.watchedRun;
    if (!run || generation !== this.generation) return;
    try {
      const detail = await workflowApi.getWorkflowRunDetail(run.workflowId, run.runId);
      if (generation !== this.generation) return;
      runInAction(() => {
        this.detail = detail;
      });
      // One more fetch after the position poll saw the run close, so the final events are shown.
      if (!OPEN_STATUSES.has(detail.status)) return;
    } catch {
      // Best-effort — `pollPosition` is the one that surfaces errors; history simply retries.
    }
    this.historyTimer = setTimeout(() => this.pollHistory(generation), HISTORY_POLL_MS);
  }
}
