import type { INode } from '@falang/dto';
import {
  VK_CHAT_MEMBER_JOINED_TRIGGER_NAME,
  VK_GROUP_MEMBER_JOINED_TRIGGER_NAME,
  VK_TRIGGER_NAME,
  vkIntegration,
} from '@falang/workflow-integrations-vk';
import { getVkCalls, pushVkUpdate, type IVkMockCall } from '@falang/workflow-mocks';
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
import {
  buildVkDeleteMessageNode,
  buildVkKickFromChatNode,
  buildVkSendMessageNode,
} from '../../test-utils/workflow-e2e-fixtures-vk.js';

const CONVERSATION_PEER_ID = 2_000_000_011;

/** Workflow-tier check of ADR 0076 (private) phase 1 for VK: member triggers and moderation actions against the VK mock. */
describe('integrations (workflow tier): VK community management', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  const integrationsDocument = (
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
          vendor: vkIntegration.vendor,
          name: 'Mock VK Community',
          fields: { accessToken: { dev: botToken, prod: botToken } },
        },
      ],
    },
  });

  const triggerDocument = (
    id: string,
    credentialId: string,
    triggerName: string,
    children: readonly INode[],
    triggerConfig?: Record<string, string>,
  ): IProjectExportPayload['documents'][number] => {
    const trigger = vkIntegration.triggers.find((candidate) => candidate.name === triggerName);
    if (!trigger) throw new Error(`no trigger ${triggerName}`);
    return {
      id,
      type: 'trigger-function',
      name: id.replaceAll('-', ''),
      folderId: null,
      pinned: false,
      root: buildTriggerFunctionRootNode(
        id,
        {
          vendor: vkIntegration.vendor,
          triggerName,
          credentialId,
          scopeVariableName: trigger.scopeVariableName,
          scopeType: trigger.scopeType,
          ...(triggerConfig ? { triggerConfig } : {}),
        },
        [...children],
      ),
      data: null,
    };
  };

  /** Imports, builds and runs `scenario` against a fresh community key, then stops and deletes the project. */
  const withRunningProject = async (
    name: string,
    documents: (credentialId: string) => IProjectExportPayload['documents'],
    scenario: (botToken: string) => Promise<void>,
  ): Promise<void> => {
    const botToken = `e2e-vk-community-${Date.now()}`;
    const credentialId = `cred-${Date.now()}`;
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `${name} ${Date.now()}` },
      folders: [],
      documents: [integrationsDocument(credentialId, botToken), ...documents(credentialId)],
    };
    const imported = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(fixture);
    expect(imported.status, JSON.stringify(imported.body)).toBe(201);
    const projectId = imported.body.id as string;
    try {
      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);
      await scenario(botToken);
      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  };

  const waitForCall = (botToken: string, predicate: (call: IVkMockCall) => boolean): Promise<IVkMockCall> =>
    workflowE2eWaitForValue(async () => {
      const calls = await getVkCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
      return calls.find((call) => predicate(call));
    }, 60_000);

  it('group_join -> vk-group-member-joined -> a welcome message to the new subscriber', async () => {
    await withRunningProject(
      'Workflow-tier VK group join',
      (credentialId) => [
        triggerDocument('onJoin', credentialId, VK_GROUP_MEMBER_JOINED_TRIGGER_NAME, [
          buildVkSendMessageNode('welcome', {
            credentialId,
            chatId: 'event.userId',
            text: 'Welcome, ${event.userId}! (${event.joinType})',
          }),
        ]),
      ],
      async (botToken) => {
        await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [
          { type: 'group_join', object: { user_id: 4242, join_type: 'join' } },
        ]);
        const welcome = await waitForCall(
          botToken,
          (call) => call.method === 'messages.send' && call.params.message === 'Welcome, 4242! (join)',
        );
        expect(welcome.params.peer_id).toBe('4242');
        // The bot switched the member events on itself.
        const settings = await waitForCall(botToken, (call) => call.method === 'groups.setLongPollSettings');
        expect(settings.params).toMatchObject({ group_join: '1', group_leave: '1' });
      },
    );
  }, 180_000);

  it('a chat_invite_user service message -> vk-chat-member-joined -> vk-kick-from-chat removes the member', async () => {
    await withRunningProject(
      'Workflow-tier VK chat join kick',
      (credentialId) => [
        triggerDocument('onChatJoin', credentialId, VK_CHAT_MEMBER_JOINED_TRIGGER_NAME, [
          buildVkKickFromChatNode('kick', { credentialId, chatId: 'event.chat.id', userId: 'event.userId' }),
        ]),
        // The service message must not reach the on-message trigger.
        triggerDocument('onMessage', credentialId, VK_TRIGGER_NAME, [
          buildVkSendMessageNode('echo', { credentialId, chatId: 'message.chat.id', text: 'Echo' }),
        ]),
      ],
      async (botToken) => {
        await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [
          {
            type: 'message_new',
            object: {
              message: {
                id: 0,
                date: Math.floor(Date.now() / 1000),
                peer_id: CONVERSATION_PEER_ID,
                from_id: 9,
                text: '',
                conversation_message_id: 1,
                out: 0,
                action: { type: 'chat_invite_user', member_id: 4242 },
              },
            },
          },
        ]);
        const kick = await waitForCall(botToken, (call) => call.method === 'messages.removeChatUser');
        expect(kick.params).toMatchObject({ chat_id: '11', member_id: '4242' });
        const calls = await getVkCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        expect(calls.some((call) => call.method === 'messages.send')).toBe(false);
      },
    );
  }, 180_000);

  it('on-message with chatType group + conversation per-event deletes every conversation message independently', async () => {
    await withRunningProject(
      'Workflow-tier VK moderation',
      (credentialId) => [
        triggerDocument(
          'moderate',
          credentialId,
          VK_TRIGGER_NAME,
          [
            buildVkDeleteMessageNode('delete', {
              credentialId,
              chatId: 'message.chat.id',
              messageId: 'message.conversationMessageId',
            }),
          ],
          { chatType: 'group', conversation: 'per-event' },
        ),
      ],
      async (botToken) => {
        const spam = (cmid: number) => ({
          type: 'message_new',
          object: {
            message: {
              id: 0,
              date: Math.floor(Date.now() / 1000),
              peer_id: CONVERSATION_PEER_ID,
              from_id: 77,
              text: 'buy now',
              conversation_message_id: cmid,
              out: 0,
            },
          },
        });
        // A private message is outside the filter and must be left alone.
        await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [
          spam(31),
          spam(32),
          {
            type: 'message_new',
            object: {
              message: { id: 0, peer_id: 55, from_id: 55, text: 'hi', conversation_message_id: 1, out: 0, date: 1 },
            },
          },
        ]);
        await waitForCall(botToken, (call) => call.method === 'messages.delete' && call.params.cmids === '31');
        const second = await waitForCall(
          botToken,
          (call) => call.method === 'messages.delete' && call.params.cmids === '32',
        );
        expect(second.params).toMatchObject({
          peer_id: String(CONVERSATION_PEER_ID),
          delete_for_all: '1',
        });
        const allCalls = await getVkCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        const deletes = allCalls.filter((call) => call.method === 'messages.delete');
        expect(deletes).toHaveLength(2);
      },
    );
  }, 180_000);
});
