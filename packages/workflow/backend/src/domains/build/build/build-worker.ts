// Entry point of the disposable build process — spawned once per build by `build-worker-pool.ts`,
// handles exactly one `IBuildJob` received over the IPC channel, replies and exits. Never imported
// by the backend itself (importing it would start listening on `process`).
import { runBuildJob, type IBuildJob, type TBuildJobResult } from './build-job.js';

export type TBuildWorkerReply =
  | { readonly ok: true; readonly result: TBuildJobResult }
  | { readonly ok: false; readonly error: string };

const reply = (message: TBuildWorkerReply): void => {
  // Exit explicitly once the reply is flushed: webpack can leave handles open that would keep a
  // naturally-exiting process alive until the parent's timeout kills it.
  // oxlint-disable-next-line unicorn/no-process-exit -- one job per disposable process; see above.
  process.send?.(message, () => process.exit(0));
};

process.once('message', (job: IBuildJob) => {
  runBuildJob(job).then(
    (result) => reply({ ok: true, result }),
    (error: unknown) => reply({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
});
