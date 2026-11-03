// oxlint-disable unicorn/no-await-expression-member, unicorn/consistent-function-scoping -- polling helpers read one member of an awaited list.
import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { getTelegramCalls, pushTelegramUpdate } from '@falang/workflow-mocks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_MOCKS_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eWaitFor,
  workflowE2eWaitForValue,
} from '../../test-utils/workflow-e2e-client.js';
import { buildTelegramSendMessageNode, buildTriggerFunctionRootNode } from '../../test-utils/workflow-e2e-fixtures.js';

/**
 * Sandbox ("test") bot, Telegram flavour — ADR 0073 (private). The platform test bot is the mock's token below; a
 * project instance with `devSandbox: true` and no dev token of its own receives, through the shared ingress, only the
 * chats connected with the one-time link, and its outbound calls go through the backend's relay under the test bot's
 * token. Needs the e2e stack's `TELEGRAM_API_BASE_URL` (backend -> mock) and `BACKEND_INTERNAL_URL` (runner pod ->
 * relay), both already set in `docker-compose.workflow-e2e.yml`.
 */
describe('integrations (workflow tier): Telegram sandbox bot', () => {
  const testBotToken = `sandbox-bot-${Date.now()}`;
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
    const response = await workflowE2eApi()
      .put('/admin/settings/sandbox-bots/telegram')
      .set(workflowE2eAuth(token))
      .send({ token: testBotToken });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ vendor: 'telegram', configured: true, username: 'mock_test_bot' });
  });

  afterAll(async () => {
    await workflowE2eApi().delete('/admin/settings/sandbox-bots/telegram').set(workflowE2eAuth(token));
  });

  const sendCalls = async (): Promise<readonly { text?: string; chat_id?: unknown }[]> => {
    const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, testBotToken);
    return calls.filter((call) => call.method === 'sendMessage').map((call) => call.body as { text?: string });
  };

  const privateMessage = (chatId: number, text: string, messageId: number): Record<string, unknown> => ({
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'private' },
      from: { id: chatId, first_name: 'Tester' },
      text,
    },
  });

  it('connects a chat with the link, echoes through the relay, and refuses unconnected chats', async () => {
    const credentialId = `cred-${Date.now()}`;
    const trigger = telegramIntegration.triggers[0];
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier TG Sandbox ${Date.now()}` },
      folders: [],
      documents: [
        {
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
                name: 'Sandbox Bot',
                // No dev token of its own: the dev stand uses the platform test bot.
                fields: { botToken: { dev: '', prod: 'unused-prod-token' } },
                devSandbox: true,
              },
            ],
          },
        },
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

    const imported = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(fixture);
    expect(imported.status).toBe(201);
    const projectId = imported.body.id as string;
    try {
      const build = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(build.status).toBe(202);
      await workflowE2eWaitFor(async () => {
        const status = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
        return (status.body as { running?: boolean }).running === true;
      }, 60_000);

      const link = await workflowE2eApi()
        .post(`/projects/${projectId}/integrations/${credentialId}/sandbox-link`)
        .set(workflowE2eAuth(token));
      expect(link.status).toBe(201);
      const code = ((link.body as { url: string }).url.split('start=')[1] ?? '').trim();
      expect(code).toMatch(/^fl_/);

      // 1) /start fl_<code> in a private chat connects it.
      await pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, privateMessage(9001, `/start ${code}`, 1));
      await workflowE2eWaitForValue(async () => (await sendCalls()).find((call) => call.chat_id === 9001), 30_000);

      // 2) A plain message of the connected chat reaches the workflow; the echo leaves through the relay.
      await pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, privateMessage(9001, 'hello sandbox', 2));
      await workflowE2eWaitForValue(
        async () => (await sendCalls()).find((call) => call.chat_id === 9001 && call.text === 'Echo: hello sandbox'),
        60_000,
      );

      // 3) A chat that never connected only gets the service reply; the workflow does not start for it.
      await pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, privateMessage(9002, 'anybody home?', 3));
      const reply = await workflowE2eWaitForValue(
        async () => (await sendCalls()).find((call) => call.chat_id === 9002),
        30_000,
      );
      expect(reply.text).not.toContain('Echo:');
      // Give a wrongly routed update time to produce an echo before asserting there is none.
      await new Promise((resolve) => {
        setTimeout(resolve, 5000);
      });
      const echoes = (await sendCalls()).filter((call) => call.chat_id === 9002 && call.text?.startsWith('Echo:'));
      expect(echoes).toEqual([]);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 240_000);
});
