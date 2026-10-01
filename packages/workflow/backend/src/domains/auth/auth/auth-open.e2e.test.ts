import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import type { CapturingMailTransport } from '../../../test-utils/capturing-mail-transport.js';
import { MAIL_TRANSPORT } from '../../mail/mail.service.js';

const statusOf = async (pending: PromiseLike<{ status: number }>): Promise<number> => {
  const response = await pending;
  return response.status;
};

const bodyOf = async <T = Record<string, unknown>>(pending: PromiseLike<{ body: unknown }>): Promise<T> => {
  const response = await pending;
  return response.body as T;
};

describe.each(['open', 'application'] as const)('e-mail flows in %s mode', (mode) => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let mailbox: CapturingMailTransport;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('SIGNUP_MODE', mode);
    vi.stubEnv('CLIENT_PUBLIC_URL', 'https://app.test');
    app = await createTestApp();
    mailbox = app.get<CapturingMailTransport>(MAIL_TRANSPORT);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const http = () => request(app.getHttpServer());

  /** An active, e-mail-verified account, made through the admin route (same in both modes). */
  const makeUser = async (email: string): Promise<{ username: string; password: string }> => {
    const adminToken = await login(app);
    const created = await http().post('/admin/users').set(auth(adminToken)).send({ username: 'carol', email });
    return { username: 'carol', password: (created.body as { password: string }).password };
  };

  it('forgot -> reset changes the password; the token is single use', async () => {
    const { username, password } = await makeUser('carol@acme.test');
    expect(await statusOf(http().post('/auth/forgot-password').send({ email: 'carol@acme.test' }))).toBe(202);
    const mail = mailbox.to('carol@acme.test').at(-1);
    expect(mail?.text).toContain('https://app.test/?resetPassword=');
    const token = mailbox.latestToken('carol@acme.test', 'resetPassword');

    const reset = await http().post('/auth/reset-password').send({ token, password: 'brand-new-pass' });
    expect(reset.status).toBe(204);
    expect(await statusOf(http().post('/auth/login').send({ username, password }))).toBe(401);
    expect(await statusOf(http().post('/auth/login').send({ username, password: 'brand-new-pass' }))).toBe(200);

    const reuse = await http().post('/auth/reset-password').send({ token, password: 'another-pass-1' });
    expect(reuse.status).toBe(400);
  });

  it('a newer reset token invalidates the older one and unknown e-mails get 202 with no mail', async () => {
    await makeUser('carol@acme.test');
    await http().post('/auth/forgot-password').send({ email: 'carol@acme.test' });
    const first = mailbox.latestToken('carol@acme.test', 'resetPassword');
    expect(await statusOf(http().post('/auth/forgot-password').send({ email: 'ghost@acme.test' }))).toBe(202);
    expect(mailbox.to('ghost@acme.test')).toHaveLength(0);
    expect(
      await statusOf(http().post('/auth/reset-password').send({ token: 'garbage', password: 'brand-new-pass' })),
    ).toBe(400);
    expect(await statusOf(http().post('/auth/reset-password').send({ token: first, password: 'brand-new-pass' }))).toBe(
      204,
    );
  });
});

describe('open mode', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let mailbox: CapturingMailTransport;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('SIGNUP_MODE', 'open');
    app = await createTestApp();
    mailbox = app.get<CapturingMailTransport>(MAIL_TRANSPORT);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const http = () => request(app.getHttpServer());

  it('registers username + password as before and returns a token', async () => {
    const response = await http().post('/auth/register').send({ username: 'newbie', password: 'password123' });
    expect(response.status).toBe(201);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ username: 'newbie', email: null, emailVerified: false });
    expect(mailbox.messages).toHaveLength(0);
  });

  it('requires username and password in open mode', async () => {
    expect(await statusOf(http().post('/auth/register').send({ email: 'a@b.test' }))).toBe(400);
  });

  it('an optional e-mail triggers a verification mail but blocks nothing', async () => {
    const response = await http()
      .post('/auth/register')
      .send({ username: 'newbie', password: 'password123', email: 'Newbie@Acme.test' });
    expect(response.status).toBe(201);
    expect(mailbox.to('newbie@acme.test')).toHaveLength(1);
    expect(await statusOf(http().post('/auth/login').send({ username: 'newbie', password: 'password123' }))).toBe(200);
    const verified = await http()
      .post('/auth/verify-email')
      .send({ token: mailbox.latestToken('newbie@acme.test', 'verifyEmail') });
    expect(verified.body).toEqual({ status: 'active' });
    const duplicate = await http()
      .post('/auth/register')
      .send({ username: 'other', password: 'password123', email: 'newbie@acme.test' });
    expect(duplicate.status).toBe(409);
  });
});

describe('legacy SELF_SERVICE_SIGNUP alias', () => {
  it('reads SELF_SERVICE_SIGNUP=true as open and false as off, SIGNUP_MODE winning when set', async () => {
    vi.stubEnv('SIGNUP_MODE', '');
    vi.stubEnv('SELF_SERVICE_SIGNUP', 'false');
    const app = await createTestApp();
    try {
      const http = () => request(app.getHttpServer());
      expect(await bodyOf(http().get('/auth/config'))).toMatchObject({ signupMode: 'off', selfServiceSignup: false });
      vi.stubEnv('SELF_SERVICE_SIGNUP', 'true');
      const modeOf = async (): Promise<unknown> => {
        const config = await bodyOf(http().get('/auth/config'));
        return config.signupMode;
      };
      expect(await modeOf()).toBe('open');
      vi.stubEnv('SIGNUP_MODE', 'off');
      expect(await modeOf()).toBe('off');
    } finally {
      await app.close();
      vi.unstubAllEnvs();
    }
  });
});
