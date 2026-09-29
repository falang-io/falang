/**
 * The debugger protocol every layer speaks — the scheme editor's `DebuggerModule`/`DebugSessionStore`
 * (UI), each compiler's trace-point instrumentation (`IDebugMap`), and each product's transport
 * (`IDebugAdapter`: Temporal signals/queries for workflows, a serial monitor for Arduino). See
 * ADR 0021 (private) §2. Deliberately DAP-shaped (same verbs and event
 * vocabulary) but node-id-addressed: a location is a diagram node, never a source line.
 */

export interface IDebugLocation {
  readonly documentId: string;
  readonly nodeId: string;
}

/** Conditional/hit-count breakpoints are deferred (ADR §Phasing) — for now a breakpoint is just a location. */
export type IDebugBreakpoint = IDebugLocation;

/** JSON-safe, already truncated by the transport (depth/size caps are the adapter's job, see ADR §5). */
export type TDebugValue =
  | null
  | boolean
  | number
  | string
  | readonly TDebugValue[]
  | { readonly [key: string]: TDebugValue };

export interface IDebugVariable {
  readonly name: string;
  /** The compile-time type as the compiler rendered it (`number`, `string[]`, `int32_t`…), purely informational. */
  readonly type?: string;
  readonly value: TDebugValue;
}

export interface IDebugFrame {
  readonly location: IDebugLocation;
  readonly functionName: string;
}

export type TDebugPauseReason = 'breakpoint' | 'step' | 'entry';
/** `'step-into'`/`'step-out'` are deferred (ADR §Phasing) — step-over is defined by call depth, see ADR §4. */
export type TDebugResumeMode = 'continue' | 'step-over';
export type TDebugTerminationReason = 'completed' | 'failed' | 'stopped';

export type TDebugEvent =
  | { readonly type: 'started' }
  | {
      readonly type: 'paused';
      readonly location: IDebugLocation;
      readonly variables: readonly IDebugVariable[];
      /** Innermost frame first. MVP UIs render only `stack[0]`. */
      readonly stack: readonly IDebugFrame[];
      readonly reason: TDebugPauseReason;
    }
  | { readonly type: 'resumed' }
  | { readonly type: 'output'; readonly text: string }
  | { readonly type: 'terminated'; readonly reason: TDebugTerminationReason; readonly message?: string };

export type TDebugEventListener = (event: TDebugEvent) => void;

export interface IDebugStartParams {
  readonly breakpoints: readonly IDebugBreakpoint[];
  readonly pauseOnEntry: boolean;
  /** Transport-specific entry description (e.g. `{ functionName, args }` for a workflow run) — opaque to the UI. */
  readonly entry?: unknown;
}

/**
 * One debug session's transport. Implemented per product; the UI (`DebugSessionStore`) is the only
 * caller. Every method resolves once the transport has *accepted* the command — the resulting state
 * change always arrives as a `TDebugEvent` through `subscribe`, never as a return value, so a
 * polling transport and a push transport look identical to the UI.
 */
export interface IDebugAdapter {
  start(params: IDebugStartParams): Promise<void>;
  /** Full replacement of the live breakpoint set — allowed at any time while a session is running. */
  setBreakpoints(breakpoints: readonly IDebugBreakpoint[]): Promise<void>;
  resume(mode: TDebugResumeMode): Promise<void>;
  stop(): Promise<void>;
  /** Returns the unsubscribe function. */
  subscribe(listener: TDebugEventListener): () => void;
}

/** One instrumented statement, as the compiler numbered it. `index` is dense and starts at 0 — small enough to ship as a `uint16_t` over a serial line, see ADR §2/§6. */
export interface IDebugTracePoint {
  readonly index: number;
  readonly documentId: string;
  readonly nodeId: string;
  readonly variables: readonly { readonly name: string; readonly type: string }[];
}

/** Produced by an instrumented compile alongside the code; the transport resolves indexes back to node ids through it. */
export interface IDebugMap {
  readonly tracePoints: readonly IDebugTracePoint[];
}

/** Stable string key for a location — `Map`/`Set` friendly. Node ids are nanoids (no `:`), document ids are uuids, so the separator is unambiguous. */
export const debugLocationKey = (location: IDebugLocation): string => `${location.documentId}:${location.nodeId}`;

export const isSameDebugLocation = (
  a: IDebugLocation | null | undefined,
  b: IDebugLocation | null | undefined,
): boolean => Boolean(a && b && a.documentId === b.documentId && a.nodeId === b.nodeId);
