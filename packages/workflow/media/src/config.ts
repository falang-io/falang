import { accessSync, constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface IMediaServiceConfig {
  readonly port: number;
  readonly backendInternalUrl: string;
  readonly maxConcurrentJobs: number;
  readonly maxJobsPerProject: number;
  readonly jobTimeoutMs: number;
  readonly workDir: string;
  readonly outputMaxBytes: number;
  readonly ffmpegThreads: number;
  readonly probeTimeoutMs: number;
  readonly maxInputBytes: number;
  readonly maxInputs: number;
  readonly maxDurationSeconds: number;
  readonly maxDimension: number;
  /** `MEDIA_FFMPEG_PATH`, default `ffmpeg` (looked up on `PATH` by the OS). */
  readonly ffmpegPath: string;
  /** `MEDIA_FFPROBE_PATH`, default `ffprobe`. */
  readonly ffprobePath: string;
  /** `nice` command ffmpeg runs under (`nice -n 10 <ffmpeg> …`), or `null` to run ffmpeg directly — always on
   * Windows, and wherever no `nice` is found on `PATH`. See `resolveNiceCommand`. */
  readonly niceCommand: string | null;
}

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isExecutableFile = (filePath: string): boolean => {
  try {
    accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

export interface IResolveNiceParams {
  readonly platform: NodeJS.Platform;
  /** The `PATH` to search (entries separated by `path.delimiter`). */
  readonly pathEnv: string | undefined;
  /** Injected for tests; default checks the file is executable. */
  readonly isExecutable?: (filePath: string) => boolean;
}

/** `nice` lowers ffmpeg's CPU priority (the ADR's own sketch) — POSIX only: Windows has no `nice`, and a minimal
 * POSIX image might not ship one either, so it is used only when found on `PATH`. Returns the bare command name (the
 * OS resolves it again on spawn), or `null` to run ffmpeg directly. */
export const resolveNiceCommand = (params: IResolveNiceParams): string | null => {
  if (params.platform === 'win32') return null;
  const isExecutable = params.isExecutable ?? isExecutableFile;
  const dirs = (params.pathEnv ?? '').split(path.delimiter).filter((dir) => dir.length > 0);
  return dirs.some((dir) => isExecutable(path.join(dir, 'nice'))) ? 'nice' : null;
};

const nonBlankOr = (value: string | undefined, fallback: string): string => (value?.trim() ? value : fallback);

/** `MEDIA_WORK_DIR` defaults to `os.tmpdir()` (dev-friendly, no directory needs to exist ahead of
 * time) — the real deployment sets it to `/work`, the pod's sized `emptyDir` (see the ADR's §1). */
export const loadConfig = (
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): IMediaServiceConfig => ({
  port: toPositiveInt(env.PORT, 4200),
  backendInternalUrl: env.BACKEND_INTERNAL_URL ?? '',
  maxConcurrentJobs: toPositiveInt(env.MEDIA_MAX_CONCURRENT_JOBS, os.cpus().length),
  maxJobsPerProject: toPositiveInt(env.MEDIA_MAX_JOBS_PER_PROJECT, 2),
  jobTimeoutMs: toPositiveInt(env.MEDIA_JOB_TIMEOUT_MS, 15 * 60 * 1000),
  workDir: env.MEDIA_WORK_DIR ?? os.tmpdir(),
  outputMaxBytes: toPositiveInt(env.MEDIA_OUTPUT_MAX_BYTES, 500 * 1024 * 1024),
  ffmpegThreads: toPositiveInt(env.MEDIA_FFMPEG_THREADS, 2),
  probeTimeoutMs: toPositiveInt(env.MEDIA_PROBE_TIMEOUT_MS, 30_000),
  maxInputBytes: toPositiveInt(env.MEDIA_MAX_INPUT_BYTES, 500 * 1024 * 1024),
  maxInputs: toPositiveInt(env.MEDIA_MAX_INPUTS, 10),
  maxDurationSeconds: toPositiveInt(env.MEDIA_MAX_DURATION_SECONDS, 3600),
  maxDimension: 8192,
  ffmpegPath: nonBlankOr(env.MEDIA_FFMPEG_PATH, 'ffmpeg'),
  ffprobePath: nonBlankOr(env.MEDIA_FFPROBE_PATH, 'ffprobe'),
  // A partial env (tests pass only a few keys) still searches the process's own PATH.
  niceCommand: resolveNiceCommand({ platform, pathEnv: env.PATH ?? process.env.PATH }),
});
