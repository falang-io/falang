import { extname, join } from 'node:path';
import { isProbeAllowed } from '../ops/allowlist.js';
import { runFfprobe, toProbeInfo } from '../ops/ffprobe-info.js';
import type { IProbeInfo } from '../ops/types.js';
import type { IFileRef } from '../types.js';
import type { IFilesClient } from './files-client.js';
import type { IProcessSpawner } from './ffmpeg-process.js';
import { UnsupportedInputError } from './unsupported-input-error.js';

export interface IDownloadedInput {
  readonly path: string;
  readonly probe: IProbeInfo;
}

/** Downloads every job input into `workDir` and `ffprobe`s each one before any ffmpeg encode runs
 * — an input outside the allowlist (`ops/allowlist.ts`) throws `UnsupportedInputError`, which
 * `job-runner.ts` turns into a `'failed'` job rather than an ffmpeg run on untrusted bytes. */
export const downloadAndProbeInputs = async (
  deps: { readonly filesClient: IFilesClient; readonly spawner: IProcessSpawner },
  projectId: string,
  token: string,
  inputs: readonly IFileRef[],
  workDir: string,
): Promise<IDownloadedInput[]> => {
  const results: IDownloadedInput[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const ext = extname(input.name) || '.bin';
    const destPath = join(workDir, `input-${index}${ext}`);
    // Sequential, not `Promise.all` — a job's own inputs are never many, and this keeps the pool's
    // concurrency limit (`MEDIA_MAX_CONCURRENT_JOBS`) the only thing bounding parallel downloads.
    // oxlint-disable-next-line no-await-in-loop
    await deps.filesClient.download(projectId, input.id, token, destPath);
    // oxlint-disable-next-line no-await-in-loop
    const raw = await runFfprobe(deps.spawner, destPath);
    const probe = toProbeInfo(raw);
    if (!isProbeAllowed(probe)) {
      throw new UnsupportedInputError(`unsupported input: ${input.name} (${probe.formatName || 'unknown format'})`);
    }
    results.push({ path: destPath, probe });
  }
  return results;
};
