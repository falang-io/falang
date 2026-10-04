import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import type { CapturingMailTransport } from '../../../test-utils/capturing-mail-transport.js';
import { MAIL_TRANSPORT } from '../../mail/mail.service.js';

const APPLICANT = 'boss@acme.test';

const statusOf = async (pending: PromiseLike<{ status: number }>): Promise<number> => {
  const response = await pending;
  return response.status;
};

describe('closed-beta application signup', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let mailbox: CapturingMailTransport;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('SIGNUP_MODE', 'application');
    vi.stubEnv('CLIENT_PUBLIC_URL', 'https://app.test');
    app = await createTestApp();
    mailbox = app.get<CapturingMailTransport>(MAIL_TRANSPORT);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const http = () => request(app.getHttpServer());
  const apply = (email = APPLICANT) =>
    http().post('/auth/register').send({
      email,
      companyName: 'Acme',
      automationInterest: 'Orders from Telegram into CRM',
      acceptTerms: true,
    });

  it('reports the mode in /auth/config', async () => {
    const response = await http().get('/auth/config');
    expect(response.body).toEqual({
      signupMode: 'application',
      termsUrl: null,
      captcha: null,
      mailConfigured: true,
      selfServiceSignup: true,
      disabledVendors: ['sqlite'],
    });
  });

  it('runs the whole application -> verify -> activate -> login flow', async () => {
    const applied = await apply();
    expect(applied.status).toBe(202);
    expect(applied.body).toEqual({ status: 'pending_email' });
    expect(mailbox.to(APPLICANT)).toHaveLength(1);
    expect(mailbox.to(APPLICANT)[0]?.text).toContain('https://app.test/?verifyEmail=');

    const early = await http().post('/auth/login').send({ username: APPLICANT, password: 'whatever123' });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe('email_not_verified');

    const adminToken = await login(app);
    // Give the seeded admin an address so the "new application" mail has a recipient.
    const created = await http()
      .post('/admin/users')
      .set(auth(adminToken))
      .send({ username: 'ops', email: 'ops@falang.test' });
    expect(created.status).toBe(201);

    const token = mailbox.latestToken(APPLICANT, 'verifyEmail');
    const verified = await http().post('/auth/verify-email').send({ token });
    expect(verified.status).toBe(200);
    expect(verified.body).toEqual({ status: 'pending_activation' });

    const reuse = await http().post('/auth/verify-email').send({ token });
    expect(reuse.status).toBe(400);

    const pending = await http().post('/auth/login').send({ username: APPLICANT, password: 'whatever123' });
    expect(pending.status).toBe(403);
    expect(pending.body.code).toBe('not_activated');

    const list = await http().get('/admin/users').set(auth(adminToken));
    const row = (list.body as { id: string; email: string; status: string }[]).find((u) => u.email === APPLICANT);
    expect(row?.status).toBe('pending_activation');
    const card = await http().get(`/admin/users/${row?.id}`).set(auth(adminToken));
    expect(card.status).toBe(200);
    expect(card.body).toMatchObject({
      email: APPLICANT,
      companyName: 'Acme',
      automationInterest: 'Orders from Telegram into CRM',
      signupSource: 'self-service',
      status: 'pending_activation',
      activatedAt: null,
    });
    expect(card.body).not.toHaveProperty('password');

    const activated = await http().post(`/admin/users/${row?.id}/activate`).set(auth(adminToken));
    expect(activated.status).toBe(200);
    expect(activated.body).toEqual({ sent: true });
    const activationMail = mailbox.to(APPLICANT).at(-1);
    expect(activationMail?.text).toContain(`Login: ${APPLICANT}`);
    const password = /Password: (\S+)/.exec(activationMail?.text ?? '')?.[1];
    expect(password).toBeTruthy();

    const ok = await http().post('/auth/login').send({ username: APPLICANT, password });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ email: APPLICANT, emailVerified: true, companyName: 'Acme' });
    expect(ok.body.user.activatedAt).toEqual(expect.any(String));

    const again = await http().post(`/admin/users/${row?.id}/activate`).set(auth(adminToken));
    expect(again.status).toBe(409);
  });

  it('mails admins with an address when the applicant verifies', async () => {
    const adminToken = await login(app);
    await http().post('/admin/users').set(auth(adminToken)).send({ username: 'ops', email: 'ops@falang.test' });
    const list = await http().get('/admin/users').set(auth(adminToken));
    const ops = (list.body as { id: string; username: string }[]).find((u) => u.username === 'ops');
    await http().patch(`/admin/users/${ops?.id}/role`).set(auth(adminToken)).send({ role: 'admin' });
    await apply();
    await http()
      .post('/auth/verify-email')
      .send({ token: mailbox.latestToken(APPLICANT, 'verifyEmail') });
    const notice = mailbox.to('ops@falang.test').at(-1);
    expect(notice?.subject).toContain('Acme');
    expect(notice?.text).toContain(APPLICANT);
  });

  it('activating an unverified application is refused', async () => {
    await apply();
    const adminToken = await login(app);
    const list = await http().get('/admin/users').set(auth(adminToken));
    const row = (list.body as { id: string; email: string }[]).find((u) => u.email === APPLICANT);
    const response = await http().post(`/admin/users/${row?.id}/activate`).set(auth(adminToken));
    expect(response.status).toBe(409);
  });

  it('returns the password only when the mail could not be sent', async () => {
    await apply();
    await http()
      .post('/auth/verify-email')
      .send({ token: mailbox.latestToken(APPLICANT, 'verifyEmail') });
    const adminToken = await login(app);
    const list = await http().get('/admin/users').set(auth(adminToken));
    const row = (list.body as { id: string; email: string }[]).find((u) => u.email === APPLICANT);
    vi.spyOn(mailbox, 'sendMail').mockRejectedValueOnce(new Error('smtp down'));
    const response = await http().post(`/admin/users/${row?.id}/activate`).set(auth(adminToken));
    expect(response.body.sent).toBe(false);
    const ok = await http().post('/auth/login').send({ username: APPLICANT, password: response.body.password });
    expect(ok.status).toBe(200);
  });

  it('handles a duplicate application: 202 while unverified (cooldown), 409 once verified', async () => {
    expect(await statusOf(apply())).toBe(202);
    const second = await apply();
    expect(second.status).toBe(202);
    // Within the 60 s cooldown no second mail goes out.
    expect(mailbox.to(APPLICANT)).toHaveLength(1);
    await http()
      .post('/auth/verify-email')
      .send({ token: mailbox.latestToken(APPLICANT, 'verifyEmail') });
    expect(await statusOf(apply())).toBe(409);
  });

  it('validates the application body and refuses a bogus verification token', async () => {
    const missing = await http().post('/auth/register').send({ email: APPLICANT });
    expect(missing.status).toBe(400);
    const badEmail = await http()
      .post('/auth/register')
      .send({ email: 'nope', companyName: 'A', automationInterest: 'B' });
    expect(badEmail.status).toBe(400);
    expect(await statusOf(http().post('/auth/verify-email').send({ token: 'nonsense' }))).toBe(400);
  });

  it('resend-verification always answers 202 and honours the cooldown', async () => {
    await apply();
    expect(await statusOf(http().post('/auth/resend-verification').send({ email: APPLICANT }))).toBe(202);
    expect(await statusOf(http().post('/auth/resend-verification').send({ email: 'ghost@acme.test' }))).toBe(202);
    expect(mailbox.to(APPLICANT)).toHaveLength(1);
    expect(mailbox.to('ghost@acme.test')).toHaveLength(0);
  });

  it('forgot-password sends nothing for a not-activated applicant', async () => {
    await apply();
    await http()
      .post('/auth/verify-email')
      .send({ token: mailbox.latestToken(APPLICANT, 'verifyEmail') });
    const before = mailbox.messages.length;
    const response = await http().post('/auth/forgot-password').send({ email: APPLICANT });
    expect(response.status).toBe(202);
    expect(mailbox.messages.length).toBe(before);
  });
});
