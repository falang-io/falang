// oxlint-disable no-new-func, init-declarations -- the generated activity code is compiled and run as the runner would.
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SHARED_ACTIVITY_CODE } from './max-shared-activity-code.js';
import { maxGetMessageAction, maxGetMessagesAction } from './max-read-actions.js';

/** Compiles the real shared code + one action into a function, with the credential resolver stubbed. */
const load = (activityCode: string, name: string): ((...args: unknown[]) => Promise<unknown>) => {
  const shared = MAX_SHARED_ACTIVITY_CODE.split('\n')
    .filter((line) => !line.startsWith('import '))
    .join('\n')
    .replace('const resolveMaxBotToken = async', 'const unusedResolveMaxBotToken = async');
  const source = [
    'const resolveMaxBotToken = async () => ({ token: "tok", apiBaseUrl: "https://max.test" });',
    shared,
    activityCode.replace(/^export /m, ''),
    `return ${name};`,
  ].join('\n');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('fetch', 'process', js)(globalThis.fetch, process) as (...args: unknown[]) => Promise<unknown>;
};

const raw = (mid: string, timestamp: number, text: string | null, sender: unknown = null) => ({
  sender,
  recipient: { chat_id: 42, chat_type: 'dialog', user_id: 1 },
  timestamp,
  body: { mid, seq: 1, text, attachments: [{ type: 'image', payload: { url: 'https://x' } }] },
});

describe('max read activities', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('get-messages calls GET /messages with chat_id and count and returns max/Message[] oldest first', async () => {
    const ann = { user_id: 7, first_name: 'Ann', last_name: null, username: 'ann', is_bot: false };
    fetchMock.mockResolvedValueOnce(
      Response.json({ messages: [raw('mid.2', 2000, 'second', ann), raw('mid.1', 1000, null)] }),
    );
    const result = await load(maxGetMessagesAction.activityCode, 'maxGetMessages')('cred', 42, 5);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(init.method).toBe('GET');
    expect(url.pathname).toBe('/messages');
    expect(url.searchParams.get('chat_id')).toBe('42');
    expect(url.searchParams.get('count')).toBe('5');
    expect(init.headers).toMatchObject({ Authorization: 'tok' });
    expect(result).toEqual([
      { messageId: 'mid.1', timestamp: 1000, chat: { id: 42, type: 'dialog' } },
      {
        messageId: 'mid.2',
        timestamp: 2000,
        text: 'second',
        chat: { id: 42, type: 'dialog' },
        from: { id: 7, isBot: false, firstName: 'Ann', username: 'ann' },
      },
    ]);
  });

  it('get-messages clamps count to 1–100 and falls back to 20', async () => {
    const getMessages = load(maxGetMessagesAction.activityCode, 'maxGetMessages');
    for (const [count, sent] of [
      [500, '100'],
      [0, '20'],
      [-3, '1'],
      [Number.NaN, '20'],
    ] as const) {
      fetchMock.mockResolvedValueOnce(Response.json({ messages: [] }));
      // oxlint-disable-next-line no-await-in-loop -- tiny table.
      await getMessages('cred', 42, count);
      const [url] = fetchMock.mock.calls.at(-1) as [URL];
      expect(url.searchParams.get('count'), String(count)).toBe(sent);
    }
  });

  it('get-message calls GET /messages/{mid} and maps the message; HTTP errors throw', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(raw('mid.a/b', 5, 'hi')));
    const getMessage = load(maxGetMessageAction.activityCode, 'maxGetMessage');
    await expect(getMessage('cred', 'mid.a/b')).resolves.toEqual({
      messageId: 'mid.a/b',
      timestamp: 5,
      text: 'hi',
      chat: { id: 42, type: 'dialog' },
    });
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.pathname).toBe('/messages/mid.a%2Fb');
    fetchMock.mockResolvedValueOnce(Response.json({ code: 'not.found' }, { status: 404 }));
    await expect(getMessage('cred', 'mid.x')).rejects.toThrow(/404/);
  });

  it('emits an assignment only when a result variable is set', () => {
    expect(
      maxGetMessagesAction.emit({
        credentialId: 'c',
        chatId: 'message.chat.id',
        count: '20',
        resultVariable: 'history',
      }),
    ).toBe('const history = await maxGetMessages(c, message.chat.id, 20);');
    expect(maxGetMessageAction.emit({ credentialId: 'c', messageId: 'id', resultVariable: '' })).toBe(
      'await maxGetMessage(c, id);',
    );
  });
});
