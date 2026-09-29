import type { IProcessSpawner } from '../jobs/ffmpeg-process.js';
import type { IProbeInfo } from './types.js';

interface IFfprobeStream {
  readonly codec_name?: string;
  readonly codec_type?: string;
  readonly width?: number;
  readonly height?: number;
  readonly duration?: string;
  readonly bit_rate?: string;
}

interface IFfprobeFormat {
  readonly format_name?: string;
  readonly duration?: string;
  readonly bit_rate?: string;
}

export interface IFfprobeResult {
  readonly streams?: readonly IFfprobeStream[];
  readonly format?: IFfprobeFormat;
}

export class FfprobeError extends Error {}

/** Runs `ffprobe -show_streams -show_format` on a downloaded input and returns its parsed JSON —
 * called on every input before any ffmpeg encode, both to reject unsupported media (`ops/
 * allowlist.ts`) and to feed `media-probe`'s own result. */
export const runFfprobe = (spawner: IProcessSpawner, filePath: string): Promise<IFfprobeResult> =>
  new Promise((resolve, reject) => {
    const proc = spawner.spawn('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath]);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    proc.onExit((code) => {
      if (code !== 0) {
        reject(new FfprobeError(`ffprobe exited with code ${code}: ${Buffer.concat(stderrChunks).toString('utf8')}`));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdoutChunks).toString('utf8')) as IFfprobeResult);
      } catch (error) {
        reject(new FfprobeError(`ffprobe produced invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });

const parseFloatOr = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const IMAGE_MIME_BY_TOKEN: Readonly<Record<string, string>> = {
  png_pipe: 'image/png',
  webp_pipe: 'image/webp',
  image2: 'image/jpeg',
  gif: 'image/gif',
};

const AUDIO_MIME_BY_TOKEN: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

/** `format_name` is a comma-separated list of container aliases ffprobe considers plausible (e.g.
 * `"mov,mp4,m4a,3gp,3g2,mj2"`) — never a single clean name. */
export const mimeFromFormatName = (formatName: string): string => {
  const tokens = formatName.split(',');
  for (const token of tokens) {
    if (IMAGE_MIME_BY_TOKEN[token]) return IMAGE_MIME_BY_TOKEN[token];
    if (AUDIO_MIME_BY_TOKEN[token]) return AUDIO_MIME_BY_TOKEN[token];
  }
  if (tokens.includes('matroska') || tokens.includes('webm')) return 'video/webm';
  if (tokens.includes('mov') || tokens.includes('mp4') || tokens.includes('m4a')) return 'video/mp4';
  return 'application/octet-stream';
};

export const toProbeInfo = (raw: IFfprobeResult): IProbeInfo => {
  const streams = raw.streams ?? [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const audioStream = streams.find((stream) => stream.codec_type === 'audio');
  const format = raw.format ?? {};
  const duration =
    parseFloatOr(format.duration, 0) || parseFloatOr(videoStream?.duration, 0) || parseFloatOr(audioStream?.duration, 0);
  return {
    formatName: format.format_name ?? '',
    duration,
    width: videoStream?.width,
    height: videoStream?.height,
    videoCodec: videoStream?.codec_name,
    audioCodec: audioStream?.codec_name,
    bitrate: parseFloatOr(format.bit_rate, 0),
    mime: mimeFromFormatName(format.format_name ?? ''),
  };
};
