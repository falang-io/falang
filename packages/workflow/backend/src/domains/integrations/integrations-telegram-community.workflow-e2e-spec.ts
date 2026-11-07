import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { getTelegramCalls, pushTelegramUpdate } from '@falang/workflow-mocks';
import { beforeAll, describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
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
  buildTelegramModerationNode,
  buildTelegramSendMessageNode,
  buildTriggerFunctionRootNode,
} from '../../test-utils/workflow-e2e-fixtures.js';

/**
 * Workflow-tier spec for ADR 0076 (private), Telegram community management (phases 0-1): member events, a stateless
 * group moderator and a join request, each driven through the Telegram mock's queued updates into a real runner pod.
 * Written against the same harness as `integrations-telegram.workflow-e2e-spec.ts`.
 */
describe('integrations (workflow tier): Telegram community management', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  const GROUP = { id: -1_001_234, type: 'supergroup', title: 'Test group' };
  const USER = { id: 777, is_bot: false, first_name: 'Eve' };

  /** Imports a project with one Telegram trigger document and runs `scenario` against a built dev stand. */
  const withTriggerProject = async (
    params: {
      readonly triggerName: string;
      readonly triggerConfig?: Record<string, string>;
      readonly body: (credentialId: string) => readonly INode[];
    },
    scenario: (botToken: string) => Promise<void>,
  ): Promise<void> => {
    const botToken = `e2e-${Date.now()}`;
    const credentialId = `cred-${Date.now()}`;
    const trigger = telegramIntegration.triggers.find((candidate) => candidate.name === params.triggerName);
    if (!trigger) throw new Error(`unknown trigger ${params.triggerName}`);
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier TG Community ${Date.now()}` },
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
                name: 'Mock Bot',
                fields: { botToken: { dev: botToken, prod: botToken } },
              },
            ],
          },
        },
        {
          id: 'trigger',
          type: 'trigger-function',
          name: 'onEvent',
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
              ...(params.triggerConfig ? { triggerConfig: params.triggerConfig } : {}),
            },
            params.body(credentialId),
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
      await waitForDevRunnerStatus(projectId, true, 60_000);
      await scenario(botToken);
      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  };

  const waitForCall = (botToken: string, method: string) =>
    workflowE2eWaitForValue(async () => {
      const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
      return calls.find((call) => call.method === method);
    }, 60_000);

  it('chat_member join -> telegram-member-joined -> a welcome message in the group', async () => {
    await withTriggerProject(
      {
        triggerName: 'telegram-member-joined',
        body: (credentialId) => [
          buildTelegramSendMessageNode('welcome', {
            credentialId,
            chatId: 'event.chat.id',
            text: 'Welcome, ${event.user.firstName}!',
          }),
        ],
      },
      async (botToken) => {
        await pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
          chat_member: {
            chat: GROUP,
            from: USER,
            date: Math.floor(Date.now() / 1000),
            old_chat_member: { status: 'left', user: USER },
            new_chat_member: { status: 'member', user: USER },
          },
        });
        const call = await waitForCall(botToken, 'sendMessage');
        expect(call.body).toEqual({ chat_id: GROUP.id, text: 'Welcome, Eve!' });
        // The platform subscribes to chat_member explicitly — otherwise Telegram would never have delivered it.
        const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        const poll = calls.find((recorded) => recorded.method === 'getUpdates');
        expect((poll?.body as { allowed_updates?: string[] } | undefined)?.allowed_updates).toContain('chat_member');
      },
    );
  }, 180_000);

  it('group message with a link -> per-event on-message moderator deletes it and bans the author', async () => {
    await withTriggerProject(
      {
        triggerName: 'telegram-trigger',
        triggerConfig: { chatType: 'group', conversation: 'per-event' },
        body: (credentialId) => [
          buildTelegramModerationNode('delete', 'telegram-delete-message', {
            credentialId,
            chatId: 'message.chat.id',
            messageId: 'message.messageId',
          }),
          buildTelegramModerationNode('ban', 'telegram-ban-member', {
            credentialId,
            chatId: 'message.chat.id',
            userId: 'message.from?.id ?? 0',
            untilDate: '',
            revokeMessages: '',
          }),
          buildTelegramSendMessageNode('report', {
            credentialId,
            chatId: 'message.chat.id',
            text: 'links: ${(message.entities ?? []).filter((entity) => entity.type === "url").length}',
          }),
        ],
      },
      async (botToken) => {
        await pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
          message: {
            message_id: 4242,
            date: Math.floor(Date.now() / 1000),
            chat: GROUP,
            from: USER,
            text: 'buy now https://spam.example',
            entities: [{ type: 'url', offset: 8, length: 20 }],
          },
        });
        const deleted = await waitForCall(botToken, 'deleteMessage');
        expect(deleted.body).toMatchObject({ chat_id: GROUP.id, message_id: 4242 });
        const banned = await waitForCall(botToken, 'banChatMember');
        expect(banned.body).toEqual({ chat_id: GROUP.id, user_id: USER.id });
        const report = await waitForCall(botToken, 'sendMessage');
        expect(report.body).toEqual({ chat_id: GROUP.id, text: 'links: 1' });
      },
    );
  }, 180_000);

  it('chat_join_request -> telegram-join-request -> approveChatJoinRequest', async () => {
    await withTriggerProject(
      {
        triggerName: 'telegram-join-request',
        body: (credentialId) => [
          buildTelegramModerationNode('approve', 'telegram-approve-join-request', {
            credentialId,
            chatId: 'request.chat.id',
            userId: 'request.user.id',
          }),
        ],
      },
      async (botToken) => {
        await pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
          chat_join_request: {
            chat: GROUP,
            from: USER,
            user_chat_id: USER.id,
            date: Math.floor(Date.now() / 1000),
          },
        });
        const approved = await waitForCall(botToken, 'approveChatJoinRequest');
        expect(approved.body).toEqual({ chat_id: GROUP.id, user_id: USER.id });
      },
    );
  }, 180_000);
});
