import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { FakeProcessSpawner } from './jobs/fake-process-spawner.test-utils.js';
import { JobQueue } from './jobs/job-queue.js';
import { JobStore } from './jobs/job-store.js';

const TOKEN = 'tok-1';
const PROJECT_ID = 'proj-1';

/** Fake `backend`: only (PROJECT_ID, TOKEN) and (OTHER_PROJECT, OTHER_TOKEN) are valid pairs. */
const fakeVerifier = (projectId: string, token: string): Promise<'ok' | 'denied' | 'unavailable'> => {
  if (token === 'backend-down') return Promise.resolve('unavailable');
  return Promise.resolve(
    (projectId === PROJECT_ID && token === TOKEN) || (projectId === 'proj-2' && token === 'tok-2') ? 'ok' : 'denied',
  );
};

const buildApp = (maxJobsPerProject = 2, maxConcurrentJobs = 4) => {
  const store = new JobStore();
  const spawner = new FakeProcessSpawner((call) => {
    // `GET /health` spawns `ffmpeg -version` — answer it, everything else (a real job run) is
    // never exercised by these tests, which only assert on the HTTP layer around job creation.
    queueMicrotask(() => {
      call.stdout.write('ffmpeg version 7.1.1 Copyright (c) 2000-2025 the FFmpeg developers\n');
      call.finish(0);
    });
  });
  const queue = new JobQueue(
    store,
    {
      run: () =>
        new Promise<void>(() => {
          // never resolves — these tests only assert on the HTTP layer around job creation
        }),
    },
    maxConcurrentJobs,
  );
  const app = createApp({ store, queue, spawner, maxJobsPerProject, verifyProjectToken: fakeVerifier });
  return { app, store, queue };
};

describe('GET /health', () => {
  it('reports ffmpeg version with no token required', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      ffmpeg: 'ffmpeg version 7.1.1 Copyright (c) 2000-2025 the FFmpeg developers',
    });
  });
});

describe('POST /jobs', () => {
  it('rejects a missing token', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/jobs')
      .send({ projectId: PROJECT_ID, op: 'media-probe', inputs: [{ id: 'f1', name: 'a.png' }] });
    expect(response.status).toBe(400);
  });

  it('rejects an unknown op', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/jobs')
      .set('x-internal-project-token', TOKEN)
      .send({ projectId: PROJECT_ID, op: 'media-hack-the-planet', inputs: [{ id: 'f1', name: 'a.png' }] });
    expect(response.status).toBe(400);
  });

  it("rejects params that don't match the op's schema", async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/jobs')
      .set('x-internal-project-token', TOKEN)
      .send({
        projectId: PROJECT_ID,
        op: 'media-video-transcode',
        inputs: [{ id: 'f1', name: 'a.mp4' }],
        params: { preset: 'gif', format: 'mp4' },
      });
    expect(response.status).toBe(400);
  });

  it('rejects a wrong number of inputs for the op', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/jobs')
      .set('x-internal-project-token', TOKEN)
      .send({ projectId: PROJECT_ID, op: 'media-video-concat', inputs: [{ id: 'f1', name: 'a.mp4' }], params: {} });
    expect(response.status).toBe(400);
  });

  it('accepts a valid request and returns 202 with a jobId', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post('/jobs')
      .set('x-internal-project-token', TOKEN)
      .send({ projectId: PROJECT_ID, op: 'media-probe', inputs: [{ id: 'f1', name: 'a.png' }] });
    expect(response.status).toBe(202);
    expect(typeof response.body.jobId).toBe('string');
  });

  it('returns the same jobId for a repeated jobKey instead of creating a new job', async () => {
    const { app } = buildApp();
    const body = { projectId: PROJECT_ID, op: 'media-probe', inputs: [{ id: 'f1', name: 'a.png' }], jobKey: 'run-1' };
    const first = await request(app).post('/jobs').set('x-internal-project-token', TOKEN).send(body);
    const second = await request(app).post('/jobs').set('x-internal-project-token', TOKEN).send(body);
    expect(second.status).toBe(202);
    expect(second.body.jobId).toBe(first.body.jobId);
  });

  it('returns 429 once the per-project cap is reached', async () => {
    const { app } = buildApp(1);
    const body = { projectId: PROJECT_ID, op: 'media-probe', inputs: [{ id: 'f1', name: 'a.png' }] };
    const first = await request(app).post('/jobs').set('x-internal-project-token', TOKEN).send(body);
    expect(first.status).toBe(202);
    const second = await request(app).post('/jobs').set('x-internal-project-token', TOKEN).send(body);
    expect(second.status).toBe(429);
  });
});

