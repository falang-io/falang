import { z } from 'zod';
import { AUDIO_FORMAT_CODEC, AUDIO_FORMAT_EXT, AUDIO_FORMAT_MIME } from './audio-format.js';
import type { IMediaOpBuildContext, IMediaOpDefinition, TMediaOpArgvResult } from './types.js';

const audioExtractParamsSchema = z.object({ format: z.enum(['mp3', 'aac', 'wav', 'ogg']).default('mp3') }).strict();

type IAudioExtractParams = z.infer<typeof audioExtractParamsSchema>;

export const audioExtractOp: IMediaOpDefinition = {
  paramsSchema: audioExtractParamsSchema,
  minInputs: 1,
  maxInputs: 1,
  inputKinds: ['video', 'audio'],
  resultKind: 'file',
  outputExt: (rawParams: Record<string, unknown>): string => AUDIO_FORMAT_EXT[(rawParams as IAudioExtractParams).format],
  outputMime: (rawParams: Record<string, unknown>): string => AUDIO_FORMAT_MIME[(rawParams as IAudioExtractParams).format],
  buildArgv: (ctx: IMediaOpBuildContext): TMediaOpArgvResult => {
    const params = ctx.params as IAudioExtractParams;
    return ['-i', ctx.inputs[0], '-vn', '-c:a', AUDIO_FORMAT_CODEC[params.format]];
  },
};
