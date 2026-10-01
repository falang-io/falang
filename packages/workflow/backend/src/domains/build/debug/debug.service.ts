import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { IDebugLocation, IDebugVariable, TDebugPauseReason, TDebugTerminationReason } from '@falang/debug';
import { DEBUG_CONFIGURE_SIGNAL_NAME, DEBUG_RESUME_SIGNAL_NAME } from '@falang/workflow-compiler';
import type { DocumentsService } from '../../projects/documents/documents.service.js';
import type { DevArtifactStore } from '../build/dev-artifact-store.service.js';
import { devTaskQueue } from '../build/task-queue-names.js';
import { ensureRunnerRunning, type IEnsureRunnerRunningDeps } from '../build/ensure-runner-running.js';
import type { WorkflowRunService } from '../build/workflow-run.service.js';
import { resolveIndexToLocation, resolveLocationsToIndices, resolveVariables } from './debug-map-resolver.js';
import type {
  TDebugSignalWithStart,
  TDescribeDebugWorkflow,
  TQueryDebugState,
  TSendDebugSignal,
  TTerminateDebugWorkflow,
} from './workflow-debug-client.js';

export interface IStartedDebugSession {
  readonly workflowId: string;
  readonly runId: string;
  readonly taskQueue: string;
  /** How many other open dev executions were terminated to make way for this one — same "dev runs one thing at a time" rule `startDevRun` follows. */
  readonly terminatedExecutionsCount: number;
}

/** One terminal status a debug session can end in, translated from Temporal's own status vocabulary — see `TDebugTerminationReason`. */
const TERMINATION_REASON_BY_STATUS: Readonly<Record<string, TDebugTerminationReason>> = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  TERMINATED: 'stopped',
  CANCELED: 'stopped',
  TIMED_OUT: 'stopped',
};

export interface IDebugSessionSnapshot {
  readonly status: 'running' | 'paused' | 'runner-stopped' | TDebugTerminationReason;
  readonly location: IDebugLocation | null;
  readonly variables: readonly IDebugVariable[];
  readonly reason: TDebugPauseReason | null;
  readonly message?: string;
}

export interface IDebugServiceParams {
  readonly documentsService: DocumentsService;
  readonly devArtifacts: DevArtifactStore;
  readonly workflowRunService: WorkflowRunService;
  readonly ensureRunnerDeps: IEnsureRunnerRunningDeps;
  readonly signalWithStartDebug: TDebugSignalWithStart;
  readonly sendDebugSignal: TSendDebugSignal;
  readonly describeDebugWorkflow: TDescribeDebugWorkflow;
  readonly queryDebugState: TQueryDebugState;
  readonly terminateDebugWorkflow: TTerminateDebugWorkflow;
}

/**
 * The backend half of the workflow debugger transport (ADR 0021 (private) §5) — everything the
 * client's `TemporalDebugAdapter` talks to. Owner-scoped like `BuildService`'s `build`/`run`, and
 * dev-only: a debug session can only ever be started against the current dev build (published
 * artifacts are never debug-instrumented). Breakpoints travel as `{documentId, nodeId}` on the wire
 * and are translated to/from the dev build's dense trace indexes via `debug-map-resolver.ts` — the
 * `IDebugMap` `BuildService.build()` now stores alongside the dev artifact.
 *
 * A plain class, not a `@nestjs/common` `@Injectable()` — constructed by a factory provider in
 * `build.module.ts`, the same posture `WorkflowRunService` already uses for the same reason (its
 * Temporal-touching dependencies are plain functions, not other Nest providers).
 */
export class DebugService {
  private readonly documentsService: DocumentsService;
  private readonly devArtifacts: DevArtifactStore;
  private readonly workflowRunService: WorkflowRunService;
  private readonly ensureRunnerDeps: IEnsureRunnerRunningDeps;
  private readonly signalWithStartDebug: TDebugSignalWithStart;
  private readonly sendDebugSignal: TSendDebugSignal;
  private readonly describeDebugWorkflow: TDescribeDebugWorkflow;
  private readonly queryDebugState: TQueryDebugState;
  private readonly terminateDebugWorkflow: TTerminateDebugWorkflow;

  constructor(params: IDebugServiceParams) {
    this.documentsService = params.documentsService;
    this.devArtifacts = params.devArtifacts;
    this.workflowRunService = params.workflowRunService;
    this.ensureRunnerDeps = params.ensureRunnerDeps;
    this.signalWithStartDebug = params.signalWithStartDebug;
    this.sendDebugSignal = params.sendDebugSignal;
    this.describeDebugWorkflow = params.describeDebugWorkflow;
    this.queryDebugState = params.queryDebugState;
    this.terminateDebugWorkflow = params.terminateDebugWorkflow;
  }

