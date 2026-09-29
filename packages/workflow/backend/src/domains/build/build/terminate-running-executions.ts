/**
 * See ADR 0040 (private) §4/§5: a dev rebuild (or `startDevRun`) clears
 * out a project's still-running executions on the same task queue before starting the new one.
 * Doing that with a hard `handle.terminate()` (the original, and until now only, implementation —
 * see `build.module.ts`'s pre-existing `terminateRunningExecutions`) tears an execution down with no
 * chance for its own workflow code to run anything — Temporal only runs a workflow's `try/catch`/
 * `finally`/`CancellationScope.nonCancellable` cleanup (the mechanism a `human-task` node's open-task
 * -closing relies on, `question-emitters.ts`'s `closeActivitySignature` wrapper) on a genuine
 * **cancellation**, never on `terminate()`. So each open execution is now asked to cancel first
 * (`handle.cancel()`), given up to `graceMs` to actually finish, and only force-`terminate()`d if
 * it's still running after that.
 */

/** The minimal per-execution surface `terminateRunningExecutionsWith` needs — kept small for testability, same "real implementation wraps the SDK, unit tests inject a fake" posture as `k8s-deployments-client.ts`'s `IK8sDeploymentsClient`. */
export interface ITerminatableWorkflowHandle {
  /** Requests cancellation. A no-op (never throws) if the execution is already gone/completed — cancelling a race that finished on its own isn't an error. */
  cancel(): Promise<void>;
  /** Whether the execution is still `Running` right now. `false` once it's completed/cancelled/failed/gone entirely (never throws on "not found"). */
  isRunning(): Promise<boolean>;
  /** Hard-terminates the execution. A no-op (never throws) if it's already gone. */
  terminate(reason: string): Promise<void>;
}

export interface ITerminateRunningExecutionsDeps {
  /** Every currently-`Running` execution on `taskQueue`, as of the moment this is called — the real implementation wraps `client.workflow.list(...)` + `getHandle(...)`. */
  listRunning(taskQueue: string): Promise<readonly ITerminatableWorkflowHandle[]>;
  /** Defaults to `Date.now` — overridable so a test can fast-forward the grace window without a real wait. */
  now?: () => number;
  /** Defaults to a real `setTimeout`-based sleep — overridable so a test's fast-forwarded `now()` doesn't also have to wait in real time. */
  sleep?: (ms: number) => Promise<void>;
}

/** How often `isRunning()` is repolled while waiting out the grace window. */
const POLL_INTERVAL_MS = 500;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Cancels every currently-running execution on `taskQueue`, waits up to `graceMs` for them to
 * actually finish (repolling `isRunning()` every `POLL_INTERVAL_MS`), then force-`terminate()`s
 * whatever's still running after that. Returns how many open executions were found — the same count
 * `IBuildResult.terminatedExecutionsCount`/`IStartedDevRun.terminatedExecutionsCount` have always
 * reported, regardless of whether a given one was actually cleaned up via cancel or the terminate
 * fallback.
 */
export const terminateRunningExecutionsWith = async (
  deps: ITerminateRunningExecutionsDeps,
  taskQueue: string,
  graceMs: number,
): Promise<number> => {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;

  const handles = await deps.listRunning(taskQueue);
  if (handles.length === 0) return 0;

  await Promise.all(handles.map((handle) => handle.cancel()));

  // Always checks at least once (even with `graceMs: 0`) before ever falling back to terminate —
  // a `handle.cancel()` that raced to completion synchronously shouldn't get terminated just
  // because the grace window happened to already be spent.
  const deadline = now() + graceMs;
  let pending = handles;
  // Deliberately sequential — each iteration's `isRunning()`/`sleep()` depends on the previous
  // iteration's own filtered `pending` list, not something `Promise.all` across iterations could
  // parallelize (the `no-await-in-loop` rule is about independent awaits, not a genuine poll loop).
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- see above.
    const stillRunning = await Promise.all(pending.map((handle) => handle.isRunning()));
    pending = pending.filter((_handle, index) => stillRunning[index]);
    if (pending.length === 0 || now() >= deadline) break;
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await sleep(POLL_INTERVAL_MS);
  }

  await Promise.all(pending.map((handle) => handle.terminate('dev rebuild: workflow code changed')));

  return handles.length;
};
