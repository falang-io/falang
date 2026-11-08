// oxlint-disable max-lines -- both delivery modes plus message/command/button/start routing in one suite.
import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMaxBackend } from './max-backend.js';

const SECRET = 'test-webhook-secret-0123456789abcdefghijklmnop';

const asDispose = (result: Awaited<ReturnType<typeof registerMaxBackend>>): (() => Promise<void>) => {
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
        data: { vendor: 'max', triggerName, credentialId: 'cred-1', triggerConfig },
      },
      { id: `footer-${id}`, name: 'function-footer', data: '' },
    ],
  };
  return { id, name: `fn_${id}`, data: null, root };
};

const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

type TTestCtx = IIntegrationBackendContext & {
  webhook?: (request: Request) => Promise<Response>;
  interval?: () => Promise<void>;
};

const buildCtx = (overrides: Partial<IIntegrationBackendContext> = {}): TTestCtx => {
  const ctx: TTestCtx = {
    vendor: 'max',
    credentialId: 'cred-1',
    projectId: 'project-1',
    env: 'prod',
    fields: { botToken: 'bot-token' },
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
    getDocumentsByType: vi.fn().mockResolvedValue([triggerFunctionDoc('doc-msg', 'max-trigger')]),
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

const rawMessage = (text: string, chatId = 42) => ({
  sender: { user_id: 7, first_name: 'Ann', last_name: null, username: 'ann', is_bot: false },
  recipient: { chat_id: chatId, chat_type: 'dialog', user_id: 1 },
  timestamp: 1_700_000_000_000,
  body: { mid: 'mid.1', seq: 1, text, attachments: null },
});

const webhookRequest = (update: unknown, secret = SECRET): Request =>
  new Request('https://bots.example.com/webhooks/max/p/cred-1/prod', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-max-bot-api-secret': secret },
    body: JSON.stringify(update),
  });

const signalCall = (ctx: TTestCtx, index = 0) => vi.mocked(ctx.signalWorkflow).mock.calls[index][0];

describe('registerMaxBackend', () => {
  // oxlint-disable-next-line init-declarations
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ success: true })));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const calledUrls = (): string[] => fetchMock.mock.calls.map((call) => String(call[0]));

  it('does nothing without a bot token', async () => {
    const ctx = buildCtx({ fields: {} });
    await expect(asDispose(await registerMaxBackend(ctx))()).resolves.toBeUndefined();
    expect(ctx.registerWebHook).not.toHaveBeenCalled();
    expect(ctx.registerInterval).not.toHaveBeenCalled();
  });

  describe('webhook mode', () => {
    const webhookUrl = 'https://bots.example.com/webhooks/max/p/cred-1/prod';

    it('subscribes with the derived secret and the update types, and unsubscribes on dispose', async () => {
      const ctx = buildCtx({ webhookUrl });
      const dispose = asDispose(await registerMaxBackend(ctx));

      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(String(url)).toBe('https://platform-api2.max.ru/subscriptions');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ Authorization: 'bot-token' });
      expect(JSON.parse(String(init.body))).toEqual({
        url: webhookUrl,
        update_types: [
          'message_created',
          'message_callback',
          'bot_started',
          'user_added',
          'user_removed',
          'bot_added',
          'bot_removed',
        ],
        secret: SECRET,
      });

      await dispose();
      const [deleteUrl, deleteInit] = fetchMock.mock.calls.at(-1) as [URL, RequestInit];
      expect(deleteInit.method).toBe('DELETE');
      expect(new URL(String(deleteUrl)).searchParams.get('url')).toBe(webhookUrl);
    });

    it('rejects a delivery without the secret header', async () => {
      const ctx = buildCtx({ webhookUrl });
      await registerMaxBackend(ctx);
      const response = await ctx.webhook?.(webhookRequest({ update_type: 'message_created' }, 'wrong'));
      expect(response?.status).toBe(401);
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    });

    it('signals the on-message trigger with the mapped message', async () => {
      const ctx = buildCtx({ webhookUrl });
      await registerMaxBackend(ctx);
      const response = await ctx.webhook?.(
        webhookRequest({ update_type: 'message_created', timestamp: 1, message: rawMessage('hello') }),
      );
      expect(response?.status).toBe(200);
      expect(signalCall(ctx)).toEqual({
        workflowId: 'max-doc-msg-42',
        workflowType: 'fn_doc-msg',
        signalName: 'maxMessage',
        signalArgs: [
          {
            messageId: 'mid.1',
            timestamp: 1_700_000_000_000,
            text: 'hello',
            chat: { id: 42, type: 'dialog' },
            from: { id: 7, isBot: false, firstName: 'Ann', username: 'ann' },
          },
        ],
      });
    });

    it('fails closed when the host cannot derive a secret', async () => {
      const ctx = buildCtx({ webhookUrl });
      Reflect.deleteProperty(ctx, 'deriveSecret');
      await expect(registerMaxBackend(ctx)).rejects.toThrow(/deriveSecret/);
    });
  });

  describe('routing', () => {
    const docs = [
      triggerFunctionDoc('doc-msg', 'max-trigger'),
      triggerFunctionDoc('doc-start', 'max-on-command-trigger', { command: '/start' }),
    ];

    const deliver = async (ctx: TTestCtx, update: unknown): Promise<void> => {
      await registerMaxBackend(ctx);
      await ctx.webhook?.(webhookRequest(update));
    };

    it('a matching command wins over the on-message trigger, with an @mention stripped', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://x/y', getDocumentsByType: vi.fn().mockResolvedValue(docs) });
      await deliver(ctx, { update_type: 'message_created', timestamp: 1, message: rawMessage('/start@my_bot now') });
      expect(signalCall(ctx).workflowId).toBe('max-doc-start-42');
    });

    it('hands a plain message to a waiting run (ADR 0079), but a bound command still goes to its trigger', async () => {
      const deliverToMessageWait = vi.fn().mockResolvedValue(true);
      const ctx = buildCtx({
        webhookUrl: 'https://x/y',
        getDocumentsByType: vi.fn().mockResolvedValue(docs),
        deliverToMessageWait,
      });
      await deliver(ctx, { update_type: 'message_created', timestamp: 1, message: rawMessage('Ann') });
      expect(deliverToMessageWait).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: 42, signalName: 'maxReply' }),
      );
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();

      await ctx.webhook?.(
        webhookRequest({ update_type: 'message_created', timestamp: 2, message: rawMessage('/start') }),
      );
      expect(deliverToMessageWait).toHaveBeenCalledTimes(1);
      expect(signalCall(ctx).workflowId).toBe('max-doc-start-42');
    });

    it('bot_started is delivered as a /start message carrying the deep-link payload', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://x/y', getDocumentsByType: vi.fn().mockResolvedValue(docs) });
      await deliver(ctx, {
        update_type: 'bot_started',
        timestamp: 5,
        chat_id: 99,
        user: { user_id: 7, first_name: 'Ann', is_bot: false, username: null },
        payload: 'ref-1',
      });
      expect(signalCall(ctx)).toMatchObject({
        workflowId: 'max-doc-start-99',
        signalArgs: [{ text: '/start ref-1', chat: { id: 99, type: 'dialog' }, from: { id: 7 } }],
      });
    });

    it("a button press acks the callback and signals the answer to the chat's conversation", async () => {
      const ctx = buildCtx({ webhookUrl: 'https://x/y', getDocumentsByType: vi.fn().mockResolvedValue(docs) });
      await registerMaxBackend(ctx);
      // The conversation was started by /start, so the press must go to that workflow, not the on-message one.
      await ctx.webhook?.(
        webhookRequest({ update_type: 'message_created', timestamp: 1, message: rawMessage('/start') }),
      );
      await ctx.webhook?.(
        webhookRequest({
          update_type: 'message_callback',
          timestamp: 2,
          callback: { callback_id: 'cb-1', payload: 'Yes', user: { user_id: 7, first_name: 'Ann', is_bot: false } },
          message: { ...rawMessage('Continue?'), body: { mid: 'mid.question', text: 'Continue?' } },
        }),
      );
      expect(signalCall(ctx, 1)).toEqual({
        workflowId: 'max-doc-start-42',
        workflowType: 'fn_doc-start',
        signalName: 'maxQuestionAnswer',
        signalArgs: [{ messageId: 'mid.question', value: 'Yes' }],
      });
      const answer = fetchMock.mock.calls.find((call) => String(call[0]).includes('/answers'));
      expect(new URL(String(answer?.[0])).searchParams.get('callback_id')).toBe('cb-1');
      const answerInit = answer ? (answer[1] as RequestInit) : {};
      expect(JSON.parse(String(answerInit.body))).toEqual({ notification: 'Yes' });
    });

    it('turns a command button press into a /command message from the presser', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://x/y', getDocumentsByType: vi.fn().mockResolvedValue(docs) });
      await registerMaxBackend(ctx);
      await ctx.webhook?.(
        webhookRequest({
          update_type: 'message_callback',
          timestamp: 9,
          callback: {
            callback_id: 'cb-2',
            payload: 'falang-cmd:/start again',
            user: { user_id: 8, first_name: 'Bob', is_bot: false },
          },
          message: { ...rawMessage('Menu'), body: { mid: 'mid.menu', text: 'Menu' } },
        }),
      );
      expect(signalCall(ctx)).toMatchObject({
        workflowId: 'max-doc-start-42',
        signalName: 'maxMessage',
        signalArgs: [{ text: '/start again', timestamp: 9, chat: { id: 42 }, from: { id: 8, firstName: 'Bob' } }],
      });
      const answer = fetchMock.mock.calls.find((call) => String(call[0]).includes('/answers'));
      const answerInit = answer ? (answer[1] as RequestInit) : {};
      expect(JSON.parse(String(answerInit.body))).toEqual({ notification: '✓' });
    });

    it('journals a message no trigger function takes', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://x/y', getDocumentsByType: vi.fn().mockResolvedValue([]) });
      await deliver(ctx, { update_type: 'message_created', timestamp: 1, message: rawMessage('hi', 5) });
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
      expect(ctx.reportJournalProblem).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'max-unbound-5' }));
    });

    it('ignores update kinds it does not handle', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://x/y' });
      await deliver(ctx, { update_type: 'message_removed', timestamp: 1, message_id: 'm', chat_id: 1, user_id: 1 });
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('poll mode', () => {
    it('removes existing webhook subscriptions, then long-polls with the returned marker', async () => {
      fetchMock.mockImplementation((url: URL | string, init?: RequestInit) => {
        const path = new URL(String(url)).pathname;
        if (path === '/subscriptions' && (init?.method ?? 'GET') === 'GET') {
          return Promise.resolve(jsonResponse({ subscriptions: [{ url: 'https://old/hook' }] }));
        }
        if (path === '/updates') {
          return Promise.resolve(
            jsonResponse({
              updates: [{ update_type: 'message_created', timestamp: 1, message: rawMessage('hi') }],
              marker: 77,
            }),
          );
        }
        return Promise.resolve(jsonResponse({ success: true }));
      });
      const ctx = buildCtx();
      await registerMaxBackend(ctx);

      expect(calledUrls()).toContain('https://platform-api2.max.ru/subscriptions?url=https%3A%2F%2Fold%2Fhook');

      await ctx.interval?.();
      const firstPoll = new URL(calledUrls().at(-1) ?? '');
      expect(firstPoll.pathname).toBe('/updates');
      expect(firstPoll.searchParams.get('marker')).toBeNull();
      expect(firstPoll.searchParams.get('types')).toBe(
        'message_created,message_callback,bot_started,user_added,user_removed,bot_added,bot_removed',
      );
      expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);

      await ctx.interval?.();
      expect(new URL(calledUrls().at(-1) ?? '').searchParams.get('marker')).toBe('77');
    });

    it('throws on a failed poll so the host logs it', async () => {
      fetchMock.mockImplementation((url: URL | string) =>
        Promise.resolve(
          new URL(String(url)).pathname === '/updates'
            ? jsonResponse({ code: 'verify.token', message: 'Invalid access_token' }, 401)
            : jsonResponse({ subscriptions: [] }),
        ),
      );
      const ctx = buildCtx();
      await registerMaxBackend(ctx);
      await expect(ctx.interval?.()).rejects.toThrow(/Max GET \/updates failed: 401/);
    });
  });
});
