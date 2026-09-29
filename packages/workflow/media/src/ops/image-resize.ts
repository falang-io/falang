import { z } from 'zod';
import { IMAGE_FORMAT_CODEC, IMAGE_FORMAT_EXT, IMAGE_FORMAT_MIME, imageExtFromMime, imageQualityArgs } from './image-format.js';
import type { IMediaOpBuildContext, IMediaOpDefinition, IProbeInfo, TMediaOpArgvResult } from './types.js';

const imageResizeParamsSchema = z
  .object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    fit: z.enum(['contain', 'cover']).default('contain'),
    format: z.enum(['keep', 'jpeg', 'png', 'webp']).default('keep'),
    quality: z.number().int().min(1).max(100).default(85),
  })
  .strict();

type IImageResizeParams = z.infer<typeof imageResizeParamsSchema>;

const buildScaleFilter = (params: IImageResizeParams): string | null => {
  const hasWidth = Boolean(params.width);
  const hasHeight = Boolean(params.height);
  if (!hasWidth && !hasHeight) return null;
  if (hasWidth && !hasHeight) return `scale=${params.width}:-2`;
  if (!hasWidth && hasHeight) return `scale=-2:${params.height}`;
  return params.fit === 'cover'
    ? `scale=${params.width}:${params.height}:force_original_aspect_ratio=increase,crop=${params.width}:${params.height}`
    : `scale=${params.width}:${params.height}:force_original_aspect_ratio=decrease`;
};

export const imageResizeOp: IMediaOpDefinition = {
  paramsSchema: imageResizeParamsSchema,
  minInputs: 1,
  maxInputs: 1,
  inputKinds: ['image'],
  resultKind: 'file',
  outputExt: (rawParams: Record<string, unknown>, probe: IProbeInfo): string => {
    const params = rawParams as IImageResizeParams;
    return params.format === 'keep' ? imageExtFromMime(probe.mime) : IMAGE_FORMAT_EXT[params.format];
  },
  outputMime: (rawParams: Record<string, unknown>): string => {
    const params = rawParams as IImageResizeParams;
    return params.format === 'keep' ? 'image/jpeg' : IMAGE_FORMAT_MIME[params.format];
  },
  buildArgv: (ctx: IMediaOpBuildContext): TMediaOpArgvResult => {
    const params = ctx.params as IImageResizeParams;
    const scaleFilter = buildScaleFilter(params);
    const argv: string[] = ['-i', ctx.inputs[0]];
    if (scaleFilter) argv.push('-vf', scaleFilter);
    argv.push('-frames:v', '1');
    if (params.format !== 'keep') {
      argv.push('-c:v', IMAGE_FORMAT_CODEC[params.format], ...imageQualityArgs(params.format, params.quality));
    }
    return argv;
  },
};
