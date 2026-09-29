import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import type { IFileRef, TWorkflowEnv } from '../types.js';
import { FakeProcessSpawner } from './fake-process-spawner.test-utils.js';
import type { IFilesClient } from './files-client.js';
import { createJobRunner } from './job-runner.js';
import { JobStore } from './job-store.js';
import type { IJob } from './job-types.js';

const PNG_PROBE_JSON = JSON.stringify({
  streams: [{ codec_type: 'video', codec_name: 'png', width: 64, height: 64 }],
  format: { format_name: 'png_pipe' },
});

const UNSUPPORTED_PROBE_JSON = JSON.stringify({
  streams: [{ codec_type: 'video', codec_name: 'mpeg2video' }],
  format: { format_name: 'mpeg' },
});

class FakeFilesClient implements IFilesClient {
  readonly downloaded: { readonly projectId: string; readonly fileId: string; readonly token: string }[] = [];
  readonly uploaded: {
    readonly projectId: string;
    readonly token: string;
    readonly fileName: string;
    readonly contentType: string;
    readonly createdBy: string;
    readonly workflowEnv: TWorkflowEnv | undefined;
    readonly ttlSeconds: number | undefined;
  }[] = [];

  private readonly writeFakeInputContent: string;

  constructor(writeFakeInputContent = 'fake-input-bytes') {
    this.writeFakeInputContent = writeFakeInputContent;
  }

  async download(projectId: string, fileId: string, token: string, destPath: string): Promise<void> {
    this.downloaded.push({ projectId, fileId, token });
    await writeFile(destPath, this.writeFakeInputContent);
  }

  async upload(
    projectId: string,
    token: string,
    filePath: string,
    fileName: string,
    contentType: string,
    createdBy: string,
    workflowEnv: TWorkflowEnv | undefined,
    ttlSeconds: number | undefined,
  ): Promise<IFileRef> {
    // Asserts the runner actually wrote something before uploading.
    await readFile(filePath);
    this.uploaded.push({ projectId, token, fileName, contentType, createdBy, workflowEnv, ttlSeconds });
    return { id: 'uploaded-file-id', name: fileName, mime: contentType };
  }
}

const baseInputs: readonly IFileRef[] = [{ id: 'input-file-id', name: 'photo.png' }];

