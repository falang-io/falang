import os from 'node:os';

export interface IMediaServiceConfig {
  readonly port: number;
  readonly backendInternalUrl: string;
  readonly maxConcurrentJobs: number;
  readonly maxJobsPerProject: number;
  readonly jobTimeoutMs: number;
  readonly workDir: string;
  readonly outputMaxBytes: number;
  readonly ffmpegThreads: number;
}

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** `MEDIA_WORK_DIR` defaults to `os.tmpdir()` (dev-friendly, no directory needs to exist ahead of
 * time) — the real deployment sets it to `/work`, the pod's sized `emptyDir` (see the ADR's §1). */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): IMediaServiceConfig => ({
  port: toPositiveInt(env.PORT, 4200),
  backendInternalUrl: env.BACKEND_INTERNAL_URL ?? '',
  maxConcurrentJobs: toPositiveInt(env.MEDIA_MAX_CONCURRENT_JOBS, os.cpus().length),
  maxJobsPerProject: toPositiveInt(env.MEDIA_MAX_JOBS_PER_PROJECT, 2),
  jobTimeoutMs: toPositiveInt(env.MEDIA_JOB_TIMEOUT_MS, 15 * 60 * 1000),
  workDir: env.MEDIA_WORK_DIR ?? os.tmpdir(),
  outputMaxBytes: toPositiveInt(env.MEDIA_OUTPUT_MAX_BYTES, 500 * 1024 * 1024),
  ffmpegThreads: toPositiveInt(env.MEDIA_FFMPEG_THREADS, 2),
});
