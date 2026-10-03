import type { IDebugQueryState } from '@falang/workflow-compiler';

/** Everything `DebugService` needs from `@temporalio/client` — the real implementations wrap it in `build.module.ts`, the same posture `WorkflowRunService`/`getWorkflowPosition` already use. */

export interface IDebugSignalWithStartParams {
  readonly taskQueue: string;
  readonly workflowId: string;
  readonly functionName: string;
  readonly args: readonly unknown[];
  /** Trace indexes (resolved from `{documentId, nodeId}` breakpoints via the dev build's `IDebugMap`), see `debug-map-resolver.ts`. */
  readonly breakpoints: readonly number[];
  readonly pauseOnEntry: boolean;
  /** Picks the project's own Temporal namespace/client — see `ITemporalTenancy` (ADR 0057 (private)). */
  readonly projectId: string;
}

/** `client.workflow.signalWithStart` with the `falang-debug-configure` signal — so the first statement can't slip past before breakpoints arrive, see ADR 0021 (private) §5. */
export type TDebugSignalWithStart = (params: IDebugSignalWithStartParams) => Promise<{ readonly runId: string }>;

export interface ISendDebugSignalParams {
  readonly workflowId: string;
  readonly signalName: string;
  readonly signalArgs: readonly unknown[];
  /** Picks the project's own Temporal namespace/client — see `ITemporalTenancy` (ADR 0057 (private)). */
  readonly projectId: string;
}

/** A plain signal to an already-started debug session — shared by `setBreakpoints` (`falang-debug-configure`) and `resume` (`falang-debug-resume`). */
export type TSendDebugSignal = (params: ISendDebugSignalParams) => Promise<void>;

export interface IDebugWorkflowDescriptor {
  /** Temporal's own status name — `'RUNNING'`, `'COMPLETED'`, `'FAILED'`, `'TERMINATED'`, … */
  readonly status: string;
  readonly taskQueue: string;
  /** Only set when `status === 'FAILED'`. */
  readonly failureMessage?: string;
}

export interface IDescribeDebugWorkflowParams {
  readonly workflowId: string;
  /** Picks the project's own Temporal namespace/client — see `ITemporalTenancy` (ADR 0057 (private)). */
  readonly projectId: string;
}

/** `handle.describe()`, plus (only for a `'FAILED'` execution) its failure message — `null` if Temporal has no such execution. Used both to resolve the session's terminal status and, by every route past `start`, to check the workflow actually belongs to this project's dev task queue before acting on it (never trusting a client-supplied workflowId on its own). */
export type TDescribeDebugWorkflow = (params: IDescribeDebugWorkflowParams) => Promise<IDebugWorkflowDescriptor | null>;

export interface IQueryDebugStateParams {
  readonly workflowId: string;
  /** Picks the project's own Temporal namespace/client — see `ITemporalTenancy` (ADR 0057 (private)). */
  readonly projectId: string;
}

/** The live `falang-debug-state` query, bounded by a short deadline — `'unavailable'` if it couldn't be served in time (typically the runner pod is idle-scaled-down). Only called while `status === 'RUNNING'`. */
export type TQueryDebugState = (params: IQueryDebugStateParams) => Promise<IDebugQueryState | 'unavailable'>;

export interface ITerminateDebugWorkflowParams {
  readonly workflowId: string;
  /** Picks the project's own Temporal namespace/client — see `ITemporalTenancy` (ADR 0057 (private)). */
  readonly projectId: string;
}

/** `handle.terminate()` — the debug session's "Stop". */
export type TTerminateDebugWorkflow = (params: ITerminateDebugWorkflowParams) => Promise<void>;
