import type { INestApplication } from '@nestjs/common';
import { WorkflowNotFoundError } from '@temporalio/client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../../test-utils/e2e-app.js';
import { INTERNAL_PROJECT_TOKEN_HEADER } from '../internal-auth/project-token.guard.js';
import { createTasksTestApp } from './tasks-e2e-harness.js';

/**
 * Real-HTTP coverage of `domains/tasks/` over its own in-memory sqlite testing module — see
 * ADR 0040 (private) and the fixed phase-4 contract. Deliberately does
 * **not** reuse the shared `test-utils/e2e-app.ts` harness or import `TasksModule`/`BuildModule`
 * as-is: `BuildModule` constructs `RunnerProcessManager` via a real `KubeConfig().loadFromDefault()`
 * at module-init time, which throws outside a real cluster/kubeconfig — the exact reason
 * `domains/mcp/mcp-test-harness.ts` already avoids importing `BuildModule` into any Nest-compiled
 * test module. `TasksController`/`InternalTasksController` (the real classes, real guards, real
 * `ValidationPipe`) are wired directly with a `TasksService` constructed from fakes for
 * `ensureRunnerRunning`/`signalWorkflow`, mirroring that harness's own "construct the service
 * manually, mount the real controllers" pattern.
 */
describe('tasks (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let harness: Awaited<ReturnType<typeof createTasksTestApp>>;
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    // This suite signs users up through POST /auth/register.
    vi.stubEnv('SELF_SERVICE_SIGNUP', 'true');
    harness = await createTasksTestApp();
    ({ app } = harness);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  const registerAndLogin = (username: string) => harness.registerAndLogin(username);
  const createProject = (token: string) => harness.createProject(token);
  const internalToken = (projectId: string) => harness.internalToken(projectId);
  const internalCreate = (projectId: string, projectToken: string, overrides: Record<string, unknown> = {}) =>
    harness.internalCreate(projectId, projectToken, overrides);

  it('upserts by (workflowId, runId, nodeId) — a retried ask returns the same id', async () => {
    const { token } = await registerAndLogin('owner');
    const projectId = await createProject(token);
    const projectToken = internalToken(projectId);

    const first = await internalCreate(projectId, projectToken);
    expect(first.status).toBe(201);
    expect(first.body.taskId).toEqual(expect.any(String));

    const second = await internalCreate(projectId, projectToken);
    expect(second.status).toBe(201);
    expect(second.body.taskId).toBe(first.body.taskId);
  });

  it("refuses a task for a run that sits on another project's queue (P1-11)", async () => {
    const { token } = await registerAndLogin('owner-foreign');
    const projectId = await createProject(token);
    harness.describeWorkflow.mockResolvedValueOnce({ taskQueue: 'workflow-dev-someone-else' });

    const response = await internalCreate(projectId, internalToken(projectId));

    expect(response.status).toBe(403);
    const list = await request(app.getHttpServer()).get('/tasks').set(auth(token));
    expect(list.body).toHaveLength(0);
  });

  it('lists and fetches a task for the owning user, and 404s for a different user', async () => {
    const { token: ownerToken } = await registerAndLogin('owner2');
    const projectId = await createProject(ownerToken);
    const projectToken = internalToken(projectId);
    const created = await internalCreate(projectId, projectToken);
    const taskId = created.body.taskId as string;

    const list = await request(app.getHttpServer()).get('/tasks').set(auth(ownerToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ id: taskId, status: 'open', title: 'Approve invoice' });

    const detail = await request(app.getHttpServer()).get(`/tasks/${taskId}`).set(auth(ownerToken));
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(taskId);

    const { token: otherToken } = await registerAndLogin('someone-else');
    const otherList = await request(app.getHttpServer()).get('/tasks').set(auth(otherToken));
    expect(otherList.status).toBe(200);
    expect(otherList.body).toEqual([]);

    const otherDetail = await request(app.getHttpServer()).get(`/tasks/${taskId}`).set(auth(otherToken));
    expect(otherDetail.status).toBe(404);
  });

  it('resolves a typed option: wakes the runner, signals the workflow, and returns the resolved task', async () => {
    const { token } = await registerAndLogin('owner3');
    const projectId = await createProject(token);
    const projectToken = internalToken(projectId);
    const created = await internalCreate(projectId, projectToken);
    const taskId = created.body.taskId as string;

    const resolved = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/resolve`)
      .set(auth(token))
      .send({ answer: 'Reject', data: 'too expensive' });

    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('done');
    expect(resolved.body.answer).toBe('Reject');
    expect(resolved.body.answerData).toBe('too expensive');

    expect(harness.ensureRunnerRunning).toHaveBeenCalledWith(projectId, 'dev', `workflow-dev-${projectId}`);
    expect(harness.signalWorkflow).toHaveBeenCalledWith(
      projectId,
      'wf-1',
      'run-1',
      'humanTaskAnswer',
      expect.objectContaining({ messageId: taskId, value: 'Reject', data: 'too expensive' }),
    );

    // Already resolved — a second resolve loses the optimistic race.
    const again = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/resolve`)
      .set(auth(token))
      .send({ answer: 'Approve' });
    expect(again.status).toBe(409);
  });

  it('flips to orphaned when the signal hits a gone workflow, closes an open task via the internal API, and no-ops closing an already-closed one', async () => {
    const { token } = await registerAndLogin('owner4');
    const projectId = await createProject(token);
    const projectToken = internalToken(projectId);

    // First task: resolve races a dead workflow.
    const orphanCandidate = await internalCreate(projectId, projectToken, { nodeId: 'node-orphan' });
    const orphanTaskId = orphanCandidate.body.taskId as string;
    harness.signalWorkflow.mockImplementationOnce(() =>
      Promise.reject(new WorkflowNotFoundError('workflow not found', 'wf-1', 'run-1')),
    );

    const resolved = await request(app.getHttpServer())
      .post(`/tasks/${orphanTaskId}/resolve`)
      .set(auth(token))
      .send({ answer: 'Approve' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe('orphaned');
    expect(resolved.body.orphanReason).toBe('workflow not found');

    // The orphaned resolution leaves a journal entry on that run (ADR 0059 (private) §2c), readable by the owner.
    const journal = await request(app.getHttpServer())
      .get(`/projects/${projectId}/workflows/wf-1/journal`)
      .set(auth(token));
    expect(journal.status).toBe(200);
    expect(journal.body.entries).toHaveLength(1);
    expect(journal.body.entries[0]).toMatchObject({
      workflowId: 'wf-1',
      runId: 'run-1',
      nodeId: 'node-orphan',
      kind: 'error',
      level: 'warn',
      env: 'dev',
      vendor: 'tasks',
    });
    expect(journal.body.entries[0].data).toMatchObject({ errorType: 'WorkflowNotFoundError', answer: 'Approve' });

    // Second task: internal close (a timeout branch) transitions open -> expired, then no-ops.
    const expiring = await internalCreate(projectId, projectToken, { nodeId: 'node-expiring' });
    const expiringTaskId = expiring.body.taskId as string;

    const closed = await request(app.getHttpServer())
      .post(`/internal/tasks/${projectId}/${expiringTaskId}/close`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken)
      .send({ status: 'expired' });
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({});

    const expiredDetail = await request(app.getHttpServer()).get(`/tasks/${expiringTaskId}`).set(auth(token));
    expect(expiredDetail.body.status).toBe('expired');

    // Resolving an already-expired task 409s.
    const resolveExpired = await request(app.getHttpServer())
      .post(`/tasks/${expiringTaskId}/resolve`)
      .set(auth(token))
      .send({ answer: 'Approve' });
    expect(resolveExpired.status).toBe(409);

    // Closing it again (internal, no longer open) is a silent no-op.
    const closeAgain = await request(app.getHttpServer())
      .post(`/internal/tasks/${projectId}/${expiringTaskId}/close`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken)
      .send({ status: 'cancelled' });
    expect(closeAgain.status).toBe(200);
    const stillExpired = await request(app.getHttpServer()).get(`/tasks/${expiringTaskId}`).set(auth(token));
    expect(stillExpired.body.status).toBe('expired');
  });

  it('rejects an internal create/close without a valid project token', async () => {
    const { token } = await registerAndLogin('owner5');
    const projectId = await createProject(token);

    const created = await internalCreate(projectId, 'not-the-real-token');
    expect(created.status).toBe(403);
  });
});
