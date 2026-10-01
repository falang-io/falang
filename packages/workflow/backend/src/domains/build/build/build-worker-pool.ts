// oxlint-disable unicorn/prefer-module -- this package is CommonJS (package.json "type"); __dirname is the correct tool here, not ESM's import.meta.
import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { IBuildJob, TBuildJobResult } from './build-job.js';
import type { TBuildWorkerReply } from './build-worker.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OLD_SPACE_MB = 1536;
const DEFAULT_CONCURRENCY = 2;
const STDERR_TAIL_BYTES = 4096;

/** The backend package's own directory — the build process's `cwd`, so `tsx` and the repo's `node_modules` resolve exactly as they do for the backend itself. */
const PACKAGE_ROOT = join(__dirname, '..', '..', '..', '..');
const DEFAULT_WORKER_ENTRY = join(__dirname, 'build-worker.ts');

export interface IBuildWorkerOptions {
  /** Kill the process after this long. Default `BUILD_WORKER_TIMEOUT_MS` or 120 s. */
  readonly timeoutMs?: number;
  /** V8 old-space limit of the process, in MB. Default `BUILD_WORKER_MAX_OLD_SPACE_MB` or 1536. */
  readonly maxOldSpaceMb?: number;
  /** Test seam: a different entry file speaking the same IPC protocol. */
  readonly workerEntry?: string;
}

const readPositiveInt = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * The child's whole environment. Deliberately NOT `process.env`: the backend holds the database
 * URL, JWT secret, `CREDENTIALS_ENCRYPTION_KEY`, S3 keys, … and the code that runs here (tsc,
 * webpack, resolving tenant-influenced module graphs) must never be able to read them.
 */
const buildChildEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', TMPDIR: '/tmp' };
  // tsx's own, non-secret setting (the backend's `start` script sets it relative to its cwd).
  const tsconfigPath = process.env.TSX_TSCONFIG_PATH;
  if (tsconfigPath) {
    const absolute = resolve(tsconfigPath);
    if (existsSync(absolute)) env.TSX_TSCONFIG_PATH = absolute;
  }
  return env;
};

// A tiny FIFO semaphore: type-check + webpack is the heaviest thing the backend does, and each job
// is its own OS process with its own memory limit, so unbounded parallelism would be an easy way to
// exhaust the pod. Concurrency is read per acquire so tests/operators can change it without restart.
const waiters: (() => void)[] = [];
let running = 0;

const acquire = async (): Promise<void> => {
  if (running < readPositiveInt('BUILD_WORKER_CONCURRENCY', DEFAULT_CONCURRENCY)) {
    running += 1;
    return;
  }
  await new Promise<void>((resolveWaiter) => {
    waiters.push(resolveWaiter);
  });
};

const release = (): void => {
  const next = waiters.shift();
  if (next) {
    // Hands the slot straight over; `running` stays as is.
    next();
  } else {
    running -= 1;
  }
};

const runOnce = (job: IBuildJob, options: IBuildWorkerOptions): Promise<TBuildJobResult> =>
  new Promise((resolvePromise, reject) => {
    const timeoutMs = options.timeoutMs ?? readPositiveInt('BUILD_WORKER_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    const maxOldSpaceMb = options.maxOldSpaceMb ?? readPositiveInt('BUILD_WORKER_MAX_OLD_SPACE_MB', DEFAULT_MAX_OLD_SPACE_MB);
    const child = fork(options.workerEntry ?? DEFAULT_WORKER_ENTRY, [], {
      cwd: PACKAGE_ROOT,
      env: buildChildEnv(),
      execArgv: ['--import', 'tsx', `--max-old-space-size=${maxOldSpaceMb}`],
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });

    let stderrTail = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_BYTES);
    });

    let settled = false;
    const timer: { handle: NodeJS.Timeout | null } = { handle: null };
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer.handle) clearTimeout(timer.handle);
      action();
    };

    timer.handle = setTimeout(() => {
      finish(() => reject(new Error(`Build timed out after ${timeoutMs} ms and was killed`)));
      child.kill('SIGKILL');
    }, timeoutMs);

    child.once('message', (message: TBuildWorkerReply) => {
      finish(() => (message.ok ? resolvePromise(message.result) : reject(new Error(message.error))));
    });
    child.once('error', (error) => finish(() => reject(error)));
    child.once('exit', (code, signal) => {
      finish(() =>
        reject(new Error(`Build process exited unexpectedly (${signal ?? `code ${code}`})${stderrTail ? `: ${stderrTail.trim()}` : ''}`)),
      );
    });
    child.send(job);
  });

/**
 * Runs one build job in a fresh, disposable child process (one per build, never reused) with an
 * empty environment, a V8 memory limit, a kill timeout and a global concurrency cap
 * (`BUILD_WORKER_CONCURRENCY`, default 2; further builds queue). Rejects on timeout, crash/OOM, or an
 * unexpected exception inside the job; a project that merely fails to type-check is an ordinary
 * `{ kind: 'errors' }` result, not a rejection.
 *
 * NOT isolated: the child shares the backend's network namespace and filesystem view. Truly
 * isolating the tenant-influenced build (no network, read-only FS) needs its own pod — a k8s Job
 * per build — which is the follow-up recorded in the security audit's P0-7.
 */
export const runBuildWorker = async (job: IBuildJob, options: IBuildWorkerOptions = {}): Promise<TBuildJobResult> => {
  await acquire();
  try {
    return await runOnce(job, options);
  } finally {
    release();
  }
};
