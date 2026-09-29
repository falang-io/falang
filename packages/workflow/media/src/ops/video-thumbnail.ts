import { z } from 'zod';
import type { IMediaOpBuildContext, IMediaOpDefinition, TMediaOpArgvResult } from './types.js';

const videoThumbnailParamsSchema = z
  .object({
    at: z.number().min(0).default(0),
    width: z.number().int().positive().optional(),
  })
  .strict();

type IVideoThumbnailParams = z.infer<typeof videoThumbnailParamsSchema>;

export const videoThumbnailOp: IMediaOpDefinition = {
  paramsSchema: videoThumbnailParamsSchema,
  minInputs: 1,
  maxInputs: 1,
  inputKinds: ['video'],
  resultKind: 'file',
  outputExt: (): string => 'jpg',
  outputMime: 'image/jpeg',
  buildArgv: (ctx: IMediaOpBuildContext): TMediaOpArgvResult => {
    const params = ctx.params as IVideoThumbnailParams;
    const argv: string[] = ['-ss', String(params.at), '-i', ctx.inputs[0], '-frames:v', '1'];
    if (params.width) argv.push('-vf', `scale=${params.width}:-2`);
    return argv;
  },
};
