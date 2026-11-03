// oxlint-disable unicorn/no-await-expression-member, unicorn/consistent-function-scoping -- polling helpers read one member of an awaited list.
import type { INode } from '@falang/dto';
import {
  MAX_ON_COMMAND_TRIGGER_NAME,
  MAX_QUESTION_NAME,
  MAX_SEND_MESSAGE_NAME,
  maxIntegration,
} from '@falang/workflow-integrations-max';
import { getMaxCalls, pushMaxUpdate, type IMaxMockCall } from '@falang/workflow-mocks';
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
import { buildTriggerFunctionRootNode } from '../../test-utils/workflow-e2e-fixtures.js';

/** Import mints fresh credential ids (security audit P0-6), so the id the fixture used is not the stored one. */
const findImportedInstanceId = async (token: string, projectId: string): Promise<string> => {
  const response = await workflowE2eApi().get(`/projects/${projectId}/documents`).set(workflowE2eAuth(token));
  const integrations = (
    response.body as readonly { type: string; data?: { instances: readonly { id: string }[] } }[]
  ).find((doc) => doc.type === 'integrations');
  const id = integrations?.data?.instances[0]?.id;
  if (!id) throw new Error(`No integration instance in project ${projectId}`);
  return id;
};

const sender = { user_id: 7, first_name: 'Ann', last_name: null, username: null, is_bot: false };

const incomingMessage = (chatId: number, text: string) => ({
  update_type: 'message_created',
  message: {
    sender,
    recipient: { chat_id: chatId, chat_type: 'dialog', user_id: 1 },
    timestamp: Date.now(),
    body: { mid: `in.${chatId}.${Math.random().toString(36).slice(2)}`, seq: 1, text, attachments: null },
  },
});

const sendMessageNode = (id: string, credentialId: string, text: string): INode => ({
  id,
  name: MAX_SEND_MESSAGE_NAME,
  data: { credentialId, chatId: 'message.chat.id', text },
});

/**
 * Sandbox ("test") bot, MAX flavour — ADR 0073 (private), phase 2. The platform test bot is the mock's token below; a
 * project instance with `devSandbox: true` and no dev token of its own receives, through the shared ingress, only the
 * chats connected with the one-time link, and its outbound calls (including a question's message read and button
 * removal, checked against the message ownership table) go through the backend's relay under the test bot's token.
 */
