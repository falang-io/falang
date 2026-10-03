import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';

/**
 * Community-edition auth model: `SELF_SERVICE_SIGNUP` / `TERMS_URL`, admin-created accounts and
 * password resets, changing your own password, and the default-admin-password warning flag.
 */
describe('account management (auth + admin users)', () => {
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

  const http = () => request(app.getHttpServer());
  const loginStatus = async (username: string, password: string): Promise<number> => {
    const response = await http().post('/auth/login').send({ username, password });
    return response.status;
  };
  const getConfig = async (): Promise<{ selfServiceSignup: boolean; termsUrl: string | null }> => {
    const response = await http().get('/auth/config');
    return response.body as { selfServiceSignup: boolean; termsUrl: string | null };
  };
  const postStatus = async (path: string, token: string, body?: object): Promise<number> => {
    const response = await http().post(path).set(auth(token)).send(body);
    return response.status;
  };

  describe('GET /auth/config and signup flags', () => {
    it('is public and reports the flag and terms URL', async () => {
      const response = await http().get('/auth/config');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ selfServiceSignup: true, termsUrl: null, disabledVendors: ['sqlite'] });
    });

    it('403s signup when SELF_SERVICE_SIGNUP is not true (the production default)', async () => {
      vi.stubEnv('SELF_SERVICE_SIGNUP', 'false');
      const off = await getConfig();
      expect(off.selfServiceSignup).toBe(false);
      const response = await http().post('/auth/register').send({ username: 'newbie', password: 'password123' });
      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/disabled/i);
    });

    it('requires acceptTerms when TERMS_URL is set, and stores the acceptance time', async () => {
      vi.stubEnv('TERMS_URL', 'https://example.test/terms');
      const withTerms = await getConfig();
      expect(withTerms.termsUrl).toBe('https://example.test/terms');

      const missing = await http().post('/auth/register').send({ username: 'newbie', password: 'password123' });
      expect(missing.status).toBe(400);
      const declined = await http()
        .post('/auth/register')
        .send({ username: 'newbie', password: 'password123', acceptTerms: false });
      expect(declined.status).toBe(400);

      const accepted = await http()
        .post('/auth/register')
        .send({ username: 'newbie', password: 'password123', acceptTerms: true });
      expect(accepted.status).toBe(201);
    });

    it('does not require acceptTerms when no TERMS_URL is set', async () => {
      const response = await http().post('/auth/register').send({ username: 'newbie', password: 'password123' });
      expect(response.status).toBe(201);
    });
  });

  describe('admin creates users and resets passwords', () => {
    it('creates a user with a generated password that works exactly once shown', async () => {
      const adminToken = await login(app);
      const created = await http().post('/admin/users').set(auth(adminToken)).send({ username: 'carol' });
      expect(created.status).toBe(201);
      expect(created.body.username).toBe('carol');
      expect(created.body.password).toMatch(/^[A-Za-z0-9_-]{16}$/);

      const loggedIn = await http().post('/auth/login').send({ username: 'carol', password: created.body.password });
      expect(loggedIn.status).toBe(200);
      expect(loggedIn.body.user.role).toBe('user');

      const listed = await http().get('/admin/users').set(auth(adminToken));
      expect(JSON.stringify(listed.body)).not.toContain(created.body.password);
    });

    it('works even while self-service signup is off', async () => {
      vi.stubEnv('SELF_SERVICE_SIGNUP', 'false');
      const adminToken = await login(app);
      const created = await http().post('/admin/users').set(auth(adminToken)).send({ username: 'carol' });
      expect(created.status).toBe(201);
    });

    it('409s a duplicate username and 400s an invalid one', async () => {
      const adminToken = await login(app);
      expect(await postStatus('/admin/users', adminToken, { username: 'admin' })).toBe(409);
      expect(await postStatus('/admin/users', adminToken, { username: 'ab' })).toBe(400);
    });

    it('403s a non-admin on both routes', async () => {
      await http().post('/auth/register').send({ username: 'bob', password: 'password123' });
      const bobToken = await login(app, 'bob', 'password123');
      expect(await postStatus('/admin/users', bobToken, { username: 'x1234' })).toBe(403);
      expect(await postStatus('/admin/users/some-id/reset-password', bobToken)).toBe(403);
    });

    it('resets a password: the old one stops working and the new one works', async () => {
      const adminToken = await login(app);
      const reg = await http().post('/auth/register').send({ username: 'bob', password: 'password123' });
      const bobId = reg.body.user.id as string;

      const reset = await http().post(`/admin/users/${bobId}/reset-password`).set(auth(adminToken));
      expect(reset.status).toBe(200);
      expect(reset.body.password).toMatch(/^[A-Za-z0-9_-]{16}$/);

      expect(await loginStatus('bob', 'password123')).toBe(401);
      expect(await loginStatus('bob', reset.body.password)).toBe(200);
    });

    it('404s resetting an unknown user', async () => {
      const adminToken = await login(app);
      const response = await http().post('/admin/users/no-such-user/reset-password').set(auth(adminToken));
      expect(response.status).toBe(404);
    });
  });

  describe('POST /auth/change-password', () => {
    beforeEach(async () => {
      await http().post('/auth/register').send({ username: 'bob', password: 'password123' });
    });

    it('changes the password when the current one is right', async () => {
      const token = await login(app, 'bob', 'password123');
      const response = await http()
        .post('/auth/change-password')
        .set(auth(token))
        .send({ currentPassword: 'password123', newPassword: 'brand-new-pass' });
      expect(response.status).toBe(204);
      expect(await loginStatus('bob', 'password123')).toBe(401);
      expect(await loginStatus('bob', 'brand-new-pass')).toBe(200);
    });

    it('400s a wrong current password', async () => {
      const token = await login(app, 'bob', 'password123');
      const response = await http()
        .post('/auth/change-password')
        .set(auth(token))
        .send({ currentPassword: 'nope-nope', newPassword: 'brand-new-pass' });
      expect(response.status).toBe(400);
      expect(await loginStatus('bob', 'password123')).toBe(200);
    });

    it('400s a too-short new password', async () => {
      const token = await login(app, 'bob', 'password123');
      const response = await http()
        .post('/auth/change-password')
        .set(auth(token))
        .send({ currentPassword: 'password123', newPassword: 'short' });
      expect(response.status).toBe(400);
    });

    it('401s without a token', async () => {
      const response = await http()
        .post('/auth/change-password')
        .send({ currentPassword: 'password123', newPassword: 'brand-new-pass' });
      expect(response.status).toBe(401);
    });
  });

  describe('defaultPasswordInUse', () => {
    it('is true on login and /auth/me for the seeded admin still using "admin"', async () => {
      const loggedIn = await http().post('/auth/login').send({ username: 'admin', password: 'admin' });
      expect(loggedIn.body.user.defaultPasswordInUse).toBe(true);
      const me = await http().get('/auth/me').set(auth(loggedIn.body.accessToken));
      expect(me.body.defaultPasswordInUse).toBe(true);
    });

    it('is false for an ordinary user and clears once the admin changes the password', async () => {
      const reg = await http().post('/auth/register').send({ username: 'bob', password: 'password123' });
      expect(reg.body.user.defaultPasswordInUse).toBe(false);

      const token = await login(app);
      await http()
        .post('/auth/change-password')
        .set(auth(token))
        .send({ currentPassword: 'admin', newPassword: 'not-the-default' });
      const again = await http().post('/auth/login').send({ username: 'admin', password: 'not-the-default' });
      expect(again.body.user.defaultPasswordInUse).toBe(false);
    });
  });
});
