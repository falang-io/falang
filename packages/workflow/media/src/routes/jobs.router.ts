import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { MEDIA_OPS, isMediaOp } from '../ops/catalog.js';
import type { JobQueue } from '../jobs/job-queue.js';
import type { JobStore } from '../jobs/job-store.js';
import { toJobStatusView } from '../jobs/job-status-view.js';

const INTERNAL_PROJECT_TOKEN_HEADER = 'x-internal-project-token';

const fileRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  size: z.number().optional(),
  mime: z.string().optional(),
  publicUrl: z.string().optional(),
});

const jobRequestSchema = z.object({
  projectId: z.string().min(1),
  op: z.string().min(1),
  inputs: z.array(fileRefSchema),
  params: z.record(z.string(), z.unknown()).default({}),
  ttlSeconds: z.number().int().positive().optional(),
  workflowEnv: z.enum(['dev', 'prod']).optional(),
  jobKey: z.string().min(1).optional(),
});

export interface IJobsRouterDeps {
  readonly store: JobStore;
  readonly queue: JobQueue;
  readonly maxJobsPerProject: number;
}

const readProjectIdQuery = (req: Request): string | undefined => {
  const value = req.query.projectId;
  if (typeof value !== 'string') return;
  return value;
};

/** A job is visible only to a `(jobId, exact same token)` pair (ADR 0041 (private) §"Аутентификация")
 * — this service never verifies the token against `backend` itself, so a wrong token here just
 * means "not your job", returned identically to "no such job" (404, never 401/403) so a caller
 * can't distinguish a typo'd id from someone else's job. */
const findOwnedJob = (deps: IJobsRouterDeps, req: Request) => {
  const token = req.header(INTERNAL_PROJECT_TOKEN_HEADER);
  const projectId = readProjectIdQuery(req);
  const job = deps.store.get(String(req.params.jobId));
  if (!job || !token || job.token !== token || job.projectId !== projectId) return;
  return job;
};

export const createJobsRouter = (deps: IJobsRouterDeps): Router => {
  const router = Router();

  router.post('/jobs', (req: Request, res: Response) => {
    const token = req.header(INTERNAL_PROJECT_TOKEN_HEADER);
    if (!token) {
      res.status(400).json({ message: `${INTERNAL_PROJECT_TOKEN_HEADER} header is required` });
      return;
    }
    const parsedRequest = jobRequestSchema.safeParse(req.body);
    if (!parsedRequest.success) {
      res.status(400).json({ message: parsedRequest.error.message });
      return;
    }
    const body = parsedRequest.data;
    if (!isMediaOp(body.op)) {
      res.status(400).json({ message: `unknown op: ${body.op}` });
      return;
    }
    const opDef = MEDIA_OPS[body.op];
    const parsedParams = opDef.paramsSchema.safeParse(body.params);
    if (!parsedParams.success) {
      res.status(400).json({ message: parsedParams.error.message });
      return;
    }
    if (body.inputs.length < opDef.minInputs || body.inputs.length > opDef.maxInputs) {
      res.status(400).json({
        message: `op ${body.op} expects ${opDef.minInputs}-${opDef.maxInputs} inputs, got ${body.inputs.length}`,
      });
      return;
    }

    if (body.jobKey) {
      const existing = deps.store.findByKey(body.projectId, body.jobKey);
      if (existing) {
        res.status(202).json({ jobId: existing.jobId });
        return;
      }
    }
    if (deps.store.countActive(body.projectId) >= deps.maxJobsPerProject) {
      res.status(429).json({ message: 'too many concurrent jobs for this project' });
      return;
    }

    const job = deps.store.createJob({ ...body, op: body.op }, token);
    deps.queue.enqueue(job);
    res.status(202).json({ jobId: job.jobId });
  });

  router.get('/jobs/:jobId', (req: Request, res: Response) => {
    const job = findOwnedJob(deps, req);
    if (!job) {
      res.status(404).json({ message: 'job not found' });
      return;
    }
    res.status(200).json(toJobStatusView(job));
  });

  router.delete('/jobs/:jobId', (req: Request, res: Response) => {
    const job = findOwnedJob(deps, req);
    if (!job) {
      res.status(404).json({ message: 'job not found' });
      return;
    }
    deps.queue.cancel(job);
    res.status(200).json({});
  });

  return router;
};
