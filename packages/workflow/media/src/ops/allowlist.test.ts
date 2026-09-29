import { describe, expect, it } from 'vitest';
import { isProbeAllowed } from './allowlist.js';
import type { IProbeInfo } from './types.js';

const probe = (overrides: Partial<IProbeInfo>): IProbeInfo => ({
  formatName: 'mp4',
  duration: 1,
  bitrate: 0,
  mime: 'video/mp4',
  ...overrides,
});

describe('isProbeAllowed', () => {
  it('allows a real mp4/h264/aac container', () => {
    expect(isProbeAllowed(probe({ formatName: 'mov,mp4,m4a,3gp,3g2,mj2', videoCodec: 'h264', audioCodec: 'aac' }))).toBe(true);
  });

  it('allows a png piped through ffprobe as png_pipe/png', () => {
    expect(isProbeAllowed(probe({ formatName: 'png_pipe', videoCodec: 'png' }))).toBe(true);
  });

  it('allows any pcm_* variant, not just pcm_s16le', () => {
    expect(isProbeAllowed(probe({ formatName: 'wav', audioCodec: 'pcm_s24le' }))).toBe(true);
  });

  it('rejects an unlisted container', () => {
    expect(isProbeAllowed(probe({ formatName: 'rm', videoCodec: 'h264' }))).toBe(false);
  });

  it('rejects an unlisted codec inside an otherwise-allowed container', () => {
    expect(isProbeAllowed(probe({ formatName: 'mov,mp4,m4a,3gp,3g2,mj2', videoCodec: 'mpeg4' }))).toBe(false);
  });
});
