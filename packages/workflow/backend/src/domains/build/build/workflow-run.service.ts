import { randomUUID } from 'node:crypto';
import type { IWorkflowPosition, TGetWorkflowPosition } from './workflow-position.js';

export type TWorkflowRunOutcome =
  | { readonly status: 'completed'; readonly result: unknown }
  | { readonly status: 'failed'; readonly message: string };

export interface IStartAndAwaitWorkflowParams {
  readonly taskQueue: string;
  readonly workflowId: string;
  readonly functionName: string;
  readonly args: readonly unknown[];
  /** Picks the project's own Temporal namespace/client — see `ITemporalTenancy` (ADR 0050 (private)). */
  readonly projectId: string;
}

/** Starts a workflow execution and resolves once it completes or fails — see the real implementation in `build.module.ts` (wraps `@temporalio/client`). */
export type TStartAndAwaitWorkflow = (params: IStartAndAwaitWorkflowParams) => Promise<TWorkflowRunOutcome>;

export interface ITerminateRunningExecutionsParams {
  readonly taskQueue: string;
  /** Picks the project's own Temporal namespace/client — see `ITemporalTenancy` (ADR 0050 (private)). */
  readonly projectId: string;
}

/** Clears out every open execution on `taskQueue` (cancel first, then terminate whatever doesn't finish in time — see ADR 0040 (private) §4/§5), returning how many were found — see the real implementation in `build.module.ts` (wraps `@temporalio/client`). */
export type TTerminateRunningExecutions = (params: ITerminateRunningExecutionsParams) => Promise<number>;

export interface IStartWorkflowParams {
  readonly taskQueue: string;
  readonly workflowId: string;
  readonly functionName: string;
  readonly args: readonly unknown[];
  /** Picks the project's own Temporal namespace/client — see `ITemporalTenancy` (ADR 0050 (private)). */
  readonly projectId: string;
}

/** Starts a workflow execution and returns as soon as Temporal has accepted it — the live-tracked counterpart of `TStartAndAwaitWorkflow`, see the real implementation in `build.module.ts`. */
export type TStartWorkflow = (params: IStartWorkflowParams) => Promise<{ readonly runId: string }>;

export interface IWorkflowRunServiceParams {
  readonly startAndAwaitWorkflow: TStartAndAwaitWorkflow;
  readonly terminateRunningExecutions: TTerminateRunningExecutions;
  readonly startWorkflow: TStartWorkflow;
  readonly getWorkflowPosition: TGetWorkflowPosition;
  /** How long a manual run waits for completion before reporting `'timeout'`; defaults to 30s. */
  readonly timeoutMs?: number;
}

export interface IRunFunctionResult {
  readonly workflowId: string;
  readonly taskQueue: string;
  readonly status: 'completed' | 'failed' | 'timeout';
  readonly result?: unknown;
  readonly message?: string;
}

/** A started-but-not-awaited execution — the client follows it via `getPosition` (see ADR 0022 (private)). */
export interface IStartedRun {
  readonly workflowId: string;
  readonly runId: string;
  readonly taskQueue: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Starts a manual, ad-hoc execution of one compiled function (see ADR 0001 (private) — a
 * `function` document compiles to a plain top-level workflow entry point) and waits for it to
 * finish, for the editor's "Run" button. Unlike `publish`/`activate`, this never manages a
 * long-lived process — it just starts one execution and reports its outcome.
 *
 * A manual run always waits up to `timeoutMs` for a result: every node kind that exists today
 * (see the ADR's node table) completes quickly, so this is safe for now; a wait/human-approval
 * node kind would need this to become async-with-polling instead — not needed yet.
 */
export class WorkflowRunService {
  private readonly startAndAwaitWorkflow: TStartAndAwaitWorkflow;
  private readonly terminateRunningExecutions: TTerminateRunningExecutions;
  private readonly startWorkflow: TStartWorkflow;
  private readonly getWorkflowPosition: TGetWorkflowPosition;
  private readonly timeoutMs: number;

  constructor(params: IWorkflowRunServiceParams) {
    this.startAndAwaitWorkflow = params.startAndAwaitWorkflow;
    this.terminateRunningExecutions = params.terminateRunningExecutions;
    this.startWorkflow = params.startWorkflow;
    this.getWorkflowPosition = params.getWorkflowPosition;
    this.timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Starts an execution and returns immediately with its ids — the editor's toolbar "Run" button
   * (ADR 0022 (private)), which then follows the execution through `getPosition` instead of
   * blocking on a result like `run()` does. Same `manual-<function>-<uuid>` workflowId convention.
   */
  async start(projectId: string, taskQueue: string, functionName: string, args: readonly unknown[]): Promise<IStartedRun> {
    const workflowId = `manual-${functionName}-${randomUUID()}`;
    const { runId } = await this.startWorkflow({ projectId, taskQueue, workflowId, functionName, args });
    return { workflowId, runId, taskQueue };
  }

  /** Where an execution currently is in its diagram — see `IWorkflowPosition`. `null` if Temporal has no such execution. */
  getPosition(projectId: string, workflowId: string, runId: string): Promise<IWorkflowPosition | null> {
    return this.getWorkflowPosition({ projectId, workflowId, runId });
  }

    /**
   * Clears out every open execution on `taskQueue` — see `BuildService.build()`: dev is unversioned
   * (kill-and-replace), so an open execution's history would otherwise desync from the new code on
   * its next workflow task. Returns how many were found (and dealt with, cancel or terminate alike).
   *
   * Since ADR 0040 (private) §4/§5: this **cancels** each one first, not
   * a hard terminate — a `human-task` node's open-task-closing cleanup (a `try/finally` +
   * `CancellationScope.nonCancellable` around its wait, `question-emitters.ts`) only runs on a
   * genuine Temporal cancellation, never on `terminate()`, which tears an execution down with no
   * chance for its own workflow code to run anything. The real closure this delegates to
   * (`createTerminateRunningExecutions` in `build.module.ts`, over `terminateRunningExecutionsWith`)
   * gives each cancelled execution a bounded grace window to actually finish before falling back to
   * `terminate()` for whatever's still running after that.
   */
  terminateRunningOn(projectId: string, taskQueue: string): Promise<number> {
    return this.terminateRunningExecutions({ projectId, taskQueue });
  }

  async run(projectId: string, taskQueue: string, functionName: string, args: readonly unknown[]): Promise<IRunFunctionResult> {
    const workflowId = `manual-${functionName}-${randomUUID()}`;

    const timeout = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), this.timeoutMs);
    });
    const outcome = await Promise.race([
      this.startAndAwaitWorkflow({ projectId, taskQueue, workflowId, functionName, args }),
      timeout,
    ]);

    if (outcome === 'timeout') {
      return { workflowId, taskQueue, status: 'timeout' };
    }
    if (outcome.status === 'failed') {
      return { workflowId, taskQueue, status: 'failed', message: outcome.message };
    }
    return { workflowId, taskQueue, status: 'completed', result: outcome.result };
  }
}
