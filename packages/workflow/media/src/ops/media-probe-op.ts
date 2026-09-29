import { z } from 'zod';
import type { IMediaInfo } from '../types.js';
import type { IMediaOpDefinition, IProbeInfo } from './types.js';

/** `media-probe` never runs ffmpeg at all — `resultKind: 'info'` tells `job-runner.ts` to build
 * the result straight from the input's own allowlist probe instead of calling `buildArgv`. */
export const mediaProbeOp: IMediaOpDefinition = {
  paramsSchema: z.object({}).strict(),
  minInputs: 1,
  maxInputs: 1,
  inputKinds: ['image', 'video', 'audio'],
  resultKind: 'info',
};

export const toMediaInfo = (probe: IProbeInfo): IMediaInfo => ({
  duration: probe.duration,
  width: probe.width ?? 0,
  height: probe.height ?? 0,
  videoCodec: probe.videoCodec ?? '',
  audioCodec: probe.audioCodec ?? '',
  bitrate: probe.bitrate,
  mime: probe.mime,
});
