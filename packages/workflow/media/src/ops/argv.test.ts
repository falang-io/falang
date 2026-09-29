import { describe, expect, it } from 'vitest';
import { audioConvertOp } from './audio-convert.js';
import { audioExtractOp } from './audio-extract.js';
import { imageConvertOp } from './image-convert.js';
import { imageResizeOp } from './image-resize.js';
import { normalizeArgvResult } from './types.js';
import type { IMediaOpBuildContext, IMediaOpDefinition, IProbeInfo } from './types.js';
import { videoConcatOp } from './video-concat.js';
import { videoThumbnailOp } from './video-thumbnail.js';
import { videoTranscodeOp } from './video-transcode.js';
import { videoTrimOp } from './video-trim.js';

const imageProbe: IProbeInfo = {
  formatName: 'png_pipe',
  duration: 0,
  width: 64,
  height: 64,
  videoCodec: 'png',
  bitrate: 0,
  mime: 'image/png',
};

const videoProbe: IProbeInfo = {
  formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
  duration: 10,
  width: 1920,
  height: 1080,
  videoCodec: 'h264',
  audioCodec: 'aac',
  bitrate: 4_000_000,
  mime: 'video/mp4',
};

const buildArgv = (op: IMediaOpDefinition, rawParams: Record<string, unknown>, ctxOverrides: Partial<IMediaOpBuildContext>) => {
  const parsedParams = op.paramsSchema.parse(rawParams) as Record<string, unknown>;
  const ctx: IMediaOpBuildContext = {
    inputs: ['/work/input-0.bin'],
    output: '/work/output.bin',
    params: parsedParams,
    probes: [imageProbe],
    workDir: '/work',
    ...ctxOverrides,
  };
  const result = op.buildArgv?.(ctx);
  if (!result) throw new Error('op has no buildArgv');
  return normalizeArgvResult(result);
};

