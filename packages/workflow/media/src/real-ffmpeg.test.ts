import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { NodeProcessSpawner } from './jobs/ffmpeg-process.js';
import type { IFilesClient } from './jobs/files-client.js';
import { createJobRunner } from './jobs/job-runner.js';
import { JobStore } from './jobs/job-store.js';
import type { IJob } from './jobs/job-types.js';
import { runFfprobe, toProbeInfo } from './ops/ffprobe-info.js';
import type { IFileRef, TWorkflowEnv } from './types.js';

const execFileAsync = promisify(execFile);

const ffmpegAvailable = await (async () => {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
})();

/** A files-client stand-in that reads/writes local files directly instead of doing real HTTP —
 * `job-runner.ts` itself doesn't know or care which `IFilesClient` it was given, so this exercises
 * the exact same download→probe→ffmpeg→upload pipeline `job-runner.test.ts` does with a fully fake
 * spawner, but here with the *real* `ffmpeg`/`ffprobe` binaries doing the actual work. */
class LocalFileFilesClient implements IFilesClient {
  readonly uploads: { readonly fileName: string; readonly contentType: string; readonly path: string }[] = [];
  private readonly sourceFiles: Readonly<Record<string, string>>;
  private readonly uploadDir: string;

  constructor(sourceFiles: Readonly<Record<string, string>>, uploadDir: string) {
    this.sourceFiles = sourceFiles;
    this.uploadDir = uploadDir;
  }

  async download(_projectId: string, fileId: string, _token: string, destPath: string): Promise<void> {
    const sourcePath = this.sourceFiles[fileId];
    if (!sourcePath) throw new Error(`no fixture registered for file id ${fileId}`);
    await writeFile(destPath, await readFile(sourcePath));
  }

  async upload(
    _projectId: string,
    _token: string,
    filePath: string,
    fileName: string,
    contentType: string,
    _createdBy: string,
    _workflowEnv: TWorkflowEnv | undefined,
    _ttlSeconds: number | undefined,
  ): Promise<IFileRef> {
    const destPath = join(this.uploadDir, fileName);
    await writeFile(destPath, await readFile(filePath));
    this.uploads.push({ fileName, contentType, path: destPath });
    return { id: fileName, name: fileName, mime: contentType };
  }
}

describe.skipIf(!ffmpegAvailable)('real ffmpeg pipeline (probe → resize → thumbnail → audio-extract)', () => {
  it('produces real, re-probeable output files', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'media-real-ffmpeg-'));
    const uploadDir = await mkdtemp(join(tmpdir(), 'media-real-ffmpeg-uploads-'));
    try {
      const imagePath = join(workDir, 'fixture.png');
      const videoPath = join(workDir, 'fixture.mp4');
      await execFileAsync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=red:s=64x64',
        '-frames:v',
        '1',
        imagePath,
      ]);
      await execFileAsync('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=128x128:rate=10:duration=1',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=44100:cl=mono:duration=1',
        '-shortest',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        videoPath,
      ]);

      const spawner = new NodeProcessSpawner();
      const filesClient = new LocalFileFilesClient({ 'image-fixture': imagePath, 'video-fixture': videoPath }, uploadDir);
      const config = loadConfig({ MEDIA_WORK_DIR: workDir, MEDIA_JOB_TIMEOUT_MS: '60000' });
      const runner = createJobRunner({ filesClient, spawner, config });
      const store = new JobStore();

      const probeJob: IJob = store.createJob(
        { projectId: 'p1', op: 'media-probe', inputs: [{ id: 'video-fixture', name: 'clip.mp4' }], params: {} },
        't1',
      );
      await runner.run(probeJob);
      expect(probeJob.status).toBe('done');
      const mediaInfo = probeJob.result as { duration: number; width: number; height: number; videoCodec: string; audioCodec: string };
      expect(mediaInfo.width).toBe(128);
      expect(mediaInfo.height).toBe(128);
      expect(mediaInfo.videoCodec).toBe('h264');
      expect(mediaInfo.audioCodec).toBe('aac');
      expect(mediaInfo.duration).toBeGreaterThan(0.5);

      const resizeJob: IJob = store.createJob(
        {
          projectId: 'p1',
          op: 'media-image-resize',
          inputs: [{ id: 'image-fixture', name: 'photo.png' }],
          params: { width: 32, format: 'webp', quality: 80 },
        },
        't1',
      );
      await runner.run(resizeJob);
      expect(resizeJob.status).toBe('done');
      const resizedRef = resizeJob.result as IFileRef;
      expect(resizedRef.name).toBe('photo.resized.webp');
      const resizedProbe = toProbeInfo(await runFfprobe(spawner, join(uploadDir, resizedRef.name)));
      expect(resizedProbe.width).toBe(32);
      expect(resizedProbe.height).toBe(32);
      expect(resizedProbe.videoCodec).toBe('webp');

      const thumbnailJob: IJob = store.createJob(
        {
          projectId: 'p1',
          op: 'media-video-thumbnail',
          inputs: [{ id: 'video-fixture', name: 'clip.mp4' }],
          params: { at: 0, width: 64 },
        },
        't1',
      );
      await runner.run(thumbnailJob);
      expect(thumbnailJob.status).toBe('done');
      const thumbnailRef = thumbnailJob.result as IFileRef;
      expect(thumbnailRef.name).toBe('clip.thumbnail.jpg');
      const thumbnailProbe = toProbeInfo(await runFfprobe(spawner, join(uploadDir, thumbnailRef.name)));
      expect(thumbnailProbe.width).toBe(64);
      expect(thumbnailProbe.videoCodec).toBe('mjpeg');

      const audioJob: IJob = store.createJob(
        {
          projectId: 'p1',
          op: 'media-audio-extract',
          inputs: [{ id: 'video-fixture', name: 'clip.mp4' }],
          params: { format: 'mp3' },
        },
        't1',
      );
      await runner.run(audioJob);
      expect(audioJob.status).toBe('done');
      const audioRef = audioJob.result as IFileRef;
      expect(audioRef.name).toBe('clip.audio.mp3');
      const audioProbe = toProbeInfo(await runFfprobe(spawner, join(uploadDir, audioRef.name)));
      expect(audioProbe.audioCodec).toBe('mp3');
      expect(audioProbe.videoCodec).toBeUndefined();
    } finally {
      await rm(workDir, { recursive: true, force: true });
      await rm(uploadDir, { recursive: true, force: true });
    }
  }, 60_000);
});
