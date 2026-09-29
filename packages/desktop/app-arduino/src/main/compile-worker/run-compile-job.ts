import { runInWorkerProcess } from '@falang/desktop-worker-process';
import type { ICompileWorkerJob, TCompileWorkerResult } from '../../shared/compile-worker-protocol.js';
import { resolveCompileWorkerCommand } from './resolve-compile-worker-command.js';

/**
 * Runs one sketch compile in a disposable worker process instead of blocking `main`'s own event loop
 * (see ADR 0020 (private)'s "Implementation notes (compile worker …)"). No `requestId`/cancel
 * plumbing, unlike `app-sketch`'s equivalent `run-export-job.ts`: a sketch compile is one atomic step
 * (setup+loop, no per-item fan-out to report progress over) inside a build/upload flow whose own
 * `busy` spinner (`build-panel-modal.tsx`) already covers the wait — nothing in this app currently
 * offers a way to cancel a build/upload in flight.
 */
export const runCompileJob = (job: ICompileWorkerJob): Promise<TCompileWorkerResult> =>
  runInWorkerProcess<ICompileWorkerJob, never, TCompileWorkerResult>({
    command: resolveCompileWorkerCommand(),
    job,
  }).result;
