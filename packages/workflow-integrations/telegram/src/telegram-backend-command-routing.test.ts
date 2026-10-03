import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTelegramBackend } from './telegram-backend.js';
import { toTelegramMessage, type ITelegramRawMessage } from './telegram-message-mapper.js';

interface ITriggerFunctionFixture {
  readonly id: string;
  readonly name: string;
  readonly triggerName: 'telegram-trigger' | 'telegram-on-command-trigger';
  readonly credentialId?: string;
  readonly triggerConfig?: Readonly<Record<string, string>>;
}

const triggerFunctionDoc = (fixture: ITriggerFunctionFixture): IIntegrationDocumentRecord => {
  const credentialId = fixture.credentialId ?? 'cred-1';
  const root: INode = {
    id: `root-${fixture.id}`,
    name: TRIGGER_FUNCTION_NAME,
    children: [
      { id: `header-${fixture.id}`, name: 'function-header', data: '' },
      {
        id: `body-${fixture.id}`,
        name: 'trigger-function-body',
        children: [],
        data: {
          vendor: 'telegram',
          triggerName: fixture.triggerName,
          credentialId,
          ...(fixture.triggerConfig ? { triggerConfig: fixture.triggerConfig } : {}),
        },
      },
      { id: `footer-${fixture.id}`, name: 'function-footer', data: '' },
    ],
  };
  return { id: fixture.id, name: fixture.name, data: null, root };
};

