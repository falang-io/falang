/**
 * DI token of an optional on-demand Temporal server (ADR 0072, private: local mode starts `temporal server start-dev`
 * only once something needs it). Provided by an overlay `@Global()` module — local mode's `LocalModeModule` — and
 * injected `@Optional()` by `TemporalModule`; without it the backend assumes an always-running server, as before.
 */
export const TEMPORAL_SERVER_CONTROL = Symbol('TEMPORAL_SERVER_CONTROL');

export interface ITemporalServerControl {
  /** Whether the server is up now. */
  isRunning(): boolean;
  /** Whether the server has stored anything yet (runs, schedules) — a read of a server that never ran finds nothing. */
  hasStoredState(): boolean;
  /** Starts the server once; concurrent callers share the start, a failed start is retried by the next call. */
  ensureStarted(): Promise<void>;
}
