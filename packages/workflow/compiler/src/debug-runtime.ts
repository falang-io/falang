/**
 * Breakpoint/pause debugging for compiled workflows — see ADR 0021 (private) §4/§5.
 *
 * Deliberately independent of `position-runtime.ts` (ADR 0022 (private)) even though both wrap
 * every compiled function body and both fire at every statement: they're separately-toggleable
 * instrumentation passes (`trackPosition` is on for every real build, `debug` only for dev builds),
 * and coupling this runtime's pause/step state to the position runtime's frame stack would make
 * either one harder to reason about or toggle independently. What IS shared is the *call site* —
 * `node-emitters.ts` emits both `__falangAt(...)` and `await __falangDebug.trace(...)` from the same
 * per-statement pass rather than walking the tree twice (see ADR 0022's "Relationship to ADR 0021").
 *
 * When `compileProject` runs with `debug: true`, the workflows module is prefixed with the runtime
 * below and every compiled `function` document's body becomes:
 *
 * ```ts
 * __falangDebug.enter();
 * try {
 *   // icon-start:log:l1
 *   await __falangDebug.trace(0, () => ({ total }));
 *   await logActivity(`hi`);
 *   // icon-end:log:l1
 * } finally {
 *   __falangDebug.leave();
 * }
 * ```
 *
 * `trace(index, snapshot)` is a no-op (one `Set.has` + a depth comparison, `snapshot` never called)
 * unless the index is a configured breakpoint, a step-over target, or "pause on entry" is pending —
 * so leaving it in a dev build costs nothing until a debug session actually attaches. Pausing is
 * `await condition(() => resumed)`, deterministic by construction (signals are the only input).
 * `trigger-function` documents are NOT wrapped in Phase 1 (see the ADR's Phase 3 — debugging
 * trigger-started workflows needs a project-level debug config threaded through `signalWithStart`,
 * which doesn't exist yet).
 */

/** Sent with `signalWithStart` so the first statement can't slip past before breakpoints arrive; also sent alone to replace breakpoints/pauseOnEntry live. */
export const DEBUG_CONFIGURE_SIGNAL_NAME = 'falang-debug-configure';
/** `mode: 'continue'` clears any pending step; `'step-over'` arms a pause at the next trace point whose depth is ≤ the depth at the moment of the signal. */
export const DEBUG_RESUME_SIGNAL_NAME = 'falang-debug-resume';
/** Read-only query, served from in-memory state — no history event per poll. */
export const DEBUG_STATE_QUERY_NAME = 'falang-debug-state';

export interface IDebugConfigureSignalPayload {
  readonly breakpoints: readonly number[];
  readonly pauseOnEntry: boolean;
}

export interface IDebugResumeSignalPayload {
  readonly mode: 'continue' | 'step-over';
}

export type TDebugRuntimePauseReason = 'breakpoint' | 'step' | 'entry';

/** Shape `falang-debug-state` resolves to — the backend translates `tracePoint` (a dense index) back to `{documentId, nodeId}` via the build's stored `IDebugMap` before handing it to the client. */
export interface IDebugQueryState {
  readonly status: 'running' | 'paused';
  readonly tracePoint: number | null;
  readonly depth: number;
  readonly variables: Record<string, unknown>;
  readonly reason: TDebugRuntimePauseReason | null;
}

/** Names the compiled code calls — exported so `node-emitters.ts`/`compile-function.ts` and tests share one spelling. */
export const DEBUG_TRACE_CALL = '__falangDebug.trace';
export const DEBUG_ENTER_CALL = '__falangDebug.enter';
export const DEBUG_LEAVE_CALL = '__falangDebug.leave';

/** Everything the runtime needs from `@temporalio/workflow` beyond what `buildWorkflowPreamble`/position tracking already import. */
export const DEBUG_RUNTIME_IMPORTS = ['defineQuery'] as const;

const DEBUG_SNAPSHOT_DEPTH_CAP = 8;
const DEBUG_SNAPSHOT_BYTE_CAP = 32 * 1024;

