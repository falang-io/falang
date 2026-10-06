import type { IIntegrationBackendContext } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTelegramBackend } from './telegram-backend.js';

const buildCtx = (): IIntegrationBackendContext & { webhook?: (request: Request) => Promise<Response> } => {
  const ctx: IIntegrationBackendContext & { webhook?: (request: Request) => Promise<Response> } = {
    vendor: 'telegram',
    credentialId: 'cred-1',
    projectId: 'project-1',
    env: 'prod',
    fields: { botToken: 'bot-token' },
    webhookUrl: 'https://bots.example.com/webhooks/telegram/p/cred-1/prod',
    taskQueue: 'workflow-project-1',
    registerWebHook: vi.fn((_uri: string, handler: (request: Request) => Promise<Response>) => {
      ctx.webhook = handler;
    }),
    registerInterval: vi.fn(),
    signalWorkflow: vi.fn().mockResolvedValue(null),
    getDocumentsByType: vi.fn().mockResolvedValue([]),
    getInternalProjectToken: vi.fn().mockReturnValue('t'),
    upsertSchedule: vi.fn().mockResolvedValue(null),
    pauseSchedule: vi.fn().mockResolvedValue(null),
    deleteSchedule: vi.fn().mockResolvedValue(null),
    listSchedules: vi.fn().mockResolvedValue([]),
    uploadFile: vi.fn(),
    reportJournalProblem: vi.fn().mockResolvedValue(null),
  };
  return ctx;
};

describe('registerTelegramBackend — journaling input no workflow can receive', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, result: [] }) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const post = async (ctx: ReturnType<typeof buildCtx>, update: unknown): Promise<void> => {
    await registerTelegramBackend(ctx);
    await ctx.webhook?.(new Request('http://localhost', { method: 'POST', body: JSON.stringify(update) }));
  };

  it('journals a button press with no bound trigger function on tg-unbound-<chatId>', async () => {
    const ctx = buildCtx();
    await post(ctx, {
      update_id: 1,
      callback_query: { id: 'cbq', data: 'A', message: { message_id: 5, date: 0, chat: { id: 42, type: 'private' } } },
    });

    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    expect(ctx.reportJournalProblem).toHaveBeenCalledWith({
      workflowId: 'tg-unbound-42',
      level: 'warn',
      message: expect.stringContaining('button press'),
      data: {
        errorType: 'NoBoundTrigger',
        signal: 'telegramQuestionAnswer',
        payload: { messageId: '5', value: 'A' },
      },
    });
  });

  it('journals a message with no bound trigger function (info) and works without a journal', async () => {
    const ctx = buildCtx();
    await post(ctx, {
      update_id: 1,
      message: { message_id: 1, date: 0, text: 'hi', chat: { id: 7, type: 'private' } },
    });
    expect(ctx.reportJournalProblem).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'tg-unbound-7', level: 'info' }),
    );

    const bare = buildCtx();
    // oxlint-disable-next-line typescript/no-dynamic-delete -- simulating a host without a journal.
    delete (bare as { reportJournalProblem?: unknown }).reportJournalProblem;
    await expect(
      post(bare, { update_id: 1, message: { message_id: 1, date: 0, text: 'hi', chat: { id: 7, type: 'private' } } }),
    ).resolves.toBeUndefined();
  });
});
