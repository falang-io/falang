import type { INestApplication } from '@nestjs/common';
import { createTriggerFunctionNode } from '@falang/workflow-dto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';

const DOC_ID = '22222222-2222-4222-8222-222222222222';

describe('trigger addresses route (GET /projects/:id/trigger-addresses)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  const previous = process.env.BACKEND_PUBLIC_URL;

  beforeEach(async () => {
    process.env.BACKEND_PUBLIC_URL = 'https://api.example.com';
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    if (typeof previous === 'string') process.env.BACKEND_PUBLIC_URL = previous;
    else delete process.env.BACKEND_PUBLIC_URL;
  });

  it('returns the dev and prod URL of a webhook trigger; another user gets 404', async () => {
    const token = await login(app);
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    const projectId: string = created.body.id;
    const root = createTriggerFunctionNode({
      vendor: 'webhook',
      triggerName: 'webhook-trigger',
      credentialId: 'webhook',
      scopeVariableName: 'request',
      scopeType: { type: 'any' },
    });
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id: DOC_ID, type: 'trigger-function', name: 'onWebhook', root })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/trigger-addresses`)
      .set(auth(token))
      .expect(200);
    expect(response.body.baseUrl).toBe('https://api.example.com');
    expect(response.body.triggers).toEqual([
      expect.objectContaining({
        documentId: DOC_ID,
        documentName: 'onWebhook',
        devUrl: `https://api.example.com/webhooks/webhook/${projectId}/webhook/dev/${DOC_ID}`,
        prodUrl: `https://api.example.com/webhooks/webhook/${projectId}/webhook/prod/${DOC_ID}`,
      }),
    ]);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'mallory', password: 'password123', acceptTerms: true });
    const other = await login(app, 'mallory', 'password123');
    await request(app.getHttpServer()).get(`/projects/${projectId}/trigger-addresses`).set(auth(other)).expect(404);
  });

  it('a project without such triggers has no addresses', async () => {
    const token = await login(app);
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    const projectId: string = created.body.id;
    const { body } = await request(app.getHttpServer())
      .get(`/projects/${projectId}/trigger-addresses`)
      .set(auth(token))
      .expect(200);
    expect(body.triggers).toEqual([]);
  });
});
