import type { TRunnerSessionEndReason } from './runner-session.entity.js';

/** Domain shape of a `runner_sessions` row (dates are `Date`; the HTTP API serializes them as ISO strings). */
export interface IRunnerSession {
  readonly id: string;
  readonly projectId: string;
  readonly env: 'dev' | 'prod';
  readonly buildId: string | null;
  readonly deploymentName: string;
  readonly taskQueue: string;
  readonly startedAt: Date;
  readonly lastSeenAt: Date;
  readonly endedAt: Date | null;
  readonly endReason: TRunnerSessionEndReason | null;
}

/**
 * Observer of the session lifecycle (ADR 0067 (private) §1). The community default is nothing; the hosted edition's
 * meter implements it. Called after the row is written; an error is logged by the caller and never reaches a start/stop.
 *
 * Overriding: export `RUNNER_SESSION_SINK` from a `@Global()` Nest module imported into `AppModule` — the same shape
 * as `AGENT_USAGE_SINK`. `BuildModule` injects it `@Optional()` and deliberately does not provide it itself.
 */
export interface IRunnerSessionSink {
  onOpened: (session: IRunnerSession) => Promise<void> | void;
  /** Each sweep tick for every session still open (`lastSeenAt` is fresh). */
  onHeartbeat: (session: IRunnerSession) => Promise<void> | void;
  /** `session.endedAt`/`endReason` are set. */
  onClosed: (session: IRunnerSession) => Promise<void> | void;
}

export const RUNNER_SESSION_SINK = Symbol('RUNNER_SESSION_SINK');

export type TRunnerStartAction =
  | 'dev-start'
  | 'dev-run'
  | 'debug'
  | 'prod-start'
  | 'activate'
  | 'publish'
  | 'wake';

export interface IRunnerStartContext {
  readonly projectId: string;
  readonly ownerId: string;
  readonly env: 'dev' | 'prod';
  readonly action: TRunnerStartAction;
}

/**
 * Asked before anything that would create a runner Deployment (ADR 0067 (private) §3). Throwing an `HttpException`
 * (the hosted edition throws `402 { code: 'insufficient_balance' }`) refuses the start and reaches the client
 * unchanged; for a trigger wake there is no client, the refusal is journaled as an undeliverable input instead.
 * The community default allows everything. Provide `RUNNER_START_GUARD` from a `@Global()` module, like the sink.
 */
export interface IRunnerStartGuard {
  assertCanStart: (ctx: IRunnerStartContext) => Promise<void>;
}

export const RUNNER_START_GUARD = Symbol('RUNNER_START_GUARD');
