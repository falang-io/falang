// oxlint-disable max-lines -- three end-to-end scenarios with their fixtures.
import type { INode } from '@falang/dto';
import {
  MAX_GET_MESSAGE_NAME,
  MAX_GET_MESSAGES_NAME,
  MAX_ON_COMMAND_TRIGGER_NAME,
  MAX_QUESTION_NAME,
  MAX_SEND_BUTTONS_NAME,
  MAX_SEND_FILE_NAME,
  MAX_SEND_MESSAGE_NAME,
  maxIntegration,
} from '@falang/workflow-integrations-max';
import { getMaxCalls, MAX_MOCK_BASE_PLACEHOLDER, pushMaxUpdate, type IMaxMockCall } from '@falang/workflow-mocks';
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
  name: MAX_SEND_MESSAGE_NAME,
  data: { credentialId, chatId: 'message.chat.id', text },
});

const sender = { user_id: 7, first_name: 'Ann', last_name: null, username: null, is_bot: false };

const incomingMessage = (chatId: number, mid: string, text: string | null, attachments: unknown[] | null = null) => ({
  update_type: 'message_created',
  message: {
    sender,
    recipient: { chat_id: chatId, chat_type: 'dialog', user_id: 1 },
    timestamp: Date.now(),
    body: { mid, seq: 1, text, attachments },
  },
});

/**
 * Workflow tier (ADR 0018 (private)): a real MAX trigger fires a real Temporal workflow in a runner pod, which calls
 * back out to `@falang/workflow-mocks`'s MAX mock — driven through `POST /projects/import` + `build`, no browser.
 */
