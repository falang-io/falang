import type { INode } from '@falang/dto';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveAmoCrmRouteKey, registerAmoCrmBackend } from './amocrm-backend.js';
import { AMOCRM_WEBHOOK_SIGNAL_NAME } from './amocrm-webhook-triggers.js';

const triggerFunctionDoc = (
  id: string,
  triggerName: string,
  event: string,
  credentialId = 'cred-1',
): IIntegrationDocumentRecord => {
  const root: INode = {
    id: `${id}-root`,
    name: TRIGGER_FUNCTION_NAME,
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      {
        id: `${id}-body`,
        name: 'trigger-function-body',
        children: [],
        data: { vendor: 'amocrm', triggerName, credentialId, triggerConfig: { event } },
      },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  };
  return { id, name: `on_${id}`, data: null, root };
};

type TTestCtx = IIntegrationBackendContext & { readonly routes: Map<string, (request: Request) => Promise<Response>> };

const buildCtx = (overrides: Partial<IIntegrationBackendContext> = {}): TTestCtx => {
  const routes = new Map<string, (request: Request) => Promise<Response>>();
  return {
    vendor: 'amocrm',
    credentialId: 'cred-1',
    projectId: 'project-1',
    env: 'dev',
    fields: { access_token: 'stale', account_domain: 'acme.amocrm.ru' },
    webhookUrl: 'https://bots.example.com/webhooks/amocrm/project-1/cred-1/dev',
    taskQueue: 'workflow-project-1',
    routes,
    registerWebHook: vi.fn((uri: string, handler: (request: Request) => Promise<Response>) => {
      routes.set(uri, handler);
    }),
    registerInterval: vi.fn(),
    upsertSchedule: vi.fn().mockResolvedValue(null),
    pauseSchedule: vi.fn().mockResolvedValue(null),
    deleteSchedule: vi.fn().mockResolvedValue(null),
    listSchedules: vi.fn().mockResolvedValue([]),
    uploadFile: vi.fn().mockResolvedValue(null),
    signalWorkflow: vi.fn().mockResolvedValue(null),
    getDocumentsByType: vi
      .fn()
      .mockResolvedValue([
        triggerFunctionDoc('tf-status', 'amocrm-on-lead', 'status'),
        triggerFunctionDoc('tf-contact', 'amocrm-on-contact', 'add'),
        triggerFunctionDoc('tf-other', 'amocrm-on-lead', 'add', 'cred-2'),
      ]),
    getInternalProjectToken: vi.fn().mockReturnValue('project-token-1'),
    getOAuth2AccessToken: vi.fn().mockResolvedValue('fresh-token'),
    reportJournalProblem: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
};

const mockFetch = (answers: Record<string, number>) => {
  const fetchMock = vi.fn((_url: string, init: { method: string; body: string }) =>
    Promise.resolve(new Response(null, { status: answers[init.method] ?? 200 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const post = (body: Record<string, string>): Request =>
  new Request('https://bots.example.com/x', { method: 'POST', body: new URLSearchParams(body) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerAmoCrmBackend', () => {
  it('re-subscribes the amoCRM webhook for exactly the bound events at a secret URL', async () => {
    const fetchMock = mockFetch({ DELETE: 404, POST: 201 });
    const ctx = buildCtx();
    await registerAmoCrmBackend(ctx);

    const [key] = [...ctx.routes.keys()];
    expect(key).toMatch(/^hook-[0-9a-f]{40}$/);
    const destination = `${ctx.webhookUrl}/${key}`;
    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method, JSON.parse(init.body)])).toEqual([
      ['https://acme.amocrm.ru/api/v4/webhooks', 'DELETE', { destination }],
      ['https://acme.amocrm.ru/api/v4/webhooks', 'POST', { destination, settings: ['status_lead', 'add_contact'] }],
    ]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ headers: { Authorization: 'Bearer fresh-token' } });
    expect(ctx.reportJournalProblem).not.toHaveBeenCalled();
  });

  it('signals one run per matching event of each bound trigger function', async () => {
    mockFetch({});
    const ctx = buildCtx();
    await registerAmoCrmBackend(ctx);
    const handler = [...ctx.routes.values()][0];

    const response = await handler(
      post({
        'leads[status][0][id]': '5',
        'leads[status][0][status_id]': '142',
        'leads[status][1][id]': '6',
        'leads[add][0][id]': '7',
        'contacts[add][0][id]': '9',
        'account[subdomain]': 'acme',
      }),
    );
    expect(response.status).toBe(200);
    const calls = vi.mocked(ctx.signalWorkflow).mock.calls.map(([target]) => target);
    expect(calls.map((call) => [call.workflowType, (call.signalArgs[0] as { id: number }).id])).toEqual([
      ['on_tf-status', 5],
      ['on_tf-status', 6],
      ['on_tf-contact', 9],
    ]);
    expect(calls[0]).toMatchObject({ signalName: AMOCRM_WEBHOOK_SIGNAL_NAME });
    expect(calls[0].workflowId).toMatch(/^amocrm-tf-status-[0-9a-f]{24}$/);
    expect(calls[0].workflowId).not.toBe(calls[1].workflowId);
  });

  it('gives a re-delivered event the same workflow id (no second run while the first is running)', async () => {
    mockFetch({});
    const ctx = buildCtx();
    await registerAmoCrmBackend(ctx);
    const handler = [...ctx.routes.values()][0];
    const body = { 'leads[status][0][id]': '5', 'account[subdomain]': 'acme' };
    await handler(post(body));
    await handler(post(body));
    const [first, second] = vi.mocked(ctx.signalWorkflow).mock.calls.map(([target]) => target.workflowId);
    expect(first).toBe(second);
  });

  it("rejects a delivery naming another account's subdomain", async () => {
    mockFetch({});
    const ctx = buildCtx();
    await registerAmoCrmBackend(ctx);
    const handler = [...ctx.routes.values()][0];
    const response = await handler(post({ 'leads[status][0][id]': '5', 'account[subdomain]': 'evil' }));
    expect(response.status).toBe(403);
    expect(ctx.signalWorkflow).not.toHaveBeenCalled();
  });

  it('journals a failed subscription with the URL and events to add by hand, keeping the route', async () => {
    mockFetch({ DELETE: 404, POST: 403 });
    const ctx = buildCtx();
    await registerAmoCrmBackend(ctx);
    expect(ctx.routes.size).toBe(1);
    const reportProblem = vi.mocked(ctx.reportJournalProblem ?? vi.fn());
    const [report] = reportProblem.mock.calls[0];
    expect(report.message).toContain('POST /api/v4/webhooks answered 403');
    expect(report.message).toContain(`${ctx.webhookUrl}/${[...ctx.routes.keys()][0]}`);
    expect(report.message).toContain('status_lead, add_contact');
  });

  it('without a public URL only registers the route (nothing to subscribe)', async () => {
    const fetchMock = mockFetch({});
    const ctx = buildCtx({ webhookUrl: null });
    await registerAmoCrmBackend(ctx);
    expect(ctx.routes.size).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with no bound trigger functions removes a stale subscription and reports nothing', async () => {
    const fetchMock = mockFetch({ DELETE: 204 });
    const ctx = buildCtx({ getDocumentsByType: vi.fn().mockResolvedValue([]) });
    await registerAmoCrmBackend(ctx);
    expect(fetchMock.mock.calls.map(([, init]) => init.method)).toEqual(['DELETE']);
    expect(ctx.reportJournalProblem).not.toHaveBeenCalled();
  });

  it('derives a route key that is stable per credential/env and differs between envs', async () => {
    const dev = await deriveAmoCrmRouteKey(buildCtx());
    expect(await deriveAmoCrmRouteKey(buildCtx())).toBe(dev);
    expect(await deriveAmoCrmRouteKey(buildCtx({ env: 'prod' }))).not.toBe(dev);
    expect(await deriveAmoCrmRouteKey(buildCtx({ getInternalProjectToken: () => 'other' }))).not.toBe(dev);
  });
});