const jsonResponse = (body: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response;

const buildCtx = (
  documents: readonly IIntegrationDocumentRecord[],
): IIntegrationBackendContext & { registeredWebhook?: (request: Request) => Promise<Response> } => {
  const ctx: IIntegrationBackendContext & { registeredWebhook?: (request: Request) => Promise<Response> } = {
    vendor: 'telegram',
    credentialId: 'cred-1',
    projectId: 'project-1',
    env: 'prod',
    fields: { botToken: 'bot-token' },
    webhookUrl: 'https://bots.example.com/webhooks/telegram/p/cred-1/prod',
    taskQueue: 'workflow-project-1',
    registerWebHook: vi.fn((_uri: string, handler: (request: Request) => Promise<Response>) => {
      ctx.registeredWebhook = handler;
    }),
    registerInterval: vi.fn(),
    signalWorkflow: vi.fn().mockResolvedValue(null),
    getDocumentsByType: vi.fn().mockResolvedValue(documents),
    getInternalProjectToken: vi.fn().mockReturnValue('project-token-1'),
    upsertSchedule: vi.fn().mockResolvedValue(null),
    pauseSchedule: vi.fn().mockResolvedValue(null),
    deleteSchedule: vi.fn().mockResolvedValue(null),
    listSchedules: vi.fn().mockResolvedValue([]),
    uploadFile: vi.fn(),
  };
  return ctx;
};

/**
 * Command triggers (Telegram's `telegram-on-command-trigger`) let a project bind multiple
 * `trigger-function`s to one bot — one specific command handler per configured `/command`, plus an
 * optional catch-all `onMessage` — unlike the single "one trigger-function per credential" case the
 * rest of `telegram-backend.test.ts` covers. See `registerTelegramBackend`'s
 * `selectTriggerFunctionForMessage`.
 */
describe('registerTelegramBackend — on-command trigger routing', () => {
  // oxlint-disable-next-line init-declarations
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sendUpdate = async (
    ctx: ReturnType<typeof buildCtx>,
    text: string,
    chatId = 42,
  ): Promise<ITelegramRawMessage> => {
    await registerTelegramBackend(ctx);
    const update = { update_id: 1, message: { message_id: 1, date: 0, text, chat: { id: chatId, type: 'private' } } };
    await ctx.registeredWebhook?.(new Request('http://localhost', { method: 'POST', body: JSON.stringify(update) }));
    return update.message;
  };

  it('signals the on-command trigger-function when the message text matches its configured command', async () => {
    const ctx = buildCtx([
      triggerFunctionDoc({ id: 'doc-message', name: 'onMessage', triggerName: 'telegram-trigger' }),
      triggerFunctionDoc({
        id: 'doc-start',
        name: 'onStart',
        triggerName: 'telegram-on-command-trigger',
        triggerConfig: { command: '/start' },
      }),
    ]);

    const message = await sendUpdate(ctx, '/start');

    expect(ctx.signalWorkflow).toHaveBeenCalledWith({
      workflowId: 'tg-doc-start-42',
      workflowType: 'onStart',
      signalName: 'telegramMessage',
      signalArgs: [toTelegramMessage(message)],
    });
  });

  it('matches regardless of the leading slash configured or a trailing @botUsername/args on the message', async () => {
    const ctx = buildCtx([
      triggerFunctionDoc({
        id: 'doc-start',
        name: 'onStart',
        triggerName: 'telegram-on-command-trigger',
        triggerConfig: { command: 'start' },
      }),
    ]);

    await sendUpdate(ctx, '/start@my_bot hello');

    expect(ctx.signalWorkflow).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'tg-doc-start-42' }));
  });

  it('falls back to the on-message trigger-function when the text does not match any configured command', async () => {
    const ctx = buildCtx([
      triggerFunctionDoc({ id: 'doc-message', name: 'onMessage', triggerName: 'telegram-trigger' }),
      triggerFunctionDoc({
        id: 'doc-start',
        name: 'onStart',
        triggerName: 'telegram-on-command-trigger',
        triggerConfig: { command: '/start' },
      }),
    ]);

    await sendUpdate(ctx, 'just chatting');

    expect(ctx.signalWorkflow).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'tg-doc-message-42' }));
  });

  it('does not signal when only an on-command trigger-function is bound and the command does not match', async () => {
    const ctx = buildCtx([
      triggerFunctionDoc({
        id: 'doc-start',
        name: 'onStart',
        triggerName: 'telegram-on-command-trigger',
        triggerConfig: { command: '/start' },
      }),
    ]);

    await sendUpdate(ctx, '/help');

    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  /**
   * Regression coverage for a real bug: a button press (`callback_query`) carries no command text, so
   * `handleCallbackQuery` can't route it the way `selectTriggerFunctionForMessage` routes a message —
   * it used to always pick the on-message trigger-function (or an arbitrary bound document), which is
   * wrong whenever the conversation was actually started by a *different* bound trigger-function (e.g.
   * an on-command `/start` trigger). Since `ctx.signalWorkflow` is a `signalWithStart`, that silently
   * started an unrelated new workflow instead of delivering the answer to the one actually waiting —
   * the button appeared to do nothing. `registerTelegramBackend` now remembers, per chat, which
   * trigger-function's workflow is running (set on the preceding message) and routes the callback there.
   */
  it('routes a callback_query to the same trigger-function workflow that handled the preceding command message', async () => {
    const ctx = buildCtx([
      triggerFunctionDoc({ id: 'doc-message', name: 'onMessage', triggerName: 'telegram-trigger' }),
      triggerFunctionDoc({
        id: 'doc-start',
        name: 'onStart',
        triggerName: 'telegram-on-command-trigger',
        triggerConfig: { command: '/start' },
      }),
    ]);

    await sendUpdate(ctx, '/start');
    expect(ctx.signalWorkflow).toHaveBeenCalledWith(expect.objectContaining({ workflowId: 'tg-doc-start-42' }));

    const callbackUpdate = {
      update_id: 2,
      callback_query: {
        id: 'cbq-1',
        data: 'A',
        message: { message_id: 5, date: 0, chat: { id: 42, type: 'private' } },
      },
    };
    await ctx.registeredWebhook?.(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify(callbackUpdate) }),
    );

    expect(ctx.signalWorkflow).toHaveBeenLastCalledWith({
      workflowId: 'tg-doc-start-42',
      workflowType: 'onStart',
      signalName: 'telegramQuestionAnswer',
      signalArgs: [{ messageId: '5', value: 'A' }],
    });
  });
});
