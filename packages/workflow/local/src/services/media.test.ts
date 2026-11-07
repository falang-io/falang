// oxlint-disable init-declarations -- test code
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findFreePort } from '../temporal/temporal-dev-server.js';
import {
  buildMediaEnv,
  buildMediaUrls,
  createMediaService,
  defaultMediaEntry,
  resolveFfmpegBinaries,
  type IFfmpegBinaries,
} from './media.js';
import type { ILocalServiceContext, ILocalServiceHandle } from './types.js';

const only =
  (...files: string[]) =>
  (file: string): Promise<boolean> =>
    Promise.resolve(files.includes(file));

describe('resolveFfmpegBinaries', () => {
  it('finds both on PATH, in PATH order', async () => {
    const result = await resolveFfmpegBinaries({
      env: { PATH: '/a:/b:/c' },
      platform: 'linux',
      isExecutable: only('/b/ffmpeg', '/c/ffmpeg', '/c/ffprobe'),
    });
    expect(result).toEqual({ ffmpeg: '/b/ffmpeg', ffprobe: '/c/ffprobe' });
  });

  it('uses .exe names and the Path key on Windows', async () => {
    const dir = String.raw`C:\ff\bin`;
    const result = await resolveFfmpegBinaries({
      env: { Path: `${dir};C:\\other` },
      platform: 'win32',
      isExecutable: only(path.join(dir, 'ffmpeg.exe'), path.join(dir, 'ffprobe.exe')),
    });
    expect(result).toEqual({ ffmpeg: path.join(dir, 'ffmpeg.exe'), ffprobe: path.join(dir, 'ffprobe.exe') });
  });

  it('prefers FALANG_FFMPEG / FALANG_FFPROBE over PATH', async () => {
    const result = await resolveFfmpegBinaries({
      env: { PATH: '/usr/bin', FALANG_FFMPEG: '/opt/a/ffmpeg', FALANG_FFPROBE: '/opt/b/probe' },
      platform: 'linux',
      isExecutable: only('/usr/bin/ffmpeg', '/usr/bin/ffprobe', '/opt/a/ffmpeg', '/opt/b/probe'),
    });
    expect(result).toEqual({ ffmpeg: '/opt/a/ffmpeg', ffprobe: '/opt/b/probe' });
  });

  it('takes the ffprobe next to an explicit FALANG_FFMPEG before PATH', async () => {
    const result = await resolveFfmpegBinaries({
      env: { PATH: '/usr/bin', FALANG_FFMPEG: '/opt/ff/ffmpeg' },
      platform: 'linux',
      isExecutable: only('/usr/bin/ffprobe', '/opt/ff/ffmpeg', '/opt/ff/ffprobe'),
    });
    expect(result.ffprobe).toBe('/opt/ff/ffprobe');
  });

  it('rejects an explicit path that is not executable instead of falling back to PATH', async () => {
    await expect(
      resolveFfmpegBinaries({
        env: { PATH: '/usr/bin', FALANG_FFMPEG: '/nope/ffmpeg' },
        platform: 'linux',
        isExecutable: only('/usr/bin/ffmpeg', '/usr/bin/ffprobe'),
      }),
    ).rejects.toThrow(/FALANG_FFMPEG=\/nope\/ffmpeg is not an executable file; install FFmpeg/);
  });

  it('names the missing binary and how to install it', async () => {
    await expect(
      resolveFfmpegBinaries({ env: { PATH: '/usr/bin' }, platform: 'linux', isExecutable: only('/usr/bin/ffmpeg') }),
    ).rejects.toThrow(/`ffprobe` was not found on PATH; install FFmpeg .*apt install ffmpeg/);
  });
});

describe('media env', () => {
  const binaries: IFfmpegBinaries = { ffmpeg: '/x/ffmpeg', ffprobe: '/x/ffprobe' };

  it('builds the service environment', () => {
    expect(
      buildMediaEnv({ port: 4321, backendInternalUrl: 'http://127.0.0.1:3001', workDir: '/data/media', binaries }),
    ).toEqual({
      PORT: '4321',
      BACKEND_INTERNAL_URL: 'http://127.0.0.1:3001',
      MEDIA_WORK_DIR: '/data/media',
      MEDIA_FFMPEG_PATH: '/x/ffmpeg',
      MEDIA_FFPROBE_PATH: '/x/ffprobe',
    });
  });

  it('gives the backend MEDIA_SERVICE_URL and the tests MEDIA_URL', () => {
    expect(buildMediaUrls(4321)).toEqual({
      backendEnv: { MEDIA_SERVICE_URL: 'http://127.0.0.1:4321' },
      testEnv: { MEDIA_URL: 'http://127.0.0.1:4321' },
    });
  });

  it('resolves the media package entry point', () => {
    expect(existsSync(defaultMediaEntry())).toBe(true);
  });
});

/** Stands in for `@falang/workflow-media`: serves /health on PORT and dumps the env it got. */
const FAKE_MEDIA = `
const http = require('node:http');
const fs = require('node:fs');
fs.writeFileSync(process.env.ENV_DUMP, JSON.stringify(process.env));
http.createServer((req, res) => res.end(JSON.stringify({ ok: true }))).listen(Number(process.env.PORT), '127.0.0.1');
`;

describe('createMediaService', () => {
  let dir: string;
  let handle: ILocalServiceHandle | null = null;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'falang-media-service-'));
  });
  afterEach(async () => {
    await handle?.stop();
    handle = null;
    await rm(dir, { recursive: true, force: true });
  });

  const context = (childEnv: NodeJS.ProcessEnv): ILocalServiceContext => ({
    name: 'media',
    dataDir: dir,
    rootDataDir: dir,
    log: () => null,
    findFreePort: (host) => findFreePort(host),
    publicUrl: 'http://localhost:4000',
    internalUrl: 'http://127.0.0.1:4001',
    testMode: true,
    childEnv,
    getSecret: () => Promise.reject(new Error('not used')),
  });

  it('starts the entry with the media env and reports its URL', async () => {
    const entry = path.join(dir, 'fake-media.cjs');
    await writeFile(entry, FAKE_MEDIA);
    const dump = path.join(dir, 'env.json');
    const service = createMediaService({
      entry: () => entry,
      resolveBinaries: () => Promise.resolve({ ffmpeg: '/x/ffmpeg', ffprobe: '/x/ffprobe' }),
    });
    handle = await service.start(context({ ...process.env, ENV_DUMP: dump }));
    expect(handle.capabilities).toEqual(['media']);
    const url = handle.backendEnv?.MEDIA_SERVICE_URL ?? '';
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(handle.testEnv).toEqual({ MEDIA_URL: url });
    const env = JSON.parse(await readFile(dump, 'utf8')) as Record<string, string>;
    expect(env).toMatchObject({
      PORT: url.split(':').at(-1),
      BACKEND_INTERNAL_URL: 'http://127.0.0.1:4001',
      MEDIA_WORK_DIR: dir,
      MEDIA_FFMPEG_PATH: '/x/ffmpeg',
      MEDIA_FFPROBE_PATH: '/x/ffprobe',
    });
    const health = await fetch(`${url}/health`);
    expect(health.status).toBe(200);
  });

  it('fails before spawning anything when ffmpeg is missing', async () => {
    const service = createMediaService({
      entry: () => {
        throw new Error('must not be reached');
      },
      resolveBinaries: () => Promise.reject(new Error('media: `ffmpeg` was not found on PATH')),
    });
    await expect(service.start(context(process.env))).rejects.toThrow(/ffmpeg` was not found/);
  });
});
