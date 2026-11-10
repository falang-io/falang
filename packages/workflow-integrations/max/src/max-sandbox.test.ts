// oxlint-disable typescript-eslint/no-non-null-assertion, init-declarations, max-lines -- test captures handlers registered through callbacks.
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, ISandboxIngressContext } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMaxBackend } from './max-backend.js';
import { maxIntegration } from './max.integration.js';
import { maxSandboxAdapter as adapter } from './max-sandbox.js';

const json = (body: unknown = {}, status = 200): Response => Response.json(body, { status });

const ann = { user_id: 7, first_name: 'Ann', last_name: 'Lee', username: 'ann', is_bot: false };
const rawMessage = (text: string | null, chatType = 'dialog', chatId = 42) => ({
  sender: ann,
  recipient: { chat_id: chatId, chat_type: chatType, user_id: 1 },
  timestamp: 1_700_000_000_000,
  body: { mid: 'mid.1', seq: 1, text, attachments: null },
});
const created = (text: string, chatType = 'dialog') => ({
  update_type: 'message_created',
  timestamp: 1,
  message: rawMessage(text, chatType),
});

const req = (method: string, query = '', headers: Record<string, string> | null = null): Request =>
  new Request(`http://relay.invalid/x${query}`, { method, headers: headers ?? { authorization: 'relay-tok' } });

