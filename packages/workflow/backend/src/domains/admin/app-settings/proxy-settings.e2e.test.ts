import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { INTERNAL_PROJECT_TOKEN_HEADER } from '../../internal-auth/project-token.guard.js';
import { ProxySettingsService } from './proxy-settings.service.js';
import { ProjectTokenService } from '../../internal-auth/project-token.service.js';

/** Covers ADR 0056 (private)'s `/admin/settings/proxy` and `/internal/egress-proxy/:projectId`. */
describe('egress proxy settings', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const put = (token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).put('/admin/settings/proxy').set(auth(token)).send(body);

  it('403s a non-admin user on every route', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({ username: 'alice', password: 'password123' });
    const userToken = await login(app, 'alice', 'password123');
    for (const response of [
      await request(app.getHttpServer()).get('/admin/settings/proxy').set(auth(userToken)),
      await request(app.getHttpServer()).get('/admin/settings/proxy/vendors').set(auth(userToken)),
      await put(userToken, { url: 'http://p:1', token: 't', vendors: [] }),
    ]) {
      expect(response.status).toBe(403);
    }
  });

  it('makes PUT/DELETE visible through getCached() immediately', async () => {
    const adminToken = await login(app);
    const settings = app.get(ProxySettingsService);
    expect(settings.getCached()).toBeNull();
    await put(adminToken, { url: 'http://p.example.com:8080', token: 'tok', vendors: ['openai'] });
    expect(settings.getCached()).toEqual({ url: 'http://p.example.com:8080', token: 'tok', vendors: ['openai'] });
    await request(app.getHttpServer()).delete('/admin/settings/proxy').set(auth(adminToken));
    expect(settings.getCached()).toBeNull();
  });

  it('round-trips PUT/GET/DELETE and never returns the token', async () => {
    const adminToken = await login(app);
    const initial = await request(app.getHttpServer()).get('/admin/settings/proxy').set(auth(adminToken));
    expect(initial.body).toEqual({ configured: false, url: null, hasToken: false, vendors: [], updatedAt: null });

    const putResponse = await put(adminToken, {
      url: 'https://proxy.example.com:8443',
      token: 'secret-token',
      vendors: ['telegram', ' openai ', 'telegram', ''],
    });
    expect(putResponse.status).toBe(200);
    expect(putResponse.body).toMatchObject({
      configured: true,
      url: 'https://proxy.example.com:8443',
      hasToken: true,
      vendors: ['telegram', 'openai'],
    });
    expect(JSON.stringify(putResponse.body)).not.toContain('secret-token');

    const getResponse = await request(app.getHttpServer()).get('/admin/settings/proxy').set(auth(adminToken));
    expect(getResponse.body.vendors).toEqual(['telegram', 'openai']);
    expect(getResponse.body.updatedAt).not.toBeNull();

    const del = await request(app.getHttpServer()).delete('/admin/settings/proxy').set(auth(adminToken));
    expect(del.status).toBe(204);
    const after = await request(app.getHttpServer()).get('/admin/settings/proxy').set(auth(adminToken));
    expect(after.body).toMatchObject({ configured: false, hasToken: false, vendors: [] });
  });

  it('keeps the stored token when PUT omits it, and 400s with no token at all', async () => {
    const adminToken = await login(app);
    const noToken = await put(adminToken, { url: 'http://proxy:3128', vendors: [] });
    expect(noToken.status).toBe(400);

    await put(adminToken, { url: 'http://proxy:3128', token: 'tok-1', vendors: ['telegram'] });
    const update = await put(adminToken, { url: 'http://proxy:3129', vendors: ['openai'] });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({ hasToken: true, url: 'http://proxy:3129', vendors: ['openai'] });

    const projectResponse = await request(app.getHttpServer())
      .post('/projects')
      .set(auth(adminToken))
      .send({ name: 'p' });
    const projectId = projectResponse.body.id as string;
    const internalToken = app.get(ProjectTokenService).getOrCreateToken(projectId);
    const internal = await request(app.getHttpServer())
      .get(`/internal/egress-proxy/${projectId}`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, internalToken);
    expect(internal.body.proxy.token).toBe('tok-1');
  });

  it('validates the url', async () => {
    const adminToken = await login(app);
    const urls = ['not a url', 'ftp://proxy:21', 'http://proxy:1/path', 'http://proxy:1/?a=b', ''];
    const statuses: number[] = [];
    for (const url of urls) {
      // oxlint-disable-next-line no-await-in-loop -- parallel supertest requests on one in-memory app flake with ECONNRESET.
      const response = await put(adminToken, { url, token: 't', vendors: [] });
      statuses.push(response.status);
    }
    expect(statuses).toEqual(urls.map(() => 400));
  });

  it('lists built-in vendors (not shadowed by the status route)', async () => {
    const adminToken = await login(app);
    const response = await request(app.getHttpServer()).get('/admin/settings/proxy/vendors').set(auth(adminToken));
    expect(response.status).toBe(200);
    const telegram = response.body.vendors.find((entry: { vendor: string }) => entry.vendor === 'telegram');
    expect(telegram).toMatchObject({ vendor: 'telegram', source: 'builtin' });
    expect(typeof telegram.label).toBe('string');
  });

  describe('GET /internal/egress-proxy/:projectId', () => {
    const createProject = async (adminToken: string): Promise<string> => {
      const response = await request(app.getHttpServer()).post('/projects').set(auth(adminToken)).send({ name: 'p' });
      return response.body.id as string;
    };

    it('rejects a missing or wrong project token', async () => {
      const adminToken = await login(app);
      const projectId = await createProject(adminToken);
      const noHeader = await request(app.getHttpServer()).get(`/internal/egress-proxy/${projectId}`);
      const wrong = await request(app.getHttpServer())
        .get(`/internal/egress-proxy/${projectId}`)
        .set(INTERNAL_PROJECT_TOKEN_HEADER, 'nope');
      expect(noHeader.status).toBe(403);
      expect(wrong.status).toBe(403);
    });

    it('returns null when unconfigured and the config once set', async () => {
      const adminToken = await login(app);
      const projectId = await createProject(adminToken);
      const internalToken = app.get(ProjectTokenService).getOrCreateToken(projectId);
      const get = () =>
        request(app.getHttpServer())
          .get(`/internal/egress-proxy/${projectId}`)
          .set(INTERNAL_PROJECT_TOKEN_HEADER, internalToken);

      const unconfigured = await get();
      expect(unconfigured.body).toEqual({ proxy: null });

      await put(adminToken, { url: 'http://proxy:3128', token: 'tok', vendors: ['telegram'] });
      const configured = await get();
      expect(configured.status).toBe(200);
      expect(configured.body).toEqual({ proxy: { url: 'http://proxy:3128', token: 'tok', vendors: ['telegram'] } });
    });
  });
});
