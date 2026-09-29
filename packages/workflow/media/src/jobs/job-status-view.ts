import type { IMediaJobStatus } from '../types.js';
import type { IJob } from './job-types.js';

export const toJobStatusView = (job: IJob): IMediaJobStatus => ({
  status: job.status,
  progress: job.progress,
  result: job.result,
  error: job.error,
});
