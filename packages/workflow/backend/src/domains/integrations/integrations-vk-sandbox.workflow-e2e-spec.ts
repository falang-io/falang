// oxlint-disable unicorn/no-await-expression-member, unicorn/consistent-function-scoping -- polling helpers read one member of an awaited list.
import type { INode } from '@falang/dto';
import {
  VK_ON_COMMAND_TRIGGER_NAME,
  VK_QUESTION_NAME,
  VK_SEND_MESSAGE_NAME,
  vkIntegration,
} from '@falang/workflow-integrations-vk';
import { getVkCalls, pushVkUpdate, type IVkMockCall } from '@falang/workflow-mocks';
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

const incoming = (peerId: number, text: string, message: Record<string, unknown> = {}) => ({
  type: 'message_new',
  object: {
    message: {
      id: 0,
      date: Math.floor(Date.now() / 1000),
      peer_id: peerId,
      from_id: peerId,
      text,
      conversation_message_id: 1,
      out: 0,
      ...message,
    },
  },
});

const sendMessageNode = (id: string, credentialId: string, text: string): INode => ({
  id,
  name: VK_SEND_MESSAGE_NAME,
  data: { credentialId, chatId: 'message.chat.id', text },
});

/**
 * Sandbox ("test") bot, VK flavour — ADR 0073 (private), phase 3. The platform test bot is the mock's token below; a
 * project instance with `devSandbox: true` and no dev token of its own receives, through the shared ingress, only the
 * chats connected with the one-time `vk.me/<community>?ref=fl_…` link, and its outbound calls go through the backend's
 * relay under the test bot's token.
 */
describe('integrations (workflow tier): VK sandbox bot', () => {
  const testBotToken = `sandbox-vk-${Date.now()}`;
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
    const response = await workflowE2eApi()
      .put('/admin/settings/sandbox-bots/vk')
      .set(workflowE2eAuth(token))
      .send({ token: testBotToken });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ vendor: 'vk', configured: true });
  });

  afterAll(async () => {
    await workflowE2eApi().delete('/admin/settings/sandbox-bots/vk').set(workflowE2eAuth(token));
  });

  const calls = (): Promise<readonly IVkMockCall[]> => getVkCalls(WORKFLOW_E2E_MOCKS_URL, testBotToken);
  const sentTo = (all: readonly IVkMockCall[], peerId: number): readonly IVkMockCall[] =>
    all.filter(
      (call) =>
        call.method === 'messages.send' &&
        (call.params.peer_id === String(peerId) || call.params.peer_ids === String(peerId)),
    );
  const textOf = (call: IVkMockCall): string => call.params.message ?? '';

  const waitForSent = (
    peerId: number,
    predicate: (text: string) => boolean,
    timeoutMs = 60_000,
  ): Promise<IVkMockCall> =>
    workflowE2eWaitForValue(
      async () => sentTo(await calls(), peerId).find((call) => predicate(textOf(call))),
      timeoutMs,
    );

  it('connects a chat with the link, echoes and asks through the relay, and refuses unconnected chats', async () => {
    const credentialId = `cred-${Date.now()}`;
    const projectName = `Workflow-tier VK Sandbox ${Date.now()}`;
    const onMessage = vkIntegration.triggers[0];
    const commandTrigger = vkIntegration.triggers.find((candidate) => candidate.name === VK_ON_COMMAND_TRIGGER_NAME);
    if (!commandTrigger) throw new Error('no command trigger');
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
          vendor: vkIntegration.vendor,
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
                vendor: vkIntegration.vendor,
                name: 'Sandbox Bot',
                // No dev token of its own: the dev stand uses the platform test bot.
                fields: { accessToken: { dev: '', prod: 'unused-prod-token' } },
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
          VK_ON_COMMAND_TRIGGER_NAME,
          commandTrigger,
          [
            {
              id: 'question',
              name: VK_QUESTION_NAME,
              data: {
                credentialId,
                chatId: 'message.chat.id',
                question: 'Pick A or B',
                timeout: '',
                options: ['A', 'B'],
              },
              children: ['A', 'B'].map((label) => ({
                id: `question-${label}`,
                name: `${VK_QUESTION_NAME}-option`,
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
      expect(url).toMatch(/^https:\/\/vk\.me\/[A-Za-z0-9_]+\?ref=fl_/);
      const code = url.split('ref=')[1] ?? '';

      // (a) The first message after the link carries `ref` and connects the chat; the workflow is not signalled by it.
      await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, [incoming(9001, 'Start', { ref: code })]);
      const linked = await waitForSent(9001, () => true, 30_000);
      expect(textOf(linked)).toContain(projectName);
      expect(sentTo(await calls(), 9001).filter((call) => textOf(call).startsWith('Echo:'))).toEqual([]);

      // (b) A message of the connected chat reaches the workflow; the echo leaves through the relay.
      await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, [incoming(9001, 'hello sandbox')]);
      const echo = await waitForSent(9001, (text) => text === 'Echo: hello sandbox');
      expect(echo.params.peer_id).toBe('9001');

      // (c) VK may repeat `ref` on later messages; the used code from the bound chat is an ordinary message.
      await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, [incoming(9001, 'again', { ref: code })]);
      await waitForSent(9001, (text) => text === 'Echo: again');
      expect(sentTo(await calls(), 9001).filter((call) => /invalid|недействител/i.test(textOf(call)))).toEqual([]);

      // (d) A question with buttons: the keyboard goes out through the relay (`peer_ids`), the press is answered by
      // the host, and the buttons are removed through the relay.
      await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, [incoming(9001, '/ask')]);
      const asked = await waitForSent(9001, (text) => text === 'Pick A or B');
      expect(asked.params.peer_ids).toBe('9001');
      const keyboard = JSON.parse(asked.params.keyboard) as { inline: boolean; buttons: unknown[][] };
      expect(keyboard.inline).toBe(true);
      expect(keyboard.buttons).toHaveLength(2);
      const cmid = asked.conversationMessageId;
      expect(cmid).toBeGreaterThan(0);
      await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, [
        {
          type: 'message_event',
          object: {
            user_id: 7,
            peer_id: 9001,
            event_id: 'ev-sandbox-1',
            payload: { falang: 'B' },
            conversation_message_id: cmid,
          },
        },
      ]);
      const ack = await workflowE2eWaitForValue(
        async () => (await calls()).find((call) => call.method === 'messages.sendMessageEventAnswer'),
        60_000,
      );
      expect(ack.params).toMatchObject({ event_id: 'ev-sandbox-1', peer_id: '9001' });
      const edit = await workflowE2eWaitForValue(
        async () => (await calls()).find((call) => call.method === 'messages.edit'),
        60_000,
      );
      expect(edit.params).toMatchObject({ peer_id: '9001', message: 'Pick A or B' });
      expect(JSON.parse(edit.params.keyboard)).toEqual({ buttons: [], inline: true });
      expect((await calls()).some((call) => call.method === 'messages.getByConversationMessageId')).toBe(true);
      await waitForSent(9001, (text) => text === 'Chose B');

      // (e) A chat that never connected only gets the service reply; the workflow does not start for it.
      await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, testBotToken, [incoming(9002, 'anybody home?')]);
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
