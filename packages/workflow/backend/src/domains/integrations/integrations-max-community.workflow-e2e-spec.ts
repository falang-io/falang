import type { INode } from '@falang/dto';
import {
  MAX_MEMBER_JOINED_TRIGGER_NAME,
  MAX_SEND_MESSAGE_NAME,
  MAX_TRIGGER_NAME,
  maxIntegration,
} from '@falang/workflow-integrations-max';
import { getMaxCalls, pushMaxUpdate, type IMaxMockCall } from '@falang/workflow-mocks';
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
import { buildMaxDeleteMessageNode, buildMaxRemoveMemberNode } from '../../test-utils/workflow-e2e-fixtures-max.js';

const member = { user_id: 7, first_name: 'Ann', last_name: null, username: null, is_bot: false };

/**
 * Workflow tier (ADR 0018 (private)) for ADR 0076 (private): MAX member events and moderation actions against the
 * MAX mock — a joined member is greeted, a group message is deleted and its author blocked.
 */
describe('integrations (workflow tier): MAX community management', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  const triggerDocument = (
    id: string,
    credentialId: string,
    triggerName: string,
    children: readonly INode[],
    triggerConfig?: Record<string, string>,
  ): IProjectExportPayload['documents'][number] => {
    const trigger = maxIntegration.triggers.find((candidate) => candidate.name === triggerName);
    if (!trigger) throw new Error(`no trigger ${triggerName}`);
    return {
      id,
      type: 'trigger-function',
      name: id,
      folderId: null,
      pinned: false,
      root: buildTriggerFunctionRootNode(
        id,
        {
          vendor: maxIntegration.vendor,
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

  const withRunningProject = async (
    name: string,
    documents: (credentialId: string) => IProjectExportPayload['documents'],
    scenario: (botToken: string) => Promise<void>,
  ): Promise<void> => {
    const botToken = `e2e-max-community-${Date.now()}`;
    const credentialId = `cred-${Date.now()}`;
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `${name} ${Date.now()}` },
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
                vendor: maxIntegration.vendor,
                name: 'Mock MAX Bot',
                fields: { botToken: { dev: botToken, prod: botToken } },
              },
            ],
          },
        },
        ...documents(credentialId),
      ],
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

  const waitForCall = (botToken: string, predicate: (call: IMaxMockCall) => boolean): Promise<IMaxMockCall> =>
    workflowE2eWaitForValue(async () => {
      const calls = await getMaxCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
      return calls.find((call) => predicate(call));
    }, 60_000);

  it('user_added -> the member-joined trigger greets the newcomer', async () => {
    await withRunningProject(
      'Workflow-tier MAX member joined',
      (credentialId) => [
        triggerDocument('onJoin', credentialId, MAX_MEMBER_JOINED_TRIGGER_NAME, [
          {
            id: 'welcome',
            name: MAX_SEND_MESSAGE_NAME,
            data: { credentialId, chatId: 'event.chat.id', text: 'Welcome, ${event.user.firstName}!' },
          },
        ]),
      ],
      async (botToken) => {
        await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
          update_type: 'user_added',
          chat_id: 901,
          user: member,
          inviter_id: 3,
          is_channel: false,
        });
        const greeting = await waitForCall(
          botToken,
          (call) => call.method === 'sendMessage' && (call.body as { text?: string }).text === 'Welcome, Ann!',
        );
        expect(greeting.query).toEqual({ chat_id: '901' });
      },
    );
  }, 150_000);

  it('a group message with chatType=group, conversation=per-event is deleted and its author blocked', async () => {
    await withRunningProject(
      'Workflow-tier MAX moderation',
      (credentialId) => [
        triggerDocument(
          'onGroupMessage',
          credentialId,
          MAX_TRIGGER_NAME,
          [
            buildMaxDeleteMessageNode('del', { credentialId, messageId: 'message.messageId' }),
            buildMaxRemoveMemberNode('ban', {
              credentialId,
              chatId: 'message.chat.id',
              userId: 'message.from!.id',
              block: 'true',
            }),
          ],
          { chatType: 'group', conversation: 'per-event' },
        ),
      ],
      async (botToken) => {
        await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
          update_type: 'message_created',
          message: {
            sender: member,
            recipient: { chat_id: 902, chat_type: 'chat', user_id: null },
            timestamp: Date.now(),
            body: { mid: 'spam.1', seq: 1, text: 'buy now', attachments: null },
          },
        });
        const deleted = await waitForCall(botToken, (call) => call.method === 'deleteMessage');
        expect(deleted.query).toEqual({ message_id: 'spam.1' });
        const removed = await waitForCall(botToken, (call) => call.method === 'removeMember');
        expect(removed.query).toEqual({ chat_id: '902', user_id: '7', block: 'true' });
      },
    );
  }, 150_000);
});