describe('integrations (workflow tier): MAX', () => {
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
          vendor: maxIntegration.vendor,
          name: 'Mock MAX Bot',
          fields: { botToken: { dev: botToken, prod: botToken } },
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
    const trigger = maxIntegration.triggers.find((candidate) => candidate.name === triggerName);
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

  /** Imports, builds and runs `scenario` against a fresh bot token, then stops and deletes the project. */
  const withRunningProject = async (
    name: string,
    documents: (credentialId: string, botToken: string) => IProjectExportPayload['documents'],
    scenario: (botToken: string) => Promise<void>,
  ): Promise<void> => {
    const botToken = `e2e-max-${Date.now()}`;
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

  const waitForCall = (botToken: string, predicate: (call: IMaxMockCall) => boolean): Promise<IMaxMockCall> =>
    workflowE2eWaitForValue(async () => {
      const calls = await getMaxCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
      return calls.find((call) => predicate(call));
    }, 60_000);

  const isTextMessage = (text: string) => (call: IMaxMockCall) =>
    call.method === 'sendMessage' && (call.body as { text?: string }).text === text;

  it('echoes a message, and routes "Start" (bot_started) to the /start command trigger', async () => {
    await withRunningProject(
      'Workflow-tier MAX echo',
      (credentialId) => [
        triggerDocument('on-message', 'onMessage', credentialId, maxIntegration.triggers[0].name, [
          sendMessageNode('echo', credentialId, 'Echo: ${message.text}'),
        ]),
        triggerDocument(
          'on-start',
          'onStart',
          credentialId,
          MAX_ON_COMMAND_TRIGGER_NAME,
          [sendMessageNode('hello', credentialId, 'Hello, ${message.from?.firstName}! ${message.text}')],
          { command: 'start' },
        ),
      ],
      async (botToken) => {
        await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, incomingMessage(555, 'in.1', 'hi bot'));
        const echo = await waitForCall(botToken, isTextMessage('Echo: hi bot'));
        expect(echo.query).toEqual({ chat_id: '555' });

        await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
          update_type: 'bot_started',
          chat_id: 556,
          user: sender,
          payload: 'ref-1',
        });
        const hello = await waitForCall(botToken, isTextMessage('Hello, Ann! /start ref-1'));
        expect(hello.query).toEqual({ chat_id: '556' });
      },
    );
  }, 150_000);

  it('max-get-messages / max-get-message: reads the chat history oldest first and one message by id', async () => {
    await withRunningProject(
      'Workflow-tier MAX read messages',
      (credentialId) => [
        triggerDocument('on-message', 'onMessage', credentialId, maxIntegration.triggers[0].name, [
          sendMessageNode('first', credentialId, 'first'),
          sendMessageNode('second', credentialId, 'second'),
          {
            id: 'history',
            name: MAX_GET_MESSAGES_NAME,
            data: { credentialId, chatId: 'message.chat.id', count: '10', resultVariable: 'history' },
          },
          {
            id: 'one',
            name: MAX_GET_MESSAGE_NAME,
            data: { credentialId, messageId: 'history[0].messageId', resultVariable: 'one' },
          },
          sendMessageNode('report', credentialId, "Read: ${history.map((m) => m.text).join('|')}; one: ${one.text}"),
        ]),
      ],
      async (botToken) => {
        await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, incomingMessage(560, 'in.r1', 'read'));
        await waitForCall(botToken, isTextMessage('Read: first|second; one: first'));
        const list = await waitForCall(botToken, (call) => call.method === 'getMessages');
        expect(list.query).toEqual({ chat_id: '560', count: '10' });
      },
    );
  }, 150_000);

  it('max-question: ask with an inline keyboard -> button press -> buttons removed, confirmation, branch', async () => {
    await withRunningProject(
      'Workflow-tier MAX question',
      (credentialId) => [
        triggerDocument('on-message', 'onMessage', credentialId, maxIntegration.triggers[0].name, [
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
        ]),
      ],
      async (botToken) => {
        await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, incomingMessage(777, 'in.1', 'hi bot'));

        // The press must carry the question's real `mid`: the mock's mids are globally unique, and removing the buttons
        // reads the message back by that id (`GET /messages/<mid>`).
        const asked = await waitForCall(botToken, isTextMessage('Pick A or B'));
        const questionMid = asked.mid ?? '';
        expect((asked.body as { attachments?: unknown }).attachments).toEqual([
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [{ type: 'callback', text: 'A', payload: 'A' }],
                [{ type: 'callback', text: 'B', payload: 'B' }],
              ],
            },
          },
        ]);

        await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
          update_type: 'message_callback',
          callback: { callback_id: 'cb-1', payload: 'B', user: sender },
          message: {
            recipient: { chat_id: 777, chat_type: 'dialog', user_id: 1 },
            timestamp: Date.now(),
            body: { mid: questionMid, seq: 2, text: 'Pick A or B' },
          },
        });

        const ack = await waitForCall(botToken, (call) => call.method === 'answerCallback');
        expect(ack.query).toEqual({ callback_id: 'cb-1' });
        const edit = await waitForCall(botToken, (call) => call.method === 'editMessage');
        expect(edit).toMatchObject({
          query: { message_id: questionMid },
          body: { text: 'Pick A or B', attachments: [] },
        });
        await waitForCall(botToken, isTextMessage('Выбрано B'));
        await waitForCall(botToken, isTextMessage('Chose B'));
      },
    );
  }, 150_000);

  it('max-send-buttons: link + callback keyboard, a command press runs the on-command trigger', async () => {
    await withRunningProject(
      'Workflow-tier MAX buttons',
      (credentialId) => [
        triggerDocument('on-message', 'onMessage', credentialId, maxIntegration.triggers[0].name, [
          {
            id: 'menu',
            name: MAX_SEND_BUTTONS_NAME,
            data: {
              credentialId,
              chatId: 'message.chat.id',
              text: 'Menu',
              buttons: JSON.stringify([
                { kind: 'url', text: 'Site', value: 'https://example.com' },
                { kind: 'command', text: 'Help', value: '/help' },
              ]),
            },
          },
        ]),
        triggerDocument(
          'on-help',
          'onHelp',
          credentialId,
          MAX_ON_COMMAND_TRIGGER_NAME,
          [sendMessageNode('help', credentialId, 'Help for ${message.from?.firstName}: ${message.text}')],
          { command: 'help' },
        ),
      ],
      async (botToken) => {
        await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, incomingMessage(778, 'in.1', 'hi bot'));
        const menu = await waitForCall(botToken, isTextMessage('Menu'));
        expect((menu.body as { attachments?: unknown }).attachments).toEqual([
          {
            type: 'inline_keyboard',
            payload: {
              buttons: [
                [{ type: 'link', text: 'Site', url: 'https://example.com' }],
                [{ type: 'callback', text: 'Help', payload: 'falang-cmd:/help' }],
              ],
            },
          },
        ]);

        await pushMaxUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
          update_type: 'message_callback',
          callback: { callback_id: 'cb-help', payload: 'falang-cmd:/help', user: sender },
          message: {
            recipient: { chat_id: 778, chat_type: 'dialog', user_id: 1 },
            timestamp: Date.now(),
            body: { mid: menu.mid ?? '', seq: 2, text: 'Menu' },
          },
        });
        await waitForCall(botToken, isTextMessage('Help for Ann: /help'));
      },
    );
  }, 150_000);

  it('an incoming photo becomes a File and is sent back through the three-step upload', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    await withRunningProject(
      'Workflow-tier MAX media',
      (credentialId) => [
        triggerDocument('on-message', 'onMessage', credentialId, maxIntegration.triggers[0].name, [
          {
            id: 'send-back',
            name: MAX_SEND_FILE_NAME,
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
        await pushMaxUpdate(
          WORKFLOW_E2E_MOCKS_URL,
          botToken,
          incomingMessage(888, 'in.photo', null, [
            {
              type: 'image',
              payload: {
                url: `${MAX_MOCK_BASE_PLACEHOLDER}/files/${encodeURIComponent(botToken)}/cat.png`,
                token: 'img-1',
                photo_id: 1,
              },
            },
          ]),
          [{ path: 'cat.png', mime: 'image/png', base64: png.toString('base64') }],
        );

        const upload = await waitForCall(botToken, (call) => call.method === 'upload');
        expect(upload.query).toEqual({ type: 'image' });
        expect(upload.body).toMatchObject({ field: 'data', byteLength: png.length });

        const sent = await waitForCall(
          botToken,
          (call) =>
            call.method === 'sendMessage' && Array.isArray((call.body as { attachments?: unknown[] }).attachments),
        );
        expect(sent).toMatchObject({
          query: { chat_id: '888' },
          body: {
            text: 'Got image/png',
            attachments: [{ type: 'image', payload: { photos: { p1: { token: 'image-token-1' } } } }],
          },
        });
      },
    );
  }, 150_000);
});
