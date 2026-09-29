import type { IFileRef } from '@falang/workflow-integrations-files';

/**
 * Real, exported function (not a `sharedActivityCode` string) — the runner resolves this whole
 * package from the monorepo's `node_modules` (npm workspaces), so an activity's own `activityCode`
 * can just `import { runMediaJob } from '@falang/workflow-integrations-media';` instead of
 * duplicating this logic as TS source text — same shape `@falang/workflow-integrations-files`'s own
 * `activity-helpers.ts` already uses for `uploadFileFromStream`/etc, see
 * ADR 0041 (private) §3.
 *
 * This module is also part of the browser bundle (the package's `index.ts` re-exports everything,
 * and `@falang/workflow-client-common` depends on the package for `mediaIntegration` itself) — no
 * `import 'node:*'`, no `process.env` access at module scope. Every `process.env` read below happens
 * inside a function body, only ever actually reached when a real runner process calls it.
 */

const POLL_INTERVAL_MS = 2000;

interface IRunMediaJobOptions {
  /** Called on every poll tick with the job's own reported progress (0..1), or with no argument when the job hasn't reported one yet — matches `@temporalio/activity`'s `heartbeat` signature exactly, so a caller can pass that function straight through. */
  readonly heartbeat: (progress?: number) => void;
  /** `Context.current().cancellationSignal`/`cancellationSignal()` — observed once per poll tick; an abort triggers a `DELETE` of the job before this rejects. */
  readonly cancellationSignal?: AbortSignal;
  /** `(projectId, jobKey)` is this job's idempotency key — see the media service's own contract (ADR 0041 (private) §1): a retried activity attempt with the same `jobKey` returns the already-running/-finished job instead of starting a second one. */
  readonly jobKey: string;
  readonly workflowEnv?: string;
  readonly ttlSeconds?: number;
}

interface IMediaJobStatusResponse {
  readonly status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  readonly progress?: number;
  readonly result?: unknown;
  readonly error?: string;
}

/** Resolves after `ms`, or immediately once `signal` aborts — so a cancellation is noticed right away rather than waiting out the rest of the current poll interval. */
const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(timer);
      resolve();
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

const readEnv = (): { readonly baseUrl: string; readonly internalProjectToken: string; readonly projectId: string } => {
  const baseUrl = process.env.MEDIA_SERVICE_URL;
  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;
  const projectId = process.env.PROJECT_ID;
  if (!baseUrl || !internalProjectToken || !projectId) {
    throw new Error('MEDIA_SERVICE_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process');
  }
  return { baseUrl, internalProjectToken, projectId };
};

/**
 * Submits one ffmpeg job to the `media` service and polls it to completion — see
 * ADR 0041 (private) §1/§3. Every registered `media-*` action's
 * `activityCode` calls this with its own `op`/`params`; `inputs` is always the action's `file`/
 * `files` field(s) as a plain array.
 */
export const runMediaJob = async (
  op: string,
  inputs: readonly IFileRef[],
  params: Readonly<Record<string, unknown>>,
  opts: IRunMediaJobOptions,
): Promise<unknown> => {
  const { baseUrl, internalProjectToken, projectId } = readEnv();
  const headers = { 'content-type': 'application/json', 'x-internal-project-token': internalProjectToken };

  const createResponse = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      projectId,
      op,
      inputs,
      params,
      jobKey: opts.jobKey,
      ...(opts.workflowEnv ? { workflowEnv: opts.workflowEnv } : {}),
      ...(typeof opts.ttlSeconds === 'number' ? { ttlSeconds: opts.ttlSeconds } : {}),
    }),
  });
  if (createResponse.status === 429) {
    throw new Error(`media job "${op}" rejected: too many concurrent jobs for this project (429)`);
  }
  if (!createResponse.ok) {
    throw new Error(`media job "${op}" failed to start: ${createResponse.status} ${await createResponse.text()}`);
  }
  const { jobId } = (await createResponse.json()) as { jobId: string };

  const pollUrl = `${baseUrl}/jobs/${jobId}?projectId=${encodeURIComponent(projectId)}`;
  const cancelJob = async (): Promise<void> => {
    try {
      await fetch(pollUrl, { method: 'DELETE', headers: { 'x-internal-project-token': internalProjectToken } });
    } catch {
      // Best-effort — the job may already be done/gone by the time the cancellation reaches here.
    }
  };

  // Sequential by design: one job, polled every `POLL_INTERVAL_MS` until it settles — not a hot
  // path, same reasoning as `schedule-backend.ts`'s own reconcile-tick loops.
  for (;;) {
    if (opts.cancellationSignal?.aborted) {
      // oxlint-disable-next-line no-await-in-loop -- sequential, see the loop's own comment above.
      await cancelJob();
      throw new Error('cancelled');
    }
    // oxlint-disable-next-line no-await-in-loop -- sequential, see the loop's own comment above.
    const response = await fetch(pollUrl, { headers: { 'x-internal-project-token': internalProjectToken } });
    if (!response.ok) {
      // oxlint-disable-next-line no-await-in-loop -- sequential, see the loop's own comment above.
      throw new Error(`media job "${op}" (${jobId}) poll failed: ${response.status} ${await response.text()}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- sequential, see the loop's own comment above.
    const job = (await response.json()) as IMediaJobStatusResponse;
    opts.heartbeat(job.progress);
    if (job.status === 'done') return job.result;
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(`media job "${op}" (${jobId}) ${job.status}: ${job.error ?? 'no error message'}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- sequential, see the loop's own comment above.
    await delay(POLL_INTERVAL_MS, opts.cancellationSignal);
  }
};
