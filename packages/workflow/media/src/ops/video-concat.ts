import { join } from 'node:path';
import { z } from 'zod';
import type { IMediaOpBuildContext, IMediaOpDefinition, TMediaOpArgvResult } from './types.js';

const videoConcatParamsSchema = z.object({ reencode: z.boolean().default(false) }).strict();

type IVideoConcatParams = z.infer<typeof videoConcatParamsSchema>;

const CONCAT_LIST_FILENAME = 'concat-list.txt';

/** ffmpeg's concat-demuxer list format is `file '<path>'`, one per line — a literal `'` in a path
 * has to be closed/reopened/escaped as `'\''`, the same trick the shell itself uses; every path
 * here is one of *our own* temp files (never a user-supplied string), but the escaping is cheap
 * insurance regardless. */
const escapeConcatPath = (path: string): string => `'${path.replaceAll("'", String.raw`'\''`)}'`;

const buildConcatListFile = (inputs: readonly string[]): string =>
  inputs.map((input) => `file ${escapeConcatPath(input)}`).join('\n');

/** Re-encode mode assumes every input has both a video and an audio stream — a real, documented
 * limitation of this first cut (an input with no audio track fails the filter graph outright
 * rather than being silently padded with silence). Stream-copy mode (the default) has no such
 * requirement, since it never decodes anything. */
const buildReencodeArgv = (inputs: readonly string[]): readonly string[] => {
  const perInputFlags = inputs.flatMap((input) => ['-i', input]);
  const streamRefs = inputs.map((_input, index) => `[${index}:v:0][${index}:a:0]`).join('');
  return [
    ...perInputFlags,
    '-filter_complex',
    `${streamRefs}concat=n=${inputs.length}:v=1:a=1[outv][outa]`,
    '-map',
    '[outv]',
    '-map',
    '[outa]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
  ];
};

export const videoConcatOp: IMediaOpDefinition = {
  paramsSchema: videoConcatParamsSchema,
  minInputs: 2,
  maxInputs: Number.POSITIVE_INFINITY,
  inputKinds: ['video'],
  resultKind: 'file',
  outputExt: (): string => 'mp4',
  outputMime: 'video/mp4',
  buildArgv: (ctx: IMediaOpBuildContext): TMediaOpArgvResult => {
    const params = ctx.params as IVideoConcatParams;
    if (params.reencode) return buildReencodeArgv(ctx.inputs);
    return {
      argv: ['-f', 'concat', '-safe', '0', '-i', join(ctx.workDir, CONCAT_LIST_FILENAME), '-c', 'copy'],
      extraFiles: { [CONCAT_LIST_FILENAME]: buildConcatListFile(ctx.inputs) },
    };
  },
};
