// oxlint-disable max-lines -- over the default cap because of the "cancel: a still-open task flips
// to `cancelled` when a new dev build cancels the enclosing workflow" case (ADR 0040 (private)
// §4/§5); the four earlier `human-task` cases (open/resolve/scoping/timeout) account for most of
// the file, not accumulated complexity.
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eAwaitWorkflowResult,
  workflowE2eLogin,
  workflowE2eWaitFor,
  workflowE2eWaitForValue,
} from '../../test-utils/workflow-e2e-client.js';
import { buildFunctionNode, buildReturnNode } from '../../test-utils/workflow-e2e-fixtures.js';
import { buildHumanTaskNode } from '../../test-utils/workflow-e2e-fixtures-tasks.js';
import type { IApiTask } from './task.types.js';

/**
 * Workflow-tier spec for ADR 0040 (private) — a `human-task` node
 * blocks a real Temporal workflow, the row shows up on `GET /tasks`, `POST /tasks/:id/resolve`
 * signals the exact same run, and a `timeoutField` (shared codegen with `telegram-question`, ADR §4)
 * takes its automatic `timeout` branch when nobody resolves in time. Same shape as
 * `integrations-telegram.workflow-e2e-spec.ts`/`integrations-schedule.workflow-e2e-spec.ts` — a
 * project imported via `POST /projects/import`, built/run for real against the `falang-workflow-e2e`
 * `kind` stack, asserted through the real backend HTTP surface plus a direct Temporal client for the
 * workflow's own result — no browser, see ADR 0018 (private).
 */