describe('GET /jobs/:jobId', () => {
  it('returns 404 for an unknown job', async () => {
    const { app } = buildApp();
    const response = await request(app)
      .get('/jobs/does-not-exist')
      .query({ projectId: PROJECT_ID })
      .set('x-internal-project-token', TOKEN);
    expect(response.status).toBe(404);
  });

  it('returns 401 when the token is not valid for the project', async () => {
    const { app, store } = buildApp();
    const job = store.createJob({ projectId: PROJECT_ID, op: 'media-probe', inputs: [], params: {} }, TOKEN);
    const response = await request(app)
      .get(`/jobs/${job.jobId}`)
      .query({ projectId: PROJECT_ID })
      .set('x-internal-project-token', 'wrong-token');
    expect(response.status).toBe(401);
  });

  it('returns 401 when the token is not valid for the claimed projectId', async () => {
    const { app, store } = buildApp();
    const job = store.createJob({ projectId: PROJECT_ID, op: 'media-probe', inputs: [], params: {} }, TOKEN);
    const response = await request(app)
      .get(`/jobs/${job.jobId}`)
      .query({ projectId: 'other-project' })
      .set('x-internal-project-token', TOKEN);
    expect(response.status).toBe(401);
  });

  it('returns the job status view for a matching token/projectId', async () => {
    const { app, store } = buildApp();
    const job = store.createJob({ projectId: PROJECT_ID, op: 'media-probe', inputs: [], params: {} }, TOKEN);
    job.status = 'running';
    job.progress = 0.5;
    const response = await request(app)
      .get(`/jobs/${job.jobId}`)
      .query({ projectId: PROJECT_ID })
      .set('x-internal-project-token', TOKEN);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'running', progress: 0.5 });
  });
});

describe('project token verification', () => {
  const body = { projectId: PROJECT_ID, op: 'media-probe', inputs: [{ id: 'f1', name: 'a.png' }] };

  it('POST /jobs rejects a token not valid for the claimed project (401)', async () => {
    const { app } = buildApp();
    const response = await request(app).post('/jobs').set('x-internal-project-token', 'tok-2').send(body);
    expect(response.status).toBe(401);
  });

  it('POST /jobs fails closed (503) when backend cannot verify', async () => {
    const { app } = buildApp();
    const response = await request(app).post('/jobs').set('x-internal-project-token', 'backend-down').send(body);
    expect(response.status).toBe(503);
  });

  it('counts the per-project cap by the verified project, not by a spoofed one', async () => {
    const { app } = buildApp(1);
    const first = await request(app).post('/jobs').set('x-internal-project-token', TOKEN).send(body);
    expect(first.status).toBe(202);
    const spoof = await request(app)
      .post('/jobs')
      .set('x-internal-project-token', 'tok-2')
      .send({ ...body, projectId: 'proj-2' });
    expect(spoof.status).toBe(202);
    const third = await request(app).post('/jobs').set('x-internal-project-token', TOKEN).send(body);
    expect(third.status).toBe(429);
  });

  it("another project's valid token gets 404 for a job it does not own", async () => {
    const { app, store } = buildApp();
    const job = store.createJob({ projectId: PROJECT_ID, op: 'media-probe', inputs: [], params: {} }, TOKEN);
    const response = await request(app)
      .get(`/jobs/${job.jobId}`)
      .query({ projectId: 'proj-2' })
      .set('x-internal-project-token', 'tok-2');
    expect(response.status).toBe(404);
  });

  it('rejects more than 10 inputs', async () => {
    const { app } = buildApp();
    const inputs = Array.from({ length: 11 }, (_, i) => ({ id: `f${i}`, name: 'a.mp4' }));
    const response = await request(app)
      .post('/jobs')
      .set('x-internal-project-token', TOKEN)
      .send({ projectId: PROJECT_ID, op: 'media-video-concat', inputs, params: {} });
    expect(response.status).toBe(400);
  });
});

describe('DELETE /jobs/:jobId', () => {
  it('returns 404 for an unowned job', async () => {
    const { app, store } = buildApp();
    const job = store.createJob({ projectId: PROJECT_ID, op: 'media-probe', inputs: [], params: {} }, TOKEN);
    const response = await request(app)
      .delete(`/jobs/${job.jobId}`)
      .query({ projectId: PROJECT_ID })
      .set('x-internal-project-token', 'wrong');
    expect(response.status).toBe(401);
  });

  it('cancels a queued job', async () => {
    const { app, store, queue } = buildApp(2, 1);
    const blocker = store.createJob({ projectId: PROJECT_ID, op: 'media-probe', inputs: [], params: {} }, TOKEN);
    // occupies the pool's single fake-runner slot forever
    queue.enqueue(blocker);
    const job = store.createJob({ projectId: PROJECT_ID, op: 'media-probe', inputs: [], params: {} }, TOKEN);
    queue.enqueue(job);
    expect(job.status).toBe('queued');

    const response = await request(app)
      .delete(`/jobs/${job.jobId}`)
      .query({ projectId: PROJECT_ID })
      .set('x-internal-project-token', TOKEN);
    expect(response.status).toBe(200);
    expect(job.status).toBe('cancelled');
  });
});
