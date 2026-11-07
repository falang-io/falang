import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import type { IFileRef } from '../types.js';
import { FakeProcessSpawner } from './fake-process-spawner.test-utils.js';
import type { IFilesClient } from './files-client.js';
import { createJobRunner } from './job-runner.js';
import { JobStore } from './job-store.js';
import type { IJob } from './job-types.js';

const PNG_PROBE_JSON = JSON.stringify({
  streams: [{ codec_type: 'video', codec_name: 'png', width: 64, height: 64 }],
  format: { format_name: 'png_pipe' },
});

const baseInputs: readonly IFileRef[] = [{ id: 'input-file-id', name: 'photo.png' }];

const noopFilesClient: IFilesClient = {
  download: () => Promise.resolve(),
  upload: () => Promise.reject(new Error('not expected in this test')),
};

describe('job-runner binaries', () => {
  it('runs the configured ffprobe/ffmpeg binaries, without nice when none is available', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'media-runner-test-'));
    try {
      const spawner = new FakeProcessSpawner((call) => {
        queueMicrotask(() => {
          if (call.command === '/opt/ff/ffprobe') call.stdout.write(PNG_PROBE_JSON);
          call.finish(0);
        });
      });
      const runner = createJobRunner({
        filesClient: noopFilesClient,
        spawner,
        config: loadConfig(
          { MEDIA_WORK_DIR: workDir, MEDIA_FFMPEG_PATH: '/opt/ff/ffmpeg', MEDIA_FFPROBE_PATH: '/opt/ff/ffprobe' },
          'win32',
        ),
      });
      const job: IJob = new JobStore().createJob(
        { projectId: 'p1', op: 'media-image-resize', inputs: baseInputs, params: { width: 10 } },
        't1',
      );
      // The fake ffmpeg writes no output, so the upload step throws — only the spawned commands matter here.
      await runner.run(job).catch(() => null);
      expect(spawner.calls.map((call) => call.command)).toEqual(['/opt/ff/ffprobe', '/opt/ff/ffmpeg']);
      expect(spawner.calls[1].args[0]).toBe('-nostdin');
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});
