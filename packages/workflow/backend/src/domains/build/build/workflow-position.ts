import { POSITION_FAILURE_TYPE, type IWorkflowFailurePositionDetails, type IWorkflowPositionFrame } from '@falang/workflow-compiler';
import type { temporal } from '@temporalio/proto';

export type { IWorkflowPositionFrame } from '@falang/workflow-compiler';

/**
 * Where an execution currently is (or last was) in its diagram — see ADR 0022 (private). `stack` is the compiled runtime's frame stack (`position-runtime.ts`), innermost last:
 * one frame per compiled function currently on the call stack, since a `call-function` is a plain TS
 * call inside the same execution.
 *
 * `source` says where `stack` came from, which also explains a `null`:
 * - `'query'` — the live `falang-position` Temporal query, answered by the running Worker;
 * - `'failure'` — the `FalangWorkflowFailure` details the entry function attached when the error
 *   escaped, read from history alone (no Worker needed);
 * - `'unavailable'` — the execution is open but the query couldn't be served in time (typically the
 *   runner pod is down or still starting — `BuildService` kicks `ensureRunnerRunning` in that case, so
 *   the next poll usually succeeds);
 * - `'none'` — nothing to report: completed/terminated/cancelled executions, or a failed one built
 *   before position tracking existed.
 */
export interface IWorkflowPosition {
  readonly workflowId: string;
  readonly runId: string;
  /** Temporal's own status name — `'RUNNING'`, `'COMPLETED'`, `'FAILED'`, `'TERMINATED'`, … (same vocabulary the Runs page shows). */
  readonly status: string;
  readonly taskQueue: string;
  readonly source: 'query' | 'failure' | 'unavailable' | 'none';
  readonly stack: readonly IWorkflowPositionFrame[] | null;
  /** The failure's own message, for `'FAILED'` executions. */
  readonly failureMessage?: string;
}

export interface IGetWorkflowPositionParams {
  readonly workflowId: string;
  readonly runId: string;
  readonly temporalAddress?: string;
  readonly namespace?: string;
}

/** Resolves an execution's position, or `null` if Temporal has no such execution — see the real implementation in `build.module.ts`. */
export type TGetWorkflowPosition = (params: IGetWorkflowPositionParams) => Promise<IWorkflowPosition | null>;

type TFailure = temporal.api.failure.v1.IFailure | null | undefined;
type TDecodePayloads = (payloads: temporal.api.common.v1.IPayloads | null | undefined) => unknown;

const isFrame = (value: unknown): value is IWorkflowPositionFrame =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { documentId?: unknown }).documentId === 'string' &&
  ((value as { nodeId?: unknown }).nodeId === null || typeof (value as { nodeId?: unknown }).nodeId === 'string');

/**
 * Reads the position stack out of a `WorkflowExecutionFailed` event's failure — the entry function
 * wraps any escaping error in a `POSITION_FAILURE_TYPE` `ApplicationFailure` whose `details[0]` is
 * an `IWorkflowFailurePositionDetails` (see `position-runtime.ts`). Walks the `cause` chain too, in
 * case something upstream (a retry policy, a child workflow) re-wrapped it. Returns `null` for
 * failures without it — an artifact built before tracking existed, or a Worker-side crash that never
 * reached the compiled `catch`.
 */
export const readFailurePosition = (
  failure: TFailure,
  decodePayloads: TDecodePayloads,
): IWorkflowFailurePositionDetails | null => {
  for (let current = failure; current; current = current.cause) {
    if (current.applicationFailureInfo?.type !== POSITION_FAILURE_TYPE) continue;
    const decoded = decodePayloads(current.applicationFailureInfo.details);
    // `decodePayloads` unwraps a single payload to the value itself; `details` always has exactly one.
    const candidate = (Array.isArray(decoded) && decoded.length === 1 ? decoded[0] : decoded) as {
      readonly position?: unknown;
    } | null;
    const position = candidate?.position;
    if (Array.isArray(position) && position.every((frame) => isFrame(frame))) return { position };
    return null;
  }
  return null;
};

/** The failure's own message (our `POSITION_FAILURE_TYPE` wrapper copies the original error's text, so the outermost one is the right one), or `null` if there is none. */
export const readFailureMessage = (failure: TFailure): string | null => {
  const message = failure?.message;
  return typeof message === 'string' && message !== '' ? message : null;
};
