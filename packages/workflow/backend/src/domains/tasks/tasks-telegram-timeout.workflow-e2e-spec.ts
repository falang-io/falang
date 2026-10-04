import type { INode } from '@falang/dto';
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
import { buildTriggerFunctionRootNode } from '../../test-utils/workflow-e2e-fixtures.js';

/**
 * `telegram-question` also gained `timeoutField` in the same pass as `human-task`
 * (ADR 0040 (private) §4, "Decisions" item 4) — split out of
 * `tasks.workflow-e2e-spec.ts` to stay under this repo's 300-line-per-file lint cap (see CLAUDE.md's
 * "Conventions"). `buildTelegramQuestionWithTimeoutNode` is reimplemented locally rather than added
 * to the shared `buildTelegramQuestionNode` helper (`test-utils/workflow-e2e-fixtures.ts`), same
 * reasoning `integrations-schedule.workflow-e2e-spec.ts`'s own `buildScheduleTriggerFunctionRootNode`
 * gives for its own local reimplementation of a field the shared helper doesn't have.
 */
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

const buildTelegramQuestionWithTimeoutNode = (
  id: string,
  fields: {
    readonly credentialId: string;
    readonly chatId: string;
    readonly question: string;
    readonly timeout: string;
  },
  options: readonly { readonly label: string; readonly children?: readonly INode[] }[],
): INode => ({
  id,
  name: 'telegram-question',
  data: {
    credentialId: fields.credentialId,
    chatId: fields.chatId,
    question: fields.question,
    timeout: fields.timeout,
    options: options.map((option) => option.label),
  },
  children: [
    ...options.map((option, index) => ({
      id: `${id}-option-${index}`,
      name: 'telegram-question-option',
      data: { label: option.label },
      children: [...(option.children ?? [])],
    })),
    { id: `${id}-timeout`, name: 'telegram-question-option', data: { label: 'timeout', fixed: true }, children: [] },
  ],
});

describe('tasks (workflow tier): telegram-question timeout (shared codegen with human-task)', () => {
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

  it('telegram-question with timeout: no button press -> the timeout branch runs and the close activity strips the keyboard', async () => {
    const botToken = `e2e-task-${Date.now()}`;
    const credentialId = `cred-task-${Date.now()}`;
    const trigger = telegramIntegration.triggers[0];
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier TG question timeout ${Date.now()}` },
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
              buildTelegramQuestionWithTimeoutNode(
                'trigger-question',
                { credentialId, chatId: 'message.chat.id', question: 'Pick A or B', timeout: '3s' },
                [{ label: 'A' }, { label: 'B' }],
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
          chat: { id: 888, type: 'private' },
          text: 'hi bot',
        },
      });

      // Never send a `callback_query` — wait for the 3s timeout to close the question on its own.
      await workflowE2eWaitForValue(async () => {
        const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        return calls.find((call) => call.method === 'editMessageReplyMarkup');
      }, 60_000);

      // The timeout message is a separate step after the markup edit — wait for it too.
      await workflowE2eWaitForValue(async () => {
        const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        return calls.find(
          (call) => call.method === 'sendMessage' && (call.body as { text?: string }).text === 'Время истекло',
        );
      }, 60_000);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 150_000);
});