  /**
   * Starts a debug session: resolves the requested breakpoints to trace indexes via the dev build's
   * `IDebugMap`, wakes the dev pod if it's idle-scaled-down, terminates whatever else the dev stand
   * was running (same rule `BuildService.startDevRun` follows — dev is single-pod/kill-and-replace),
   * then `signalWithStart`s so the breakpoints are armed before the workflow's first statement runs.
   */
  async start(
    projectId: string,
    ownerId: string,
    input: {
      readonly functionName: string;
      readonly args: readonly unknown[];
      readonly breakpoints: readonly IDebugLocation[];
      readonly pauseOnEntry: boolean;
    },
  ): Promise<IStartedDebugSession> {
    const documents = await this.documentsService.listFull(projectId, ownerId);
    const exists = documents.some((document) => document.type === 'function' && document.name === input.functionName);
    if (!exists) {
      throw new NotFoundException(`Function "${input.functionName}" not found in project "${projectId}"`);
    }
    const artifact = this.devArtifacts.get(projectId);
    if (!artifact) {
      throw new ConflictException('Build the project first — there is no dev build to debug');
    }

    const taskQueue = devTaskQueue(projectId);
    await ensureRunnerRunning(this.ensureRunnerDeps, projectId, 'dev', taskQueue);
    const terminatedExecutionsCount = await this.workflowRunService.terminateRunningOn(projectId, taskQueue);

    const workflowId = `debug-${input.functionName}-${randomUUID()}`;
    const breakpoints = resolveLocationsToIndices(artifact.debugMap ?? { tracePoints: [] }, input.breakpoints);
    const { runId } = await this.signalWithStartDebug({
      projectId,
      taskQueue,
      workflowId,
      functionName: input.functionName,
      args: input.args,
      breakpoints,
      pauseOnEntry: input.pauseOnEntry,
    });
    return { workflowId, runId, taskQueue, terminatedExecutionsCount };
  }

  /** Polled by the client every 500ms while a session is `running`/`paused` — see ADR 0021 (private) §5. */
  async getState(projectId: string, ownerId: string, workflowId: string): Promise<IDebugSessionSnapshot> {
    const descriptor = await this.authorize(projectId, ownerId, workflowId);
    const map = this.devArtifacts.get(projectId)?.debugMap ?? { tracePoints: [] };

    if (descriptor.status !== 'RUNNING') {
      const reason = TERMINATION_REASON_BY_STATUS[descriptor.status] ?? 'stopped';
      return { status: reason, location: null, variables: [], reason: null, message: descriptor.failureMessage };
    }

    const query = await this.queryDebugState({ projectId, workflowId });
    if (query === 'unavailable') {
      await ensureRunnerRunning(this.ensureRunnerDeps, projectId, 'dev', descriptor.taskQueue);
      return { status: 'runner-stopped', location: null, variables: [], reason: null };
    }

    const location = resolveIndexToLocation(map, query.tracePoint);
    if (query.status === 'paused') {
      return {
        status: 'paused',
        location,
        variables: resolveVariables(map, query.tracePoint, query.variables),
        reason: query.reason,
      };
    }
    return { status: 'running', location, variables: [], reason: null };
  }

  /** Full replacement of the live breakpoint set — see `IDebugAdapter.setBreakpoints`. `pauseOnEntry` is always sent `false`: entry has already happened or not by the time a session can receive a live update. */
  async setBreakpoints(
    projectId: string,
    ownerId: string,
    workflowId: string,
    breakpoints: readonly IDebugLocation[],
  ): Promise<void> {
    await this.authorize(projectId, ownerId, workflowId);
    const map = this.devArtifacts.get(projectId)?.debugMap ?? { tracePoints: [] };
    await this.sendDebugSignal({
      projectId,
      workflowId,
      signalName: DEBUG_CONFIGURE_SIGNAL_NAME,
      signalArgs: [{ breakpoints: resolveLocationsToIndices(map, breakpoints), pauseOnEntry: false }],
    });
  }

  async resume(projectId: string, ownerId: string, workflowId: string, mode: 'continue' | 'step-over'): Promise<void> {
    await this.authorize(projectId, ownerId, workflowId);
    await this.sendDebugSignal({
      projectId,
      workflowId,
      signalName: DEBUG_RESUME_SIGNAL_NAME,
      signalArgs: [{ mode }],
    });
  }

  async stop(projectId: string, ownerId: string, workflowId: string): Promise<void> {
    await this.authorize(projectId, ownerId, workflowId);
    await this.terminateDebugWorkflow({ projectId, workflowId });
  }

  /** Confirms `workflowId` actually belongs to this project's dev task queue before acting on it — never trusting a client-supplied workflowId on its own, the same rule `BuildService.getRunPosition` follows for the "Запуски" panel. */
  private async authorize(projectId: string, ownerId: string, workflowId: string): Promise<{ status: string; taskQueue: string; failureMessage?: string }> {
    // `listFull` throws 404 if the project isn't owned by `ownerId` — reused purely for that
    // authorization check here (its documents aren't needed by the callers of `authorize`).
    await this.documentsService.listFull(projectId, ownerId);
    const descriptor = await this.describeDebugWorkflow({ projectId, workflowId });
    if (!descriptor || descriptor.taskQueue !== devTaskQueue(projectId)) {
      throw new NotFoundException(`Debug session "${workflowId}" not found in project "${projectId}"`);
    }
    return descriptor;
  }
}
