import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { describe, expect, it, vi } from 'vitest';
import { registerBitrix24Backend } from './bitrix24-backend.js';
import { BITRIX24_SIGNAL_NAME } from './constants.js';

const triggerFunctionRoot = (credentialId: string): INode => ({
  id: 'root-1',
  name: TRIGGER_FUNCTION_NAME,
  children: [
    { id: 'header-1', name: 'function-header', data: '' },
    {
      id: 'body-1',
      name: 'trigger-function-body',
      children: [],
      data: { vendor: 'bitrix24', triggerName: 'bitrix24-trigger', credentialId },
    },
    { id: 'footer-1', name: 'function-footer', data: '' },
  ],
});

const triggerFunctionDoc = (id: string, credentialId: string): IIntegrationDocumentRecord => ({
  id,
  name: 'onBitrix24Event',
  data: null,
  root: triggerFunctionRoot(credentialId),
});

const buildCtx = (
  overrides: Partial<IIntegrationBackendContext> = {},
): IIntegrationBackendContext & { registeredWebhooks: Map<string, (request: Request) => Promise<Response>> } => {
  const registeredWebhooks = new Map<string, (request: Request) => Promise<Response>>();
  const ctx: IIntegrationBackendContext & { registeredWebhooks: Map<string, (request: Request) => Promise<Response>> } =
    {
      vendor: 'bitrix24',
      credentialId: 'cred-1',
      projectId: 'project-1',
      env: 'dev',
      fields: { application_token: 'secret-token' },
      webhookUrl: null,
      taskQueue: 'workflow-project-1',
      registeredWebhooks,
      registerWebHook: vi.fn((uri: string, handler: (request: Request) => Promise<Response>) => {
        registeredWebhooks.set(uri, handler);
      }),
      registerInterval: vi.fn(),
      upsertSchedule: vi.fn().mockResolvedValue(null),
      pauseSchedule: vi.fn().mockResolvedValue(null),
      deleteSchedule: vi.fn().mockResolvedValue(null),
      listSchedules: vi.fn().mockResolvedValue([]),
      uploadFile: vi.fn().mockResolvedValue(null),
      signalWorkflow: vi.fn().mockResolvedValue(null),
      getDocumentsByType: vi.fn().mockResolvedValue([triggerFunctionDoc('doc-trigger-1', 'cred-1')]),
      getInternalProjectToken: vi.fn().mockReturnValue('project-token-1'),
      ...overrides,
    };
  return ctx;
};

const bitrix24RequestBody = (overrides: Readonly<Record<string, string>> = {}): string => {
  const fields: Record<string, string> = {
    event: 'ONCRMLEADADD',
    'data[FIELDS][ID]': '123',
    ts: '1727000000',
    'auth[domain]': 'example.bitrix24.ru',
    'auth[member_id]': 'abc123',
    'auth[application_token]': 'secret-token',
    ...overrides,
  };
  return new URLSearchParams(fields).toString();
};

describe('registerBitrix24Backend', () => {
  it('registers one webhook route per bound trigger-function, keyed by its document id', async () => {
    const ctx = buildCtx();
    await registerBitrix24Backend(ctx);
    expect(ctx.registerWebHook).toHaveBeenCalledWith('doc-trigger-1', expect.any(Function));
  });

  it('ignores trigger-functions bound to a different vendor or credential', async () => {
    const ctx = buildCtx({
      getDocumentsByType: vi
        .fn()
        .mockResolvedValue([
          triggerFunctionDoc('doc-other-cred', 'cred-2'),
          { id: 'doc-other-vendor', name: 'other', data: null, root: null },
        ]),
    });
    await registerBitrix24Backend(ctx);
    expect(ctx.registerWebHook).not.toHaveBeenCalled();
  });

  it('signals the bound trigger-function workflow with the parsed event when the application_token matches', async () => {
    const ctx = buildCtx();
    await registerBitrix24Backend(ctx);

    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const request = new Request('http://localhost/webhooks/bitrix24/p/cred-1/dev/doc-trigger-1', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: bitrix24RequestBody(),
    });
    const response = await handler?.(request);

    expect(response?.status).toBe(200);
    expect(ctx.signalWorkflow).toHaveBeenCalledWith({
      workflowId: 'bitrix24-doc-trigger-1',
      workflowType: 'onBitrix24Event',
      signalName: BITRIX24_SIGNAL_NAME,
      signalArgs: [
        {
          event: 'ONCRMLEADADD',
          data: { FIELDS: { ID: '123' } },
          ts: '1727000000',
          domain: 'example.bitrix24.ru',
          memberId: 'abc123',
        },
      ],
    });
  });

  it('never reaches the nested parser for a caller with a bad token (prototype-pollution payload)', async () => {
    const ctx = buildCtx();
    await registerBitrix24Backend(ctx);
    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const response = await handler?.(
      new Request('http://localhost/webhooks/bitrix24/p/cred-1/dev/doc-trigger-1', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: '__proto__[polluted]=1&auth%5Bapplication_token%5D=wrong',
      }),
    );
    expect(response?.status).toBe(403);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects with 403 and never signals when application_token does not match', async () => {
    const ctx = buildCtx();
    await registerBitrix24Backend(ctx);

    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const request = new Request('http://localhost/webhooks/bitrix24/p/cred-1/dev/doc-trigger-1', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: bitrix24RequestBody({ 'auth[application_token]': 'wrong-token' }),
    });
    const response = await handler?.(request);

    expect(response?.status).toBe(403);
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the request carries no application_token at all', async () => {
    const ctx = buildCtx();
    await registerBitrix24Backend(ctx);

    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const request = new Request('http://localhost/webhooks/bitrix24/p/cred-1/dev/doc-trigger-1', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ event: 'ONCRMLEADADD' }).toString(),
    });
    const response = await handler?.(request);

    expect(response?.status).toBe(403);
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the credential has no application_token configured', async () => {
    const ctx = buildCtx({ fields: {} });
    await registerBitrix24Backend(ctx);

    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const request = new Request('http://localhost/webhooks/bitrix24/p/cred-1/dev/doc-trigger-1', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: bitrix24RequestBody(),
    });
    const response = await handler?.(request);

    expect(response?.status).toBe(403);
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('dispose is a no-op — nothing was ever registered with a third-party service', async () => {
    const ctx = buildCtx();
    const handle = await registerBitrix24Backend(ctx);
    await expect(typeof handle === 'function' ? handle() : handle.dispose()).resolves.toBeUndefined();
  });
});
