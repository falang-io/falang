import { join } from 'node:path';
import { isProbeAllowed } from '../ops/allowlist.js';
import { runFfprobe, toProbeInfo } from '../ops/ffprobe-info.js';
import type { IProbeInfo } from '../ops/types.js';
import type { IMediaServiceConfig } from '../config.js';
import type { IFileRef } from '../types.js';
import type { IFilesClient } from './files-client.js';
import type { IProcessSpawner } from './ffmpeg-process.js';
import { safeExtension } from './output-naming.js';
import { UnsupportedInputError } from './unsupported-input-error.js';

export interface IDownloadedInput {
  readonly path: string;
  readonly probe: IProbeInfo;
}

/** Downloads every job input into `workDir` and `ffprobe`s each one before any ffmpeg encode runs
 * — an input outside the allowlist (`ops/allowlist.ts`) throws `UnsupportedInputError`, which
 * `job-runner.ts` turns into a `'failed'` job rather than an ffmpeg run on untrusted bytes. */
export const downloadAndProbeInputs = async (
  deps: {
    readonly filesClient: IFilesClient;
    readonly spawner: IProcessSpawner;
    readonly config: Pick<
      IMediaServiceConfig,
      'probeTimeoutMs' | 'maxInputBytes' | 'maxInputs' | 'maxDurationSeconds' | 'maxDimension'
    >;
  },
  projectId: string,
  token: string,
  inputs: readonly IFileRef[],
  workDir: string,
): Promise<IDownloadedInput[]> => {
  const { config } = deps;
  if (inputs.length > config.maxInputs) {
    throw new UnsupportedInputError(`too many inputs: ${inputs.length} (max ${config.maxInputs})`);
  }
  const results: IDownloadedInput[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const ext = safeExtension(input.name);
    const destPath = join(workDir, `input-${index}${ext}`);
    // Sequential, not `Promise.all` — a job's own inputs are never many, and this keeps the pool's
    // concurrency limit (`MEDIA_MAX_CONCURRENT_JOBS`) the only thing bounding parallel downloads.
    // oxlint-disable-next-line no-await-in-loop
    await deps.filesClient.download(projectId, input.id, token, destPath, config.maxInputBytes);
    // oxlint-disable-next-line no-await-in-loop
    const raw = await runFfprobe(deps.spawner, destPath, config.probeTimeoutMs);
    const probe = toProbeInfo(raw);
    if (!isProbeAllowed(probe)) {
      throw new UnsupportedInputError(`unsupported input: ${input.name} (${probe.formatName || 'unknown format'})`);
    }
    if (probe.duration > config.maxDurationSeconds) {
      throw new UnsupportedInputError(
        `input too long: ${input.name} is ${Math.ceil(probe.duration)}s (max ${config.maxDurationSeconds}s)`,
      );
    }
    if ((probe.width ?? 0) > config.maxDimension || (probe.height ?? 0) > config.maxDimension) {
      throw new UnsupportedInputError(
        `input resolution too large: ${input.name} is ${probe.width}x${probe.height} (max ${config.maxDimension}x${config.maxDimension})`,
      );
    }
    results.push({ path: destPath, probe });
  }
  return results;
};
