import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IMediaServiceConfig } from '../config.js';
import { MEDIA_OPS, OP_SUFFIX } from '../ops/catalog.js';
import { toMediaInfo } from '../ops/media-probe-op.js';
import { normalizeArgvResult } from '../ops/types.js';
import type { IDownloadedInput } from './download-inputs.js';
import { downloadAndProbeInputs } from './download-inputs.js';
import type { IProcessSpawner } from './ffmpeg-process.js';
import type { IFilesClient } from './files-client.js';
import type { IJobRunner } from './job-queue.js';
import type { IJob } from './job-types.js';
import { deriveOutputName } from './output-naming.js';
import { runFfmpeg } from './run-ffmpeg.js';
import { UnsupportedInputError } from './unsupported-input-error.js';

export interface IJobRunnerDeps {
  readonly filesClient: IFilesClient;
  readonly spawner: IProcessSpawner;
  readonly config: IMediaServiceConfig;
}

const resolveOutputMime = (
  outputMime: string | ((params: Record<string, unknown>) => string) | undefined,
  params: Record<string, unknown>,
): string => (typeof outputMime === 'function' ? outputMime(params) : (outputMime ?? 'application/octet-stream'));

/** Downloads+probes every input, setting `job.status`/`job.error` itself (and returning `null`)
 * on an unsupported/unreachable input rather than throwing — the caller just checks for `null`. */
const downloadInputsOrFail = async (deps: IJobRunnerDeps, job: IJob, workDir: string): Promise<IDownloadedInput[] | null> => {
  try {
    return await downloadAndProbeInputs(deps, job.projectId, job.token, job.request.inputs, workDir);
  } catch (error) {
    job.status = 'failed';
    job.error = error instanceof UnsupportedInputError ? error.message : `failed to prepare inputs: ${String(error)}`;
    return null;
  }
};

const writeExtraFiles = async (workDir: string, extraFiles: Readonly<Record<string, string>> | undefined): Promise<void> => {
  if (!extraFiles) return;
  for (const [name, content] of Object.entries(extraFiles)) {
    // Sequential on purpose — the ADR's ops never produce more than one side file (the concat
    // list), and this keeps the write order deterministic for anything that ever needs to debug it.
    // oxlint-disable-next-line no-await-in-loop
    await writeFile(join(workDir, name), content, 'utf8');
  }
};

/** One job, start to finish: `mkdtemp` → download+probe every input → build the op's ffmpeg argv
 * → run it (or, for `media-probe`, skip ffmpeg entirely) → upload the result → always clean up the
 * temp dir. Every failure path sets `job.status`/`job.error` instead of throwing, *except* a bug in
 * this function itself — `JobQueue`'s own `.catch` is the last-resort net for that. */
const runJob = async (deps: IJobRunnerDeps, job: IJob, workDir: string): Promise<void> => {
  const downloaded = await downloadInputsOrFail(deps, job, workDir);
  if (downloaded === null) return;

  const opDef = MEDIA_OPS[job.request.op];
  const parsedParams = opDef.paramsSchema.parse(job.request.params) as Record<string, unknown>;
  const primaryProbe = downloaded[0].probe;

  if (opDef.resultKind === 'info') {
    job.result = toMediaInfo(primaryProbe);
    job.progress = 1;
    job.status = 'done';
    return;
  }

  const outputExt = opDef.outputExt?.(parsedParams, primaryProbe) ?? 'bin';
  const outputName = deriveOutputName(job.request.inputs[0].name, OP_SUFFIX[job.request.op], outputExt);
  const outputPath = join(workDir, outputName);

  const argvResult = opDef.buildArgv?.({
    inputs: downloaded.map((entry) => entry.path),
    output: outputPath,
    params: parsedParams,
    probes: downloaded.map((entry) => entry.probe),
    workDir,
  });
  if (!argvResult) throw new Error(`op ${job.request.op} declares no buildArgv`);
  const { argv: middleArgv, extraFiles } = normalizeArgvResult(argvResult);
  await writeExtraFiles(workDir, extraFiles);

  const fullArgv = [
    '-nostdin',
    '-y',
    '-progress',
    'pipe:1',
    '-threads',
    String(deps.config.ffmpegThreads),
    '-protocol_whitelist',
    'file,pipe',
    ...middleArgv,
    '-fs',
    String(deps.config.outputMaxBytes),
    outputPath,
  ];

  if (job.cancelRequested) {
    job.status = 'cancelled';
    return;
  }

  const result = await runFfmpeg({
    spawner: deps.spawner,
    argv: fullArgv,
    timeoutMs: deps.config.jobTimeoutMs,
    durationSeconds: primaryProbe.duration,
    onProgress: (fraction) => {
      job.progress = fraction;
    },
    registerKill: (kill) => {
      job.kill = kill;
    },
  });

  if (job.cancelRequested) {
    job.status = 'cancelled';
    return;
  }
  if (result.timedOut) {
    job.status = 'failed';
    job.error = `job timed out after ${deps.config.jobTimeoutMs}ms`;
    return;
  }
  if (result.exitCode !== 0) {
    job.status = 'failed';
    job.error = result.stderr.slice(-2000) || `ffmpeg exited with code ${String(result.exitCode)}`;
    return;
  }

  const mime = resolveOutputMime(opDef.outputMime, parsedParams);
  const fileRef = await deps.filesClient.upload(
    job.projectId,
    job.token,
    outputPath,
    outputName,
    mime,
    `media:${job.request.op}`,
    job.request.workflowEnv,
    job.request.ttlSeconds,
  );
  job.result = opDef.resultKind === 'files' ? [fileRef] : fileRef;
  job.progress = 1;
  job.status = 'done';
};

export const createJobRunner = (deps: IJobRunnerDeps): IJobRunner => ({
  run: async (job: IJob): Promise<void> => {
    if (job.cancelRequested) {
      job.status = 'cancelled';
      return;
    }
    const workDir = await mkdtemp(join(deps.config.workDir, 'media-job-'));
    try {
      await runJob(deps, job, workDir);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },
});
