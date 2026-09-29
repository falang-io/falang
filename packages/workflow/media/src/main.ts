import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { NodeProcessSpawner } from './jobs/ffmpeg-process.js';
import { createFilesClient } from './jobs/files-client.js';
import { JobQueue } from './jobs/job-queue.js';
import { createJobRunner } from './jobs/job-runner.js';
import { JobStore } from './jobs/job-store.js';

const config = loadConfig();
const store = new JobStore();
const spawner = new NodeProcessSpawner();
const filesClient = createFilesClient(config.backendInternalUrl);
const runner = createJobRunner({ filesClient, spawner, config });
const queue = new JobQueue(store, runner, config.maxConcurrentJobs);

const sweepTimer = setInterval(() => store.sweepFinished(), 5 * 60 * 1000);
sweepTimer.unref();

const app = createApp({ store, queue, spawner, maxJobsPerProject: config.maxJobsPerProject });
const server = app.listen(config.port, () => {
  // oxlint-disable-next-line no-console -- process-lifecycle log, this service has no logging framework yet.
  console.log(`@falang/workflow-media listening on :${config.port}`);
});

let shuttingDown = false;

/** Not `npx tsx`/a shell-form `CMD` — see `docker/media.Dockerfile` and
 * ADR 0016 (private)'s own runner-pod `SIGTERM` gotcha this mirrors:
 * a running job's ffmpeg child is killed here rather than left orphaned when the pod terminates. */
const shutdown = (): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(sweepTimer);
  server.close();
  for (const job of store.runningJobs()) job.kill?.();
};

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
