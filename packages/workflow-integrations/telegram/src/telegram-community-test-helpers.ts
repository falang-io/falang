import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { vi } from 'vitest';
import { TEST_WEBHOOK_SECRET, withTelegramSecret } from './telegram-test-secret.js';

/** Shared by the community-management suites (ADR 0076 (private)): bound trigger documents and a webhook-mode ctx. */
export interface ITriggerDocFixture {
  readonly id: string;
  readonly name: string;
  readonly triggerName: string;
  readonly triggerConfig?: Readonly<Record<string, string>>;
}

export const triggerDoc = (fixture: ITriggerDocFixture): IIntegrationDocumentRecord => {
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
          credentialId: 'cred-1',
          ...(fixture.triggerConfig ? { triggerConfig: fixture.triggerConfig } : {}),
        },
      },
      { id: `footer-${fixture.id}`, name: 'function-footer', data: '' },
    ],
  };
  return { id: fixture.id, name: fixture.name, data: null, root };
};

export const jsonResponse = (body: unknown, ok = true): Response =>
  ({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response;

export type TTestCtx = IIntegrationBackendContext & { registeredWebhook?: (request: Request) => Promise<Response> };

export const buildCommunityCtx = (documents: readonly IIntegrationDocumentRecord[]): TTestCtx => {
  const ctx: TTestCtx = {
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
    reportJournalProblem: vi.fn().mockResolvedValue(undefined),
  };
  return ctx;
};

/** Delivers one update through the registered webhook (the ctx must already be registered). */
export const postUpdate = async (ctx: TTestCtx, update: unknown): Promise<void> => {
  await ctx.registeredWebhook?.(new Request('http://localhost', { method: 'POST', body: JSON.stringify(update) }));
};

export const privateMessage = (text: string, chatId = 42, userId = chatId): Record<string, unknown> => ({
  message_id: 1,
  date: 0,
  text,
  chat: { id: chatId, type: 'private' },
  from: { id: userId, is_bot: false, first_name: 'Ann' },
});

export const groupMessage = (text: string, userId = 7, chatId = -100): Record<string, unknown> => ({
  message_id: 11,
  date: 0,
  text,
  chat: { id: chatId, type: 'supergroup', title: 'Chat' },
  from: { id: userId, is_bot: false, first_name: 'Bob' },
});
