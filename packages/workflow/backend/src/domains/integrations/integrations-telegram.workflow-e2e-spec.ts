import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { getTelegramCalls, pushTelegramUpdate } from '@falang/workflow-mocks';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_MOCKS_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eWaitFor,
  workflowE2eWaitForValue,
} from '../../test-utils/workflow-e2e-client.js';
import {
  buildTelegramQuestionNode,
  buildTelegramSendMessageNode,
  buildTriggerFunctionRootNode,
} from '../../test-utils/workflow-e2e-fixtures.js';

/**
 * Workflow-tier port of `@falang/workflow-e2e-tests`' `integrations-telegram.spec.ts` — see
 * ADR 0018 (private). Same assertions (a real Telegram trigger fires a
 * real Temporal workflow through a real runner pod, which really calls back out to the Telegram
 * mock), driven entirely through `POST /projects/import` + `build` HTTP calls instead of the project
 * tree/toolbar UI — no browser. The credential is embedded directly into the fixture rather than
 * `PATCH`ed in afterward — see `integrations-webhook.workflow-e2e-spec.ts`'s doc comment for why
 * that's safe (a credential's id is never backend-assigned, unlike a document's own id).
 */
describe('integrations (workflow tier): Telegram', () => {
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

  const buildIntegrationsDocument = (
    credentialId: string,
    botToken: string,
  ): IProjectExportPayload['documents'][number] => ({
    id: 'integrations',
    type: 'integrations',
    name: 'Integrations',
    folderId: null,
    pinned: true,
    root: null,
    data: {
      instances: [
        {
          id: credentialId,
          vendor: telegramIntegration.vendor,
          name: 'Mock Bot',
          fields: { botToken: { dev: botToken, prod: botToken } },
        },
      ],
    },
  });

  it('telegram trigger -> telegram-send-message round-trips through the Telegram mock', async () => {
    const botToken = `e2e-${Date.now()}`;
    const credentialId = `cred-${Date.now()}`;
    const trigger = telegramIntegration.triggers[0];
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier TG Trigger ${Date.now()}` },
      folders: [],
      documents: [
        buildIntegrationsDocument(credentialId, botToken),
        {
          id: 'trigger',
          type: 'trigger-function',
          name: 'onMessage',
          folderId: null,
          pinned: false,
          root: buildTriggerFunctionRootNode(
            'trigger',
            {
              vendor: telegramIntegration.vendor,
              triggerName: trigger.name,
              credentialId,
              scopeVariableName: trigger.scopeVariableName,
              scopeType: trigger.scopeType,
            },
            [
              buildTelegramSendMessageNode('trigger-send', {
                credentialId,
                chatId: 'message.chat.id',
                text: 'Echo: ${message.text}',
              }),
            ],
          ),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      await pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
        message: {
          message_id: 100,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 555, type: 'private' },
          text: 'hi bot',
        },
      });

      const sendMessageCall = await workflowE2eWaitForValue(async () => {
        const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        return calls.find((call) => call.method === 'sendMessage');
      }, 60_000);

      expect(sendMessageCall.body).toEqual({ chat_id: 555, text: 'Echo: hi bot' });

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 150_000);

  it('telegram-question: ask -> button press (mock callback_query) -> confirm + branch', async () => {
    const botToken = `e2e-${Date.now()}`;
    const credentialId = `cred-${Date.now()}`;
    const trigger = telegramIntegration.triggers[0];
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier TG Question ${Date.now()}` },
      folders: [],
      documents: [
        buildIntegrationsDocument(credentialId, botToken),
        {
          id: 'trigger',
          type: 'trigger-function',
          name: 'onMessage',
          folderId: null,
          pinned: false,
          root: buildTriggerFunctionRootNode(
            'trigger',
            {
              vendor: telegramIntegration.vendor,
              triggerName: trigger.name,
              credentialId,
              scopeVariableName: trigger.scopeVariableName,
              scopeType: trigger.scopeType,
            },
            [
              buildTelegramQuestionNode(
                'trigger-question',
                { credentialId, chatId: 'message.chat.id', question: 'Pick A or B' },
                [
                  {
                    label: 'A',
                    children: [
                      buildTelegramSendMessageNode('trigger-a', {
                        credentialId,
                        chatId: 'message.chat.id',
                        text: 'Chose A',
                      }),
                    ],
                  },
                  {
                    label: 'B',
                    children: [
                      buildTelegramSendMessageNode('trigger-b', {
                        credentialId,
                        chatId: 'message.chat.id',
                        text: 'Chose B',
                      }),
                    ],
                  },
                ],
              ),
            ],
          ),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      await pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
        message: {
          message_id: 100,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 777, type: 'private' },
          text: 'hi bot',
        },
      });

      // The question is the first `sendMessage` this fresh token's mock state ever sees, so the mock
      // deterministically assigns it `message_id: 1` — that's what the `callback_query` below references.
      const questionCall = await workflowE2eWaitForValue(async () => {
        const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        return calls.find((call) => call.method === 'sendMessage');
      }, 60_000);
      expect((questionCall.body as { reply_markup?: unknown }).reply_markup).toEqual({
        inline_keyboard: [[{ text: 'A', callback_data: 'A' }], [{ text: 'B', callback_data: 'B' }]],
      });

      await pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
        callback_query: {
          id: 'cbq-1',
          data: 'B',
          message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: 777, type: 'private' } },
        },
      });

      await workflowE2eWaitForValue(async () => {
        const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        return calls.find(
          (call) => call.method === 'sendMessage' && (call.body as { text?: string }).text === 'Выбрано B',
        );
      }, 60_000);

      // Each of these is produced by a different step of the workflow, so none may be assumed present just
      // because another one already is — wait for each.
      await workflowE2eWaitForValue(async () => {
        const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        return calls.find((call) => call.method === 'editMessageReplyMarkup');
      }, 60_000);
      await workflowE2eWaitForValue(async () => {
        const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        return calls.find(
          (call) => call.method === 'sendMessage' && (call.body as { text?: string }).text === 'Chose B',
        );
      }, 60_000);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 150_000);
});
