import type {
  IDebugAdapter,
  IDebugBreakpoint,
  IDebugStartParams,
  TDebugEvent,
  TDebugEventListener,
  TDebugResumeMode,
} from '@falang/debug';
import { workflowApi, type IApiDebugSessionSnapshot } from './api-client.js';

/** `IDebugStartParams.entry` for the workflow product — the function to run and its positional arguments. */
export interface ITemporalDebugEntry {
  readonly functionName: string;
  readonly args: readonly unknown[];
}

export interface ITemporalDebugAdapterHooks {
  /** Makes sure a dev build exists that reflects the current documents — same hook `LiveRunStore` uses for the "Run" button. */
  readonly ensureDevBuilt: () => Promise<boolean>;
}

const STATE_POLL_MS = 500;

const toLocation = (breakpoint: IDebugBreakpoint): IDebugBreakpoint => ({
  documentId: breakpoint.documentId,
  nodeId: breakpoint.nodeId,
});

/**
 * The workflow product's `IDebugAdapter` (ADR 0021 (private) §5) — polls `GET .../debug/:workflowId/state`
 * every 500ms while a session is open and turns the raw snapshot into the discrete `TDebugEvent`s
 * `DebugSessionStore` expects, the same "poll a snapshot, diff it into events" shape
 * `LiveRunStore`/`ExecutionPositionModule` already use for the always-on position tracker. One
 * instance per project, constructed once by `WorkflowStore` and handed to its `DebugSessionStore`.
 */
export class TemporalDebugAdapter implements IDebugAdapter {
  private readonly projectId: string;
  private readonly hooks: ITemporalDebugAdapterHooks;
  private readonly listeners = new Set<TDebugEventListener>();
  private workflowId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wasPaused = false;
  /** Bumped by every `start()`/`stop()`, so a poll answer that lands after the session moved on is dropped — same guard `LiveRunStore` uses. */
  private generation = 0;

  constructor(projectId: string, hooks: ITemporalDebugAdapterHooks) {
    this.projectId = projectId;
    this.hooks = hooks;
  }

  subscribe(listener: TDebugEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(params: IDebugStartParams): Promise<void> {
    const entry = params.entry as ITemporalDebugEntry | undefined;
    if (!entry) throw new Error('TemporalDebugAdapter.start requires an entry ({ functionName, args })');

    if (!(await this.hooks.ensureDevBuilt())) {
      this.emit({ type: 'terminated', reason: 'failed', message: 'Failed to build the project for debugging' });
      return;
    }

    const started = await workflowApi.startDebugSession(this.projectId, {
      functionName: entry.functionName,
      args: [...entry.args],
      breakpoints: params.breakpoints.map((breakpoint) => toLocation(breakpoint)),
      pauseOnEntry: params.pauseOnEntry,
    });

    this.generation += 1;
    this.workflowId = started.workflowId;
    this.wasPaused = false;
    this.emit({ type: 'started' });
    this.poll(this.generation);
  }

  async setBreakpoints(breakpoints: readonly IDebugBreakpoint[]): Promise<void> {
    if (!this.workflowId) return;
    await workflowApi.setDebugBreakpoints(
      this.projectId,
      this.workflowId,
      breakpoints.map((breakpoint) => toLocation(breakpoint)),
    );
  }

  async resume(mode: TDebugResumeMode): Promise<void> {
    if (!this.workflowId) return;
    await workflowApi.resumeDebugSession(this.projectId, this.workflowId, mode);
  }

  async stop(): Promise<void> {
    if (!this.workflowId) return;
    const { workflowId } = this;
    this.clearTimer();
    this.generation += 1;
    this.workflowId = null;
    await workflowApi.stopDebugSession(this.projectId, workflowId);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private async poll(generation: number): Promise<void> {
    if (!this.workflowId || generation !== this.generation) return;
    try {
      const snapshot = await workflowApi.getDebugState(this.projectId, this.workflowId);
      if (generation !== this.generation) return;
      if (this.applySnapshot(snapshot)) return;
    } catch {
      // Transient (e.g. a dropped request) — the session's own terminal states come from the
      // snapshot's `status`, not from a poll failure, so just retry on the next tick.
    }
    this.timer = setTimeout(() => this.poll(generation), STATE_POLL_MS);
  }

  /** Returns `true` once the session has reached a terminal status, so `poll` stops rescheduling itself. */
  private applySnapshot(snapshot: IApiDebugSessionSnapshot): boolean {
    if (snapshot.status === 'paused') {
      this.wasPaused = true;
      if (!snapshot.location || !snapshot.reason) return false;
      this.emit({
        type: 'paused',
        location: snapshot.location,
        variables: snapshot.variables,
        // MVP renders only the top frame (ADR 0021 §2) — `functionName` isn't shown by today's
        // panel, so the current document id is a fine stand-in for "which function this frame is in".
        stack: [{ location: snapshot.location, functionName: snapshot.location.documentId }],
        reason: snapshot.reason,
      });
      return false;
    }
    if (snapshot.status === 'running') {
      if (this.wasPaused) this.emit({ type: 'resumed' });
      this.wasPaused = false;
      return false;
    }
    // `'runner-stopped'` is transient (the dev pod was idle-scaled down; the backend already kicked
    // it awake) — neither a pause nor a termination, just keep polling with no event.
    if (snapshot.status === 'runner-stopped') return false;

    // Neither 'paused', 'running' nor 'runner-stopped' — must be a `TDebugTerminationReason`.
    this.workflowId = null;
    this.emit({ type: 'terminated', reason: snapshot.status, message: snapshot.message });
    return true;
  }

  private emit(event: TDebugEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
