import { z } from 'zod';
import type { IMediaOpBuildContext, IMediaOpDefinition, TMediaOpArgvResult } from './types.js';

const videoTranscodeParamsSchema = z
  .object({
    preset: z.enum(['web-720p', 'web-1080p', 'telegram', 'gif']),
    format: z.enum(['mp4', 'webm', 'gif']).default('mp4'),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.preset === 'gif' && value.format !== 'gif') {
      ctx.addIssue({ code: 'custom', message: "preset 'gif' requires format 'gif'", path: ['format'] });
    }
    if (value.preset !== 'gif' && value.format === 'gif') {
      ctx.addIssue({ code: 'custom', message: "format 'gif' requires preset 'gif'", path: ['format'] });
    }
  });

type IVideoTranscodeParams = z.infer<typeof videoTranscodeParamsSchema>;

const FORMAT_EXT_MIME: Readonly<Record<IVideoTranscodeParams['format'], readonly [string, string]>> = {
  mp4: ['mp4', 'video/mp4'],
  webm: ['webm', 'video/webm'],
  gif: ['gif', 'image/gif'],
};

const SCALE_FILTER_BY_PRESET: Readonly<Record<IVideoTranscodeParams['preset'], string>> = {
  'web-720p': 'scale=-2:720',
  'web-1080p': 'scale=-2:1080',
  telegram: 'scale=-2:720',
  gif: 'fps=10,scale=480:-1:flags=lanczos',
};

const buildCodecArgs = (params: IVideoTranscodeParams): readonly string[] => {
  if (params.format === 'webm') return ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-c:a', 'libopus'];
  return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'];
};

export const videoTranscodeOp: IMediaOpDefinition = {
  paramsSchema: videoTranscodeParamsSchema,
  minInputs: 1,
  maxInputs: 1,
  inputKinds: ['video'],
  resultKind: 'file',
  outputExt: (rawParams: Record<string, unknown>): string => FORMAT_EXT_MIME[(rawParams as IVideoTranscodeParams).format][0],
  outputMime: (rawParams: Record<string, unknown>): string => FORMAT_EXT_MIME[(rawParams as IVideoTranscodeParams).format][1],
  buildArgv: (ctx: IMediaOpBuildContext): TMediaOpArgvResult => {
    const params = ctx.params as IVideoTranscodeParams;
    const vf = SCALE_FILTER_BY_PRESET[params.preset];
    if (params.preset === 'gif') return ['-i', ctx.inputs[0], '-vf', vf];
    const argv = ['-i', ctx.inputs[0], '-vf', vf, ...buildCodecArgs(params)];
    if (params.preset === 'telegram') argv.push('-pix_fmt', 'yuv420p');
    return argv;
  },
};
