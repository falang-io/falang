// oxlint-disable max-lines -- both delivery modes plus message/command/button/start routing in one suite.
import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerVkBackend } from './vk-backend.js';

const SECRET = 'test-callback-secret-0123456789abcdefghijklmnop';
const WEBHOOK_URL = 'https://bots.example.com/webhooks/vk/p/cred-1/prod';

const asDispose = (result: Awaited<ReturnType<typeof registerVkBackend>>): (() => Promise<void>) => {
  if (typeof result === 'function') return result;
  throw new Error('expected a bare dispose function');
};

const triggerFunctionDoc = (
  id: string,
  triggerName: string,
  triggerConfig?: Record<string, string>,
): IIntegrationDocumentRecord => {
  const root: INode = {
    id: `root-${id}`,
    name: TRIGGER_FUNCTION_NAME,
    children: [
      { id: `header-${id}`, name: 'function-header', data: '' },
      {
        id: `body-${id}`,
        name: 'trigger-function-body',
        children: [],
        data: { vendor: 'vk', triggerName, credentialId: 'cred-1', triggerConfig },
      },
      { id: `footer-${id}`, name: 'function-footer', data: '' },
    ],
  };
  return { id, name: `fn_${id}`, data: null, root };
};

type TTestCtx = IIntegrationBackendContext & {
  webhook?: (request: Request) => Promise<Response>;
  interval?: () => Promise<void>;
};

const buildCtx = (overrides: Partial<IIntegrationBackendContext> = {}): TTestCtx => {
  const ctx: TTestCtx = {
    vendor: 'vk',
    credentialId: 'cred-1',
    projectId: 'project-1',
    env: 'prod',
    fields: { accessToken: 'vk-key' },
    webhookUrl: null,
    taskQueue: 'workflow-project-1',
    registerWebHook: vi.fn((_uri: string, handler: (request: Request) => Promise<Response>) => {
      ctx.webhook = handler;
    }),
    deriveSecret: () => SECRET,
    registerInterval: vi.fn((callback: () => Promise<void>) => {
      ctx.interval = callback;
    }),
    signalWorkflow: vi.fn().mockResolvedValue(null),
    getDocumentsByType: vi.fn().mockResolvedValue([triggerFunctionDoc('doc-msg', 'vk-trigger')]),
    getInternalProjectToken: vi.fn().mockReturnValue('project-token-1'),
    upsertSchedule: vi.fn().mockResolvedValue(null),
    pauseSchedule: vi.fn().mockResolvedValue(null),
    deleteSchedule: vi.fn().mockResolvedValue(null),
    listSchedules: vi.fn().mockResolvedValue([]),
    uploadFile: vi.fn(),
    reportJournalProblem: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  return ctx;
};

const ok = (response: unknown): Response => Response.json({ response });

const rawMessage = (text: string, extra: Record<string, unknown> = {}) => ({
  id: 11,
  date: 1_700_000_000,
  peer_id: 42,
  from_id: 42,
  text,
  conversation_message_id: 3,
  out: 0,
  ...extra,
});

const messageNew = (message: unknown) => ({ type: 'message_new', object: { message }, group_id: 77, secret: SECRET });

const callbackRequest = (update: unknown): Request =>
  new Request(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  });

const signalCall = (ctx: TTestCtx, index = 0) => vi.mocked(ctx.signalWorkflow).mock.calls[index][0];

interface ICall {
  readonly url: URL;
  readonly init: RequestInit;
  readonly params: URLSearchParams;
  readonly method: string;
}

const withEvent = (update: Record<string, unknown>, eventId: string) => ({ ...update, event_id: eventId });

