import type { z } from 'zod';

export type TMediaInputKind = 'image' | 'video' | 'audio';

/** What `ops/ffprobe-info.ts` extracts from a real `ffprobe` run — the shape every op's
 * `buildArgv`/`outputExt` receives, and what the allowlist check (`ops/allowlist.ts`) validates. */
export interface IProbeInfo {
  readonly formatName: string;
  readonly duration: number;
  readonly width?: number;
  readonly height?: number;
  readonly videoCodec?: string;
  readonly audioCodec?: string;
  readonly bitrate: number;
  readonly mime: string;
}

export interface IMediaOpBuildContext {
  /** Absolute temp paths, one per downloaded input, in request order. */
  readonly inputs: readonly string[];
  /** Absolute temp path the op must write its result to (already carries the right extension). */
  readonly output: string;
  /** Already `paramsSchema`-validated — every op module casts this to its own params interface. */
  readonly params: Record<string, unknown>;
  /** Parallel to `inputs`. */
  readonly probes: readonly IProbeInfo[];
  /** For an op that needs a side file next to the inputs (`media-video-concat`'s concat list). */
  readonly workDir: string;
}

/** A plain argv is the common case; `{ argv, extraFiles }` lets an op (concat) ask the runner to
 * write one or more side files into `workDir` before ffmpeg starts. */
export type TMediaOpArgvResult =
  | readonly string[]
  | { readonly argv: readonly string[]; readonly extraFiles?: Readonly<Record<string, string>> };

export interface IMediaOpDefinition {
  readonly paramsSchema: z.ZodType;
  readonly minInputs: number;
  readonly maxInputs: number;
  readonly inputKinds: readonly TMediaInputKind[];
  readonly resultKind: 'file' | 'files' | 'info';
  /** Unused for `resultKind: 'info'` (`media-probe`), which never runs ffmpeg at all. */
  readonly outputExt?: (params: Record<string, unknown>, probe: IProbeInfo) => string;
  readonly outputMime?: string | ((params: Record<string, unknown>) => string);
  readonly buildArgv?: (ctx: IMediaOpBuildContext) => TMediaOpArgvResult;
}

export const normalizeArgvResult = (
  result: TMediaOpArgvResult,
): { readonly argv: readonly string[]; readonly extraFiles?: Readonly<Record<string, string>> } =>
  Array.isArray(result) ? { argv: result } : (result as { argv: readonly string[]; extraFiles?: Record<string, string> });
