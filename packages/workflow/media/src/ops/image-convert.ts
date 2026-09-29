import { z } from 'zod';
import { IMAGE_FORMAT_CODEC, IMAGE_FORMAT_EXT, IMAGE_FORMAT_MIME, imageQualityArgs } from './image-format.js';
import type { IMediaOpBuildContext, IMediaOpDefinition, TMediaOpArgvResult } from './types.js';

const imageConvertParamsSchema = z
  .object({
    format: z.enum(['jpeg', 'png', 'webp']),
    quality: z.number().int().min(1).max(100).default(85),
  })
  .strict();

type IImageConvertParams = z.infer<typeof imageConvertParamsSchema>;

export const imageConvertOp: IMediaOpDefinition = {
  paramsSchema: imageConvertParamsSchema,
  minInputs: 1,
  maxInputs: 1,
  inputKinds: ['image'],
  resultKind: 'file',
  outputExt: (rawParams: Record<string, unknown>): string => IMAGE_FORMAT_EXT[(rawParams as IImageConvertParams).format],
  outputMime: (rawParams: Record<string, unknown>): string => IMAGE_FORMAT_MIME[(rawParams as IImageConvertParams).format],
  buildArgv: (ctx: IMediaOpBuildContext): TMediaOpArgvResult => {
    const params = ctx.params as IImageConvertParams;
    return [
      '-i',
      ctx.inputs[0],
      '-frames:v',
      '1',
      '-c:v',
      IMAGE_FORMAT_CODEC[params.format],
      ...imageQualityArgs(params.format, params.quality),
    ];
  },
};