describe('registerVkBackend', () => {
  // oxlint-disable-next-line init-declarations
  let fetchMock: ReturnType<typeof vi.fn>;
  let handlers: Record<string, (params: URLSearchParams) => unknown> = {};

  beforeEach(() => {
    handlers = {};
    fetchMock = vi.fn().mockImplementation((url: URL | string, init?: RequestInit) => {
      const parsed = new URL(String(url));
      const name = parsed.pathname.replace('/method/', '');
      const handler = handlers[name];
      const params = new URLSearchParams(String(init?.body ?? ''));
      if (handler) return Promise.resolve(handler(params) as Response);
      if (name === 'groups.getById') return Promise.resolve(ok({ groups: [{ id: 77 }] }));
      if (name === 'users.get') return Promise.resolve(ok([{ id: 42, first_name: 'Ann', last_name: 'Lee' }]));
      return Promise.resolve(ok(1));
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const apiCalls = (): ICall[] =>
    fetchMock.mock.calls
      .filter((call) => String(call[0]).includes('/method/'))
      .map(([url, init]) => {
        const parsed = new URL(String(url));
        return {
          url: parsed,
          init: init as RequestInit,
          params: new URLSearchParams(String((init as RequestInit).body ?? '')),
          method: parsed.pathname.replace('/method/', ''),
        };
      });

  const callsOf = (method: string): ICall[] => apiCalls().filter((call) => call.method === method);

  it('does nothing without an access token', async () => {
    const ctx = buildCtx({ fields: {} });
    await expect(asDispose(await registerVkBackend(ctx))()).resolves.toBeUndefined();
    expect(ctx.registerWebHook).not.toHaveBeenCalled();
    expect(ctx.registerInterval).not.toHaveBeenCalled();
  });

  it('calls the API with a bearer key, the version and a form body', async () => {
    const ctx = buildCtx();
    handlers['groups.getLongPollServer'] = () => ok({ server: 'https://lp.test/x', key: 'k', ts: '1' });
    await registerVkBackend(ctx);
    const [call] = callsOf('groups.getById');
    expect(call.url.origin).toBe('https://api.vk.ru');
    expect(call.url.searchParams.get('v')).toBe('5.199');
    expect(call.init.headers).toMatchObject({
      Authorization: 'Bearer vk-key',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });

  describe('callback API mode', () => {
    const setup = async (overrides: Partial<IIntegrationBackendContext> = {}) => {
      handlers['groups.getCallbackConfirmationCode'] = () => ok({ code: 'confirm-123' });
      handlers['groups.getCallbackServers'] = () =>
        ok({
          items: [
            { id: 5, url: WEBHOOK_URL },
            { id: 6, url: 'https://other' },
          ],
        });
      handlers['groups.addCallbackServer'] = () => ok({ server_id: 9 });
      const ctx = buildCtx({ webhookUrl: WEBHOOK_URL, ...overrides });
      const dispose = asDispose(await registerVkBackend(ctx));
      return { ctx, dispose };
    };

    it('replaces a stale server with the same URL, registers one and configures events', async () => {
      const { dispose } = await setup();
      const deleted = callsOf('groups.deleteCallbackServer');
      expect(deleted).toHaveLength(1);
      expect(deleted[0].params.get('server_id')).toBe('5');
      const [add] = callsOf('groups.addCallbackServer');
      expect(Object.fromEntries(add.params)).toEqual({
        group_id: '77',
        url: WEBHOOK_URL,
        title: 'Falang',
        secret_key: SECRET,
      });
      const [settings] = callsOf('groups.setCallbackSettings');
      expect(Object.fromEntries(settings.params)).toMatchObject({
        server_id: '9',
        message_new: '1',
        message_event: '1',
        api_version: '5.199',
      });

      await dispose();
      expect(callsOf('groups.deleteCallbackServer').at(-1)?.params.get('server_id')).toBe('9');
    });

    it('answers the confirmation with the code as plain text', async () => {
      const { ctx } = await setup();
      const response = await ctx.webhook?.(callbackRequest({ type: 'confirmation', group_id: 77 }));
      expect(response?.status).toBe(200);
      await expect(response?.text()).resolves.toBe('confirm-123');
    });

    it('rejects an event with a wrong secret', async () => {
      const { ctx } = await setup();
      const response = await ctx.webhook?.(callbackRequest({ ...messageNew(rawMessage('hi')), secret: 'wrong' }));
      expect(response?.status).toBe(401);
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    });

    it('signals the on-message trigger and answers ok', async () => {
      const { ctx } = await setup();
      const response = await ctx.webhook?.(callbackRequest(messageNew(rawMessage('hello'))));
      expect(response?.status).toBe(200);
      await expect(response?.text()).resolves.toBe('ok');
      expect(signalCall(ctx)).toEqual({
        workflowId: 'vk-doc-msg-42',
        workflowType: 'fn_doc-msg',
        signalName: 'vkMessage',
        signalArgs: [
          {
            messageId: 11,
            conversationMessageId: 3,
            text: 'hello',
            date: 1_700_000_000,
            chat: { id: 42, type: 'private' },
            from: { id: 42, firstName: 'Ann', lastName: 'Lee' },
            payload: null,
          },
        ],
      });
    });

    it('fails closed when the host cannot derive a secret', async () => {
      const ctx = buildCtx({ webhookUrl: WEBHOOK_URL });
      Reflect.deleteProperty(ctx, 'deriveSecret');
      await expect(registerVkBackend(ctx)).rejects.toThrow(/deriveSecret/);
    });
  });

  describe('routing', () => {
    const docs = [
      triggerFunctionDoc('doc-msg', 'vk-trigger'),
      triggerFunctionDoc('doc-start', 'vk-on-command-trigger', { command: '/start' }),
    ];

    const setup = async (documents: readonly IIntegrationDocumentRecord[] = docs) => {
      handlers['groups.getCallbackConfirmationCode'] = () => ok({ code: 'c' });
      handlers['groups.getCallbackServers'] = () => ok({ items: [] });
      handlers['groups.addCallbackServer'] = () => ok({ server_id: 1 });
      const ctx = buildCtx({ webhookUrl: WEBHOOK_URL, getDocumentsByType: vi.fn().mockResolvedValue(documents) });
      await registerVkBackend(ctx);
      return ctx;
    };

    it('a matching command wins over the on-message trigger', async () => {
      const ctx = await setup();
      await ctx.webhook?.(callbackRequest(messageNew(rawMessage('/start@my_bot now'))));
      expect(signalCall(ctx).workflowId).toBe('vk-doc-start-42');
    });

    it('a "Start" press is delivered as /start', async () => {
      const ctx = await setup();
      await ctx.webhook?.(callbackRequest(messageNew(rawMessage('Начать', { payload: '{"command":"start"}' }))));
      expect(signalCall(ctx)).toMatchObject({
        workflowId: 'vk-doc-start-42',
        signalArgs: [{ text: '/start', payload: { command: 'start' } }],
      });
    });

    it('a "Start" press from a deep link carries the ref', async () => {
      const ctx = await setup();
      await ctx.webhook?.(
        callbackRequest(messageNew(rawMessage('Начать', { payload: '{"command":"start"}', ref: 'promo' }))),
      );
      expect(signalCall(ctx)).toMatchObject({
        workflowId: 'vk-doc-start-42',
        signalArgs: [{ text: '/start promo', ref: 'promo' }],
      });
    });

    it('ignores the community own messages', async () => {
      const ctx = await setup();
      await ctx.webhook?.(callbackRequest(messageNew(rawMessage('echo', { out: 1 }))));
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    });

    it('a button press is answered, then signalled to the conversation that asked', async () => {
      const ctx = await setup();
      // The conversation was started by /start, so the press must go to that workflow, not the on-message one.
      await ctx.webhook?.(callbackRequest(messageNew(rawMessage('/start'))));
      await ctx.webhook?.(
        callbackRequest({
          type: 'message_event',
          secret: SECRET,
          object: {
            user_id: 42,
            peer_id: 42,
            event_id: 'ev-1',
            payload: { falang: 'Yes' },
            conversation_message_id: 8,
          },
        }),
      );
      expect(signalCall(ctx, 1)).toEqual({
        workflowId: 'vk-doc-start-42',
        workflowType: 'fn_doc-start',
        signalName: 'vkQuestionAnswer',
        signalArgs: [{ messageId: '8', value: 'Yes' }],
      });
      const [answer] = callsOf('messages.sendMessageEventAnswer');
      expect(Object.fromEntries(answer.params)).toEqual({ event_id: 'ev-1', user_id: '42', peer_id: '42' });
    });

    it('answers a button press without a falang payload but signals nothing', async () => {
      const ctx = await setup();
      await ctx.webhook?.(
        callbackRequest({
          type: 'message_event',
          secret: SECRET,
          object: { user_id: 42, peer_id: 42, event_id: 'ev-2', payload: { other: 1 }, conversation_message_id: 8 },
        }),
      );
      expect(callsOf('messages.sendMessageEventAnswer')).toHaveLength(1);
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    });

    it('journals a message no trigger function takes', async () => {
      const ctx = await setup([]);
      await ctx.webhook?.(callbackRequest(messageNew(rawMessage('hi', { peer_id: 5, from_id: 5 }))));
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
      expect(ctx.reportJournalProblem).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'vk-unbound-5' }));
    });

    it('caches sender lookups per target', async () => {
      const ctx = await setup();
      await ctx.webhook?.(callbackRequest(messageNew(rawMessage('a'))));
      await ctx.webhook?.(callbackRequest(messageNew(rawMessage('b'))));
      expect(callsOf('users.get')).toHaveLength(1);
    });

    it('sends the message without a sender when users.get fails', async () => {
      handlers['users.get'] = () => Response.json({ error: { error_code: 5, error_msg: 'bad' } });
      const ctx = await setup();
      await ctx.webhook?.(callbackRequest(messageNew(rawMessage('a'))));
      const args = signalCall(ctx).signalArgs?.[0] as Record<string, unknown>;
      expect(args.from).toBeUndefined();
    });
  });

  describe('community routing (ADR 0076)', () => {
    const GROUP_PEER = 2_000_000_005;
    const messageIn = (peerId: number, extra: Record<string, unknown> = {}) =>
      rawMessage('hello', { peer_id: peerId, from_id: 42, ...extra });

    const setup = async (documents: readonly IIntegrationDocumentRecord[]) => {
      handlers['groups.getCallbackConfirmationCode'] = () => ok({ code: 'c' });
      handlers['groups.getCallbackServers'] = () => ok({ items: [] });
      handlers['groups.addCallbackServer'] = () => ok({ server_id: 1 });
      const ctx = buildCtx({ webhookUrl: WEBHOOK_URL, getDocumentsByType: vi.fn().mockResolvedValue(documents) });
      await registerVkBackend(ctx);
      return ctx;
    };

    it('switches group_join / group_leave on for the callback server and for long poll', async () => {
      await setup([]);
      expect(Object.fromEntries(callsOf('groups.setCallbackSettings')[0].params)).toMatchObject({
        message_new: '1',
        message_event: '1',
        group_join: '1',
        group_leave: '1',
      });
      fetchMock.mockClear();
      handlers['groups.getLongPollServer'] = () => ok({ server: 'https://lp.test/path', key: 'k', ts: '1' });
      await registerVkBackend(buildCtx());
      expect(Object.fromEntries(callsOf('groups.setLongPollSettings')[0].params)).toMatchObject({
        group_join: '1',
        group_leave: '1',
      });
    });

    it('the chatType filter picks the document by peer_id: private below / group above 2000000000', async () => {
      const ctx = await setup([
        triggerFunctionDoc('doc-priv', 'vk-trigger', { chatType: 'private' }),
        triggerFunctionDoc('doc-group', 'vk-trigger', { chatType: 'group' }),
      ]);
      await ctx.webhook?.(callbackRequest(messageNew(messageIn(42))));
      await ctx.webhook?.(callbackRequest(messageNew(messageIn(GROUP_PEER))));
      expect(signalCall(ctx, 0).workflowId).toBe('vk-doc-priv-42');
      expect(signalCall(ctx, 1).workflowId).toBe(`vk-doc-group-${GROUP_PEER}`);
    });

    it('a command document is subject to the filter too, and a plain "any" document is the fallback', async () => {
      const ctx = await setup([
        triggerFunctionDoc('doc-start-group', 'vk-on-command-trigger', { command: 'start', chatType: 'group' }),
        triggerFunctionDoc('doc-any', 'vk-trigger'),
      ]);
      await ctx.webhook?.(callbackRequest(messageNew(messageIn(42, { text: '/start' }))));
      await ctx.webhook?.(callbackRequest(messageNew(messageIn(GROUP_PEER, { text: '/start' }))));
      expect(signalCall(ctx, 0).workflowId).toBe('vk-doc-any-42');
      expect(signalCall(ctx, 1).workflowId).toBe(`vk-doc-start-group-${GROUP_PEER}`);
    });

    it('journals a message when no document admits the chat type', async () => {
      const ctx = await setup([triggerFunctionDoc('doc-priv', 'vk-trigger', { chatType: 'private' })]);
      await ctx.webhook?.(callbackRequest(messageNew(messageIn(GROUP_PEER))));
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
      expect(ctx.reportJournalProblem).toHaveBeenCalledWith(expect.objectContaining({ level: 'info' }));
    });

    it('the conversation mode builds the workflow id from from_id and event_id (both transports carry event_id)', async () => {
      const ctx = await setup([
        triggerFunctionDoc('doc-user', 'vk-trigger', { chatType: 'private', conversation: 'per-user' }),
        triggerFunctionDoc('doc-event', 'vk-trigger', { chatType: 'group', conversation: 'per-event' }),
      ]);
      await ctx.webhook?.(callbackRequest(withEvent(messageNew(messageIn(42)), 'ev-1')));
      await ctx.webhook?.(callbackRequest(withEvent(messageNew(messageIn(GROUP_PEER, { from_id: 9 })), 'ev-2')));
      expect(signalCall(ctx, 0).workflowId).toBe('vk-doc-user-42-42');
      expect(signalCall(ctx, 1).workflowId).toBe(`vk-doc-event-${GROUP_PEER}-ev-2`);
    });

    it('long poll items keep their event_id for a per-event conversation', async () => {
      handlers['groups.getLongPollServer'] = () => ok({ server: 'https://lp.test/path', key: 'k', ts: '1' });
      fetchMock.mockImplementation((url: URL | string, init?: RequestInit) => {
        const parsed = new URL(String(url));
        if (parsed.hostname === 'lp.test') {
          return Promise.resolve(
            Response.json({ ts: '2', updates: [withEvent(messageNew(messageIn(GROUP_PEER)), 'c68dfb98')] }),
          );
        }
        const name = parsed.pathname.replace('/method/', '');
        if (name === 'groups.getById') return Promise.resolve(ok({ groups: [{ id: 77 }] }));
        if (name === 'users.get') return Promise.resolve(ok([{ id: 42 }]));
        return Promise.resolve(handlers[name]?.(new URLSearchParams(String(init?.body ?? ''))) as Response);
      });
      const ctx = buildCtx({
        getDocumentsByType: vi
          .fn()
          .mockResolvedValue([triggerFunctionDoc('doc-event', 'vk-trigger', { conversation: 'per-event' })]),
      });
      await registerVkBackend(ctx);
      await ctx.interval?.();
      expect(signalCall(ctx).workflowId).toBe(`vk-doc-event-${GROUP_PEER}-c68dfb98`);
    });

    it('a button press goes to the full workflow id remembered for a private per-user conversation', async () => {
      const ctx = await setup([triggerFunctionDoc('doc-user', 'vk-trigger', { conversation: 'per-user' })]);
      await ctx.webhook?.(callbackRequest(messageNew(messageIn(42))));
      await ctx.webhook?.(
        callbackRequest({
          type: 'message_event',
          secret: SECRET,
          object: { user_id: 42, peer_id: 42, event_id: 'e', payload: { falang: 'Yes' }, conversation_message_id: 8 },
        }),
      );
      expect(signalCall(ctx, 1)).toMatchObject({
        workflowId: 'vk-doc-user-42-42',
        signalName: 'vkQuestionAnswer',
      });
    });

    it('after a restart a private per-user press falls back to the id the document mode builds', async () => {
      const ctx = await setup([triggerFunctionDoc('doc-user', 'vk-trigger', { conversation: 'per-user' })]);
      await ctx.webhook?.(
        callbackRequest({
          type: 'message_event',
          secret: SECRET,
          object: { user_id: 42, peer_id: 42, event_id: 'e', payload: { falang: 'Yes' }, conversation_message_id: 8 },
        }),
      );
      expect(signalCall(ctx).workflowId).toBe('vk-doc-user-42-42');
    });

    it('a button pressed in a conversation of a per-user / per-event document is journaled, not signalled', async () => {
      const ctx = await setup([triggerFunctionDoc('doc-event', 'vk-trigger', { conversation: 'per-event' })]);
      await ctx.webhook?.(callbackRequest(withEvent(messageNew(messageIn(GROUP_PEER)), 'ev-1')));
      vi.mocked(ctx.signalWorkflow).mockClear();
      await ctx.webhook?.(
        callbackRequest({
          type: 'message_event',
          secret: SECRET,
          object: {
            user_id: 9,
            peer_id: GROUP_PEER,
            event_id: 'btn',
            payload: { falang: 'Yes' },
            conversation_message_id: 8,
          },
        }),
      );
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
      expect(ctx.reportJournalProblem).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          data: expect.objectContaining({ errorType: 'UnroutableGroupAnswer' }),
        }),
      );
      // The press is still acknowledged to VK.
      expect(callsOf('messages.sendMessageEventAnswer')).toHaveLength(1);
    });

    it('a button pressed in a conversation of a per-chat document is still signalled', async () => {
      const ctx = await setup([triggerFunctionDoc('doc-chat', 'vk-trigger')]);
      await ctx.webhook?.(
        callbackRequest({
          type: 'message_event',
          secret: SECRET,
          object: {
            user_id: 9,
            peer_id: GROUP_PEER,
            event_id: 'btn',
            payload: { falang: 'No' },
            conversation_message_id: 8,
          },
        }),
      );
      expect(signalCall(ctx).workflowId).toBe(`vk-doc-chat-${GROUP_PEER}`);
    });

    it('a service message with an action never reaches the on-message trigger', async () => {
      const ctx = await setup([
        triggerFunctionDoc('doc-chat', 'vk-trigger'),
        triggerFunctionDoc('doc-join', 'vk-chat-member-joined'),
      ]);
      await ctx.webhook?.(
        callbackRequest(
          withEvent(
            messageNew(messageIn(GROUP_PEER, { text: '', action: { type: 'chat_invite_user', member_id: 5 } })),
            'ev-3',
          ),
        ),
      );
      await ctx.webhook?.(
        callbackRequest(messageNew(messageIn(GROUP_PEER, { text: '', action: { type: 'chat_title_update' } }))),
      );
      expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);
      expect(signalCall(ctx)).toMatchObject({
        workflowId: `vk-doc-join-${GROUP_PEER}-5-ev-3`,
        signalName: 'vkChatMemberJoined',
      });
    });

    it('group_join / group_leave reach the member triggers through the callback API', async () => {
      const ctx = await setup([triggerFunctionDoc('doc-in', 'vk-group-member-joined')]);
      await ctx.webhook?.(
        callbackRequest({
          type: 'group_join',
          event_id: 'g1',
          group_id: 77,
          secret: SECRET,
          object: { user_id: 5, join_type: 'join' },
        }),
      );
      expect(signalCall(ctx)).toMatchObject({ workflowId: 'vk-doc-in-g77-5-g1', signalName: 'vkGroupMemberJoined' });
    });

    it('sandbox mode ignores group_join / group_leave and member service messages without errors', async () => {
      const subscribers: ((update: unknown) => Promise<void>)[] = [];
      const ctx = buildCtx({
        sharedIngress: {
          subscribe: (h) => {
            subscribers.push(h);
          },
        },
        getDocumentsByType: vi
          .fn()
          .mockResolvedValue([
            triggerFunctionDoc('doc-in', 'vk-group-member-joined'),
            triggerFunctionDoc('doc-join', 'vk-chat-member-joined'),
          ]),
      });
      await registerVkBackend(ctx);
      await subscribers[0]?.({ type: 'group_join', event_id: 'a', group_id: 1, object: { user_id: 5 } });
      await subscribers[0]?.({ type: 'group_leave', event_id: 'b', group_id: 1, object: { user_id: 5 } });
      await subscribers[0]?.(messageNew(messageIn(GROUP_PEER, { action: { type: 'chat_invite_user', member_id: 5 } })));
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
      expect(ctx.reportJournalProblem).not.toHaveBeenCalled();
    });
  });

  describe('sandbox mode', () => {
    it('subscribes to the shared ingress and opens no server of its own', async () => {
      const subscribers: ((update: unknown) => Promise<void>)[] = [];
      const ctx = buildCtx({
        sharedIngress: {
          subscribe: (h) => {
            subscribers.push(h);
          },
        },
      });
      await registerVkBackend(ctx);
      expect(apiCalls()).toHaveLength(0);
      await subscribers[0]?.(messageNew(rawMessage('hi')));
      expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);
    });
  });

  describe('long poll mode', () => {
    const answerPoll = (answers: unknown[]) => {
      handlers['groups.getLongPollServer'] = () => ok({ server: 'https://lp.test/path', key: 'key-1', ts: '10' });
      const queue = [...answers];
      fetchMock.mockImplementation((url: URL | string, init?: RequestInit) => {
        const parsed = new URL(String(url));
        if (parsed.hostname === 'lp.test')
          return Promise.resolve(Response.json(queue.shift() ?? { ts: '99', updates: [] }));
        const name = parsed.pathname.replace('/method/', '');
        const handler = handlers[name];
        if (handler) return Promise.resolve(handler(new URLSearchParams(String(init?.body ?? ''))) as Response);
        if (name === 'groups.getById') return Promise.resolve(ok({ groups: [{ id: 77 }] }));
        if (name === 'users.get') return Promise.resolve(ok([{ id: 42, first_name: 'Ann' }]));
        return Promise.resolve(ok(1));
      });
    };

    const pollCalls = (): URL[] =>
      fetchMock.mock.calls.map((call) => new URL(String(call[0]))).filter((url) => url.hostname === 'lp.test');

    it('enables long poll, polls with wait=25 and passes on the returned ts', async () => {
      answerPoll([
        { ts: '11', updates: [messageNew(rawMessage('hi'))] },
        { ts: '12', updates: [] },
      ]);
      const ctx = buildCtx();
      await registerVkBackend(ctx);
      const [settings] = callsOf('groups.setLongPollSettings');
      expect(Object.fromEntries(settings.params)).toMatchObject({
        group_id: '77',
        enabled: '1',
        message_new: '1',
        message_event: '1',
      });

      await ctx.interval?.();
      const first = pollCalls()[0];
      expect(first.pathname).toBe('/path');
      expect(Object.fromEntries(first.searchParams)).toEqual({ act: 'a_check', key: 'key-1', ts: '10', wait: '25' });
      expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);

      await ctx.interval?.();
      expect(pollCalls()[1].searchParams.get('ts')).toBe('11');
    });

    it('failed 1 takes the new ts, failed 2 a new key, failed 3 both', async () => {
      answerPoll([{ failed: 1, ts: '50' }, { failed: 2 }, { failed: 3 }, { ts: '60', updates: [] }]);
      let calls = 0;
      handlers['groups.getLongPollServer'] = () => {
        calls += 1;
        return ok({ server: 'https://lp.test/path', key: `key-${calls}`, ts: `${calls * 100}` });
      };
      const ctx = buildCtx();
      await registerVkBackend(ctx);
      // Initial server (key-1, ts 100) then failed 1 -> ts 50; ts 50 sent, failed 2 -> key-2; failed 3 -> key-3 / ts 300.
      await ctx.interval?.();
      await ctx.interval?.();
      await ctx.interval?.();
      await ctx.interval?.();
      const polls = pollCalls().map((url) => [url.searchParams.get('key'), url.searchParams.get('ts')]);
      expect(polls).toEqual([
        ['key-1', '100'],
        ['key-1', '50'],
        ['key-2', '50'],
        ['key-3', '300'],
      ]);
    });

    it('does not overlap itself', async () => {
      const releases: (() => void)[] = [];
      handlers['groups.getLongPollServer'] = () => ok({ server: 'https://lp.test/path', key: 'k', ts: '1' });
      fetchMock.mockImplementation((url: URL | string, init?: RequestInit) => {
        const parsed = new URL(String(url));
        if (parsed.hostname === 'lp.test') {
          return new Promise<Response>((resolve) => {
            releases.push(() => resolve(Response.json({ ts: '2', updates: [] })));
          });
        }
        const name = parsed.pathname.replace('/method/', '');
        const handler = handlers[name];
        if (handler) return Promise.resolve(handler(new URLSearchParams(String(init?.body ?? ''))) as Response);
        return Promise.resolve(name === 'groups.getById' ? ok({ groups: [{ id: 77 }] }) : ok(1));
      });
      const ctx = buildCtx();
      await registerVkBackend(ctx);
      const first = ctx.interval?.();
      await vi.waitFor(() => expect(releases).toHaveLength(1));
      await ctx.interval?.();
      expect(pollCalls()).toHaveLength(1);
      releases[0]?.();
      await first;
    });

    it('throws on a failed poll so the host logs it', async () => {
      handlers['groups.getLongPollServer'] = () => ok({ server: 'https://lp.test/path', key: 'k', ts: '1' });
      fetchMock.mockImplementation((url: URL | string, init?: RequestInit) => {
        const parsed = new URL(String(url));
        if (parsed.hostname === 'lp.test') return Promise.resolve(new Response('nope', { status: 502 }));
        const name = parsed.pathname.replace('/method/', '');
        const handler = handlers[name];
        if (handler) return Promise.resolve(handler(new URLSearchParams(String(init?.body ?? ''))) as Response);
        return Promise.resolve(name === 'groups.getById' ? ok({ groups: [{ id: 77 }] }) : ok(1));
      });
      const ctx = buildCtx();
      await registerVkBackend(ctx);
      await expect(ctx.interval?.()).rejects.toThrow(/VK long poll failed: 502/);
    });
  });
});