describe('tasks (workflow tier): human-task', () => {
  let token = '';
  let adminUserId = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
    const loginResponse = await workflowE2eApi().post('/auth/login').send({ username: 'admin', password: 'admin' });
    adminUserId = (loginResponse.body as { user: { id: string } }).user.id;
  });

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  const importFixture = async (payload: IProjectExportPayload): Promise<string> => {
    const response = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(payload);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  const buildAndRun = async (
    projectId: string,
    functionName: string,
  ): Promise<{ workflowId: string; runId: string; taskQueue: string }> => {
    const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
    expect(buildResponse.status).toBe(202);
    await waitForDevRunnerStatus(projectId, true, 60_000);
    const runResponse = await workflowE2eApi()
      .post(`/projects/${projectId}/runs`)
      .set(workflowE2eAuth(token))
      .send({ functionName, args: [] });
    expect(runResponse.status).toBe(202);
    return runResponse.body as { workflowId: string; runId: string; taskQueue: string };
  };

  const findOpenTaskByTitle = (title: string, projectId?: string): Promise<IApiTask> =>
    workflowE2eWaitForValue(async () => {
      const response = await workflowE2eApi()
        .get('/tasks')
        .query(projectId ? { projectId } : {})
        .set(workflowE2eAuth(token));
      const tasks = response.body as IApiTask[];
      return tasks.find((task) => task.title === title && task.status === 'open');
    }, 60_000);

  const getTask = async (id: string, asToken = token): Promise<IApiTask> => {
    const response = await workflowE2eApi().get(`/tasks/${id}`).set(workflowE2eAuth(asToken));
    return response.body as IApiTask;
  };

  const stopAndDelete = async (projectId: string): Promise<void> => {
    await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token));
    await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
  };

  it("resolves with a typed per-option value ('Reject' + a string reason) and the resolver's id is in scope as task.resolvedBy", async () => {
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier human-task ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'fn',
          type: 'function',
          name: 'approveOrder',
          folderId: null,
          pinned: false,
          root: buildFunctionNode(
            'fn',
            [
              buildHumanTaskNode('task1', { title: 'Approve order', description: 'Amount: 100' }, [
                {
                  label: 'Approve',
                  dataType: 'void',
                  children: [buildReturnNode('r-approve', "{ branch: 'approve', by: task.resolvedBy }")],
                },
                {
                  label: 'Reject',
                  dataType: 'string',
                  prompt: 'Reason',
                  children: [buildReturnNode('r-reject', "{ branch: 'reject', reason: data, by: task.resolvedBy }")],
                },
              ]),
            ],
            { type: 'any' },
          ),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      const started = await buildAndRun(projectId, 'approveOrder');

      const task = await findOpenTaskByTitle('Approve order', projectId);
      expect(task.description).toBe('Amount: 100');
      expect(task.options).toEqual([
        { label: 'Approve', dataType: 'void' },
        { label: 'Reject', dataType: 'string', prompt: 'Reason' },
      ]);

      const resolveResponse = await workflowE2eApi()
        .post(`/tasks/${task.id}/resolve`)
        .set(workflowE2eAuth(token))
        .send({ answer: 'Reject', data: 'too expensive' });
      expect(resolveResponse.status).toBe(200);

      const result = await workflowE2eAwaitWorkflowResult(started.workflowId, projectId);
      expect(result).toEqual({ branch: 'reject', reason: 'too expensive', by: adminUserId });

      const resolved = await getTask(task.id);
      expect(resolved.status).toBe('done');
      expect(resolved.answer).toBe('Reject');
      expect(resolved.answerData).toBe('too expensive');
      expect(resolved.resolvedBy).toBe(adminUserId);
    } finally {
      await stopAndDelete(projectId);
    }
  }, 150_000);

  it("a second user's token gets 404 on someone else's task (owner-scoped, same rule as Runs)", async () => {
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier human-task ownership ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'fn',
          type: 'function',
          name: 'ownershipTask',
          folderId: null,
          pinned: false,
          root: buildFunctionNode(
            'fn',
            [
              buildHumanTaskNode('task1', { title: 'Ownership check', description: '—' }, [
                { label: 'Approve', dataType: 'void', children: [buildReturnNode('r1', "'approve'")] },
                { label: 'Reject', dataType: 'void', children: [buildReturnNode('r2', "'reject'")] },
              ]),
            ],
            { type: 'any' },
          ),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      await buildAndRun(projectId, 'ownershipTask');
      const task = await findOpenTaskByTitle('Ownership check', projectId);

      const username = `task-e2e-second-${Date.now()}`;
      const registerResponse = await workflowE2eApi()
        .post('/auth/register')
        .send({ username, password: 'password123' });
      expect(registerResponse.status).toBe(201);
      const secondUserToken = (registerResponse.body as { accessToken: string }).accessToken;

      await workflowE2eApi().get(`/tasks/${task.id}`).set(workflowE2eAuth(secondUserToken)).expect(404);
    } finally {
      await stopAndDelete(projectId);
    }
  }, 150_000);

  it('timeout: the node takes its fixed timeout branch and the task row flips to expired', async () => {
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier human-task timeout ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'fn',
          type: 'function',
          name: 'timeoutTask',
          folderId: null,
          pinned: false,
          root: buildFunctionNode(
            'fn',
            [
              buildHumanTaskNode(
                'task1',
                {
                  title: 'Timeout check',
                  description: '—',
                  timeout: '3s',
                  timeoutChildren: [buildReturnNode('r-timeout', "{ branch: 'timeout' }")],
                },
                [
                  { label: 'Approve', dataType: 'void', children: [buildReturnNode('r1', "{ branch: 'approve' }")] },
                  { label: 'Reject', dataType: 'void', children: [buildReturnNode('r2', "{ branch: 'reject' }")] },
                ],
              ),
            ],
            { type: 'any' },
          ),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      const started = await buildAndRun(projectId, 'timeoutTask');
      const task = await findOpenTaskByTitle('Timeout check', projectId);

      const result = await workflowE2eAwaitWorkflowResult(started.workflowId, projectId);
      expect(result).toEqual({ branch: 'timeout' });

      const expired = await getTask(task.id);
      expect(expired.status).toBe('expired');
    } finally {
      await stopAndDelete(projectId);
    }
  }, 150_000);

  it('cancel: a still-open task flips to `cancelled` when a new dev build cancels the enclosing workflow', async () => {
    // See ADR 0040 (private) §4/§5 and `WorkflowRunService.
    // terminateRunningOn`'s own doc comment: `POST /projects/:id/build` clears out every still-
    // running execution on the project's dev task queue before starting the new one — since the
    // "close the open task on cancellation" fix, it does that by *cancelling* first (giving
    // `question-emitters.ts`'s `try/finally` + `CancellationScope.nonCancellable` close-on-cancel
    // a real chance to run) and only force-terminates whatever doesn't finish within the grace
    // window. `POST /projects/:id/stop` is deliberately not used here — per the ADR, stopping the
    // runner pod is not the same thing as cancelling its executions (see `BuildService.stop`).
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier human-task cancel ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'fn',
          type: 'function',
          name: 'cancelTask',
          folderId: null,
          pinned: false,
          root: buildFunctionNode(
            'fn',
            [
              buildHumanTaskNode('task1', { title: 'Cancel check', description: '—' }, [
                { label: 'Approve', dataType: 'void', children: [buildReturnNode('r1', "'approve'")] },
                { label: 'Reject', dataType: 'void', children: [buildReturnNode('r2', "'reject'")] },
              ]),
            ],
            { type: 'any' },
          ),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      await buildAndRun(projectId, 'cancelTask');
      const task = await findOpenTaskByTitle('Cancel check', projectId);

      // A second build on the same project cancels the still-running execution from the first
      // `buildAndRun` above (both `build()` and `startDevRun()` call `terminateRunningOn` on the
      // project's one dev task queue, `devTaskQueue(projectId)` — see `build.service.ts`).
      const rebuildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(rebuildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      const cancelled = await workflowE2eWaitForValue(async () => {
        const current = await getTask(task.id);
        if (current.status === 'cancelled') return current;
      }, 60_000);
      expect(cancelled.status).toBe('cancelled');
    } finally {
      await stopAndDelete(projectId);
    }
  }, 150_000);
});
