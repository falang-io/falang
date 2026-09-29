import { z } from 'zod';
import { AUDIO_FORMAT_CODEC, AUDIO_FORMAT_EXT, AUDIO_FORMAT_MIME } from './audio-format.js';
import type { IMediaOpBuildContext, IMediaOpDefinition, TMediaOpArgvResult } from './types.js';

const audioConvertParamsSchema = z
  .object({
    format: z.enum(['mp3', 'aac', 'wav', 'ogg']).default('mp3'),
    bitrate: z.enum(['64k', '96k', '128k', '192k', '256k']).optional(),
    mono: z.boolean().optional(),
    sampleRate: z
      .union([z.literal(8000), z.literal(16_000), z.literal(22_050), z.literal(44_100), z.literal(48_000)])
      .optional(),
  })
  .strict();

type IAudioConvertParams = z.infer<typeof audioConvertParamsSchema>;

export const audioConvertOp: IMediaOpDefinition = {
  paramsSchema: audioConvertParamsSchema,
  minInputs: 1,
  maxInputs: 1,
  inputKinds: ['audio'],
  resultKind: 'file',
  outputExt: (rawParams: Record<string, unknown>): string => AUDIO_FORMAT_EXT[(rawParams as IAudioConvertParams).format],
  outputMime: (rawParams: Record<string, unknown>): string => AUDIO_FORMAT_MIME[(rawParams as IAudioConvertParams).format],
  buildArgv: (ctx: IMediaOpBuildContext): TMediaOpArgvResult => {
    const params = ctx.params as IAudioConvertParams;
    const argv: string[] = ['-i', ctx.inputs[0], '-c:a', AUDIO_FORMAT_CODEC[params.format]];
    if (params.bitrate) argv.push('-b:a', params.bitrate);
    if (params.mono) argv.push('-ac', '1');
    if (params.sampleRate) argv.push('-ar', String(params.sampleRate));
    return argv;
  },
};
