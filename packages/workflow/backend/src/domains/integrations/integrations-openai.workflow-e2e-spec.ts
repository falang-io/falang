import { openaiIntegration } from '@falang/workflow-integrations-openai';
import { getOpenAiRequests, queueOpenAiResponse } from '@falang/workflow-mocks';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_MOCKS_URL,
  WORKFLOW_E2E_RUNNER_MOCKS_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eGetIntegrationsDocumentId,
  workflowE2eLogin,
  workflowE2eStartAndAwaitResult,
  workflowE2eWaitFor,
} from '../../test-utils/workflow-e2e-client.js';
import {
  buildCallAiChoiceNode,
  buildCallAiTextNode,
  buildFunctionNode,
  buildReturnNode,
} from '../../test-utils/workflow-e2e-fixtures.js';

/**
 * Workflow-tier port of `@falang/workflow-e2e-tests`' `integrations-openai.spec.ts` — see
 * ADR 0018 (private). Same assertions (a real `call-ai-text`/
 * `call-ai-choice` node's activity round-trips through the OpenAI mock from inside a real runner
 * pod), driven entirely through `POST /projects/import` + a credential-seeding `PATCH` +
 * `build`/`stop` HTTP calls instead of the project tree/toolbar UI — no browser. Needs the real
 * `docker-compose.workflow-e2e.yml` stack up first, `mocks` included — see
 * `build-and-run.workflow-e2e-spec.ts`'s own doc comment for how to run this file directly
 * (`npm run test-e2e:workflow`).
 */
describe('integrations (workflow tier): OpenAI', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
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

  const seedOpenAiCredential = async (projectId: string, credentialId: string, apiKey: string): Promise<void> => {
    const integrationsDocId = await workflowE2eGetIntegrationsDocumentId(token, projectId);
    await workflowE2eApi()
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(workflowE2eAuth(token))
      .send({
        data: {
          instances: [
            {
              id: credentialId,
              vendor: openaiIntegration.vendor,
              name: 'Mock OpenAI',
              fields: { baseUrl: `${WORKFLOW_E2E_RUNNER_MOCKS_URL}/openai`, apiKey: { dev: apiKey, prod: apiKey } },
            },
          ],
        },
      })
      .expect(200);
  };

  it('call-ai-text: request/response round-trips through the OpenAI mock', async () => {
    const apiKey = `key-${Date.now()}`;
    const credentialId = `cred-${Date.now()}`;
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier AI Text ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'fn',
          type: 'function',
          name: 'askAi',
          folderId: null,
          pinned: false,
          root: buildFunctionNode(
            'fn',
            [
              buildCallAiTextNode('fn-call', {
                integration: credentialId,
                model: 'mock-model',
                prompt: 'Say hi',
                resultVariable: 'aiReply',
              }),
              buildReturnNode('fn-return', 'aiReply'),
            ],
            { type: 'string' },
          ),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      await seedOpenAiCredential(projectId, credentialId, apiKey);
      await queueOpenAiResponse(WORKFLOW_E2E_MOCKS_URL, apiKey, 'Hello from the mock');

      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      const result = await workflowE2eStartAndAwaitResult('askAi', `workflow-dev-${projectId}`);
      expect(result).toBe('Hello from the mock');

      const requests = await getOpenAiRequests(WORKFLOW_E2E_MOCKS_URL, apiKey);
      expect(requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ model: 'mock-model', messages: [{ role: 'user', content: 'Say hi' }] }),
        ]),
      );

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 150_000);

  it('call-ai-choice: structured response branches to the correct option', async () => {
    const apiKey = `key-${Date.now()}`;
    const credentialId = `cred-${Date.now()}`;
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier AI Choice ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'fn',
          type: 'function',
          name: 'askChoice',
          folderId: null,
          pinned: false,
          root: buildFunctionNode(
            'fn',
            [
              buildCallAiChoiceNode(
                'fn-choice',
                { integration: credentialId, model: 'mock-model', prompt: 'Pick A or B' },
                [
                  {
                    alias: 'OptionA',
                    dataType: { type: 'string' },
                    children: [buildReturnNode('fn-return-a', '`a:${data}`')],
                  },
                  {
                    alias: 'OptionB',
                    dataType: { type: 'string' },
                    children: [buildReturnNode('fn-return-b', '`b:${data}`')],
                  },
                ],
              ),
            ],
            { type: 'string' },
          ),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      await seedOpenAiCredential(projectId, credentialId, apiKey);
      await queueOpenAiResponse(
        WORKFLOW_E2E_MOCKS_URL,
        apiKey,
        JSON.stringify({ result: { action: 'OptionB', data: 'picked' } }),
      );

      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      const result = await workflowE2eStartAndAwaitResult('askChoice', `workflow-dev-${projectId}`);
      expect(result).toBe('b:picked');

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 150_000);
});
