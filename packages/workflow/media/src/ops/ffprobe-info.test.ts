import { describe, expect, it } from 'vitest';
import { mimeFromFormatName, toProbeInfo } from './ffprobe-info.js';
import type { IFfprobeResult } from './ffprobe-info.js';

describe('mimeFromFormatName', () => {
  it('maps a still-image pipe format', () => {
    expect(mimeFromFormatName('png_pipe')).toBe('image/png');
  });

  it('maps an mp4-family container', () => {
    expect(mimeFromFormatName('mov,mp4,m4a,3gp,3g2,mj2')).toBe('video/mp4');
  });

  it('maps a webm container', () => {
    expect(mimeFromFormatName('matroska,webm')).toBe('video/webm');
  });

  it('falls back to a generic mime for an unrecognized container', () => {
    expect(mimeFromFormatName('made_up_format')).toBe('application/octet-stream');
  });
});

describe('toProbeInfo', () => {
  it('extracts video+audio streams and format-level fields', () => {
    const raw: IFfprobeResult = {
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.5', bit_rate: '900000' },
    };
    expect(toProbeInfo(raw)).toEqual({
      formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
      duration: 12.5,
      width: 1280,
      height: 720,
      videoCodec: 'h264',
      audioCodec: 'aac',
      bitrate: 900_000,
      mime: 'video/mp4',
    });
  });

  it('defaults duration/bitrate to 0 and leaves codecs undefined when there is no matching stream', () => {
    const raw: IFfprobeResult = { streams: [], format: { format_name: 'png_pipe' } };
    expect(toProbeInfo(raw)).toEqual({
      formatName: 'png_pipe',
      duration: 0,
      bitrate: 0,
      mime: 'image/png',
    });
  });
});