/** The runtime itself — plain TS, type-checked by `typeCheckProject` like the rest of the module. */
export const DEBUG_RUNTIME_CODE = [
  `const __falangDebugConfigureSignal = defineSignal<[{ breakpoints: number[]; pauseOnEntry: boolean }]>('${DEBUG_CONFIGURE_SIGNAL_NAME}');`,
  `const __falangDebugResumeSignal = defineSignal<[{ mode: 'continue' | 'step-over' }]>('${DEBUG_RESUME_SIGNAL_NAME}');`,
  `const __falangDebugStateQuery = defineQuery<{ status: 'running' | 'paused'; tracePoint: number | null; depth: number; variables: Record<string, unknown>; reason: 'breakpoint' | 'step' | 'entry' | null }>('${DEBUG_STATE_QUERY_NAME}');`,
  'let __falangDebugHandlersRegistered = false;',
  'let __falangDebugBreakpoints = new Set<number>();',
  'let __falangDebugPauseOnEntry = false;',
  'let __falangDebugEntryPending = false;',
  "let __falangDebugStatus: 'running' | 'paused' = 'running';",
  "let __falangDebugResumeMode: 'continue' | 'step-over' | null = null;",
  'let __falangDebugStepDepth: number | null = null;',
  'let __falangDebugDepth = 0;',
  'let __falangDebugCurrentIndex: number | null = null;',
  'let __falangDebugCurrentVariables: Record<string, unknown> = {};',
  "let __falangDebugPauseReason: 'breakpoint' | 'step' | 'entry' | null = null;",
  '',
  'const __falangDebugTruncate = (value: unknown, depth: number): unknown => {',
  "  if (Array.isArray(value)) return depth <= 0 ? '[Truncated: max depth]' : value.map((item) => __falangDebugTruncate(item, depth - 1));",
  "  if (value !== null && typeof value === 'object') {",
  "    if (depth <= 0) return '[Truncated: max depth]';",
  '    const result: Record<string, unknown> = {};',
  '    for (const key of Object.keys(value as Record<string, unknown>)) result[key] = __falangDebugTruncate((value as Record<string, unknown>)[key], depth - 1);',
  '    return result;',
  '  }',
  '  return value;',
  '};',
  '',
  "/** `JSON.parse(JSON.stringify(...))` with a depth cap (via `__falangDebugTruncate`) and a per-variable byte cap — query results must survive the payload converter, and a runaway value shouldn't stall the client. */",
  'const __falangDebugSnapshotVariable = (value: unknown): unknown => {',
  '  try {',
  `    const safe = JSON.parse(JSON.stringify(__falangDebugTruncate(value, ${DEBUG_SNAPSHOT_DEPTH_CAP})));`,
  '    const json = JSON.stringify(safe);',
  `    if (typeof json === 'string' && json.length > ${DEBUG_SNAPSHOT_BYTE_CAP}) return '[Truncated: too large]';`,
  '    return safe;',
  '  } catch {',
  "    return '[Unserializable]';",
  '  }',
  '};',
  '',
  'const __falangDebugSnapshotObject = (values: Record<string, unknown>): Record<string, unknown> => {',
  '  const result: Record<string, unknown> = {};',
  '  for (const key of Object.keys(values)) result[key] = __falangDebugSnapshotVariable(values[key]);',
  '  return result;',
  '};',
  '',
  '/** Registered lazily on the first `enter()` (mirrors `position-runtime.ts`), synchronously before any `await` — so a `falang-debug-configure` signal sent `signalWithStart` is already buffered-and-delivered by the time the first trace point evaluates it. */',
  'const __falangDebugRegisterHandlers = (): void => {',
  '  setHandler(__falangDebugConfigureSignal, (payload: { breakpoints: number[]; pauseOnEntry: boolean }) => {',
  '    __falangDebugBreakpoints = new Set(payload.breakpoints);',
  '    __falangDebugPauseOnEntry = payload.pauseOnEntry;',
  '  });',
  "  setHandler(__falangDebugResumeSignal, (payload: { mode: 'continue' | 'step-over' }) => {",
  "    __falangDebugStepDepth = payload.mode === 'step-over' ? __falangDebugDepth : null;",
  '    __falangDebugResumeMode = payload.mode;',
  '  });',
  '  setHandler(__falangDebugStateQuery, () => ({',
  '    status: __falangDebugStatus,',
  '    tracePoint: __falangDebugCurrentIndex,',
  '    depth: __falangDebugDepth,',
  '    variables: __falangDebugCurrentVariables,',
  '    reason: __falangDebugPauseReason,',
  '  }));',
  '  __falangDebugHandlersRegistered = true;',
  '};',
  '',
  'const __falangDebugPause = async (',
  '  index: number,',
  "  reason: 'breakpoint' | 'step' | 'entry',",
  '  snapshot: () => Record<string, unknown>,',
  '): Promise<void> => {',
  '  __falangDebugCurrentIndex = index;',
  '  __falangDebugCurrentVariables = __falangDebugSnapshotObject(snapshot());',
  '  __falangDebugPauseReason = reason;',
  "  __falangDebugStatus = 'paused';",
  '  __falangDebugResumeMode = null;',
  '  await condition(() => __falangDebugResumeMode !== null);',
  "  __falangDebugStatus = 'running';",
  '  __falangDebugPauseReason = null;',
  '};',
  '',
  'const __falangDebugTrace = async (index: number, snapshot: () => Record<string, unknown>): Promise<void> => {',
  '  __falangDebugCurrentIndex = index;',
  '  if (__falangDebugEntryPending) {',
  '    __falangDebugEntryPending = false;',
  "    await __falangDebugPause(index, 'entry', snapshot);",
  '    return;',
  '  }',
  '  if (__falangDebugBreakpoints.has(index)) {',
  "    await __falangDebugPause(index, 'breakpoint', snapshot);",
  '    return;',
  '  }',
  '  if (__falangDebugStepDepth !== null && __falangDebugDepth <= __falangDebugStepDepth) {',
  '    __falangDebugStepDepth = null;',
  "    await __falangDebugPause(index, 'step', snapshot);",
  '  }',
  '};',
  '',
  '/** Only the outermost call (the workflow entry point) can arm "pause on entry" — a nested `call-function` entering a helper document should not re-trigger it. */',
  'const __falangDebugEnter = (): void => {',
  '  if (!__falangDebugHandlersRegistered) __falangDebugRegisterHandlers();',
  '  __falangDebugDepth += 1;',
  '  if (__falangDebugDepth === 1) __falangDebugEntryPending = __falangDebugPauseOnEntry;',
  '};',
  '',
  'const __falangDebugLeave = (): void => {',
  '  __falangDebugDepth -= 1;',
  '};',
  '',
  'const __falangDebug = { trace: __falangDebugTrace, enter: __falangDebugEnter, leave: __falangDebugLeave };',
].join('\n');
