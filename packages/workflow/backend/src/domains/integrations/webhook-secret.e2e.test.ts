import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTriggerFunctionNode } from '@falang/workflow-dto';
import { deriveIntegrationSecret, resolveWebhookSecretKey } from '@falang/workflow-gateway';
import { registerWebhookBackend } from '@falang/workflow-integrations-webhook';
import type { IIntegrationBackendContext, IIntegrationDocumentRecord } from '@falang/workflow-integrations-common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';
import { UsersService } from '../users/users/users.service.js';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL_ID = 'webhook';

const statusOf = async (response: Promise<Response | undefined> | undefined): Promise<number | undefined> => {
  const resolved = await response;
  return resolved?.status;
};

const url = (projectId: string, query: string): string => `/projects/${projectId}/integrations/webhook-secret?${query}`;

describe('webhook secret route (GET /projects/:id/integrations/webhook-secret)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const setUp = async (token: string, triggerConfig?: Record<string, string>) => {
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    const projectId: string = created.body.id;
    const root = createTriggerFunctionNode({
      vendor: 'webhook',
      triggerName: 'webhook-trigger',
      credentialId: CREDENTIAL_ID,
      scopeVariableName: 'request',
      scopeType: { type: 'any' },
      ...(triggerConfig ? { triggerConfig } : {}),
    });
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id: DOC_ID, type: 'trigger-function', name: 'onWebhook', root })
      .expect(201);
    return projectId;
  };

  it('returns the secret the gateway derives for the same target (accepted by the webhook route, a stale one is not)', async () => {
    const token = await login(app);
    const projectId = await setUp(token, { require_signature: 'true' });

    const dev = await request(app.getHttpServer())
      .get(url(projectId, `documentId=${DOC_ID}&env=dev`))
      .set(auth(token));
    const prod = await request(app.getHttpServer())
      .get(url(projectId, `documentId=${DOC_ID}&env=prod`))
      .set(auth(token));
    expect(dev.status).toBe(200);
    expect(dev.body).toMatchObject({ version: 1, required: true, header: 'x-webhook-secret' });
    expect(prod.body.secret).not.toBe(dev.body.secret);

    // The runtime side: a ctx whose `deriveSecret` is the gateway's own function over the same key and target.
    const key = resolveWebhookSecretKey(app.get(ConfigService)) as string;
    const document: IIntegrationDocumentRecord = {
      id: DOC_ID,
      name: 'onWebhook',
      data: null,
      root: createTriggerFunctionNode({
        vendor: 'webhook',
        triggerName: 'webhook-trigger',
        credentialId: CREDENTIAL_ID,
        scopeVariableName: 'request',
        scopeType: { type: 'any' },
        triggerConfig: { require_signature: 'true' },
      }),
    };
    const handlers = new Map<string, (request: Request) => Promise<Response>>();
    const ctx = {
      vendor: 'webhook',
      credentialId: CREDENTIAL_ID,
      projectId,
      env: 'dev',
      registerWebHook: (uri: string, handler: (request: Request) => Promise<Response>) => handlers.set(uri, handler),
      signalWorkflow: vi.fn().mockResolvedValue(null),
      getDocumentsByType: vi.fn().mockResolvedValue([document]),
      deriveSecret: (label: string) =>
        deriveIntegrationSecret({ key, projectId, credentialId: CREDENTIAL_ID, env: 'dev', vendor: 'webhook', label }),
    } as unknown as IIntegrationBackendContext;
    await registerWebhookBackend(ctx);
    const call = (secret: string) =>
      handlers.get(DOC_ID)?.(
        new Request('http://x/', { method: 'POST', headers: { 'x-webhook-secret': secret }, body: '{}' }),
      );
    expect(await statusOf(call(dev.body.secret))).toBe(200);
    expect(await statusOf(call(prod.body.secret))).toBe(401);
    expect(await statusOf(call('wrong'))).toBe(401);
  });

  it('changes with signature_version and defaults to version 1 when require_signature is off', async () => {
    const token = await login(app);
    const projectId = await setUp(token, { signature_version: '3' });
    const response = await request(app.getHttpServer())
      .get(url(projectId, `documentId=${DOC_ID}&env=dev`))
      .set(auth(token));
    expect(response.body).toMatchObject({ version: 3, required: false });
  });

  it('validates the query and 404s an unknown / non-webhook document', async () => {
    const token = await login(app);
    const projectId = await setUp(token);
    const get = async (query: string): Promise<number> => {
      const response = await request(app.getHttpServer()).get(url(projectId, query)).set(auth(token));
      return response.status;
    };
    expect(await get(`documentId=${DOC_ID}&env=staging`)).toBe(400);
    expect(await get('env=dev')).toBe(400);
    expect(await get('documentId=22222222-2222-4222-8222-222222222222&env=dev')).toBe(404);
  });

  it("404s another user's project, even for a (read-only) admin", async () => {
    await app.get(UsersService).create({ username: 'owner-3', password: 'password' });
    const projectId = await setUp(await login(app, 'owner-3', 'password'), { require_signature: 'true' });
    await app.get(UsersService).create({ username: 'someone-else-3', password: 'password' });
    const otherUser = await login(app, 'someone-else-3', 'password');
    const admin = await login(app);
    const get = (token: string) =>
      request(app.getHttpServer())
        .get(url(projectId, `documentId=${DOC_ID}&env=dev`))
        .set(auth(token));
    const [otherResponse, adminResponse] = await Promise.all([get(otherUser), get(admin)]);
    expect([otherResponse.status, adminResponse.status]).toEqual([404, 404]);
  });
});
