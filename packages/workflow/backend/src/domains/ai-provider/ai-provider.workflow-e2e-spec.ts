// oxlint-disable max-lines-per-function -- three scenario-style runs over one stack.
import { openaiIntegration } from '@falang/workflow-integrations-openai';
import { getOpenAiRequests, queueOpenAiResponse } from '@falang/workflow-mocks';
import { ActivityFailure, ApplicationFailure, WorkflowFailedError } from '@temporalio/client';
import { RetryState } from '@temporalio/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
 * ADR 0081 (private) phase 1: an `openai` instance with `platformProvider` and no key of its own runs `call-ai-text` /
 * `call-ai-choice` through the backend relay (`/internal/ai-provider/:projectId/:env/*`) against the OpenAI mock, which
 * only ever sees the platform key; a model the admin does not offer fails the activity once, non-retryably. The relay
 * runs inside `backend`, so the provider's base URL is the mocks address `backend` reaches — the same
 * `RUNNER_MOCKS_URL` the database specs use for "reachable from backend and pods alike".
 * Usage rows and "the pod never gets the key" are asserted in `ai-provider-relay.e2e.test.ts`.
 */
/** The first `ActivityFailure` down the `cause` chain of a workflow's failure. */
const findActivityFailure = (error: unknown): ActivityFailure | null => {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current instanceof ActivityFailure) return current;
    current = current.cause;
  }
  return null;
};

describe('built-in AI provider (workflow tier)', () => {
  let token = '';
  const platformKey = `sk-platform-${Date.now()}`;

  beforeAll(async () => {
    token = await workflowE2eLogin();
    await workflowE2eApi()
      .put('/admin/settings/ai-provider')
      .set(workflowE2eAuth(token))
      .send({
        baseUrl: `${WORKFLOW_E2E_RUNNER_MOCKS_URL}/openai`,
        apiKey: platformKey,
        models: [{ id: 'mock-model', label: 'Mock model', kind: 'chat' }],
      })
      .expect(200);
  });

  afterAll(async () => {
    await workflowE2eApi().delete('/admin/settings/ai-provider').set(workflowE2eAuth(token));
  });

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  /** Imports one function document, seeds a key-less `platformProvider` instance, starts the dev stand and runs it. */
  const runWithBuiltInProvider = async (
    name: string,
    credentialId: string,
    root: IProjectExportPayload['documents'][number]['root'],
    check: (run: Promise<unknown>) => Promise<void>,
  ): Promise<void> => {
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Built-in AI ${name} ${Date.now()}` },
      folders: [],
      documents: [{ id: 'fn', type: 'function', name, folderId: null, pinned: false, root, data: null }],
    };
    const imported = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(fixture);
    expect(imported.status).toBe(201);
    const projectId = imported.body.id as string;
    try {
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
                name: 'Built-in AI',
                fields: { baseUrl: '', apiKey: { dev: '', prod: '' } },
                platformProvider: true,
              },
            ],
          },
        })
        .expect(200);
      const build = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(build.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      await check(workflowE2eStartAndAwaitResult(name, `workflow-dev-${projectId}`));

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  };

  it('call-ai-text runs through the relay under the platform key', async () => {
    const credentialId = `ai-text-${Date.now()}`;
    await queueOpenAiResponse(WORKFLOW_E2E_MOCKS_URL, platformKey, 'Hello from the built-in provider');
    await runWithBuiltInProvider(
      'askBuiltIn',
      credentialId,
      buildFunctionNode(
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
      async (run) => {
        expect(await run).toBe('Hello from the built-in provider');
      },
    );
    expect(await getOpenAiRequests(WORKFLOW_E2E_MOCKS_URL, platformKey)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ model: 'mock-model', messages: [{ role: 'user', content: 'Say hi' }] }),
      ]),
    );
  }, 150_000);

  it('call-ai-choice branches on the structured answer through the relay', async () => {
    const credentialId = `ai-choice-${Date.now()}`;
    await queueOpenAiResponse(
      WORKFLOW_E2E_MOCKS_URL,
      platformKey,
      JSON.stringify({ result: { action: 'OptionB', data: 'picked' } }),
    );
    await runWithBuiltInProvider(
      'askBuiltInChoice',
      credentialId,
      buildFunctionNode(
        'fn',
        [
          buildCallAiChoiceNode(
            'fn-choice',
            { integration: credentialId, model: 'mock-model', prompt: 'Pick A or B' },
            [
              { alias: 'OptionA', dataType: { type: 'string' }, children: [buildReturnNode('fn-a', '`a:${data}`')] },
              { alias: 'OptionB', dataType: { type: 'string' }, children: [buildReturnNode('fn-b', '`b:${data}`')] },
            ],
          ),
        ],
        { type: 'string' },
      ),
      async (run) => {
        expect(await run).toBe('b:picked');
      },
    );
  }, 150_000);

  it('a model the admin does not offer fails the activity once, non-retryably, with model_not_allowed', async () => {
    const credentialId = `ai-denied-${Date.now()}`;
    await runWithBuiltInProvider(
      'askUnlisted',
      credentialId,
      buildFunctionNode(
        'fn',
        [
          buildCallAiTextNode('fn-call', {
            integration: credentialId,
            model: 'not-listed-model',
            prompt: 'Say hi',
            resultVariable: 'aiReply',
          }),
          buildReturnNode('fn-return', 'aiReply'),
        ],
        { type: 'string' },
      ),
      async (run) => {
        const failure = await run.then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(WorkflowFailedError);
        // The compiled workflow wraps its failure (position details, ADR 0022); the activity's failure is below it.
        const activityFailure = findActivityFailure(failure);
        expect(activityFailure?.retryState).toBe(RetryState.NON_RETRYABLE_FAILURE);
        const cause = activityFailure?.cause;
        expect(cause).toBeInstanceOf(ApplicationFailure);
        expect(cause).toMatchObject({ type: 'model_not_allowed', nonRetryable: true });
      },
    );
    const requests = (await getOpenAiRequests(WORKFLOW_E2E_MOCKS_URL, platformKey)) as { model?: string }[];
    expect(requests.some((request) => request.model === 'not-listed-model')).toBe(false);
  }, 150_000);
});
