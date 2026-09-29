import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_RUNNER_MOCKS_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eStartAndAwaitResult,
  workflowE2eWaitFor,
} from '../../test-utils/workflow-e2e-client.js';
import { buildFunctionNode, buildHttpRequestNode, buildReturnNode } from '../../test-utils/workflow-e2e-fixtures.js';

/**
 * Workflow-tier port of `@falang/workflow-e2e-tests`' `integrations-http.spec.ts` — see
 * ADR 0018 (private). Same assertion (a real `http-request` node's
 * activity round-trips through the mocks server from inside a real runner pod), driven entirely
 * through `POST /projects/import` + `build`/`stop` HTTP calls instead of the project tree/toolbar
 * UI — no browser, no credential/integration setup needed (`http-request` has `credentialFields: []`).
 * Needs the real `docker-compose.workflow-e2e.yml` stack up first, `mocks` included — see
 * `build-and-run.workflow-e2e-spec.ts`'s own doc comment for how to run this file directly
 * (`npm run test-e2e:workflow`).
 */
describe('integrations (workflow tier): HTTP Request', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  it('http-request: GET round-trips through the mocks server, no credential/integration setup required', async () => {
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier HTTP Request ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'fn',
          type: 'function',
          name: 'callHttp',
          folderId: null,
          pinned: false,
          root: buildFunctionNode(
            'fn',
            [
              buildHttpRequestNode('fn-call', {
                method: 'GET',
                url: `${WORKFLOW_E2E_RUNNER_MOCKS_URL}/`,
                resultVariable: 'httpResult',
              }),
              buildReturnNode('fn-return', 'JSON.stringify(httpResult.body)'),
            ],
            { type: 'string' },
          ),
          data: null,
        },
      ],
    };

    const importResponse = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(fixture);
    expect(importResponse.status).toBe(201);
    const projectId = importResponse.body.id as string;

    try {
      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      const result = await workflowE2eStartAndAwaitResult('callHttp', `workflow-dev-${projectId}`);
      expect(result).toBe('{"ok":true}');

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 150_000);
});
