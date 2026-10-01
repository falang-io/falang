import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerYookassaBackend } from './yookassa-backend.js';
import { YOOKASSA_SIGNAL_NAME } from './constants.js';

const triggerFunctionRoot = (credentialId: string): INode => ({
  id: 'root-1',
  name: TRIGGER_FUNCTION_NAME,
  children: [
    { id: 'header-1', name: 'function-header', data: '' },
    {
      id: 'body-1',
      name: 'trigger-function-body',
      children: [],
      data: { vendor: 'yookassa', triggerName: 'yookassa-trigger', credentialId },
    },
    { id: 'footer-1', name: 'function-footer', data: '' },
  ],
});

const triggerFunctionDoc = (id: string, credentialId: string): IIntegrationDocumentRecord => ({
  id,
  name: 'onYookassaEvent',
  data: null,
  root: triggerFunctionRoot(credentialId),
});

const buildCtx = (
  overrides: Partial<IIntegrationBackendContext> = {},
): IIntegrationBackendContext & { registeredWebhooks: Map<string, (request: Request) => Promise<Response>> } => {
  const registeredWebhooks = new Map<string, (request: Request) => Promise<Response>>();
  const ctx: IIntegrationBackendContext & { registeredWebhooks: Map<string, (request: Request) => Promise<Response>> } =
    {
      vendor: 'yookassa',
      credentialId: 'cred-1',
      projectId: 'project-1',
      env: 'dev',
      fields: { shop_id: 'shop-1', secret_key: 'secret-1' },
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

const notificationRequest = (body: unknown): Request =>
  new Request('http://localhost/webhooks/yookassa/p/cred-1/dev/doc-trigger-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const jsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response;

describe('registerYookassaBackend', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers one webhook route per bound trigger-function, keyed by its document id', async () => {
    const ctx = buildCtx();
    await registerYookassaBackend(ctx);
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
    await registerYookassaBackend(ctx);
    expect(ctx.registerWebHook).not.toHaveBeenCalled();
  });

  it('re-fetches the payment via the API and signals with the confirmed object, not the notification body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'pay-1', status: 'succeeded' }));
    vi.stubGlobal('fetch', fetchMock);

    const ctx = buildCtx();
    await registerYookassaBackend(ctx);
    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const response = await handler?.(
      notificationRequest({
        type: 'notification',
        event: 'payment.succeeded',
        // A malicious/forged claim — should be discarded in favor of the re-fetched object below.
        object: { id: 'pay-1', status: 'pending' },
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.yookassa.ru/v3/payments/pay-1',
      expect.objectContaining({ headers: { Authorization: `Basic ${btoa('shop-1:secret-1')}` } }),
    );
    expect(response?.status).toBe(200);
    expect(ctx.signalWorkflow).toHaveBeenCalledWith({
      workflowId: 'yookassa-doc-trigger-1',
      workflowType: 'onYookassaEvent',
      signalName: YOOKASSA_SIGNAL_NAME,
      signalArgs: [{ event: 'payment.succeeded', object: { id: 'pay-1', status: 'succeeded' } }],
    });
  });

  it('resolves refund events against the /refunds collection', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'ref-1', status: 'succeeded' }));
    vi.stubGlobal('fetch', fetchMock);

    const ctx = buildCtx();
    await registerYookassaBackend(ctx);
    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    await handler?.(notificationRequest({ type: 'notification', event: 'refund.succeeded', object: { id: 'ref-1' } }));

    expect(fetchMock).toHaveBeenCalledWith('https://api.yookassa.ru/v3/refunds/ref-1', expect.anything());
  });

  it('accepts but does not signal when the confirming GET 404s (id not found under this shop — likely forged)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    vi.stubGlobal('fetch', fetchMock);

    const ctx = buildCtx();
    await registerYookassaBackend(ctx);
    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const response = await handler?.(
      notificationRequest({ type: 'notification', event: 'payment.succeeded', object: { id: 'forged-id' } }),
    );

    expect(response?.status).toBe(200);
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('returns 502 (so ЮKassa retries) when the confirming GET fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const ctx = buildCtx();
    await registerYookassaBackend(ctx);
    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const response = await handler?.(
      notificationRequest({ type: 'notification', event: 'payment.succeeded', object: { id: 'pay-1' } }),
    );

    expect(response?.status).toBe(502);
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('returns 502 when the confirming GET responds with a non-404 error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    const ctx = buildCtx();
    await registerYookassaBackend(ctx);
    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const response = await handler?.(
      notificationRequest({ type: 'notification', event: 'payment.succeeded', object: { id: 'pay-1' } }),
    );

    expect(response?.status).toBe(502);
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('rejects a malformed notification body with 400 and never calls the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const ctx = buildCtx();
    await registerYookassaBackend(ctx);
    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const response = await handler?.(notificationRequest({ type: 'notification' }));

    expect(response?.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('accepts-but-ignores when the credential has no shop_id/secret_key configured yet', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const ctx = buildCtx({ fields: {} });
    await registerYookassaBackend(ctx);
    const handler = ctx.registeredWebhooks.get('doc-trigger-1');
    const response = await handler?.(
      notificationRequest({ type: 'notification', event: 'payment.succeeded', object: { id: 'pay-1' } }),
    );

    expect(response?.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('dispose is a no-op — nothing was ever registered with a third-party service', async () => {
    const ctx = buildCtx();
    const handle = await registerYookassaBackend(ctx);
    await expect(typeof handle === 'function' ? handle() : handle.dispose()).resolves.toBeUndefined();
  });
});
