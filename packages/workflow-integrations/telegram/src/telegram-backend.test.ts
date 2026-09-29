import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTelegramBackend } from './telegram-backend.js';
import { toTelegramMessage } from './telegram-message-mapper.js';

/** `registerTelegramBackend` always returns the bare-function shape — narrows the declared union. */
const asDispose = (result: Awaited<ReturnType<typeof registerTelegramBackend>>): (() => Promise<void>) => {
  if (typeof result === 'function') return result;
  throw new Error('expected a bare dispose function');
};

const triggerFunctionRoot = (credentialId: string): INode => ({
  id: 'root-1',
  name: TRIGGER_FUNCTION_NAME,
  children: [
    { id: 'header-1', name: 'function-header', data: '' },
    {
      id: 'body-1',
      name: 'trigger-function-body',
      children: [],
      data: { vendor: 'telegram', triggerName: 'telegram-trigger', credentialId },
    },
    { id: 'footer-1', name: 'function-footer', data: '' },
  ],
});

const triggerFunctionDoc = (credentialId: string): IIntegrationDocumentRecord => ({
  id: 'doc-trigger-1',
  name: 'onMessage',
  data: null,
  root: triggerFunctionRoot(credentialId),
});

const jsonResponse = (body: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response;

const buildCtx = (
  overrides: Partial<IIntegrationBackendContext> = {},
): IIntegrationBackendContext & {
  registeredWebhook?: (request: Request) => Promise<Response>;
  registeredInterval?: () => Promise<void>;
} => {
  const ctx: IIntegrationBackendContext & {
    registeredWebhook?: (request: Request) => Promise<Response>;
    registeredInterval?: () => Promise<void>;
  } = {
    vendor: 'telegram',
    credentialId: 'cred-1',
    projectId: 'project-1',
    env: 'prod',
    fields: { botToken: 'bot-token' },
    webhookUrl: null,
    taskQueue: 'workflow-project-1',
    registerWebHook: vi.fn((_uri: string, handler: (request: Request) => Promise<Response>) => {
      ctx.registeredWebhook = handler;
    }),
    registerInterval: vi.fn((callback: () => Promise<void>) => {
      ctx.registeredInterval = callback;
    }),
    signalWorkflow: vi.fn().mockResolvedValue(null),
    getDocumentsByType: vi.fn().mockResolvedValue([triggerFunctionDoc('cred-1')]),
    getInternalProjectToken: vi.fn().mockReturnValue('project-token-1'),
    upsertSchedule: vi.fn().mockResolvedValue(null),
    pauseSchedule: vi.fn().mockResolvedValue(null),
    deleteSchedule: vi.fn().mockResolvedValue(null),
    listSchedules: vi.fn().mockResolvedValue([]),
    uploadFile: vi.fn(),
    ...overrides,
  };
  return ctx;
};

describe('registerTelegramBackend', () => {
  // oxlint-disable-next-line init-declarations
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing and returns a no-op dispose when the credential has no bot token', async () => {
    const ctx = buildCtx({ fields: {} });
    const dispose = asDispose(await registerTelegramBackend(ctx));
    expect(ctx.registerWebHook).not.toHaveBeenCalled();
    expect(ctx.registerInterval).not.toHaveBeenCalled();
    await expect(dispose()).resolves.toBeUndefined();
  });

  describe('webhook mode (ctx.webhookUrl set)', () => {
    it('registers a local webhook handler and calls Telegram setWebhook', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://bots.example.com/webhooks/telegram/cred-1/prod' });
      await registerTelegramBackend(ctx);

      expect(ctx.registerWebHook).toHaveBeenCalledWith('', expect.any(Function));
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.telegram.org/botbot-token/setWebhook',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ url: 'https://bots.example.com/webhooks/telegram/cred-1/prod' }),
        }),
      );
    });

    it('throws when Telegram setWebhook responds with a non-ok status', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ ok: false }, false));
      const ctx = buildCtx({ webhookUrl: 'https://bots.example.com/webhooks/telegram/cred-1/prod' });
      await expect(registerTelegramBackend(ctx)).rejects.toThrow(/Telegram setWebhook failed/);
    });

    it('signals the bound trigger-function, mapping snake_case (message_id/from.first_name/from.is_bot) to camelCase', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://bots.example.com/webhooks/telegram/cred-1/prod' });
      await registerTelegramBackend(ctx);

      const update = {
        update_id: 1,
        message: {
          message_id: 1,
          date: 0,
          chat: { id: 42, type: 'private' },
          from: { id: 7, is_bot: false, first_name: 'Ada', username: 'ada' },
        },
      };
      const response = await ctx.registeredWebhook?.(
        new Request('http://localhost', { method: 'POST', body: JSON.stringify(update) }),
      );

      expect(response?.status).toBe(200);
      expect(ctx.signalWorkflow).toHaveBeenCalledWith({
        workflowId: 'tg-doc-trigger-1-42',
        workflowType: 'onMessage',
        signalName: 'telegramMessage',
        signalArgs: [
          {
            messageId: 1,
            date: 0,
            chat: { id: 42, type: 'private' },
            from: { id: 7, isBot: false, firstName: 'Ada', username: 'ada' },
          },
        ],
      });
    });

    it('the registered handler does not signal when the update has no chat', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://bots.example.com/webhooks/telegram/cred-1/prod' });
      await registerTelegramBackend(ctx);

      await ctx.registeredWebhook?.(
        new Request('http://localhost', { method: 'POST', body: JSON.stringify({ update_id: 1 }) }),
      );
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    });

    it('the registered handler does not signal when no trigger-function is bound to this credential', async () => {
      const ctx = buildCtx({
        webhookUrl: 'https://bots.example.com/webhooks/telegram/cred-1/prod',
        getDocumentsByType: vi.fn().mockResolvedValue([]),
      });
      await registerTelegramBackend(ctx);

      const update = { update_id: 1, message: { message_id: 1, date: 0, chat: { id: 42, type: 'private' } } };
      await ctx.registeredWebhook?.(new Request('http://localhost', { method: 'POST', body: JSON.stringify(update) }));
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    });

    it('dispose() calls Telegram deleteWebhook', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://bots.example.com/webhooks/telegram/cred-1/prod' });
      const dispose = asDispose(await registerTelegramBackend(ctx));
      fetchMock.mockClear();

      await dispose();

      expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/botbot-token/deleteWebhook', { method: 'POST' });
    });
  });

  describe('callback_query updates (button presses)', () => {
    it('signals telegramQuestionAnswer, normalized to { messageId, value }, and acks the callback', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://bots.example.com/webhooks/telegram/cred-1/prod' });
      await registerTelegramBackend(ctx);

      const update = {
        update_id: 1,
        callback_query: {
          id: 'cbq-1',
          data: 'Option A',
          message: { message_id: 99, date: 0, chat: { id: 42, type: 'private' } },
        },
      };
      const response = await ctx.registeredWebhook?.(
        new Request('http://localhost', { method: 'POST', body: JSON.stringify(update) }),
      );

      expect(response?.status).toBe(200);
      expect(ctx.signalWorkflow).toHaveBeenCalledWith({
        workflowId: 'tg-doc-trigger-1-42',
        workflowType: 'onMessage',
        signalName: 'telegramQuestionAnswer',
        signalArgs: [{ messageId: '99', value: 'Option A' }],
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.telegram.org/botbot-token/answerCallbackQuery',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ callback_query_id: 'cbq-1' }) }),
      );
    });

    it('does not signal when the callback has no chat/message', async () => {
      const ctx = buildCtx({ webhookUrl: 'https://bots.example.com/webhooks/telegram/cred-1/prod' });
      await registerTelegramBackend(ctx);

      await ctx.registeredWebhook?.(
        new Request('http://localhost', {
          method: 'POST',
          body: JSON.stringify({ update_id: 1, callback_query: { id: 'cbq-2', data: 'Option A' } }),
        }),
      );

      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('poll mode (ctx.webhookUrl null)', () => {
    it('clears any existing webhook up front and registers an interval instead of a webhook route', async () => {
      const ctx = buildCtx({ webhookUrl: null });
      await registerTelegramBackend(ctx);

      expect(ctx.registerWebHook).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/botbot-token/deleteWebhook', { method: 'POST' });
      expect(ctx.registerInterval).toHaveBeenCalledWith(expect.any(Function), expect.any(Number));
    });

    it('the registered interval callback polls getUpdates and signals the bound workflow for each update', async () => {
      const ctx = buildCtx({ webhookUrl: null });
      const update = { update_id: 5, message: { message_id: 1, date: 0, chat: { id: 42, type: 'private' } } };
      fetchMock.mockImplementation((input: string | URL) =>
        Promise.resolve(
          input.toString().includes('getUpdates')
            ? jsonResponse({ ok: true, result: [update] })
            : jsonResponse({ ok: true }),
        ),
      );
      await registerTelegramBackend(ctx);

      await ctx.registeredInterval?.();

      expect(ctx.signalWorkflow).toHaveBeenCalledWith({
        workflowId: 'tg-doc-trigger-1-42',
        workflowType: 'onMessage',
        signalName: 'telegramMessage',
        signalArgs: [toTelegramMessage(update.message)],
      });
    });

    it('advances the offset across successive interval invocations', async () => {
      const ctx = buildCtx({ webhookUrl: null });
      fetchMock.mockImplementation((input: string | URL) =>
        Promise.resolve(
          input.toString().includes('getUpdates')
            ? jsonResponse({ ok: true, result: [{ update_id: 5 }, { update_id: 6 }] })
            : jsonResponse({ ok: true }),
        ),
      );
      await registerTelegramBackend(ctx);

      await ctx.registeredInterval?.();
      fetchMock.mockClear();
      await ctx.registeredInterval?.();

      const getUpdatesCall = fetchMock.mock.calls.find((call) => (call[0] as URL).toString().includes('getUpdates'));
      const url = new URL((getUpdatesCall as [string | URL])[0]);
      expect(url.searchParams.get('offset')).toBe('7');
    });

    it('dispose() is a no-op — the host clears the interval itself', async () => {
      const ctx = buildCtx({ webhookUrl: null });
      const dispose = asDispose(await registerTelegramBackend(ctx));
      fetchMock.mockClear();

      await dispose();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
