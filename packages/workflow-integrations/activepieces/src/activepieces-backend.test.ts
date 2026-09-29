import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerActivepiecesBackend } from './activepieces-backend.js';
import type { IActivepiecesTriggerCatalogEntry } from './catalog-types.js';

const triggerFunctionRoot = (data: Record<string, unknown>): INode => ({
  id: 'root-1',
  name: TRIGGER_FUNCTION_NAME,
  children: [
    { id: 'header-1', name: 'function-header', data: '' },
    { id: 'body-1', name: 'trigger-function-body', children: [], data },
    { id: 'footer-1', name: 'function-footer', data: '' },
  ],
});

const triggerFunctionDoc = (data: Record<string, unknown>): IIntegrationDocumentRecord => ({
  id: 'doc-trigger-1',
  name: 'onNewItem',
  data: null,
  root: triggerFunctionRoot(data),
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
): IIntegrationBackendContext & { registeredInterval?: () => Promise<void> } => {
  const ctx: IIntegrationBackendContext & { registeredInterval?: () => Promise<void> } = {
    vendor: 'activepieces-mock',
    credentialId: 'cred-1',
    projectId: 'project-1',
    env: 'prod',
    fields: {},
    webhookUrl: null,
    taskQueue: 'workflow-project-1',
    registerWebHook: vi.fn(),
    registerInterval: vi.fn((callback: () => Promise<void>) => {
      ctx.registeredInterval = callback;
    }),
    signalWorkflow: vi.fn().mockResolvedValue(null),
    getDocumentsByType: vi
      .fn()
      .mockResolvedValue([
        triggerFunctionDoc({ vendor: 'activepieces-mock', triggerName: 'mock-new_item', credentialId: 'cred-1' }),
      ]),
    getInternalProjectToken: vi.fn().mockReturnValue('project-token-1'),
    upsertSchedule: vi.fn().mockResolvedValue(null),
    pauseSchedule: vi.fn().mockResolvedValue(null),
    deleteSchedule: vi.fn().mockResolvedValue(null),
    listSchedules: vi.fn().mockResolvedValue([]),
    uploadFile: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  return ctx;
};

const newItemTrigger: IActivepiecesTriggerCatalogEntry = {
  name: 'new_item',
  displayName: 'New item',
  description: '',
  props: [],
};

describe('registerActivepiecesBackend', () => {
  // oxlint-disable-next-line init-declarations
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    process.env['ACTIVEPIECES_SERVICE_URL'] = 'http://activepieces:4100';
    process.env['ACTIVEPIECES_SERVICE_SECRET'] = 'internal-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['ACTIVEPIECES_SERVICE_URL'];
    delete process.env['ACTIVEPIECES_SERVICE_SECRET'];
  });

  it('registers an interval (poll mode only — ActivePieces triggers never use webhooks)', async () => {
    const ctx = buildCtx();
    await registerActivepiecesBackend('mock', [newItemTrigger])(ctx);

    expect(ctx.registerWebHook).not.toHaveBeenCalled();
    expect(ctx.registerInterval).toHaveBeenCalledWith(expect.any(Function), expect.any(Number));
  });

  it("polls the service using the raw (unqualified) trigger name, reversed from the bound document's qualified triggerName", async () => {
    const ctx = buildCtx();
    await registerActivepiecesBackend('mock', [newItemTrigger])(ctx);
    await ctx.registeredInterval?.();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://activepieces:4100/credentials/cred-1/pieces/mock/triggers/new_item/poll',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-internal-api-key': 'internal-secret' }),
        body: JSON.stringify({ propsValue: {}, projectId: 'project-1', internalProjectToken: 'project-token-1' }),
      }),
    );
  });

  it('signals a fresh workflow per item returned by the poll, with a random per-item workflowId', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [{ id: 'a' }, { id: 'b' }] }));
    const ctx = buildCtx();
    await registerActivepiecesBackend('mock', [newItemTrigger])(ctx);

    await ctx.registeredInterval?.();

    expect(ctx.signalWorkflow).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = vi.mocked(ctx.signalWorkflow).mock.calls;
    expect(firstCall?.[0]).toMatchObject({
      workflowType: 'onNewItem',
      signalName: 'mock-new_item',
      signalArgs: [{ id: 'a' }],
    });
    expect(firstCall?.[0].workflowId).toMatch(/^ap-doc-trigger-1-/);
    expect(secondCall?.[0].workflowId).not.toBe(firstCall?.[0].workflowId);
  });

  it("only polls trigger-functions bound to this ctx's vendor and credentialId", async () => {
    const ctx = buildCtx({
      getDocumentsByType: vi
        .fn()
        .mockResolvedValue([
          triggerFunctionDoc({ vendor: 'activepieces-mock', triggerName: 'mock-new_item', credentialId: 'cred-1' }),
          triggerFunctionDoc({ vendor: 'activepieces-mock', triggerName: 'mock-new_item', credentialId: 'other-cred' }),
          triggerFunctionDoc({ vendor: 'activepieces-other', triggerName: 'other-new_item', credentialId: 'cred-1' }),
        ]),
    });
    await registerActivepiecesBackend('mock', [newItemTrigger])(ctx);

    await ctx.registeredInterval?.();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips a bound document whose triggerName does not reverse to any of this piece's known triggers", async () => {
    const ctx = buildCtx({
      getDocumentsByType: vi.fn().mockResolvedValue([
        triggerFunctionDoc({
          vendor: 'activepieces-mock',
          triggerName: 'mock-unknown_trigger',
          credentialId: 'cred-1',
        }),
      ]),
    });
    await registerActivepiecesBackend('mock', [newItemTrigger])(ctx);

    await ctx.registeredInterval?.();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('re-lists bound trigger-functions on every tick rather than caching at registration time', async () => {
    const getDocumentsByType = vi.fn().mockResolvedValue([]);
    const ctx = buildCtx({ getDocumentsByType });
    await registerActivepiecesBackend('mock', [newItemTrigger])(ctx);

    await ctx.registeredInterval?.();
    await ctx.registeredInterval?.();

    expect(getDocumentsByType).toHaveBeenCalledTimes(2);
  });

  it('dispose() is a no-op — the host clears the interval itself', async () => {
    const ctx = buildCtx();
    const handle = await registerActivepiecesBackend('mock', [newItemTrigger])(ctx);
    fetchMock.mockClear();

    await (typeof handle === 'function' ? handle() : handle.dispose());

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
