import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { describe, expect, it, vi } from 'vitest';
import { WEBHOOK_SIGNAL_NAME } from './constants.js';
import { registerWebhookBackend } from './webhook-backend.js';

const triggerFunctionRoot = (credentialId: string, triggerConfig?: Record<string, string>): INode => ({
  id: 'root-1',
  name: TRIGGER_FUNCTION_NAME,
  children: [
    { id: 'header-1', name: 'function-header', data: '' },
    {
      id: 'body-1',
      name: 'trigger-function-body',
      children: [],
      data: { vendor: 'webhook', triggerName: 'webhook-trigger', credentialId, triggerConfig },
    },
    { id: 'footer-1', name: 'function-footer', data: '' },
  ],
});

const triggerFunctionDoc = (
  id: string,
  credentialId: string,
  triggerConfig?: Record<string, string>,
): IIntegrationDocumentRecord => ({
  id,
  name: 'onWebhook',
  data: null,
  root: triggerFunctionRoot(credentialId, triggerConfig),
});

const buildCtx = (
  overrides: Partial<IIntegrationBackendContext> = {},
): IIntegrationBackendContext & { registeredWebhooks: Map<string, (request: Request) => Promise<Response>> } => {
  const registeredWebhooks = new Map<string, (request: Request) => Promise<Response>>();
  const ctx: IIntegrationBackendContext & { registeredWebhooks: Map<string, (request: Request) => Promise<Response>> } =
    {
      vendor: 'webhook',
      credentialId: 'cred-1',
      projectId: 'project-1',
      env: 'dev',
      fields: {},
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

const hmacHex = async (secret: string, text: string): Promise<string> => {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(text));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

describe('registerWebhookBackend', () => {
  it('registers one webhook route per bound trigger-function, keyed by its document id', async () => {
    const ctx = buildCtx();
    await registerWebhookBackend(ctx);
    expect(ctx.registerWebHook).toHaveBeenCalledWith('doc-trigger-1', expect.any(Function));
  });

  it('ignores ctx.webhookUrl — registers the route in both webhook and polling mode', async () => {
    const ctxNoPublicHost = buildCtx({ webhookUrl: null });
    await registerWebhookBackend(ctxNoPublicHost);
    expect(ctxNoPublicHost.registerWebHook).toHaveBeenCalled();
    expect(ctxNoPublicHost.registerInterval).not.toHaveBeenCalled();

    const ctxPublicHost = buildCtx({ webhookUrl: 'https://example.com/webhooks/webhook/p/cred-1/dev' });
    await registerWebhookBackend(ctxPublicHost);
    expect(ctxPublicHost.registerWebHook).toHaveBeenCalled();
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
    await registerWebhookBackend(ctx);
    expect(ctx.registerWebHook).not.toHaveBeenCalled();
  });

  it('the registered handler signals the bound trigger-function workflow with method/headers/body', async () => {
    const ctx = buildCtx();
    await registerWebhookBackend(ctx);

    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const request = new Request('http://localhost/webhooks/webhook/p/cred-1/dev/doc-trigger-1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    const response = await handler?.(request);

    expect(response?.status).toBe(200);
    expect(ctx.signalWorkflow).toHaveBeenCalledWith({
      workflowId: 'webhook-doc-trigger-1',
      workflowType: 'onWebhook',
      signalName: WEBHOOK_SIGNAL_NAME,
      signalArgs: [
        {
          method: 'POST',
          headers: expect.objectContaining({ 'content-type': 'application/json' }),
          body: JSON.stringify({ hello: 'world' }),
        },
      ],
    });
  });

  describe('signing secret (trigger config signing_secret)', () => {
    const SECRET = 's3cret';
    const body = JSON.stringify({ hello: 'world' });
    const setup = async () => {
      const ctx = buildCtx({
        getDocumentsByType: vi
          .fn()
          .mockResolvedValue([triggerFunctionDoc('doc-trigger-1', 'cred-1', { signing_secret: SECRET })]),
      });
      await registerWebhookBackend(ctx);
      const handler = ctx.registeredWebhooks.get('doc-trigger-1');
      const call = (headers: Record<string, string>) =>
        handler?.(new Request('http://localhost/x', { method: 'POST', headers, body }));
      return { ctx, call };
    };

    it('rejects a call with no / wrong secret or signature (401) and never signals', async () => {
      const { ctx, call } = await setup();
      const responses = await Promise.all([
        call({}),
        call({ 'x-webhook-secret': 'nope' }),
        call({ 'x-webhook-signature': `sha256=${await hmacHex('other', body)}` }),
        call({ 'x-webhook-signature': 'sha256=deadbeef' }),
      ]);
      expect(responses.map((response) => response?.status)).toEqual([401, 401, 401, 401]);
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    });

    it('accepts the shared secret header and strips it from the payload', async () => {
      const { ctx, call } = await setup();
      const response = await call({ 'x-webhook-secret': SECRET });
      expect(response?.status).toBe(200);
      const payload = (ctx.signalWorkflow as ReturnType<typeof vi.fn>).mock.calls[0][0].signalArgs[0];
      expect(payload.headers['x-webhook-secret']).toBeUndefined();
    });

    it('accepts a valid sha256 HMAC signature of the raw body', async () => {
      const { ctx, call } = await setup();
      const response = await call({ 'x-webhook-signature': `sha256=${await hmacHex(SECRET, body)}` });
      expect(response?.status).toBe(200);
      expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);
    });
  });

  it('dispose is a no-op — nothing was ever registered with a third-party service', async () => {
    const ctx = buildCtx();
    const handle = await registerWebhookBackend(ctx);
    await expect(typeof handle === 'function' ? handle() : handle.dispose()).resolves.toBeUndefined();
  });
});
