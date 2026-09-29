import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IFileRef } from '@falang/workflow-integrations-files';
import { runMediaJob } from './media-job-client.js';

const stubEnv = (): void => {
  vi.stubEnv('MEDIA_SERVICE_URL', 'http://media.test');
  vi.stubEnv('INTERNAL_PROJECT_TOKEN', 'ptok');
  vi.stubEnv('PROJECT_ID', 'project-1');
};

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response;

const inputFile: IFileRef = { id: 'file-1', name: 'clip.mp4', size: 2048, mime: 'video/mp4' };

beforeEach(() => {
  stubEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('runMediaJob', () => {
  it('creates a job, polls until done, heartbeats progress, and returns the result', async () => {
    vi.useFakeTimers();
    const heartbeat = vi.fn();
    const outputFile: IFileRef = { id: 'file-2', name: 'clip.thumb.jpg', size: 512, mime: 'image/jpeg' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(202, { jobId: 'job-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'running', progress: 0.4 }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'done', result: outputFile }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = runMediaJob('media-video-thumbnail', [inputFile], { at: 0 }, { heartbeat, jobKey: 'wf:run:act-1' });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual(outputFile);
    expect(heartbeat).toHaveBeenCalledWith(0.4);
    // The final `done` poll's own body carries no `progress` field — heartbeat is still called, with
    // that field's value passed through as-is (`job.progress`), matching `@temporalio/activity`'s
    // `heartbeat(details?: unknown)` signature.
    expect(heartbeat).toHaveBeenCalledTimes(2);

    const [createUrl, createInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(createUrl).toBe('http://media.test/jobs');
    expect(createInit.method).toBe('POST');
    expect(createInit.headers['x-internal-project-token']).toBe('ptok');
    const body = JSON.parse(createInit.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ projectId: 'project-1', op: 'media-video-thumbnail', jobKey: 'wf:run:act-1' });

    const [pollUrl] = fetchMock.mock.calls[1] as [string];
    expect(pollUrl).toBe('http://media.test/jobs/job-1?projectId=project-1');
  });

  it("rejects with the job's own error when it reports failed", async () => {
    const heartbeat = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(202, { jobId: 'job-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'failed', error: 'ffmpeg exited with code 1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runMediaJob('media-video-trim', [inputFile], {}, { heartbeat, jobKey: 'k' })).rejects.toThrow(
      'ffmpeg exited with code 1',
    );
  });

  it('cancels the job (DELETE) and rejects once the cancellation signal aborts', async () => {
    vi.useFakeTimers();
    const heartbeat = vi.fn();
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(202, { jobId: 'job-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'running', progress: 0.1 }))
      .mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const promise = runMediaJob(
      'media-video-transcode',
      [inputFile],
      {},
      { heartbeat, jobKey: 'k', cancellationSignal: controller.signal },
    );
    // Let the create call + first poll resolve, reaching the post-poll `delay()`.
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();

    await expect(promise).rejects.toThrow('cancelled');
    const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect((deleteCall?.[0] as string) ?? '').toBe('http://media.test/jobs/job-1?projectId=project-1');
  });

  it('rejects with the status text when job creation is rejected with 429', async () => {
    const heartbeat = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(429, { message: 'too many jobs' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(runMediaJob('media-probe', [inputFile], {}, { heartbeat, jobKey: 'k' })).rejects.toThrow('429');
  });

  it('throws when MEDIA_SERVICE_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured', async () => {
    vi.unstubAllEnvs();
    const heartbeat = vi.fn();
    await expect(runMediaJob('media-probe', [inputFile], {}, { heartbeat, jobKey: 'k' })).rejects.toThrow(
      'not configured',
    );
  });
});
