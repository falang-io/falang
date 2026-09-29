import { randomUUID } from 'node:crypto';
import type { IJob, IJobRequest } from './job-types.js';

/** How long a finished job's record is kept around for a late `GET`/idempotent `jobKey` lookup —
 * the ADR names this window explicitly (§ contract: 1 hour). */
const FINISHED_JOB_TTL_MS = 60 * 60 * 1000;

const jobKeyOf = (projectId: string, jobKey: string): string => `${projectId}:${jobKey}`;

export class JobStore {
  private readonly jobs = new Map<string, IJob>();
  private readonly byRequestKey = new Map<string, string>();

  createJob(request: IJobRequest, token: string): IJob {
    const job: IJob = {
      jobId: randomUUID(),
      projectId: request.projectId,
      token,
      jobKey: request.jobKey,
      request,
      createdAt: Date.now(),
      status: 'queued',
      cancelRequested: false,
    };
    this.jobs.set(job.jobId, job);
    if (typeof request.jobKey === 'string') this.byRequestKey.set(jobKeyOf(request.projectId, request.jobKey), job.jobId);
    return job;
  }

  get(jobId: string): IJob | undefined {
    return this.jobs.get(jobId);
  }

  findByKey(projectId: string, jobKey: string): IJob | undefined {
    const jobId = this.byRequestKey.get(jobKeyOf(projectId, jobKey));
    if (typeof jobId !== 'string') return;
    return this.jobs.get(jobId);
  }

  /** Queued + running jobs for a project — what `MEDIA_MAX_JOBS_PER_PROJECT` caps. */
  countActive(projectId: string): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.projectId === projectId && (job.status === 'queued' || job.status === 'running')) count += 1;
    }
    return count;
  }

  runningJobs(): readonly IJob[] {
    return Array.from(this.jobs.values()).filter((job) => job.status === 'running');
  }

  sweepFinished(now: number = Date.now()): void {
    for (const [jobId, job] of this.jobs) {
      if (typeof job.finishedAt === 'number' && now - job.finishedAt > FINISHED_JOB_TTL_MS) {
        this.jobs.delete(jobId);
        if (typeof job.jobKey === 'string') this.byRequestKey.delete(jobKeyOf(job.projectId, job.jobKey));
      }
    }
  }
}
