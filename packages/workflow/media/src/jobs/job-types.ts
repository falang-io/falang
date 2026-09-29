import type { IFileRef, TJobStatus, TMediaJobResult, TMediaOp, TWorkflowEnv } from '../types.js';

export interface IJobRequest {
  readonly projectId: string;
  readonly op: TMediaOp;
  readonly inputs: readonly IFileRef[];
  readonly params: Record<string, unknown>;
  readonly ttlSeconds?: number;
  readonly workflowEnv?: TWorkflowEnv;
  readonly jobKey?: string;
}

/** The full in-memory record — `job-status-view.ts` strips this down to what a client is allowed
 * to see (never `token`). Deliberately not durable (see the ADR's §1/"Decisions" #3): a media pod
 * restart loses every in-flight job, and the *activity*'s own Temporal retry (with the same
 * derived `jobKey`) is what recovers. */
export interface IJob {
  readonly jobId: string;
  readonly projectId: string;
  readonly token: string;
  readonly jobKey?: string;
  readonly request: IJobRequest;
  readonly createdAt: number;
  status: TJobStatus;
  progress?: number;
  result?: TMediaJobResult;
  error?: string;
  finishedAt?: number;
  cancelRequested: boolean;
  /** Set once the job's ffmpeg child is actually spawned — before that, cancelling a queued job is
   * just flipping its status (see `JobQueue.cancel`). */
  kill?: () => void;
}
