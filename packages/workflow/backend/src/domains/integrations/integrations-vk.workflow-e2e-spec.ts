// oxlint-disable max-lines -- three end-to-end scenarios with their fixtures.
import type { INode } from '@falang/dto';
import {
  VK_ON_COMMAND_TRIGGER_NAME,
  VK_QUESTION_NAME,
  VK_SEND_BUTTONS_NAME,
  VK_SEND_FILE_NAME,
  VK_SEND_MESSAGE_NAME,
  vkIntegration,
} from '@falang/workflow-integrations-vk';
import { getVkCalls, pushVkUpdate, VK_MOCK_BASE_PLACEHOLDER, type IVkMockCall } from '@falang/workflow-mocks';
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

const sendMessageNode = (id: string, credentialId: string, text: string): INode => ({
  id,
  name: VK_SEND_MESSAGE_NAME,
  data: { credentialId, chatId: 'message.chat.id', text },
});

/** A Bots Long Poll `message_new` update from a private dialog with user `peerId`. */
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

/**
 * Workflow tier (ADR 0018 (private)): a real VK trigger fires a real Temporal workflow in a runner pod, which calls
 * back out to `@falang/workflow-mocks`'s VK mock — driven through `POST /projects/import` + `build`, no browser.
 */
describe('integrations (workflow tier): VK', () => {
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
    name: string,
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
      name,
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

  /** Imports, builds and runs `scenario` against a fresh bot token, then stops and deletes the project. */
  const withRunningProject = async (
    name: string,
    documents: (credentialId: string, botToken: string) => IProjectExportPayload['documents'],
    scenario: (botToken: string) => Promise<void>,
  ): Promise<void> => {
    const botToken = `e2e-vk-${Date.now()}`;
    const credentialId = `cred-${Date.now()}`;
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `${name} ${Date.now()}` },
      folders: [],
      documents: [integrationsDocument(credentialId, botToken), ...documents(credentialId, botToken)],
    };
    const imported = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(fixture);
    expect(imported.status).toBe(201);
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

  const isText = (text: string) => (call: IVkMockCall) =>
    call.method === 'messages.send' && call.params.message === text;

  it('echoes a message, and routes "Start" (payload) with a ref and /help to command triggers', async () => {
    await withRunningProject(
      'Workflow-tier VK echo',
      (credentialId) => [
        triggerDocument('on-message', 'onMessage', credentialId, vkIntegration.triggers[0].name, [
          sendMessageNode('echo', credentialId, 'Echo: ${message.text}'),
        ]),
        triggerDocument(
          'on-start',
          'onStart',
          credentialId,
          VK_ON_COMMAND_TRIGGER_NAME,
          [sendMessageNode('hello', credentialId, 'Hello, ${message.from?.firstName}! ${message.text}')],
          { command: 'start' },
        ),
        triggerDocument(
          'on-help',
          'onHelp',
          credentialId,
          VK_ON_COMMAND_TRIGGER_NAME,
          [sendMessageNode('help', credentialId, 'Help text')],
          { command: 'help' },
        ),
      ],
      async (botToken) => {
        await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [incoming(555, 'hi bot')]);
        const echo = await waitForCall(botToken, isText('Echo: hi bot'));
        expect(echo.params.peer_id).toBe('555');

        await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [
          incoming(556, 'Начать', { payload: '{"command":"start"}', ref: 'ref-1' }),
        ]);
        const hello = await waitForCall(botToken, isText('Hello, User! /start ref-1'));
        expect(hello.params.peer_id).toBe('556');

        await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [incoming(557, '/help')]);
        await waitForCall(botToken, isText('Help text'));
      },
    );
  }, 180_000);

  it('vk-question: ask with callback buttons -> button press -> event answered, buttons removed, confirmation, branch', async () => {
    await withRunningProject(
      'Workflow-tier VK question',
      (credentialId) => [
        triggerDocument('on-message', 'onMessage', credentialId, vkIntegration.triggers[0].name, [
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
        ]),
      ],
      async (botToken) => {
        await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [incoming(777, 'hi bot')]);

        const asked = await waitForCall(
          botToken,
          (call) => call.method === 'messages.send' && call.params.message === 'Pick A or B',
        );
        expect(asked.params.peer_ids).toBe('777');
        const keyboard = JSON.parse(asked.params.keyboard) as { inline: boolean; buttons: unknown[][] };
        expect(keyboard.inline).toBe(true);
        expect(keyboard.buttons).toEqual([
          [{ action: { type: 'callback', label: 'A', payload: JSON.stringify({ falang: 'A' }) } }],
          [{ action: { type: 'callback', label: 'B', payload: JSON.stringify({ falang: 'B' }) } }],
        ]);
        const cmid = asked.conversationMessageId;
        expect(cmid).toBeGreaterThan(0);

        await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [
          {
            type: 'message_event',
            object: {
              user_id: 7,
              peer_id: 777,
              event_id: 'ev-1',
              payload: { falang: 'B' },
              conversation_message_id: cmid,
            },
          },
        ]);

        const ack = await waitForCall(botToken, (call) => call.method === 'messages.sendMessageEventAnswer');
        expect(ack.params).toMatchObject({ event_id: 'ev-1', peer_id: '777' });
        await waitForCall(botToken, (call) => call.method === 'messages.getByConversationMessageId');
        const edit = await waitForCall(botToken, (call) => call.method === 'messages.edit');
        expect(edit.params).toMatchObject({ peer_id: '777', message: 'Pick A or B' });
        expect(JSON.parse(edit.params.keyboard)).toEqual({ buttons: [], inline: true });
        await waitForCall(botToken, isText('Выбрано B'));
        await waitForCall(botToken, isText('Chose B'));
      },
    );
  }, 180_000);

  it('vk-send-buttons: open_link + callback keyboard, a command press runs the on-command trigger', async () => {
    await withRunningProject(
      'Workflow-tier VK buttons',
      (credentialId) => [
        triggerDocument('on-message', 'onMessage', credentialId, vkIntegration.triggers[0].name, [
          {
            id: 'menu',
            name: VK_SEND_BUTTONS_NAME,
            data: {
              credentialId,
              chatId: 'message.chat.id',
              text: 'Menu',
              buttons: JSON.stringify([
                { kind: 'url', text: 'Site', value: 'https://example.com' },
                { kind: 'command', text: 'Help', value: 'help' },
              ]),
            },
          },
        ]),
        triggerDocument(
          'on-help',
          'onHelp',
          credentialId,
          VK_ON_COMMAND_TRIGGER_NAME,
          [sendMessageNode('help', credentialId, 'Help: ${message.text}')],
          { command: 'help' },
        ),
      ],
      async (botToken) => {
        await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [incoming(779, 'hi bot')]);
        const menu = await waitForCall(botToken, isText('Menu'));
        expect(JSON.parse(menu.params.keyboard)).toEqual({
          inline: true,
          buttons: [
            [{ action: { type: 'open_link', link: 'https://example.com', label: 'Site' } }],
            [{ action: { type: 'callback', label: 'Help', payload: JSON.stringify({ falangCommand: '/help' }) } }],
          ],
        });

        await pushVkUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, [
          {
            type: 'message_event',
            object: {
              user_id: 779,
              peer_id: 779,
              event_id: 'ev-help',
              payload: { falangCommand: '/help' },
              conversation_message_id: menu.conversationMessageId,
            },
          },
        ]);
        await waitForCall(botToken, (call) => call.method === 'messages.sendMessageEventAnswer');
        await waitForCall(botToken, isText('Help: /help'));
      },
    );
  }, 180_000);

  it('an incoming photo becomes a File and is sent back through the upload flow', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    await withRunningProject(
      'Workflow-tier VK media',
      (credentialId) => [
        triggerDocument('on-message', 'onMessage', credentialId, vkIntegration.triggers[0].name, [
          {
            id: 'send-back',
            name: VK_SEND_FILE_NAME,
            data: {
              credentialId,
              chatId: 'message.chat.id',
              file: 'message.photo',
              as: 'auto',
              caption: 'Got ${message.photo?.mime}',
            },
          },
        ]),
      ],
      async (botToken) => {
        await pushVkUpdate(
          WORKFLOW_E2E_MOCKS_URL,
          botToken,
          [
            incoming(888, '', {
              attachments: [
                {
                  type: 'photo',
                  photo: {
                    id: 1,
                    sizes: [
                      {
                        type: 'x',
                        width: 100,
                        height: 100,
                        url: `${VK_MOCK_BASE_PLACEHOLDER}/files/${encodeURIComponent(botToken)}/cat.png`,
                      },
                    ],
                  },
                },
              ],
            }),
          ],
          [{ path: 'cat.png', mime: 'image/png', base64: png.toString('base64') }],
        );

        const upload = await waitForCall(botToken, (call) => call.upload?.kind === 'photo');
        expect(upload.upload).toMatchObject({ field: 'photo', byteLength: png.length });

        const sent = await waitForCall(
          botToken,
          (call) =>
            call.method === 'messages.send' &&
            typeof call.params.attachment === 'string' &&
            call.params.attachment.startsWith('photo'),
        );
        expect(sent.params).toMatchObject({ peer_id: '888', message: 'Got image/png' });
      },
    );
  }, 180_000);
});
