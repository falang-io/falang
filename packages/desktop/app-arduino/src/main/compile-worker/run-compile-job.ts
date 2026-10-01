import { runInWorkerProcess } from '@falang/desktop-worker-process';
import type {
  ICompileWorkerJob,
  IValidateDriversWorkerJob,
  IValidateDriversWorkerResult,
  TCompileWorkerResult,
  TWorkerJob,
  TWorkerResult,
} from '../../shared/compile-worker-protocol.js';
import { resolveCompileWorkerCommand } from './resolve-compile-worker-command.js';

const runInWorker = (job: TWorkerJob): Promise<TWorkerResult> =>
  runInWorkerProcess<TWorkerJob, never, TWorkerResult>({ command: resolveCompileWorkerCommand(), job }).result;

/**
 * Runs one sketch compile in a disposable worker process instead of blocking `main`'s own event loop
 * (see ADR 0020 (private)'s "Implementation notes (compile worker …)"). No `requestId`/cancel
 * plumbing, unlike `app-sketch`'s equivalent `run-export-job.ts`: a sketch compile is one atomic step
 * (setup+loop, no per-item fan-out to report progress over) inside a build/upload flow whose own
 * `busy` spinner (`build-panel-modal.tsx`) already covers the wait — nothing in this app currently
 * offers a way to cancel a build/upload in flight.
 */
export const runCompileJob = async (job: ICompileWorkerJob): Promise<TCompileWorkerResult> =>
  (await runInWorker(job)) as TCompileWorkerResult;

/** Driver-bundle validation (ADR 0054 (private)) in the same worker process, so the TS-compile stage never blocks `main`. */
export const runValidateDriversJob = async (
  job: Omit<IValidateDriversWorkerJob, 'kind'>,
): Promise<IValidateDriversWorkerResult> =>
  (await runInWorker({ kind: 'validate-drivers', ...job })) as IValidateDriversWorkerResult;
