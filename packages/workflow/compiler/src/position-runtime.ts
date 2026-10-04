/**
 * Execution-position tracking for compiled workflows — see ADR 0022 (private).
 *
 * When `compileProject` runs with `trackPosition: true`, the workflows module is prefixed with the
 * runtime below and every compiled function body becomes:
 *
 * ```ts
 * __falangEnter('<documentId>');
 * try {
 *   // icon-start:log:l1
 *   __falangAt('l1');
 *   await logActivity(`hi`);
 *   // icon-end:log:l1
 * } catch (error) {
 *   throw __falangFailure(error);
 * } finally {
 *   __falangLeave();
 * }
 * ```
 *
 * The stack of `{ documentId, nodeId }` frames (one per nested compiled-function call, since a
 * `call-function` is a plain TS call inside the same execution) is served by the
 * `POSITION_QUERY_NAME` Temporal query — read-only, answered by the Worker from in-memory state,
 * no history event per statement. On failure the entry function re-throws an `ApplicationFailure`
 * carrying the same stack in its `details`, so a failed run's last position is readable from its
 * history alone, with no Worker needed (see `readFailurePosition` on the backend). Cancellation is
 * passed through untouched: wrapping a `CancelledFailure` would turn a *cancelled* execution into a
 * *failed* one.
 *
 * Module-level state is per-execution in Temporal's workflow sandbox (both with and without
 * `reuseV8Context` — the SDK swaps each Workflow's module state in and out of the shared context
 * per Workflow Task), so no explicit plumbing is needed to keep two executions' stacks apart —
 * provided the bundle keeps Temporal's per-execution webpack module cache, which
 * `@falang/workflow-backend`'s `bundleWorkflowCode` enforces (a newer webpack's `const` module cache
 * once silently made every execution on a Worker share this stack).
 */

/** Temporal query name the compiled runtime answers with its current `IWorkflowPositionFrame[]`. */
export const POSITION_QUERY_NAME = 'falang-position';

/** `ApplicationFailure.type` of the wrapper the entry function throws when tracking is on — its `details[0]` is an `IWorkflowFailurePositionDetails`. */
export const POSITION_FAILURE_TYPE = 'FalangWorkflowFailure';

export interface IWorkflowPositionFrame {
  readonly documentId: string;
  /** `null` between `__falangEnter` and the first statement (e.g. while a `trigger-function` is still waiting for its first signal). */
  readonly nodeId: string | null;
}

/** Shape of `details[0]` on a `POSITION_FAILURE_TYPE` failure — the stack as it was when the error escaped the entry function. */
export interface IWorkflowFailurePositionDetails {
  readonly position: readonly IWorkflowPositionFrame[];
}

/** Names the compiled code calls — exported so emitters and tests share one spelling. */
export const POSITION_ENTER_FN = '__falangEnter';
export const POSITION_LEAVE_FN = '__falangLeave';
export const POSITION_AT_FN = '__falangAt';
export const POSITION_FAILURE_FN = '__falangFailure';

/** Everything the runtime needs from `@temporalio/workflow` beyond what `buildWorkflowPreamble` already imports. */
export const POSITION_RUNTIME_IMPORTS = ['ApplicationFailure', 'defineQuery', 'isCancellation'] as const;

/** The runtime itself — plain TS, type-checked by `typeCheckProject` like the rest of the module. */
export const POSITION_RUNTIME_CODE = [
  'interface __FalangPositionFrame { documentId: string; nodeId: string | null }',
  'const __falangPositionStack: __FalangPositionFrame[] = [];',
  `const __falangPositionQuery = defineQuery<__FalangPositionFrame[]>('${POSITION_QUERY_NAME}');`,
  'const __falangSnapshot = (): __FalangPositionFrame[] => __falangPositionStack.map((frame) => ({ ...frame }));',
  `const ${POSITION_ENTER_FN} = (documentId: string): void => {`,
  '  if (__falangPositionStack.length === 0) setHandler(__falangPositionQuery, __falangSnapshot);',
  '  __falangPositionStack.push({ documentId, nodeId: null });',
  '};',
  `const ${POSITION_LEAVE_FN} = (): void => {`,
  '  __falangPositionStack.pop();',
  '};',
  `const ${POSITION_AT_FN} = (nodeId: string): void => {`,
  '  const frame = __falangPositionStack[__falangPositionStack.length - 1];',
  '  if (frame) frame.nodeId = nodeId;',
  '};',
  `const ${POSITION_FAILURE_FN} = (error: unknown): unknown => {`,
  '  if (__falangPositionStack.length !== 1 || isCancellation(error)) return error;',
  '  return ApplicationFailure.create({',
  '    message: error instanceof Error ? error.message : String(error),',
  `    type: '${POSITION_FAILURE_TYPE}',`,
  '    details: [{ position: __falangSnapshot() }],',
  '    cause: error instanceof Error ? error : undefined,',
  '  });',
  '};',
].join('\n');