describe('integrations (workflow tier): MAX sandbox bot', () => {
  const testBotToken = `sandbox-max-${Date.now()}`;
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
    const response = await workflowE2eApi()
      .put('/admin/settings/sandbox-bots/max')
      .set(workflowE2eAuth(token))
      .send({ token: testBotToken });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ vendor: 'max', configured: true, username: 'mock_max_test_bot' });
  });

  afterAll(async () => {
    await workflowE2eApi().delete('/admin/settings/sandbox-bots/max').set(workflowE2eAuth(token));
  });

  const calls = (): Promise<readonly IMaxMockCall[]> => getMaxCalls(WORKFLOW_E2E_MOCKS_URL, testBotToken);
  const sentTo = (all: readonly IMaxMockCall[], chatId: number): readonly IMaxMockCall[] =>
    all.filter((call) => call.method === 'sendMessage' && String(call.query.chat_id) === String(chatId));
  const textOf = (call: IMaxMockCall): string => (call.body as { text?: string }).text ?? '';

  const waitForSent = (
    chatId: number,
    predicate: (text: string) => boolean,
    timeoutMs = 60_000,
  ): Promise<IMaxMockCall> =>
    workflowE2eWaitForValue(
      async () => sentTo(await calls(), chatId).find((call) => predicate(textOf(call))),
      timeoutMs,
    );

  it('connects a chat with the link, echoes and asks through the relay, and refuses unconnected chats', async () => {
    const credentialId = `cred-${Date.now()}`;
    const projectName = `Workflow-tier MAX Sandbox ${Date.now()}`;
    const onMessage = maxIntegration.triggers[0];
    const triggerDocument = (
      id: string,
      name: string,
      triggerName: string,
      scope: { scopeVariableName: string; scopeType: unknown },
      children: readonly INode[],
      triggerConfig?: Record<string, string>,
    ): IProjectExportPayload['documents'][number] => ({
      id,
      type: 'trigger-function',
      name,
      folderId: null,
      pinned: false,
      root: buildTriggerFunctionRootNode(
        id,
        {
          vendor: maxIntegration.vendor,
          triggerName,
          credentialId,
          scopeVariableName: scope.scopeVariableName,
          scopeType: scope.scopeType,
          ...(triggerConfig ? { triggerConfig } : {}),
        } as Parameters<typeof buildTriggerFunctionRootNode>[1],
        [...children],
      ),
      data: null,
    });
    const commandTrigger = maxIntegration.triggers.find((candidate) => candidate.name === MAX_ON_COMMAND_TRIGGER_NAME);
    if (!commandTrigger) throw new Error('no command trigger');

    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: projectName },
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
                name: 'Sandbox Bot',
                // No dev token of its own: the dev stand uses the platform test bot.
                fields: { botToken: { dev: '', prod: 'unused-prod-token' } },
                devSandbox: true,
              },
            ],
          },
        },
        triggerDocument('on-message', 'onMessage', onMessage.name, onMessage, [
          sendMessageNode('echo', credentialId, 'Echo: ${message.text}'),
        ]),
        triggerDocument(
          'on-ask',
          'onAsk',
          MAX_ON_COMMAND_TRIGGER_NAME,
          commandTrigger,
          [
            {
              id: 'question',
              name: MAX_QUESTION_NAME,
              data: {
                credentialId,
                chatId: 'message.chat.id',
                question: 'Pick A or B',
                timeout: '',
                options: ['A', 'B'],
              },
              children: ['A', 'B'].map((label) => ({
                id: `question-${label}`,
                name: `${MAX_QUESTION_NAME}-option`,
                data: { label },
                children: [sendMessageNode(`chose-${label}`, credentialId, `Chose ${label}`)],
              })),
            },
          ],
          { command: 'ask' },
        ),
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
        .post(`/projects/${projectId}/integrations/${await findImportedInstanceId(token, projectId)}/sandbox-link`)
        .set(workflowE2eAuth(token));
      expect(link.status).toBe(201);
      const url = (link.body as { url: string }).url;
      expect(url).toMatch(/^https:\/\/max\.ru\/mock_max_test_bot\?start=fl_/);
      const code = url.split('start=')[1] ?? '';

      // (a) `bot_started` with the link payload connects the chat; the workflow is not signalled by it.
      await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, {
        update_type: 'bot_started',
        chat_id: 9001,
        user: sender,
        payload: code,
      });
      const linked = await waitForSent(9001, () => true, 30_000);
      expect(textOf(linked)).toContain(projectName);

      // (b) A message of the connected chat reaches the workflow; the echo leaves through the relay.
      await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, incomingMessage(9001, 'hello sandbox'));
      await waitForSent(9001, (text) => text === 'Echo: hello sandbox');
      expect(sentTo(await calls(), 9001).filter((call) => textOf(call).startsWith('Echo:'))).toHaveLength(1);

      // (c) A question with buttons: the message is read and its buttons removed through the relay (the host checks
      // the message belongs to a chat connected to this project), then the host answers the press.
      await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, incomingMessage(9001, '/ask'));
      const asked = await workflowE2eWaitForValue(
        async () => sentTo(await calls(), 9001).find((call) => textOf(call) === 'Pick A or B'),
        60_000,
      );
      expect((asked.body as { attachments?: unknown }).attachments).toEqual([
        {
          type: 'inline_keyboard',
          payload: {
            buttons: [[{ type: 'callback', text: 'A', payload: 'A' }], [{ type: 'callback', text: 'B', payload: 'B' }]],
          },
        },
      ]);
      const mid = asked.mid as string;
      expect(mid).toMatch(/^mid\./);
      await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, {
        update_type: 'message_callback',
        callback: { callback_id: 'cb-sandbox-1', payload: 'B', user: sender },
        message: {
          recipient: { chat_id: 9001, chat_type: 'dialog', user_id: 1 },
          timestamp: Date.now(),
          body: { mid, seq: 2, text: 'Pick A or B' },
        },
      });
      const edit = await workflowE2eWaitForValue(
        async () => (await calls()).find((call) => call.method === 'editMessage'),
        60_000,
      );
      expect(edit).toMatchObject({ query: { message_id: mid }, body: { text: 'Pick A or B', attachments: [] } });
      const all = await calls();
      expect(all.find((call) => call.method === 'getMessage')).toMatchObject({ query: { message_id: mid } });
      expect(all.find((call) => call.method === 'answerCallback')).toMatchObject({
        query: { callback_id: 'cb-sandbox-1' },
      });
      await waitForSent(9001, (text) => text === 'Chose B');

      // (d) A chat that never connected only gets the service reply; the workflow does not start for it.
      await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, incomingMessage(9002, 'anybody home?'));
      const reply = await waitForSent(9002, () => true, 30_000);
      expect(textOf(reply)).not.toContain('Echo:');
      // Give a wrongly routed update time to produce an echo before asserting there is none.
      await new Promise((resolve) => {
        setTimeout(resolve, 5000);
      });
      expect(sentTo(await calls(), 9002).filter((call) => textOf(call).startsWith('Echo:'))).toEqual([]);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 300_000);
});
