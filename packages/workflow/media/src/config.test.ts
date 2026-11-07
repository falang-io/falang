import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, resolveNiceCommand } from './config.js';

describe('loadConfig — ffmpeg binaries', () => {
  it('defaults to ffmpeg/ffprobe from PATH', () => {
    const config = loadConfig({});
    expect(config.ffmpegPath).toBe('ffmpeg');
    expect(config.ffprobePath).toBe('ffprobe');
  });

  it('takes MEDIA_FFMPEG_PATH / MEDIA_FFPROBE_PATH', () => {
    const config = loadConfig({ MEDIA_FFMPEG_PATH: '/opt/ff/ffmpeg', MEDIA_FFPROBE_PATH: '/opt/ff/ffprobe' });
    expect(config.ffmpegPath).toBe('/opt/ff/ffmpeg');
    expect(config.ffprobePath).toBe('/opt/ff/ffprobe');
  });

  it('ignores blank paths', () => {
    const config = loadConfig({ MEDIA_FFMPEG_PATH: '  ', MEDIA_FFPROBE_PATH: '' });
    expect(config.ffmpegPath).toBe('ffmpeg');
    expect(config.ffprobePath).toBe('ffprobe');
  });

  it('never uses nice on Windows', () => {
    expect(loadConfig({ PATH: process.env.PATH }, 'win32').niceCommand).toBeNull();
  });
});

describe('resolveNiceCommand', () => {
  const pathEnv = ['/a', '/b'].join(path.delimiter);

  it('returns null on win32 without looking at PATH', () => {
    let looked = false;
    const result = resolveNiceCommand({
      platform: 'win32',
      pathEnv,
      isExecutable: () => {
        looked = true;
        return true;
      },
    });
    expect(result).toBeNull();
    expect(looked).toBe(false);
  });

  it('returns the bare name when nice is on PATH', () => {
    const checked: string[] = [];
    const result = resolveNiceCommand({
      platform: 'linux',
      pathEnv,
      isExecutable: (file) => {
        checked.push(file);
        return file === path.join('/b', 'nice');
      },
    });
    expect(result).toBe('nice');
    expect(checked).toEqual([path.join('/a', 'nice'), path.join('/b', 'nice')]);
  });

  it('returns null when nice is not found (or PATH is empty)', () => {
    expect(resolveNiceCommand({ platform: 'darwin', pathEnv, isExecutable: () => false })).toBeNull();
    expect(resolveNiceCommand({ platform: 'linux', pathEnv: '', isExecutable: () => true })).toBeNull();
  });
});
