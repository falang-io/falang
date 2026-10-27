import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { MEDIA_OPS, isMediaOp } from '../ops/catalog.js';
import type { JobQueue } from '../jobs/job-queue.js';
import type { JobStore } from '../jobs/job-store.js';
import type { IJob } from '../jobs/job-types.js';
import { toJobStatusView } from '../jobs/job-status-view.js';
import { INTERNAL_PROJECT_TOKEN_HEADER } from '../auth/project-token-verifier.js';
import type { TProjectTokenVerifier } from '../auth/project-token-verifier.js';

/** Upper bound on inputs per job, whatever the op itself would allow (concat is unbounded). */
export const MAX_INPUTS_PER_JOB = 10;

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
  readonly verifyProjectToken: TProjectTokenVerifier;
  readonly maxInputs?: number;
}

const readProjectIdQuery = (req: Request): string | undefined => {
  const value = req.query.projectId;
  if (typeof value !== 'string') return;
  return value;
};

/** A job is visible only to the `(projectId, token)` pair that created it. The pair is first
 * verified against `backend` (so `projectId` is trustworthy: 401 for a wrong token, 503 when
 * `backend` cannot be asked), then a job that belongs to someone else is indistinguishable from a
 * missing one (404, so a caller can't tell a typo'd id from another project's job). */
const authenticate = async (
  deps: IJobsRouterDeps,
  projectId: string | undefined,
  token: string | undefined,
  res: Response,
): Promise<boolean> => {
  if (!projectId || !token) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }
  const verdict = await deps.verifyProjectToken(projectId, token);
  if (verdict === 'ok') return true;
  if (verdict === 'unavailable') res.status(503).json({ message: 'Project token verification unavailable' });
  else res.status(401).json({ message: 'Unauthorized' });
  return false;
};

const findOwnedJob = async (deps: IJobsRouterDeps, req: Request, res: Response): Promise<IJob | undefined> => {
  const token = req.header(INTERNAL_PROJECT_TOKEN_HEADER);
  const projectId = readProjectIdQuery(req);
  if (!(await authenticate(deps, projectId, token, res))) return;
  const job = deps.store.get(String(req.params.jobId));
  if (!job || job.token !== token || job.projectId !== projectId) {
    res.status(404).json({ message: 'job not found' });
    return;
  }
  return job;
};

/** Express 4 does not catch rejected promises, so async handlers are forwarded to `next` explicitly. */
const handle =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

export const createJobsRouter = (deps: IJobsRouterDeps): Router => {
  const router = Router();

  router.post(
    '/jobs',
    handle(async (req: Request, res: Response) => {
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
      if (!(await authenticate(deps, body.projectId, token, res))) return;
      const maxInputs = deps.maxInputs ?? MAX_INPUTS_PER_JOB;
      if (body.inputs.length > maxInputs) {
        res.status(400).json({ message: `too many inputs: ${body.inputs.length} (max ${maxInputs})` });
        return;
      }
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
    }),
  );

  router.get(
    '/jobs/:jobId',
    handle(async (req: Request, res: Response) => {
      const job = await findOwnedJob(deps, req, res);
      if (!job) return;
      res.status(200).json(toJobStatusView(job));
    }),
  );

  router.delete(
    '/jobs/:jobId',
    handle(async (req: Request, res: Response) => {
      const job = await findOwnedJob(deps, req, res);
      if (!job) return;
      deps.queue.cancel(job);
      res.status(200).json({});
    }),
  );

  return router;
};
