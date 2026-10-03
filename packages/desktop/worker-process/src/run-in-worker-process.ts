import { spawn, type ChildProcess } from 'node:child_process';
import type { TWorkerOutboundMessage } from './protocol.js';

export interface IWorkerProcessCommand {
  readonly command: string;
  readonly args: readonly string[];
  /** Extra environment variables, layered over this process's own `process.env` (never replacing it). */
  readonly env?: Readonly<Record<string, string>>;
}

export interface IRunInWorkerProcessParams<TJob, TProgress> {
  readonly command: IWorkerProcessCommand;
  readonly job: TJob;
  readonly onProgress?: (progress: TProgress) => void;
}

export interface IWorkerProcessHandle<TResult> {
  /** Resolves with the worker's result; rejects on a worker-reported error, a crash, or `cancel()`. */
  readonly result: Promise<TResult>;
  /** Kills the underlying process. `result` then rejects with `WorkerCancelledError`. Safe to call
   * after the job has already settled (a no-op — the process is already gone). */
  readonly cancel: () => void;
}

export class WorkerCancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'WorkerCancelledError';
  }
}

/**
 * Runs one job in a fresh, disposable child process speaking the tiny protocol in `protocol.ts` over
 * Node's built-in `fork`-style IPC channel (`stdio: [..., 'ipc']` gives the same `send`/`'message'`
 * pair `child_process.fork()` would, but via `spawn` so `command`/`args` can point at `tsx <file>`
 * in dev or the packaged app's own binary in Node mode (`electronNodeCommand`) in a packaged build — same dev/packaged split `resolveMcpServerCommand`
 * already established for `@falang/desktop-mcp`, see ADR 0029 (private)).
 *
 * One process per call, not a pool: the work this exists for (project codegen, sketch compiles) is
 * triggered by a single user click, runs for seconds at most, and needs no state carried between
 * calls — spawning fresh means `cancel()` is just killing the process, no job-id bookkeeping, and a
 * worker that throws during its own module load (a real risk for a hand-bundled entry point) can
 * never wedge a shared pool for a later, unrelated call.
 */
export const runInWorkerProcess = <TJob, TProgress, TResult>({
  command,
  job,
  onProgress,
}: IRunInWorkerProcessParams<TJob, TProgress>): IWorkerProcessHandle<TResult> => {
  const child: ChildProcess = spawn(command.command, [...command.args], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    ...(command.env ? { env: { ...process.env, ...command.env } } : {}),
  });

  // Captured only for the "exited without ever reporting a result" error path below — never printed
  // on the happy path, so a well-behaved worker's own stray console output doesn't leak into the UI.
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  let settled = false;
  // Tracked locally rather than inferred from the child's exit `code`/`signal`: `command` may itself
  // spawn a further child (e.g. `tsx`'s own CLI forks a loader-hooked Node process), so a killed
  // top-level process doesn't reliably surface as `signal` being set on our own `exit` event — some
  // wrappers translate a received `SIGTERM` into a plain non-zero exit code instead. Knowing "we asked
  // for this" ourselves sidesteps that entirely.
  let cancelled = false;
  const result = new Promise<TResult>((resolve, reject) => {
    const settleOnce = (run: () => void): void => {
      if (settled) return;
      settled = true;
      run();
    };
    child.on('message', (message: TWorkerOutboundMessage<TProgress, TResult>) => {
      if (message.type === 'progress') {
        onProgress?.(message.progress);
        return;
      }
      if (message.type === 'result') {
        settleOnce(() => resolve(message.result));
        return;
      }
      settleOnce(() => reject(new Error(message.message)));
    });
    // `spawn` itself failing (e.g. `command` not on `PATH`) surfaces here, not as an 'exit'.
    child.on('error', (error) => settleOnce(() => reject(cancelled ? new WorkerCancelledError() : error)));
    // A clean result/error already resolved this promise via 'message' above (`settleOnce` no-ops on
    // the second call) — this only fires for a crash, an unhandled exception in the worker's own
    // entry module, or `cancel()`.
    child.on('exit', (code) => {
      settleOnce(() => {
        if (cancelled) {
          reject(new WorkerCancelledError());
          return;
        }
        reject(new Error(`Worker process exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`));
      });
    });
    // Same `Serializable`-vs-generic cast reasoning as `run-worker-main.ts`'s own `send` — `.call(child,
    // ...)` matters, an unbound extracted reference throws inside Node's own implementation instead.
    (child.send as (message: unknown) => boolean).call(child, job);
  });

  return {
    result,
    cancel: () => {
      cancelled = true;
      child.kill();
    },
  };
};
