// oxlint-disable typescript-eslint/no-non-null-assertion, init-declarations, unicorn/consistent-function-scoping -- test captures handlers registered through callbacks.
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, ISandboxIngressContext } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTelegramBackend } from './telegram-backend.js';
import { telegramSandboxAdapter as adapter } from './telegram-sandbox.js';

const EMPTY_RESULT = { ok: true, result: [] };
const ok = (body: unknown = EMPTY_RESULT): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') }) as Response;

const message = (text: string, type = 'private') => ({
  update_id: 1,
  message: {
    message_id: 5,
    date: 1,
    text,
    chat: { id: 42, type },
    from: { id: 1, is_bot: false, first_name: 'Ann', last_name: 'Lee', username: 'ann' },
  },
});

describe('telegram sandbox adapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('describeUpdate', () => {
    it('describes a private message with a start payload', () => {
      expect(adapter.describeUpdate(message('/start fl_abc'))).toEqual({
        chatId: '42',
        isPrivateChat: true,
        text: '/start fl_abc',
        startPayload: 'fl_abc',
        chatTitle: 'Ann Lee @ann',
      });
    });
    it('handles /start@bot and a bare /start', () => {
      expect(adapter.describeUpdate(message('/start@my_bot fl_x'))?.startPayload).toBe('fl_x');
      expect(adapter.describeUpdate(message('/start'))?.startPayload).toBeNull();
      expect(adapter.describeUpdate(message('hello /start x'))?.startPayload).toBeNull();
    });
    it('flags group chats', () => {
      expect(adapter.describeUpdate(message('hi', 'supergroup'))?.isPrivateChat).toBe(false);
    });
    it('takes the chat of a callback query and ignores other updates', () => {
      const update = {
        update_id: 2,
        callback_query: { id: 'c', data: 'x', message: { message_id: 1, chat: { id: 7, type: 'private' } } },
      };
      expect(adapter.describeUpdate(update)).toMatchObject({ chatId: '7', text: null, startPayload: null });
      expect(adapter.describeUpdate({ update_id: 3, edited_message: {} })).toBeNull();
    });
  });

  describe('relay.inspect', () => {
    const json = (method: string, body: unknown, query = '') =>
      new Request(`http://relay/x/bot/tok/${method}${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    it('reads chat_id from JSON', async () => {
      expect(
        await adapter.relay.inspect(json('sendMessage', { chat_id: 42, text: 'a' }), '/bottok/sendMessage'),
      ).toEqual({
        method: 'sendMessage',
        recipients: ['42'],
        relayToken: 'tok',
        sendsMessage: true,
      });
    });
    it('reads chat_id from multipart', async () => {
      const form = new FormData();
      form.set('chat_id', '99');
      form.set('photo', new Blob(['x']), 'a.png');
      const request = new Request('http://relay/x', { method: 'POST', body: form });
      expect(await adapter.relay.inspect(request, '/bottok/sendPhoto')).toMatchObject({ recipients: ['99'] });
    });
    it('reads chat_id from the query', async () => {
      const request = new Request('http://relay/x?chat_id=5', { method: 'POST' });
      const decision = await adapter.relay.inspect(request, '/bottok/sendChatAction');
      expect(decision).toMatchObject({ recipients: ['5'] });
      expect(decision).not.toHaveProperty('sendsMessage');
    });
    it('refuses a chat_id that differs between the query and the body', async () => {
      const mixed = json('sendMessage', { chat_id: 666, text: 'a' }, '?chat_id=5');
      expect(await adapter.relay.inspect(mixed, '/bottok/sendMessage')).toHaveProperty('error');
      const same = json('sendMessage', { chat_id: 5, text: 'a' }, '?chat_id=5');
      expect(await adapter.relay.inspect(same, '/bottok/sendMessage')).toMatchObject({ recipients: ['5'] });
    });
    it('refuses unknown methods, missing chat_id and bad paths', async () => {
      expect(await adapter.relay.inspect(json('getUpdates', { chat_id: 1 }), '/bottok/getUpdates')).toHaveProperty(
        'error',
      );
      expect(await adapter.relay.inspect(json('sendMessage', { text: 'a' }), '/bottok/sendMessage')).toHaveProperty(
        'error',
      );
      expect(await adapter.relay.inspect(json('sendMessage', { chat_id: 1 }), '/nope')).toHaveProperty('error');
    });
    it('classifies the answers that mean the bot cannot write to the chat', () => {
      const send = { method: 'sendMessage', recipients: ['1'], relayToken: 't', sendsMessage: true };
      const unreachable = adapter.relay.isChatUnreachable!;
      expect(unreachable(send, 403, { ok: false, description: 'Forbidden: bot was blocked by the user' })).toBe(true);
      expect(unreachable({ ...send, method: 'sendPhoto' }, 403, null)).toBe(true);
      expect(unreachable(send, 400, { ok: false, description: 'Bad Request: chat not found' })).toBe(true);
      expect(unreachable(send, 400, { ok: false, description: 'Bad Request: message text is empty' })).toBe(false);
      expect(unreachable(send, 429, { ok: false })).toBe(false);
      expect(unreachable({ ...send, method: 'sendChatAction' }, 403, null)).toBe(false);
    });
    it('builds the upstream URL with the real token', () => {
      expect(adapter.relay.upstreamUrl('real', '/bottok/sendMessage', '?a=1')).toMatch(/\/botreal\/sendMessage\?a=1$/);
    });
  });

  it('buildChatLink and getBotInfo', async () => {
    expect(adapter.buildChatLink({ username: 'my_bot', title: 'T' }, 'fl_a')).toBe('https://t.me/my_bot?start=fl_a');
    fetchMock.mockResolvedValueOnce(ok({ ok: true, result: { username: 'my_bot', first_name: 'My' } }));
    expect(await adapter.getBotInfo('t')).toEqual({ username: 'my_bot', title: 'My' });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ ok: false, description: 'Unauthorized' }),
    });
    await expect(adapter.getBotInfo('bad')).rejects.toThrow('Unauthorized');
  });

  it('sendText posts sendMessage', async () => {
    await adapter.sendText('t', '42', 'hi');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/bott\/sendMessage$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ chat_id: '42', text: 'hi' });
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

    it('webhook mode registers secret_token, verifies the header and deletes the webhook on dispose', async () => {
      const { ctx, state, onUpdate } = buildCtx('https://x/hook');
      const dispose = await adapter.startIngress(ctx);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ url: 'https://x/hook', secret_token: 'sec' });
      const body = JSON.stringify(message('hi'));
      const bad = await state.webhook!(new Request('http://x', { method: 'POST', body }));
      expect(bad.status).toBe(401);
      const good = await state.webhook!(
        new Request('http://x', { method: 'POST', body, headers: { 'x-telegram-bot-api-secret-token': 'sec' } }),
      );
      expect(good.status).toBe(200);
      expect(onUpdate).toHaveBeenCalledTimes(1);
      await dispose();
      expect(fetchMock.mock.calls.at(-1)![0]).toMatch(/deleteWebhook$/);
    });

    it('poll mode deletes the webhook, then polls with an advancing offset', async () => {
      const { ctx, state, onUpdate } = buildCtx(null);
      await adapter.startIngress(ctx);
      expect(fetchMock.mock.calls[0][0]).toMatch(/deleteWebhook$/);
      fetchMock.mockResolvedValueOnce(ok({ ok: true, result: [{ update_id: 10 }, { update_id: 11 }] }));
      await state.interval!();
      expect(onUpdate.mock.calls.map((c) => c[0].update_id)).toEqual([10, 11]);
      fetchMock.mockResolvedValueOnce(ok());
      await state.interval!();
      expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('offset=12');
    });
  });
});

describe('registerTelegramBackend with a sharedIngress', () => {
  it('subscribes, never touches the Bot API, and signals the workflow', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let handler: ((update: unknown) => Promise<void>) | undefined;
    const signalWorkflow = vi.fn().mockResolvedValue(null);
    const ctx = {
      vendor: 'telegram',
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
                data: { vendor: 'telegram', triggerName: 'telegram-trigger', credentialId: 'cred-1' },
              },
              { id: 'f', name: 'function-footer', data: '' },
            ],
          },
        },
      ]),
      sharedIngress: { subscribe: (h: (u: unknown) => Promise<void>) => (handler = h) },
    } as unknown as IIntegrationBackendContext;
    const dispose = await registerTelegramBackend(ctx);
    expect(handler).toBeDefined();
    expect(ctx.registerWebHook).not.toHaveBeenCalled();
    expect(ctx.registerInterval).not.toHaveBeenCalled();
    await handler!(message('hello'));
    expect(signalWorkflow).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    await (dispose as () => Promise<void>)();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('telegram sandbox chat commands', () => {
  const doc = (name: string, triggerName: string, command: string, credentialId = 'c1', vendor = 'telegram') => ({
    id: name,
    name,
    data: null,
    root: {
      id: `r-${name}`,
      name: TRIGGER_FUNCTION_NAME,
      children: [
        { id: 'h', name: 'function-header' },
        {
          id: 'b',
          name: 'trigger-function-body',
          data: { vendor, triggerName, credentialId, triggerConfig: { command } },
        },
      ],
    } as never,
  });
  const commands = adapter.chatCommands!;

  it('lists the on-command triggers of the credential with valid menu names only', () => {
    const docs = [
      doc('Start flow', 'telegram-on-command-trigger', '/help'),
      doc('Other cred', 'telegram-on-command-trigger', 'x', 'c2'),
      doc('On message', 'telegram-trigger', 'ignored'),
      doc('Upper', 'telegram-on-command-trigger', 'Bad'),
      doc('Dup', 'telegram-on-command-trigger', 'help'),
      doc('Other vendor', 'telegram-on-command-trigger', 'y', 'c1', 'max'),
      doc('L'.repeat(300), 'telegram-on-command-trigger', 'long_one'),
    ];
    const list = commands.list(docs, 'c1');
    expect(list.map((entry) => entry.command)).toEqual(['help', 'long_one']);
    expect(list[0]!.description).toBe('Start flow');
    expect(list[1]!.description).toHaveLength(256);
  });

  it('sets a chat-scoped menu, and deletes it for an empty list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetchMock);
    await commands.set('tok', '42', [{ command: 'help', description: 'Help' }]);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/bottok/setMyCommands');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      commands: [{ command: 'help', description: 'Help' }],
      scope: { type: 'chat', chat_id: '42' },
    });
    await commands.set('tok', '42', []);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/bottok/deleteMyCommands');
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ scope: { type: 'chat', chat_id: '42' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ...ok(), ok: false, status: 400 }));
    await expect(commands.set('tok', '42', [])).rejects.toThrow('400');
    vi.unstubAllGlobals();
  });
});
