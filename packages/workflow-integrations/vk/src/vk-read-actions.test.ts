// oxlint-disable no-new-func, init-declarations -- the generated activity code is compiled and run as the runner would.
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vkGetMessageAction, vkGetMessagesAction } from './vk-read-actions.js';
import { VK_SHARED_ACTIVITY_CODE } from './vk-shared-activity-code.js';

/** Compiles the real shared code + one action into a function, with the credential resolver and Temporal stubbed. */
const load = (activityCode: string, name: string): ((...args: unknown[]) => Promise<unknown>) => {
  const shared = VK_SHARED_ACTIVITY_CODE.split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n')
    .replace('const resolveVkAccessToken = async', 'const unusedResolveVkAccessToken = async');
  const source = [
    'const VkActivityContext = { current: () => { throw new Error("no context"); } };',
    'const resolveVkAccessToken = async () => ({ token: "tok", apiBaseUrl: "https://vk.test" });',
    shared,
    activityCode.replace(/^export /m, ''),
    `return ${name};`,
  ].join('\n');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('fetch', 'process', js)(globalThis.fetch, process) as (...args: unknown[]) => Promise<unknown>;
};

const formOf = (init: RequestInit): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(init.body as URLSearchParams));

describe('vk read activities', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('get-messages calls messages.getHistory (extended) and returns vk/Message[] oldest first with sender names', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        response: {
          count: 2,
          items: [
            { id: 11, conversation_message_id: 6, peer_id: 7, from_id: -5, date: 200, text: 'answer', out: 1 },
            {
              id: 10,
              conversation_message_id: 5,
              peer_id: 7,
              from_id: 7,
              date: 100,
              text: 'Начать',
              payload: '{"command":"start"}',
              ref: 'fl_secret',
            },
          ],
          profiles: [{ id: 7, first_name: 'Ann', last_name: 'Lee' }],
        },
      }),
    );
    const result = await load(vkGetMessagesAction.activityCode, 'vkGetMessages')('cred', 7, 300);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://vk.test/method/messages.getHistory?v=5.199');
    expect(formOf(init)).toEqual({ peer_id: '7', count: '200', extended: '1' });
    expect(result).toEqual([
      {
        messageId: 10,
        conversationMessageId: 5,
        text: 'Начать',
        date: 100,
        chat: { id: 7, type: 'private' },
        from: { id: 7, firstName: 'Ann', lastName: 'Lee' },
        payload: { command: 'start' },
      },
      {
        messageId: 11,
        conversationMessageId: 6,
        text: 'answer',
        date: 200,
        chat: { id: 7, type: 'private' },
        payload: null,
      },
    ]);
  });

  it('get-message calls messages.getByConversationMessageId and fails on an unknown id or a VK error', async () => {
    const getMessage = load(vkGetMessageAction.activityCode, 'vkGetMessage');
    fetchMock.mockResolvedValueOnce(
      Response.json({
        response: {
          items: [
            { id: 3, conversation_message_id: 9, peer_id: 2_000_000_001, from_id: 8, date: 1, text: 'x', ref: 'promo' },
          ],
        },
      }),
    );
    await expect(getMessage('cred', 2_000_000_001, 9)).resolves.toEqual({
      messageId: 3,
      conversationMessageId: 9,
      text: 'x',
      date: 1,
      chat: { id: 2_000_000_001, type: 'chat' },
      from: { id: 8 },
      ref: 'promo',
      payload: null,
    });
    expect(formOf((fetchMock.mock.calls[0] as [string, RequestInit])[1])).toEqual({
      peer_id: '2000000001',
      conversation_message_ids: '9',
      extended: '1',
    });
    fetchMock.mockResolvedValueOnce(Response.json({ response: { count: 0, items: [] } }));
    await expect(getMessage('cred', 7, 1)).rejects.toThrow(/not found/);
    fetchMock.mockResolvedValueOnce(Response.json({ error: { error_code: 917, error_msg: 'no access' } }));
    await expect(getMessage('cred', 7, 1)).rejects.toThrow(/917/);
  });

  it('emits an assignment only when a result variable is set', () => {
    expect(
      vkGetMessagesAction.emit({
        credentialId: 'c',
        chatId: 'message.chat.id',
        count: '20',
        resultVariable: 'history',
      }),
    ).toBe('const history = await vkGetMessages(c, message.chat.id, 20);');
    expect(vkGetMessageAction.emit({ credentialId: 'c', chatId: '1', messageId: '2', resultVariable: '' })).toBe(
      'await vkGetMessage(c, 1, 2);',
    );
  });
});