describe('max sandbox adapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(json({ subscriptions: [], updates: [] }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is the sandbox adapter of the vendor', () => {
    expect(maxIntegration.sandbox).toBe(adapter);
    expect(adapter.tokenField).toBe('botToken');
  });

  describe('describeUpdate', () => {
    it('describes bot_started with its payload', () => {
      expect(
        adapter.describeUpdate({ update_type: 'bot_started', chat_id: 42, user: ann, payload: 'fl_abc', timestamp: 1 }),
      ).toEqual({
        chatId: '42',
        isPrivateChat: true,
        startPayload: 'fl_abc',
        text: null,
        chatTitle: 'Ann Lee @ann',
        userId: '7',
      });
    });

    it('describes a private message and takes no payload from a typed /start text', () => {
      expect(adapter.describeUpdate(created('/start fl_abc'))).toEqual({
        chatId: '42',
        isPrivateChat: true,
        startPayload: null,
        text: '/start fl_abc',
        chatTitle: 'Ann Lee @ann',
        userId: '7',
      });
    });

    it('marks a group chat as not private', () => {
      expect(adapter.describeUpdate(created('hi', 'chat'))).toMatchObject({ isPrivateChat: false, userId: null });
    });

    it('describes a callback by its message, without text', () => {
      expect(
        adapter.describeUpdate({
          update_type: 'message_callback',
          timestamp: 1,
          callback: { callback_id: 'c', payload: 'Yes', user: ann },
          message: rawMessage('Q?'),
        }),
      ).toEqual({
        chatId: '42',
        isPrivateChat: true,
        startPayload: null,
        text: null,
        chatTitle: 'Ann Lee @ann',
        userId: '7',
      });
    });

    it("ignores member and bot-chat events (a test bot is not an admin of anyone's chat)", () => {
      for (const type of ['user_added', 'user_removed', 'bot_added', 'bot_removed']) {
        expect(adapter.describeUpdate({ update_type: type, timestamp: 1, chat_id: 5, user: ann })).toBeNull();
      }
    });

    it('ignores a callback without a message and unknown update types', () => {
      expect(
        adapter.describeUpdate({ update_type: 'message_callback', callback: { user: ann }, message: null }),
      ).toBeNull();
      expect(adapter.describeUpdate({ update_type: 'user_added', timestamp: 1 })).toBeNull();
    });
  });

  describe('relay.inspect', () => {
    const { relay } = adapter;
    it('allows POST /messages to exactly one chat', async () => {
      expect(await relay.inspect(req('POST', '?chat_id=42'), '/messages')).toEqual({
        method: 'POST messages',
        recipients: ['42'],
        relayToken: 'relay-tok',
        sendsMessage: true,
      });
    });

    it('allows PUT /messages by message_id and GET /messages/<mid>', async () => {
      expect(await relay.inspect(req('PUT', '?message_id=mid.1'), '/messages')).toEqual({
        method: 'PUT messages',
        recipients: [],
        messageIds: ['mid.1'],
        relayToken: 'relay-tok',
      });
      expect(await relay.inspect(req('GET'), '/messages/mid.a%2Fb')).toMatchObject({
        method: 'GET messages',
        recipients: [],
        messageIds: ['mid.a/b'],
      });
    });

    it('allows GET /messages (a chat history) for exactly one chat_id and its paging parameters only', async () => {
      expect(await relay.inspect(req('GET', '?chat_id=42&count=20'), '/messages')).toEqual({
        method: 'GET messages list',
        recipients: ['42'],
        relayToken: 'relay-tok',
      });
      for (const query of [
        '',
        '?chat_id=42&chat_id=43',
        '?chat_id=42&message_ids=mid.1',
        '?chat_id=42&user_id=5',
        '?count=5',
      ]) {
        // oxlint-disable-next-line no-await-in-loop -- tiny table.
        expect(await relay.inspect(req('GET', query), '/messages'), query).toHaveProperty('error');
      }
    });

    it('allows POST /uploads as unaddressed', async () => {
      expect(await relay.inspect(req('POST', '?type=image'), '/uploads')).toEqual({
        method: 'POST uploads',
        recipients: [],
        unaddressed: true,
        relayToken: 'relay-tok',
      });
    });

    it.each([
      ['GET', '/updates', ''],
      ['POST', '/subscriptions', ''],
      ['POST', '/answers', '?callback_id=1'],
      ['GET', '/me', ''],
      ['GET', '/chats', ''],
      ['DELETE', '/messages', '?message_id=1'],
    ])('refuses %s %s', async (method, path, query) => {
      expect(await relay.inspect(req(method, query), path)).toHaveProperty('error');
    });

    it('a send by user id names the user, not a chat', async () => {
      expect(await relay.inspect(req('POST', '?user_id=5'), '/messages')).toMatchObject({
        recipients: [],
        recipientUsers: ['5'],
        sendsMessage: true,
      });
    });

    it('refuses malformed addressing and a missing Authorization', async () => {
      for (const [method, query] of [
        ['POST', '?chat_id=42&user_id=5'],
        ['POST', '?user_id=5&user_id=6'],
        ['POST', '?chat_id=42&chat_id=43'],
        ['POST', ''],
        ['PUT', ''],
        ['PUT', '?message_id=1&message_id=2'],
        ['PUT', '?message_id=1&chat_id=42'],
      ]) {
        // oxlint-disable-next-line no-await-in-loop -- tiny table.
        expect(await relay.inspect(req(method, query), '/messages'), `${method}${query}`).toHaveProperty('error');
      }
      const noAuth = await relay.inspect(req('POST', '?chat_id=42', {}), '/messages');
      expect(noAuth).toHaveProperty('error');
    });

    it('builds the upstream URL and headers from the real token', () => {
      expect(relay.upstreamUrl!('real', '/messages', '?chat_id=42')).toBe(
        'https://platform-api2.max.ru/messages?chat_id=42',
      );
      expect(relay.upstreamHeaders!('real')).toEqual({ Authorization: 'real' });
    });

    it('classifies the answers that mean the bot cannot write to the chat', () => {
      const send = { method: 'POST messages', recipients: ['42'], relayToken: 't', sendsMessage: true };
      const unreachable = relay.isChatUnreachable!;
      expect(unreachable(send, 403, { code: 'chat.denied', message: 'blocked' })).toBe(true);
      expect(unreachable(send, 404, { code: 'chat.not.found' })).toBe(true);
      expect(unreachable(send, 404, { code: 'not.found' })).toBe(false);
      expect(unreachable(send, 400, { code: 'proto.payload' })).toBe(false);
      expect(unreachable({ ...send, method: 'PUT messages' }, 403, null)).toBe(false);
    });

    it('reports the message a POST /messages created', () => {
      const call = { method: 'POST messages', recipients: ['42'], relayToken: 't' };
      expect(relay.sentMessages!(call, { message: { body: { mid: 'mid.9' }, recipient: { chat_id: 42 } } })).toEqual([
        { messageId: 'mid.9', chatId: '42' },
      ]);
      expect(relay.sentMessages!(call, {})).toEqual([]);
      expect(relay.sentMessages!(call, null)).toEqual([]);
      expect(relay.sentMessages!({ ...call, method: 'PUT messages' }, { message: { body: { mid: 'x' } } })).toEqual([]);
    });
  });

  describe('startIngress', () => {
    const buildCtx = (webhookUrl: string | null) => {
      const state: { webhook?: (r: Request) => Promise<Response>; interval?: () => Promise<void> } = {};
      const onUpdate = vi.fn().mockResolvedValue(null);
      const ctx: ISandboxIngressContext = {
        token: 'tok',
        webhookUrl,
        secret: 'sec',
        registerWebHook: (h) => {
          state.webhook = (r) => h(r, { ip: '1.1.1.1' });
        },
        registerInterval: (cb) => {
          state.interval = cb;
        },
        onUpdate,
      };
      return { ctx, state, onUpdate };
    };

    it('webhook mode subscribes with the secret, verifies the header and unsubscribes on dispose', async () => {
      fetchMock.mockResolvedValue(json({ success: true }));
      const { ctx, state, onUpdate } = buildCtx('https://x/hook');
      const dispose = await adapter.startIngress(ctx);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/subscriptions$/);
      expect(init.headers.Authorization).toBe('tok');
      expect(JSON.parse(init.body)).toMatchObject({ url: 'https://x/hook', secret: 'sec' });
      const body = JSON.stringify(created('hi'));
      const bad = await state.webhook!(new Request('http://x', { method: 'POST', body }));
      expect(bad.status).toBe(401);
      const good = await state.webhook!(
        new Request('http://x', { method: 'POST', body, headers: { 'x-max-bot-api-secret': 'sec' } }),
      );
      expect(good.status).toBe(200);
      expect(onUpdate).toHaveBeenCalledTimes(1);
      await dispose();
      const last = fetchMock.mock.calls.at(-1)!;
      expect(last[1].method).toBe('DELETE');
      expect(String(last[0])).toContain('/subscriptions?url=');
    });

    it('poll mode drops subscriptions, then polls with an advancing marker', async () => {
      fetchMock.mockResolvedValueOnce(json({ subscriptions: [{ url: 'https://old/hook' }] }));
      fetchMock.mockResolvedValueOnce(json({ success: true }));
      const { ctx, state, onUpdate } = buildCtx(null);
      await adapter.startIngress(ctx);
      expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
      fetchMock.mockResolvedValueOnce(
        json({ updates: [{ update_type: 'bot_started', timestamp: 1 }, created('b')], marker: 7 }),
      );
      await state.interval!();
      expect(onUpdate).toHaveBeenCalledTimes(2);
      fetchMock.mockResolvedValueOnce(json({ updates: [] }));
      await state.interval!();
      expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('marker=7');
    });
  });

  describe('sendText / getBotInfo / buildChatLink', () => {
    it('sends a plain message and throws on failure', async () => {
      fetchMock.mockResolvedValueOnce(json({ message: {} }));
      await adapter.sendText('tok', '42', 'hi');
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/messages?chat_id=42');
      expect(JSON.parse(init.body)).toEqual({ text: 'hi' });
      fetchMock.mockResolvedValueOnce(json({ message: 'boom' }, 400));
      await expect(adapter.sendText('tok', '42', 'hi')).rejects.toThrow(/400/);
    });

    it('reads the bot identity and rejects a bad token', async () => {
      fetchMock.mockResolvedValueOnce(json({ user_id: 1, first_name: 'Test', username: 'test_bot', is_bot: true }));
      expect(await adapter.getBotInfo('tok')).toEqual({ username: 'test_bot', title: 'Test' });
      fetchMock.mockResolvedValueOnce(json({ code: 'verify.token', message: 'Invalid access_token' }, 401));
      await expect(adapter.getBotInfo('bad')).rejects.toThrow('Invalid access_token');
      fetchMock.mockResolvedValueOnce(json({ user_id: 1, first_name: 'NoName', is_bot: true }));
      await expect(adapter.getBotInfo('tok')).rejects.toThrow();
    });

    it('builds the deep link', () => {
      expect(adapter.buildChatLink({ username: 'test_bot', title: 'T' }, 'fl_a-b')).toBe(
        'https://max.ru/test_bot?start=fl_a-b',
      );
    });
  });
});

