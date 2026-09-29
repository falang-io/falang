import { action, computed, makeObservable, observable, ObservableMap, ObservableSet, runInAction } from 'mobx';
import type {
  IDebugAdapter,
  IDebugBreakpoint,
  IDebugFrame,
  IDebugLocation,
  IDebugVariable,
  TDebugEvent,
  TDebugPauseReason,
  TDebugResumeMode,
  TDebugTerminationReason,
} from '@falang/debug';

export type TDebugSessionStatus = 'idle' | 'starting' | 'running' | 'paused' | 'terminated';

export interface IDebugSessionStartParams {
  readonly pauseOnEntry?: boolean;
  readonly entry?: unknown;
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();
const MAX_OUTPUT_LINES = 500;

/**
 * One debug session's state, shared by every scheme (document) open in a project — a session spans
 * documents (a breakpoint in `loop` and one in a helper both belong to one run), while `IModule`
 * instances are per-scheme. So the host instantiates this once per project and hands the same
 * instance to every `DebuggerModule` (see ADR 0021 (private) §3). It is the
 * only object that talks to the `IDebugAdapter`; `DebuggerService` and the panel just read it.
 *
 * Breakpoints live here (not in the node's `meta`, see the ADR) and survive sessions: toggling
 * one while a session is active pushes the full set to the adapter, toggling it while idle just
 * records it for the next `start()`.
 */
export class DebugSessionStore {
  @observable.ref status: TDebugSessionStatus = 'idle';
  @observable.ref location: IDebugLocation | null = null;
  @observable.ref variables: readonly IDebugVariable[] = [];
  @observable.ref stack: readonly IDebugFrame[] = [];
  @observable.ref pauseReason: TDebugPauseReason | null = null;
  @observable.ref terminationReason: TDebugTerminationReason | null = null;
  @observable.ref lastError: string | null = null;
  readonly output = observable.array<string>([], { deep: false });
  /** documentId → node ids. Nested observables so a per-document layer only re-renders for its own document. */
  readonly breakpoints = new ObservableMap<string, ObservableSet<string>>();

  private readonly adapter: IDebugAdapter;
  private readonly unsubscribe: () => void;

  constructor(adapter: IDebugAdapter) {
    this.adapter = adapter;
    this.unsubscribe = adapter.subscribe((event) => this.applyEvent(event));
    makeObservable(this);
  }

  @computed get isActive(): boolean {
    return this.status === 'starting' || this.status === 'running' || this.status === 'paused';
  }

  /** The location to highlight — only meaningful while paused; a running session has no "current node". */
  @computed get pausedLocation(): IDebugLocation | null {
    return this.status === 'paused' ? this.location : null;
  }

  @computed get breakpointList(): readonly IDebugBreakpoint[] {
    const list: IDebugBreakpoint[] = [];
    for (const [documentId, nodeIds] of this.breakpoints) {
      for (const nodeId of nodeIds) list.push({ documentId, nodeId });
    }
    return list;
  }

  getBreakpointIds(documentId: string): ReadonlySet<string> {
    return this.breakpoints.get(documentId) ?? EMPTY_IDS;
  }

  hasBreakpoint({ documentId, nodeId }: IDebugLocation): boolean {
    return this.breakpoints.get(documentId)?.has(nodeId) ?? false;
  }

  @action setBreakpoint(location: IDebugLocation, enabled: boolean): void {
    const { documentId, nodeId } = location;
    let ids = this.breakpoints.get(documentId);
    if (enabled) {
      if (!ids) {
        ids = new ObservableSet<string>();
        this.breakpoints.set(documentId, ids);
      }
      if (ids.has(nodeId)) return;
      ids.add(nodeId);
    } else {
      if (!ids?.has(nodeId)) return;
      ids.delete(nodeId);
      if (ids.size === 0) this.breakpoints.delete(documentId);
    }
    this.syncBreakpoints();
  }

  @action toggleBreakpoint(location: IDebugLocation): boolean {
    const enabled = !this.hasBreakpoint(location);
    this.setBreakpoint(location, enabled);
    return enabled;
  }

  /** Replaces the whole breakpoint set at once — for a host restoring persisted breakpoints. */
  @action replaceBreakpoints(list: readonly IDebugBreakpoint[]): void {
    this.breakpoints.clear();
    for (const { documentId, nodeId } of list) {
      let ids = this.breakpoints.get(documentId);
      if (!ids) {
        ids = new ObservableSet<string>();
        this.breakpoints.set(documentId, ids);
      }
      ids.add(nodeId);
    }
    this.syncBreakpoints();
  }

  async start(params: IDebugSessionStartParams = {}): Promise<void> {
    if (this.isActive) return;
    runInAction(() => {
      this.status = 'starting';
      this.location = null;
      this.variables = [];
      this.stack = [];
      this.pauseReason = null;
      this.terminationReason = null;
      this.lastError = null;
      this.output.clear();
    });
    try {
      await this.adapter.start({
        breakpoints: this.breakpointList,
        pauseOnEntry: params.pauseOnEntry ?? false,
        entry: params.entry,
      });
    } catch (error) {
      this.fail(error);
    }
  }

  async resume(mode: TDebugResumeMode = 'continue'): Promise<void> {
    if (this.status !== 'paused') return;
    try {
      await this.adapter.resume(mode);
    } catch (error) {
      this.fail(error);
    }
  }

  async stop(): Promise<void> {
    if (!this.isActive) return;
    try {
      await this.adapter.stop();
    } catch (error) {
      this.fail(error);
    }
  }

  @action applyEvent(event: TDebugEvent): void {
    switch (event.type) {
      case 'started': {
        this.status = 'running';
        break;
      }
      case 'paused': {
        this.status = 'paused';
        this.location = event.location;
        this.variables = event.variables;
        this.stack = event.stack;
        this.pauseReason = event.reason;
        break;
      }
      case 'resumed': {
        this.status = 'running';
        this.pauseReason = null;
        break;
      }
      case 'output': {
        this.output.push(event.text);
        if (this.output.length > MAX_OUTPUT_LINES) this.output.splice(0, this.output.length - MAX_OUTPUT_LINES);
        break;
      }
      case 'terminated': {
        this.status = 'terminated';
        this.terminationReason = event.reason;
        this.pauseReason = null;
        if (event.message) this.lastError = event.message;
        break;
      }
      default: {
        break;
      }
    }
  }

  dispose(): void {
    this.unsubscribe();
  }

  private syncBreakpoints(): void {
    if (!this.isActive) return;
    this.adapter.setBreakpoints(this.breakpointList).catch((error: unknown) => this.setError(error));
  }

  @action private fail(error: unknown): void {
    this.status = 'terminated';
    this.terminationReason = 'failed';
    this.setError(error);
  }

  @action private setError(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
  }
}
