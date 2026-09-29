import express from 'express';
import type { Express } from 'express';
import { createFfmpegVersionResolver } from './jobs/ffmpeg-version.js';
import type { IProcessSpawner } from './jobs/ffmpeg-process.js';
import type { JobQueue } from './jobs/job-queue.js';
import type { JobStore } from './jobs/job-store.js';
import { createJobsRouter } from './routes/jobs.router.js';

export interface ICreateAppDeps {
  readonly store: JobStore;
  readonly queue: JobQueue;
  readonly spawner: IProcessSpawner;
  readonly maxJobsPerProject: number;
}

/** Split out from `main.ts` so unit tests can exercise the routes (via `supertest`) without
 * binding a real port — mirrors `activepieces/src/app.ts`'s own `createApp` split. */
export const createApp = (deps: ICreateAppDeps): Express => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const resolveFfmpegVersion = createFfmpegVersionResolver(deps.spawner);
  app.get('/health', async (_req, res) => {
    try {
      res.status(200).json({ ok: true, ffmpeg: await resolveFfmpegVersion() });
    } catch {
      res.status(200).json({ ok: true, ffmpeg: 'unknown' });
    }
  });

  app.use(createJobsRouter({ store: deps.store, queue: deps.queue, maxJobsPerProject: deps.maxJobsPerProject }));

  return app;
};
