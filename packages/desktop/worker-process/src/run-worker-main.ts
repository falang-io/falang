import type { TWorkerOutboundMessage } from './protocol.js';

/**
 * The worker-side half of `run-in-worker-process.ts`'s protocol: waits for the one job message the
 * parent sends right after spawning, runs `handler`, and reports progress/result/error back over the
 * same IPC channel. Call this as the entire body of a worker entry point's `main.ts` — see
 * ADR 0019 (private)/ADR 0020 (private)'s "Implementation notes (export worker …)" for the two
 * concrete entry points that do this (`app-sketch`'s logic/code export worker, `app-arduino`'s sketch
 * compile worker).
 *
 * Deliberately does not call `process.exit()` on completion: `process.send`'s callback fires once the
 * message has actually been handed to the OS pipe, and only then is `process.disconnect()` called to
 * close the IPC channel — closing it is what lets the process exit naturally once nothing else keeps
 * the event loop alive, without risking truncating the just-sent message the way an immediate
 * `process.exit()` could.
 */
// `process.send`'s declared type requires `NodeJS.Serializable` (a fixed union of JSON-safe shapes) —
// too narrow for a generic message type callers instantiate freely, so it's cast once here to a
// loosely-typed function rather than fighting the overload at every call site. The runtime contract
// (JSON-serializable over the IPC channel) is unchanged; only the compile-time shape is relaxed.
// `.bind(process)` matters: `process.send` reads `this.connected` internally, so calling the
// extracted reference unbound (`this` then `undefined` in strict mode) throws inside Node's own
// implementation instead of sending anything.
const send = process.send?.bind(process) as
  | undefined
  | ((message: unknown, callback?: (error: Error | null) => void) => boolean);

export const runWorkerMain = <TJob, TProgress, TResult>(
  handler: (job: TJob, report: (progress: TProgress) => void) => Promise<TResult>,
): void => {
  process.once('message', (job: TJob) => {
    const report = (progress: TProgress): void => {
      const message: TWorkerOutboundMessage<TProgress, TResult> = { type: 'progress', progress };
      send?.(message);
    };
    const done = (message: TWorkerOutboundMessage<TProgress, TResult>): void => {
      send?.(message, () => process.disconnect?.());
    };
    handler(job, report).then(
      (workerResult) => done({ type: 'result', result: workerResult }),
      (error: unknown) => done({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
  });
};
