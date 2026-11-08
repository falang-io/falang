import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../export/project-export.service.js';
import {
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eStartAndAwaitResult,
  workflowE2eWaitFor,
} from '../../../test-utils/workflow-e2e-client.js';
import { buildFunctionNode } from '../../../test-utils/workflow-e2e-fixtures.js';

/**
 * Project constants reach the running code: the dev stand runs with the dev values, a published version with the prod
 * values (the compiler bakes the environment's values into the artifact). Workflow tier: import, build, publish, run.
 */
describe('project constants (workflow tier)', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  it('runs the dev build with the dev values and the published version with the prod values', async () => {
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier constants ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'constants',
          type: 'constants',
          name: 'Constants',
          folderId: null,
          pinned: true,
          root: null,
          data: {
            constants: [
              { id: 'c1', name: 'API_URL', type: 'string', dev: 'https://dev.example', prod: 'https://example.com' },
              { id: 'c2', name: 'LIMIT', type: 'number', dev: 1, prod: 10 },
              { id: 'c3', name: 'VERBOSE', type: 'boolean', dev: true, prod: false },
            ],
          },
        },
        {
          id: 'fn',
          type: 'function',
          name: 'describeEnv',
          folderId: null,
          pinned: false,
          root: buildFunctionNode(
            'fn',
            [{ id: 'fn-set', name: 'action', data: 'returnValue = `${API_URL}|${LIMIT * 2}|${VERBOSE}`' }],
            { type: 'string' },
          ),
          data: null,
        },
      ],
    };
    const imported = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(fixture);
    expect(imported.status).toBe(201);
    const projectId = imported.body.id as string;
    try {
      await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token)).expect(202);
      await workflowE2eWaitFor(async () => {
        const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
        return (response.body as { running?: boolean }).running === true;
      }, 60_000);
      expect(await workflowE2eStartAndAwaitResult('describeEnv', `workflow-dev-${projectId}`)).toBe(
        'https://dev.example|2|true',
      );

      await workflowE2eApi().post(`/projects/${projectId}/publish`).set(workflowE2eAuth(token)).expect(202);
      await workflowE2eWaitFor(async () => {
        const response = await workflowE2eApi()
          .post(`/projects/${projectId}/versions/start`)
          .set(workflowE2eAuth(token));
        return response.status < 400;
      }, 20_000);
      expect(await workflowE2eStartAndAwaitResult('describeEnv', `workflow-${projectId}`)).toBe(
        'https://example.com|20|false',
      );
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 180_000);
});
