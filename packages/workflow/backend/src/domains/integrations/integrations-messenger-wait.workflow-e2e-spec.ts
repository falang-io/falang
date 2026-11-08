import type { INode } from '@falang/dto';
import {
  TELEGRAM_ON_COMMAND_TRIGGER_NAME,
  TELEGRAM_TRIGGER_NAME,
  TELEGRAM_WAIT_MESSAGE_NAME,
  telegramIntegration,
} from '@falang/workflow-integrations-telegram';
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
import { buildTelegramSendMessageNode, buildTriggerFunctionRootNode } from '../../test-utils/workflow-e2e-fixtures.js';

/**
 * ADR 0079: the messenger "wait for message" node on the real stack — the node's activity registers the wait through
 * the backend's internal API, the Telegram ingress claims it and plain-signals the run. The run is started by an
 * on-command trigger, so the reply only reaches it through the registry (the usual routing would hand a plain message
 * to the on-message document, which answers "fallback").
 */
const sendNode = (id: string, credentialId: string, text: string): INode =>
  buildTelegramSendMessageNode(id, { credentialId, chatId: 'message.chat.id', text });

const waitNode = (
  id: string,
  credentialId: string,
  timeout: string,
  onMessage: INode[],
  onTimeout: INode[],
): INode => ({
  id,
  name: TELEGRAM_WAIT_MESSAGE_NAME,
  data: { credentialId, chatId: 'message.chat.id', fromUserId: '', timeout, options: [] },
  children: [
    {
      id: `${id}-message`,
      name: `${TELEGRAM_WAIT_MESSAGE_NAME}-option`,
      data: { label: 'message', fixed: true },
      children: onMessage,
    },
    {
      id: `${id}-timeout`,
      name: `${TELEGRAM_WAIT_MESSAGE_NAME}-option`,
      data: { label: 'timeout', fixed: true },
      children: onTimeout,
    },
  ],
});

const triggerFields = (credentialId: string, triggerName: string, triggerConfig?: Record<string, string>) => {
  const trigger = telegramIntegration.triggers.find((candidate) => candidate.name === triggerName);
  if (!trigger) throw new Error(`no trigger ${triggerName}`);
  return {
    vendor: telegramIntegration.vendor,
    triggerName,
    credentialId,
    scopeVariableName: trigger.scopeVariableName,
    scopeType: trigger.scopeType,
    ...(triggerConfig ? { triggerConfig } : {}),
  };
};

const buildFixture = (credentialId: string, botToken: string, timeout: string): IProjectExportPayload => ({
  formatVersion: 1,
  project: { id: '', name: `Workflow-tier TG wait for message ${Date.now()}` },
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
      id: 'on-start',
      type: 'trigger-function',
      name: 'onStart',
      folderId: null,
      pinned: false,
      root: buildTriggerFunctionRootNode(
        'on-start',
        triggerFields(credentialId, TELEGRAM_ON_COMMAND_TRIGGER_NAME, { command: 'start' }),
        [
          sendNode('ask', credentialId, 'What is your name?'),
          waitNode(
            'wait',
            credentialId,
            timeout,
            [sendNode('hello', credentialId, 'Hello, ${reply.text}')],
            [sendNode('bye', credentialId, 'Bye')],
          ),
        ],
      ),
      data: null,
    },
    {
      id: 'on-message',
      type: 'trigger-function',
      name: 'onMessage',
      folderId: null,
      pinned: false,
      root: buildTriggerFunctionRootNode('on-message', triggerFields(credentialId, TELEGRAM_TRIGGER_NAME), [
        sendNode('fallback', credentialId, 'fallback'),
      ]),
      data: null,
    },
  ],
});

describe('messenger "wait for message" (workflow tier, ADR 0079)', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const sentTexts = async (botToken: string): Promise<string[]> => {
    const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
    return calls
      .filter((call) => call.method === 'sendMessage')
      .map((call) => String((call.body as { text?: string }).text ?? ''));
  };

  const waitForText = (botToken: string, text: string): Promise<string> =>
    workflowE2eWaitForValue(async () => {
      const texts = await sentTexts(botToken);
      return texts.find((sent) => sent === text);
    }, 60_000);

  const pushText = (botToken: string, messageId: number, text: string): Promise<void> =>
    pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 555, type: 'private' },
        from: { id: 555, is_bot: false, first_name: 'Ann' },
        text,
      },
    });

  /** Imports, starts the dev stand, runs `body`, stops and deletes the project. */
  const withProject = async (timeout: string, body: (botToken: string) => Promise<void>): Promise<void> => {
    const botToken = `e2e-wait-${Date.now()}`;
    const credentialId = `cred-wait-${Date.now()}`;
    const response = await workflowE2eApi()
      .post('/projects/import')
      .set(workflowE2eAuth(token))
      .send(buildFixture(credentialId, botToken, timeout));
    expect(response.status).toBe(201);
    const projectId = response.body.id as string;
    const runnerIs = (running: boolean, timeoutMs: number): Promise<void> =>
      workflowE2eWaitFor(async () => {
        const status = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
        return (status.body as { running?: boolean }).running === running;
      }, timeoutMs);
    try {
      const build = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(build.status).toBe(202);
      await runnerIs(true, 60_000);
      await body(botToken);
      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await runnerIs(false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  };

  it('delivers the next message to the run started by /start, not to the on-message trigger', async () => {
    await withProject('2m', async (botToken) => {
      await pushText(botToken, 1, '/start');
      await waitForText(botToken, 'What is your name?');
      await pushText(botToken, 2, 'Ann');
      await waitForText(botToken, 'Hello, Ann');
      expect(await sentTexts(botToken)).not.toContain('fallback');
      // The wait was claimed: the next message routes as usual again.
      await pushText(botToken, 3, 'anything else');
      await waitForText(botToken, 'fallback');
    });
  }, 180_000);

  it('takes the timeout branch when nobody writes in time', async () => {
    await withProject('3s', async (botToken) => {
      await pushText(botToken, 1, '/start');
      await waitForText(botToken, 'What is your name?');
      await waitForText(botToken, 'Bye');
      expect(await sentTexts(botToken)).not.toContain('Hello, ');
    });
  }, 180_000);
});
