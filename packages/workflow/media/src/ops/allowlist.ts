import type { IProbeInfo } from './types.js';

/** Container tokens `ffprobe`'s `format_name` may contain, across the ADR's three families (image:
 * png/mjpeg/webp/gif; video: mp4/mov/webm/matroska/gif; audio: mp3/ogg/wav/flac/m4a) — kept as one
 * flat allowlist since a container alone doesn't say which family it's being used for, and the
 * per-op `minInputs`/`inputKinds` plus ffmpeg's own errors are what actually reject a wrong-kind
 * input for a given op. `_pipe` variants are how ffprobe names the single-image demuxers it uses
 * for `png`/`webp`/`mjpeg` (verified live: `ffprobe` on a generated PNG reports `format_name:
 * "png_pipe"`, never bare `"png"`). */
const ALLOWED_CONTAINER_TOKENS: ReadonlySet<string> = new Set([
  'png_pipe',
  'webp_pipe',
  'mjpeg',
  'image2',
  'gif',
  'mp4',
  'mov',
  'm4a',
  '3gp',
  '3g2',
  'mj2',
  'webm',
  'matroska',
  'mp3',
  'ogg',
  'wav',
  'flac',
]);

const ALLOWED_CODECS: ReadonlySet<string> = new Set([
  'png',
  'mjpeg',
  'webp',
  'gif',
  'h264',
  'hevc',
  'vp8',
  'vp9',
  'av1',
  'mp3',
  'aac',
  'opus',
  'vorbis',
  'flac',
]);

const isAllowedContainer = (formatName: string): boolean =>
  formatName
    .split(',')
    .map((token) => token.trim())
    .some((token) => ALLOWED_CONTAINER_TOKENS.has(token));

const isAllowedCodec = (codec: string | undefined): boolean => {
  if (!codec) return true;
  if (codec.startsWith('pcm')) return true;
  return ALLOWED_CODECS.has(codec);
};

export const isProbeAllowed = (probe: IProbeInfo): boolean =>
  isAllowedContainer(probe.formatName) && isAllowedCodec(probe.videoCodec) && isAllowedCodec(probe.audioCodec);
