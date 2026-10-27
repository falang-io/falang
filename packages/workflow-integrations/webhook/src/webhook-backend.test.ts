import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { describe, expect, it, vi } from 'vitest';
import { WEBHOOK_SIGNAL_NAME, webhookSecretLabel } from './constants.js';
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

const statusOf = async (response: Promise<Response | undefined> | undefined): Promise<number | undefined> => {
  const resolved = await response;
  return resolved?.status;
};

/** Stand-in for the host's `ctx.deriveSecret`: any deterministic function of the label. */
const derive = (label: string): string => `derived(${label})`;

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

  describe('signed calls (trigger config require_signature, derived secret)', () => {
    const body = JSON.stringify({ hello: 'world' });
    const SECRET_V1 = derive(webhookSecretLabel('doc-trigger-1', 1));
    const setup = async (
      triggerConfig: Record<string, string> | undefined,
      overrides: Partial<IIntegrationBackendContext> = {},
      withoutDerive = false,
    ) => {
      const ctx = buildCtx({
        deriveSecret: derive,
        getDocumentsByType: vi.fn().mockResolvedValue([triggerFunctionDoc('doc-trigger-1', 'cred-1', triggerConfig)]),
        ...overrides,
      });
      if (withoutDerive) Reflect.deleteProperty(ctx, 'deriveSecret');
      await registerWebhookBackend(ctx);
      const handler = ctx.registeredWebhooks.get('doc-trigger-1');
      const call = (headers: Record<string, string>) =>
        handler?.(new Request('http://localhost/x', { method: 'POST', headers, body }));
      return { ctx, call };
    };

    it.each([
      ['no config', null],
      ['require_signature false', { require_signature: 'false' }],
      ['a leftover signing_secret', { signing_secret: 'old' }],
    ])('does not check anything unless require_signature is true (%s)', async (_name, config) => {
      const { ctx, call } = await setup(config ?? {});
      expect(await statusOf(call({}))).toBe(200);
      expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);
    });

    it('rejects a call with no / wrong secret or signature (401) and never signals', async () => {
      const { ctx, call } = await setup({ require_signature: 'true' });
      const responses = await Promise.all([
        call({}),
        call({ 'x-webhook-secret': 'nope' }),
        call({ 'x-webhook-signature': `sha256=${await hmacHex('other', body)}` }),
        call({ 'x-webhook-signature': 'sha256=deadbeef' }),
      ]);
      expect(responses.map((response) => response?.status)).toEqual([401, 401, 401, 401]);
      expect(ctx.signalWorkflow).not.toHaveBeenCalled();
    });

    it('accepts the derived secret header and strips it from the payload', async () => {
      const { ctx, call } = await setup({ require_signature: 'true' });
      const response = await call({ 'x-webhook-secret': SECRET_V1 });
      expect(response?.status).toBe(200);
      const payload = (ctx.signalWorkflow as ReturnType<typeof vi.fn>).mock.calls[0][0].signalArgs[0];
      expect(payload.headers['x-webhook-secret']).toBeUndefined();
    });

    it('accepts a valid sha256 HMAC signature of the raw body', async () => {
      const { ctx, call } = await setup({ require_signature: 'true' });
      const response = await call({ 'x-webhook-signature': `sha256=${await hmacHex(SECRET_V1, body)}` });
      expect(response?.status).toBe(200);
      expect(ctx.signalWorkflow).toHaveBeenCalledTimes(1);
    });

    it('rotating signature_version makes the old secret fail and the new one work', async () => {
      const { call } = await setup({ require_signature: 'true', signature_version: '2' });
      expect(await statusOf(call({ 'x-webhook-secret': SECRET_V1 }))).toBe(401);
      expect(await statusOf(call({ 'x-webhook-secret': derive(webhookSecretLabel('doc-trigger-1', 2)) }))).toBe(200);
    });

    it('picks up a changed config without re-registering', async () => {
      const getDocumentsByType = vi
        .fn()
        .mockResolvedValue([triggerFunctionDoc('doc-trigger-1', 'cred-1', { require_signature: 'true' })]);
      const { call } = await setup({ require_signature: 'true' }, { getDocumentsByType });
      expect(await statusOf(call({}))).toBe(401);
      getDocumentsByType.mockResolvedValue([triggerFunctionDoc('doc-trigger-1', 'cred-1', {})]);
      expect(await statusOf(call({}))).toBe(200);
    });

    it('fails closed when the host cannot derive a secret', async () => {
      const unsupported = await setup({ require_signature: 'true' }, {}, true);
      expect(await statusOf(unsupported.call({ 'x-webhook-secret': '' }))).toBe(401);
      expect(await statusOf(unsupported.call({}))).toBe(401);
      const throwing = await setup(
        { require_signature: 'true' },
        {
          deriveSecret: () => {
            throw new Error('no key');
          },
        },
      );
      expect(await statusOf(throwing.call({ 'x-webhook-signature': 'sha256=' }))).toBe(401);
      expect(unsupported.ctx.signalWorkflow).not.toHaveBeenCalled();
    });
  });

  it('dispose is a no-op — nothing was ever registered with a third-party service', async () => {
    const ctx = buildCtx();
    const handle = await registerWebhookBackend(ctx);
    await expect(typeof handle === 'function' ? handle() : handle.dispose()).resolves.toBeUndefined();
  });
});
