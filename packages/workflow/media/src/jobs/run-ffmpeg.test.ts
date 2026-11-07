import { describe, expect, it } from 'vitest';
import { FakeProcessSpawner } from './fake-process-spawner.test-utils.js';
import { buildFfmpegCommand, runFfmpeg } from './run-ffmpeg.js';

describe('buildFfmpegCommand', () => {
  it('wraps ffmpeg in nice -n 10 when a nice command is given', () => {
    expect(buildFfmpegCommand(['-i', 'in.png'], '/opt/ffmpeg', 'nice')).toEqual({
      command: 'nice',
      args: ['-n', '10', '/opt/ffmpeg', '-i', 'in.png'],
    });
  });

  it('runs ffmpeg directly without nice', () => {
    expect(buildFfmpegCommand(['-i', 'in.png'], '/opt/ffmpeg', null)).toEqual({
      command: '/opt/ffmpeg',
      args: ['-i', 'in.png'],
    });
    expect(buildFfmpegCommand(['-version'])).toEqual({ command: 'ffmpeg', args: ['-version'] });
  });
});

describe('runFfmpeg', () => {
  const run = (spawner: FakeProcessSpawner, extra: { ffmpegPath?: string; niceCommand?: string | null }) =>
    runFfmpeg({
      spawner,
      argv: ['-i', 'x'],
      timeoutMs: 10_000,
      durationSeconds: 0,
      onProgress: () => null,
      registerKill: () => null,
      ...extra,
    });

  it('spawns the configured ffmpeg under nice', async () => {
    const spawner = new FakeProcessSpawner((call) => queueMicrotask(() => call.finish(0)));
    const result = await run(spawner, { ffmpegPath: 'C:/ff/ffmpeg.exe', niceCommand: 'nice' });
    expect(result.exitCode).toBe(0);
    expect(spawner.calls.map(({ command, args }) => ({ command, args }))).toEqual([
      { command: 'nice', args: ['-n', '10', 'C:/ff/ffmpeg.exe', '-i', 'x'] },
    ]);
  });

  it('spawns ffmpeg directly when nice is unavailable', async () => {
    const spawner = new FakeProcessSpawner((call) => queueMicrotask(() => call.finish(0)));
    await run(spawner, { ffmpegPath: 'C:/ff/ffmpeg.exe', niceCommand: null });
    expect(spawner.calls.map(({ command, args }) => ({ command, args }))).toEqual([
      { command: 'C:/ff/ffmpeg.exe', args: ['-i', 'x'] },
    ]);
  });
});
