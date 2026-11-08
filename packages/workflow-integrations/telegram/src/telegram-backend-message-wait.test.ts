import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_WEBHOOK_SECRET, withTelegramSecret } from './telegram-test-secret.js';
import { registerTelegramBackend } from './telegram-backend.js';
import { toTelegramMessage } from './telegram-message-mapper.js';

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
      ctx.registeredWebhook = (request) => handler(withTelegramSecret(request));
    }),
    deriveSecret: () => TEST_WEBHOOK_SECRET,
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

/** ADR 0079: a run waiting for the chat's next message takes it before the usual trigger routing. */
describe('registerTelegramBackend — delivering to a waiting run', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true, result: [] })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const documents = [
    triggerFunctionDoc({ id: 'doc-message', name: 'onMessage', triggerName: 'telegram-trigger' }),
    triggerFunctionDoc({
      id: 'doc-start',
      name: 'onStart',
      triggerName: 'telegram-on-command-trigger',
      triggerConfig: { command: 'start' },
    }),
  ];

  const sendText = async (ctx: ReturnType<typeof buildCtx>, text: string) => {
    await registerTelegramBackend(ctx);
    const message = {
      message_id: 5,
      date: 0,
      text,
      chat: { id: 42, type: 'private' },
      from: { id: 7, is_bot: false, first_name: 'Ann' },
    };
    await ctx.registeredWebhook?.(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({ update_id: 3, message }) }),
    );
    return message;
  };

  it('hands a plain message to the waiting run and does not signal any trigger', async () => {
    const ctx = buildCtx(documents);
    const deliverToMessageWait = vi.fn(async (params: { buildMessage: () => Promise<unknown> }) => {
      await params.buildMessage();
      return true;
    });
    ctx.deliverToMessageWait = deliverToMessageWait as unknown as IIntegrationBackendContext['deliverToMessageWait'];

    const message = await sendText(ctx, 'Ann Smith');

    expect(deliverToMessageWait).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 42, userId: 7, signalName: 'telegramReply' }),
    );
    const built = await deliverToMessageWait.mock.calls[0][0].buildMessage();
    expect(built).toMatchObject(toTelegramMessage(message));
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('routes the message to its trigger as usual when nobody waits', async () => {
    const ctx = buildCtx(documents);
    ctx.deliverToMessageWait = vi.fn().mockResolvedValue(false);

    await sendText(ctx, 'hello');

    expect(ctx.signalWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ workflowType: 'onMessage', signalName: 'telegramMessage' }),
    );
  });

  it('lets a command with a bound on-command trigger win over the wait', async () => {
    const ctx = buildCtx(documents);
    ctx.deliverToMessageWait = vi.fn().mockResolvedValue(true);

    await sendText(ctx, '/start');

    expect(ctx.deliverToMessageWait).not.toHaveBeenCalled();
    expect(ctx.signalWorkflow).toHaveBeenCalledWith(expect.objectContaining({ workflowType: 'onStart' }));
  });

  it('gives a command without its own trigger to the wait', async () => {
    const ctx = buildCtx(documents);
    ctx.deliverToMessageWait = vi.fn().mockResolvedValue(true);

    await sendText(ctx, '/skip');

    expect(ctx.deliverToMessageWait).toHaveBeenCalled();
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });
});