describe('registerMaxBackend with a sharedIngress', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('subscribes, never touches the Bot API, and signals the workflow', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let handler: ((update: unknown) => Promise<void>) | undefined;
    const signalWorkflow = vi.fn().mockResolvedValue(null);
    const ctx = {
      vendor: 'max',
      credentialId: 'cred-1',
      fields: { botToken: 'real' },
      webhookUrl: 'https://x/hook',
      registerWebHook: vi.fn(),
      registerInterval: vi.fn(),
      signalWorkflow,
      getDocumentsByType: vi.fn().mockResolvedValue([
        {
          id: 'doc-1',
          name: 'onMessage',
          data: null,
          root: {
            id: 'r',
            name: TRIGGER_FUNCTION_NAME,
            children: [
              { id: 'h', name: 'function-header', data: '' },
              {
                id: 'b',
                name: 'trigger-function-body',
                children: [],
                data: { vendor: 'max', triggerName: 'max-trigger', credentialId: 'cred-1' },
              },
              { id: 'f', name: 'function-footer', data: '' },
            ],
          },
        },
      ]),
      sharedIngress: { subscribe: (h: (u: unknown) => Promise<void>) => (handler = h) },
    } as unknown as IIntegrationBackendContext;
    const dispose = await registerMaxBackend(ctx);
    expect(handler).toBeDefined();
    expect(ctx.registerWebHook).not.toHaveBeenCalled();
    expect(ctx.registerInterval).not.toHaveBeenCalled();
    await handler!(created('hello'));
    expect(signalWorkflow).toHaveBeenCalledTimes(1);
    expect(signalWorkflow.mock.calls[0][0].signalArgs[0]).toMatchObject({ text: 'hello', chat: { id: 42 } });
    // A start from a deep link without our payload still becomes "/start …" for the project's own trigger.
    await handler!({ update_type: 'bot_started', chat_id: 42, user: ann, payload: 'mine', timestamp: 1 });
    expect(signalWorkflow.mock.calls[1][0].signalArgs[0].text).toBe('/start mine');
    expect(fetchMock).not.toHaveBeenCalled();
    await (dispose as () => Promise<void>)();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