describe('image-resize argv', () => {
  it('scales contain and reencodes to webp', () => {
    const { argv } = buildArgv(imageResizeOp, { width: 200, height: 100, fit: 'contain', format: 'webp', quality: 70 }, {});
    expect(argv).toEqual([
      '-i',
      '/work/input-0.bin',
      '-vf',
      'scale=200:100:force_original_aspect_ratio=decrease',
      '-frames:v',
      '1',
      '-c:v',
      'libwebp',
      '-q:v',
      '70',
    ]);
  });

  it('scales cover with a crop filter', () => {
    const { argv } = buildArgv(imageResizeOp, { width: 200, height: 100, fit: 'cover', format: 'keep' }, {});
    expect(argv).toEqual([
      '-i',
      '/work/input-0.bin',
      '-vf',
      'scale=200:100:force_original_aspect_ratio=increase,crop=200:100',
      '-frames:v',
      '1',
    ]);
  });

  it('keeps original size when neither dimension is given', () => {
    const { argv } = buildArgv(imageResizeOp, { format: 'jpeg', quality: 50 }, {});
    expect(argv).toEqual(['-i', '/work/input-0.bin', '-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '50']);
  });
});

describe('image-convert argv', () => {
  it('re-encodes to png with no quality flag', () => {
    const { argv } = buildArgv(imageConvertOp, { format: 'png', quality: 85 }, {});
    expect(argv).toEqual(['-i', '/work/input-0.bin', '-frames:v', '1', '-c:v', 'png']);
  });
});

describe('video-trim argv', () => {
  it('stream-copies with -ss before -i', () => {
    const { argv } = buildArgv(videoTrimOp, { start: 5, duration: 3, reencode: false }, { probes: [videoProbe] });
    expect(argv).toEqual(['-ss', '5', '-t', '3', '-i', '/work/input-0.bin', '-c', 'copy']);
  });

  it('re-encodes when asked', () => {
    const { argv } = buildArgv(videoTrimOp, { start: 0, reencode: true }, { probes: [videoProbe] });
    expect(argv).toEqual([
      '-ss',
      '0',
      '-i',
      '/work/input-0.bin',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
    ]);
  });
});

describe('video-concat argv', () => {
  it('builds a concat-demuxer list file for stream copy', () => {
    const { argv, extraFiles } = buildArgv(
      videoConcatOp,
      { reencode: false },
      { inputs: ['/work/input-0.mp4', '/work/input-1.mp4'], probes: [videoProbe, videoProbe] },
    );
    expect(argv).toEqual(['-f', 'concat', '-safe', '0', '-i', '/work/concat-list.txt', '-c', 'copy']);
    expect(extraFiles).toEqual({ 'concat-list.txt': "file '/work/input-0.mp4'\nfile '/work/input-1.mp4'" });
  });

  it("escapes a single quote in a path (defense in depth, even though it's always our own temp path)", () => {
    const { extraFiles } = buildArgv(videoConcatOp, { reencode: false }, { inputs: ["/work/it's.mp4"], probes: [videoProbe] });
    expect(extraFiles?.['concat-list.txt']).toBe(String.raw`file '/work/it'\''s.mp4'`);
  });

  it('builds a filter_complex concat for reencode mode', () => {
    const { argv } = buildArgv(
      videoConcatOp,
      { reencode: true },
      { inputs: ['/work/input-0.mp4', '/work/input-1.mp4'], probes: [videoProbe, videoProbe] },
    );
    expect(argv).toEqual([
      '-i',
      '/work/input-0.mp4',
      '-i',
      '/work/input-1.mp4',
      '-filter_complex',
      '[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[outv][outa]',
      '-map',
      '[outv]',
      '-map',
      '[outa]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
    ]);
  });
});

describe('video-thumbnail argv', () => {
  it('seeks and grabs one frame, scaled', () => {
    const { argv } = buildArgv(videoThumbnailOp, { at: 2.5, width: 320 }, { probes: [videoProbe] });
    expect(argv).toEqual(['-ss', '2.5', '-i', '/work/input-0.bin', '-frames:v', '1', '-vf', 'scale=320:-2']);
  });
});

describe('video-transcode argv', () => {
  it('builds the telegram preset with forced pixel format', () => {
    const { argv } = buildArgv(videoTranscodeOp, { preset: 'telegram', format: 'mp4' }, { probes: [videoProbe] });
    expect(argv).toEqual([
      '-i',
      '/work/input-0.bin',
      '-vf',
      'scale=-2:720',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-pix_fmt',
      'yuv420p',
    ]);
  });

  it('builds the gif preset with no audio codec at all', () => {
    const { argv } = buildArgv(videoTranscodeOp, { preset: 'gif', format: 'gif' }, { probes: [videoProbe] });
    expect(argv).toEqual(['-i', '/work/input-0.bin', '-vf', 'fps=10,scale=480:-1:flags=lanczos']);
  });

  it('builds the webm preset with vp9/opus', () => {
    const { argv } = buildArgv(videoTranscodeOp, { preset: 'web-1080p', format: 'webm' }, { probes: [videoProbe] });
    expect(argv).toEqual([
      '-i',
      '/work/input-0.bin',
      '-vf',
      'scale=-2:1080',
      '-c:v',
      'libvpx-vp9',
      '-b:v',
      '0',
      '-crf',
      '30',
      '-c:a',
      'libopus',
    ]);
  });

  it('rejects a preset/format mismatch before argv is ever built', () => {
    expect(() => videoTranscodeOp.paramsSchema.parse({ preset: 'gif', format: 'mp4' })).toThrow();
    expect(() => videoTranscodeOp.paramsSchema.parse({ preset: 'web-720p', format: 'gif' })).toThrow();
  });
});

describe('audio-extract argv', () => {
  it('drops video and re-encodes audio', () => {
    const { argv } = buildArgv(audioExtractOp, { format: 'ogg' }, { probes: [videoProbe] });
    expect(argv).toEqual(['-i', '/work/input-0.bin', '-vn', '-c:a', 'libvorbis']);
  });
});

describe('audio-convert argv', () => {
  it('applies bitrate/mono/sampleRate when given', () => {
    const { argv } = buildArgv(
      audioConvertOp,
      { format: 'mp3', bitrate: '96k', mono: true, sampleRate: 16_000 },
      { probes: [videoProbe] },
    );
    expect(argv).toEqual(['-i', '/work/input-0.bin', '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '1', '-ar', '16000']);
  });

  it('omits every optional flag when none are given', () => {
    const { argv } = buildArgv(audioConvertOp, { format: 'wav' }, { probes: [videoProbe] });
    expect(argv).toEqual(['-i', '/work/input-0.bin', '-c:a', 'pcm_s16le']);
  });
});
