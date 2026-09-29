// Test fixture only, run via `tsx` from `run-in-worker-process.test.ts` — never imported directly.
// Deliberately not colocated as a `.test.ts` file: vitest would otherwise try to run it as a suite.
import { runWorkerMain } from '../run-worker-main.js';

interface IEchoJob {
  readonly steps: number;
  /** 1-based step number to throw on, if any. */
  readonly failAt?: number;
  /** Delay between steps, so `cancel()` tests have time to kill the process mid-job. */
  readonly delayMs?: number;
}

interface IEchoProgress {
  readonly done: number;
  readonly total: number;
}

interface IEchoResult {
  readonly stepsCompleted: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

runWorkerMain<IEchoJob, IEchoProgress, IEchoResult>(async (job, report) => {
  for (let step = 1; step <= job.steps; step += 1) {
    // oxlint-disable-next-line no-await-in-loop -- deliberately sequential: each step must delay before the next, not run in parallel.
    if (job.delayMs) await sleep(job.delayMs);
    if (job.failAt === step) throw new Error(`failed at step ${step}`);
    report({ done: step, total: job.steps });
  }
  return { stepsCompleted: job.steps };
});
