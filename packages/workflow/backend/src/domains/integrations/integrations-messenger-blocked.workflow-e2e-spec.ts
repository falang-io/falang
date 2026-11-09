import type { INode } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { MAX_SEND_MESSAGE_NAME, maxIntegration } from '@falang/workflow-integrations-max';
import { TELEGRAM_SEND_MESSAGE_NAME, telegramIntegration } from '@falang/workflow-integrations-telegram';
import { VK_SEND_MESSAGE_NAME, vkIntegration } from '@falang/workflow-integrations-vk';
import {
  getMaxCalls,
  getTelegramCalls,
  getVkCalls,
  pushMaxUpdate,
  pushTelegramUpdate,
  pushVkUpdate,
  setBlockedChats,
} from '@falang/workflow-mocks';
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
import { buildTriggerFunctionRootNode } from '../../test-utils/workflow-e2e-fixtures.js';

/** The chat whose user blocked the bot, an ordinary chat, and the chat the scenario reports to. */
const BLOCKED_CHAT = 666;
const OPEN_CHAT = 555;
const REPORT_CHAT = 777;

interface IMessenger {
  readonly vendor: 'telegram' | 'max' | 'vk';
  readonly integration: IWorkflowIntegration;
  readonly sendMessageName: string;
  readonly tokenField: string;
  /** Queues an incoming text message from `chatId`. */
  readonly push: (botToken: string, chatId: number, messageId: number) => Promise<void>;
  /** Texts the bot sent, as the mock recorded them (attempts into a blocked chat included where recorded). */
  readonly sentTexts: (botToken: string) => Promise<string[]>;
}

const MESSENGERS: readonly IMessenger[] = [
  {
    vendor: 'telegram',
    integration: telegramIntegration,
    sendMessageName: TELEGRAM_SEND_MESSAGE_NAME,
    tokenField: 'botToken',
    push: (botToken, chatId, messageId) =>
      pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
        message: {
          message_id: messageId,
          date: Math.floor(Date.now() / 1000),
          chat: { id: chatId, type: 'private' },
          text: 'hi',
        },
      }),
    sentTexts: async (botToken) => {
      const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
      return calls
        .filter((call) => call.method === 'sendMessage')
        .map((call) => String((call.body as { text?: string }).text ?? ''));
    },
  },
  {
    vendor: 'max',
    integration: maxIntegration,
    sendMessageName: MAX_SEND_MESSAGE_NAME,
    tokenField: 'botToken',
    push: (botToken, chatId, messageId) =>
      pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
        update_type: 'message_created',
        message: {
          sender: { user_id: chatId, first_name: 'Ann', last_name: null, username: null, is_bot: false },
          recipient: { chat_id: chatId, chat_type: 'dialog', user_id: 1 },
          timestamp: Date.now(),
          body: { mid: `in.${messageId}`, seq: messageId, text: 'hi', attachments: null },
        },
      }),
    sentTexts: async (botToken) => {
      const calls = await getMaxCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
      return calls
        .filter((call) => call.method === 'sendMessage')
        .map((call) => String((call.body as { text?: string }).text ?? ''));
    },
  },
  {
    vendor: 'vk',
    integration: vkIntegration,
    sendMessageName: VK_SEND_MESSAGE_NAME,
    tokenField: 'accessToken',
    push: (botToken, chatId, messageId) =>
      pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [
        {
          type: 'message_new',
          object: {
            message: {
              id: 0,
              date: Math.floor(Date.now() / 1000),
              peer_id: chatId,
              from_id: chatId,
              text: 'hi',
              conversation_message_id: messageId,
              out: 0,
            },
          },
        },
      ]),
    sentTexts: async (botToken) => {
      const calls = await getVkCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
      return calls.filter((call) => call.method === 'messages.send').map((call) => String(call.params.message ?? ''));
    },
  },
];

const sendNode = (messenger: IMessenger, id: string, credentialId: string, data: Record<string, string>): INode => ({
  id,
  name: messenger.sendMessageName,
  data: { credentialId, ...data },
});

/** Greets the sender keeping the send result, then reports that result to `REPORT_CHAT`. */
const buildFixture = (messenger: IMessenger, credentialId: string, botToken: string): IProjectExportPayload => {
  const trigger = messenger.integration.triggers[0];
  return {
    formatVersion: 1,
    project: { id: '', name: `Workflow-tier ${messenger.vendor} blocked bot ${Date.now()}` },
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
              vendor: messenger.vendor,
              name: 'Mock Bot',
              fields: { [messenger.tokenField]: { dev: botToken, prod: botToken } },
            },
          ],
        },
      },
      {
        id: 'on-message',
        type: 'trigger-function',
        name: 'onMessage',
        folderId: null,
        pinned: false,
        root: buildTriggerFunctionRootNode(
          'on-message',
          {
            vendor: messenger.vendor,
            triggerName: trigger.name,
            credentialId,
            scopeVariableName: trigger.scopeVariableName,
            scopeType: trigger.scopeType,
          },
          [
            sendNode(messenger, 'greet', credentialId, {
              chatId: 'message.chat.id',
              text: 'Hello',
              resultVariable: 'sent',
            }),
            sendNode(messenger, 'report', credentialId, {
              chatId: String(REPORT_CHAT),
              text: 'chat=${message.chat.id} success=${sent.success} disabled=${sent.disabled}',
            }),
          ],
        ),
        data: null,
      },
    ],
  };
};

describe('messenger send actions report a bot the user blocked (workflow tier)', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  it.each(MESSENGERS.map((messenger) => [messenger.vendor, messenger] as const))(
    '%s: a send into a chat that blocked the bot gives { success: false, disabled: true } and the run goes on',
    async (_vendor, messenger) => {
      const botToken = `e2e-blocked-${messenger.vendor}-${Date.now()}`;
      const credentialId = `cred-blocked-${Date.now()}`;
      await setBlockedChats(WORKFLOW_E2E_MOCKS_URL, messenger.vendor, botToken, [BLOCKED_CHAT]);
      const imported = await workflowE2eApi()
        .post('/projects/import')
        .set(workflowE2eAuth(token))
        .send(buildFixture(messenger, credentialId, botToken));
      expect(imported.status).toBe(201);
      const projectId = imported.body.id as string;
      const runnerIs = (running: boolean, timeoutMs: number): Promise<void> =>
        workflowE2eWaitFor(async () => {
          const status = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
          return (status.body as { running?: boolean }).running === running;
        }, timeoutMs);
      const waitForText = (text: string): Promise<string> =>
        workflowE2eWaitForValue(async () => {
          const texts = await messenger.sentTexts(botToken);
          return texts.find((sent) => sent === text);
        }, 60_000);
      try {
        const build = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
        expect(build.status).toBe(202);
        await runnerIs(true, 60_000);

        await messenger.push(botToken, BLOCKED_CHAT, 1);
        await waitForText(`chat=${BLOCKED_CHAT} success=false disabled=true`);

        await messenger.push(botToken, OPEN_CHAT, 2);
        await waitForText(`chat=${OPEN_CHAT} success=true disabled=false`);

        await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
        await runnerIs(false, 20_000);
      } finally {
        await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
      }
    },
    180_000,
  );
});