describe('job-runner', () => {
  it('runs media-probe without ever spawning ffmpeg', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'media-runner-test-'));
    try {
      const spawner = new FakeProcessSpawner((call) => {
        queueMicrotask(() => {
          call.stdout.write(PNG_PROBE_JSON);
          call.finish(0);
        });
      });
      const filesClient = new FakeFilesClient();
      const runner = createJobRunner({ filesClient, spawner, config: loadConfig({ MEDIA_WORK_DIR: workDir }) });
      const store = new JobStore();
      const job: IJob = store.createJob(
        { projectId: 'p1', op: 'media-probe', inputs: baseInputs, params: {} },
        't1',
      );
      await runner.run(job);
      expect(job.status).toBe('done');
      expect(job.result).toEqual({ duration: 0, width: 64, height: 64, videoCodec: 'png', audioCodec: '', bitrate: 0, mime: 'image/png' });
      expect(spawner.calls.map((call) => call.command)).toEqual(['ffprobe']);
      expect(filesClient.uploaded).toHaveLength(0);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('fails the job when ffprobe reports an unsupported codec, without ever calling nice/ffmpeg', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'media-runner-test-'));
    try {
      const spawner = new FakeProcessSpawner((call) => {
        queueMicrotask(() => {
          call.stdout.write(UNSUPPORTED_PROBE_JSON);
          call.finish(0);
        });
      });
      const filesClient = new FakeFilesClient();
      const runner = createJobRunner({ filesClient, spawner, config: loadConfig({ MEDIA_WORK_DIR: workDir }) });
      const store = new JobStore();
      const job: IJob = store.createJob(
        { projectId: 'p1', op: 'media-image-resize', inputs: baseInputs, params: { format: 'jpeg', quality: 80 } },
        't1',
      );
      await runner.run(job);
      expect(job.status).toBe('failed');
      expect(job.error).toContain('unsupported input');
      expect(spawner.calls.map((call) => call.command)).toEqual(['ffprobe']);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('runs an ffmpeg op end to end and uploads the result', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'media-runner-test-'));
    try {
      const spawner = new FakeProcessSpawner((call) => {
        if (call.command === 'ffprobe') {
          queueMicrotask(() => {
            call.stdout.write(PNG_PROBE_JSON);
            call.finish(0);
          });
          return;
        }
        // the "nice -n 10 ffmpeg ..." call: write the output file ourselves (standing in for a real
        // encode) and report a clean exit.
        queueMicrotask(async () => {
          const outputPath = call.args.at(-1) as string;
          await writeFile(outputPath, 'fake-encoded-bytes');
          call.stdout.write('progress=end\n');
          call.finish(0);
        });
      });
      const filesClient = new FakeFilesClient();
      const runner = createJobRunner({ filesClient, spawner, config: loadConfig({ MEDIA_WORK_DIR: workDir }) });
      const store = new JobStore();
      const job: IJob = store.createJob(
        {
          projectId: 'p1',
          op: 'media-image-resize',
          inputs: baseInputs,
          params: { width: 32, format: 'webp', quality: 60 },
          workflowEnv: 'dev',
          ttlSeconds: 3600,
        },
        't1',
      );
      await runner.run(job);
      expect(job.status).toBe('done');
      expect(job.progress).toBe(1);
      expect(job.result).toEqual({ id: 'uploaded-file-id', name: 'photo.resized.webp', mime: 'image/webp' });
      expect(spawner.calls.map((call) => call.command)).toEqual(['ffprobe', 'nice']);
      expect(filesClient.uploaded[0]).toMatchObject({
        fileName: 'photo.resized.webp',
        contentType: 'image/webp',
        createdBy: 'media:media-image-resize',
        workflowEnv: 'dev',
        ttlSeconds: 3600,
      });
      const niceArgv = spawner.calls[1].args;
      expect(niceArgv[0]).toBe('-n');
      expect(niceArgv[1]).toBe('10');
      expect(niceArgv[2]).toBe('ffmpeg');
      expect(niceArgv).toContain('-protocol_whitelist');
      expect(niceArgv).toContain('-fs');
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('fails the job when ffmpeg exits non-zero', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'media-runner-test-'));
    try {
      const spawner = new FakeProcessSpawner((call) => {
        if (call.command === 'ffprobe') {
          queueMicrotask(() => {
            call.stdout.write(PNG_PROBE_JSON);
            call.finish(0);
          });
          return;
        }
        queueMicrotask(() => {
          call.stderr.write('ffmpeg: something went wrong');
          call.finish(1);
        });
      });
      const filesClient = new FakeFilesClient();
      const runner = createJobRunner({ filesClient, spawner, config: loadConfig({ MEDIA_WORK_DIR: workDir }) });
      const store = new JobStore();
      const job: IJob = store.createJob(
        { projectId: 'p1', op: 'media-image-convert', inputs: baseInputs, params: { format: 'png', quality: 80 } },
        't1',
      );
      await runner.run(job);
      expect(job.status).toBe('failed');
      expect(job.error).toContain('something went wrong');
      expect(filesClient.uploaded).toHaveLength(0);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('marks the job cancelled (not failed) when ffmpeg is killed mid-run', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'media-runner-test-'));
    try {
      const store = new JobStore();
      const job: IJob = store.createJob(
        { projectId: 'p1', op: 'media-image-convert', inputs: baseInputs, params: { format: 'png', quality: 80 } },
        't1',
      );
      const spawner = new FakeProcessSpawner((call) => {
        if (call.command === 'ffprobe') {
          queueMicrotask(() => {
            call.stdout.write(PNG_PROBE_JSON);
            call.finish(0);
          });
          return;
        }
        // Never call finish() on our own — simulate `job.kill()` triggering it, same as JobQueue.cancel would.
        queueMicrotask(() => {
          job.cancelRequested = true;
          job.kill?.();
        });
      });
      const filesClient = new FakeFilesClient();
      const runner = createJobRunner({ filesClient, spawner, config: loadConfig({ MEDIA_WORK_DIR: workDir }) });
      await runner.run(job);
      expect(job.status).toBe('cancelled');
      expect(filesClient.uploaded).toHaveLength(0);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});
