import { z } from 'zod';
import { videoExtFromProbe } from './video-container.js';
import type { IMediaOpBuildContext, IMediaOpDefinition, IProbeInfo, TMediaOpArgvResult } from './types.js';

const videoTrimParamsSchema = z
  .object({
    start: z.number().min(0),
    duration: z.number().positive().optional(),
    reencode: z.boolean().default(false),
  })
  .strict();

type IVideoTrimParams = z.infer<typeof videoTrimParamsSchema>;

export const videoTrimOp: IMediaOpDefinition = {
  paramsSchema: videoTrimParamsSchema,
  minInputs: 1,
  maxInputs: 1,
  inputKinds: ['video'],
  resultKind: 'file',
  outputExt: (_params: Record<string, unknown>, probe: IProbeInfo): string => videoExtFromProbe(probe),
  outputMime: 'video/mp4',
  buildArgv: (ctx: IMediaOpBuildContext): TMediaOpArgvResult => {
    const params = ctx.params as IVideoTrimParams;
    // `-ss` before `-i` for fast (input-side) seeking — see ADR 0041 (private) §2's own sketch.
    const argv: string[] = ['-ss', String(params.start)];
    if (params.duration) argv.push('-t', String(params.duration));
    argv.push('-i', ctx.inputs[0]);
    argv.push(...(params.reencode ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac'] : ['-c', 'copy']));
    return argv;
  },
};
