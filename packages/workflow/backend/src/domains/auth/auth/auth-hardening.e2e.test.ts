import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapturingMailTransport } from '../../../test-utils/capturing-mail-transport.js';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { MAIL_TRANSPORT } from '../../mail/mail.service.js';
import { User } from '../../users/users/user.entity.js';
import { UsersService } from '../../users/users/users.service.js';
import { MAX_MAILS_PER_ADDRESS, MAX_MAILS_PER_IP, MailLimitsService } from '../mail-limits/mail-limits.service.js';
import { AdminDigestService } from './admin-digest.service.js';
import { UnverifiedAccountGcService } from './unverified-account-gc.service.js';

describe('auth hardening (JWT revocation, mail limits, unconfirmed cleanup)', () => {
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

  const APPLICANT = 'boss@acme.test';
  const http = () => request(app.getHttpServer());
  const apply = (email = APPLICANT) =>
    http().post('/auth/register').send({ email, companyName: 'Acme', automationInterest: 'x', acceptTerms: true });

  describe('JWT revocation', () => {
    it('accepts a token without `tv` (issued before the release) as version 0', async () => {
      const admin = await app.get(UsersService).findByUsername('admin');
      const legacy = app.get(JwtService).sign({ sub: admin?.id, username: 'admin', role: 'admin' });
      const me = await http().get('/auth/me').set(auth(legacy));
      expect(me.status).toBe(200);
    });

    it('rejects a token whose version no longer matches or whose user is gone', async () => {
      const admin = await app.get(UsersService).findByUsername('admin');
      const stale = app.get(JwtService).sign({ sub: admin?.id, username: 'admin', role: 'admin', tv: 7 });
      const staleMe = await http().get('/auth/me').set(auth(stale));
      expect(staleMe.status).toBe(401);
      const ghost = app
        .get(JwtService)
        .sign({ sub: '00000000-0000-4000-8000-000000000000', username: 'x', role: 'user' });
      const ghostMe = await http().get('/auth/me').set(auth(ghost));
      expect(ghostMe.status).toBe(401);
    });

    it('a password reset by link signs older sessions out', async () => {
      const adminToken = await login(app);
      const created = await http()
        .post('/admin/users')
        .set(auth(adminToken))
        .send({ username: 'carol', email: 'carol@acme.test' });
      const password = created.body.password as string;
      const oldToken = await login(app, 'carol', password);
      await http().post('/auth/forgot-password').send({ email: 'carol@acme.test' });
      const reset = await http()
        .post('/auth/reset-password')
        .send({ token: mailbox.latestToken('carol@acme.test', 'resetPassword'), password: 'brand-new-pass' });
      expect(reset.status).toBe(204);
      const oldMe = await http().get('/auth/me').set(auth(oldToken));
      expect(oldMe.status).toBe(401);
    });
  });

  describe('admin digest', () => {
    it('mails admins one digest of the new applications, at most every 15 minutes', async () => {
      const adminToken = await login(app);
      await http().post('/admin/users').set(auth(adminToken)).send({ username: 'ops', email: 'ops@falang.test' });
      const list = await http().get('/admin/users').set(auth(adminToken));
      const ops = (list.body as { id: string; username: string }[]).find((u) => u.username === 'ops');
      await http().patch(`/admin/users/${ops?.id}/role`).set(auth(adminToken)).send({ role: 'admin' });
      const digest = app.get(AdminDigestService);
      await apply();
      await http()
        .post('/auth/verify-email')
        .send({ token: mailbox.latestToken(APPLICANT, 'verifyEmail') });
      // Nothing is mailed at confirmation time any more.
      expect(mailbox.to('ops@falang.test')).toHaveLength(0);
      const now = new Date();
      expect(await digest.sweep(now)).toBe(1);
      const notice = mailbox.to('ops@falang.test').at(-1);
      expect(notice?.subject).toContain('1 new signup');
      expect(notice?.text).toContain(APPLICANT);
      expect(notice?.text).toContain('Acme');

      await apply('second@acme.test');
      await http()
        .post('/auth/verify-email')
        .send({ token: mailbox.latestToken('second@acme.test', 'verifyEmail') });
      expect(await digest.sweep(new Date(now.getTime() + 60_000))).toBe(0);
      expect(await digest.sweep(new Date(now.getTime() + 16 * 60_000))).toBe(1);
      expect(mailbox.to('ops@falang.test').at(-1)?.text).toContain('second@acme.test');
      expect(mailbox.to('ops@falang.test').at(-1)?.text).not.toContain(APPLICANT);
    });
  });

  describe('mail limits', () => {
    it('allows 5 mails a day per address and 20 per IP, then refuses', async () => {
      const limits = app.get(MailLimitsService);
      const first = await Promise.all(
        Array.from({ length: MAX_MAILS_PER_ADDRESS }, () => limits.tryConsume('verify-email', 'Same@Acme.test', null)),
      );
      expect(first.every(Boolean)).toBe(true);
      expect(await limits.tryConsume('verify-email', 'same@acme.test', null)).toBe(false);
      const second = await Promise.all(
        Array.from({ length: MAX_MAILS_PER_IP }, (_, i) =>
          limits.tryConsume('verify-email', `user${i}@acme.test`, '203.0.113.9'),
        ),
      );
      expect(second.every(Boolean)).toBe(true);
      expect(await limits.tryConsume('verify-email', 'another@acme.test', '203.0.113.9')).toBe(false);
      // A day later the window is free again.
      const later = new Date(Date.now() + 25 * 3_600_000);
      expect(await limits.tryConsume('verify-email', 'same@acme.test', null, later)).toBe(true);
    });

    it('answers the same 202 but sends nothing once the address is over its limit', async () => {
      const limits = app.get(MailLimitsService);
      await Promise.all(
        Array.from({ length: MAX_MAILS_PER_ADDRESS }, () => limits.tryConsume('verify-email', 'boss@acme.test', null)),
      );
      const response = await apply('boss@acme.test');
      expect(response.status).toBe(202);
      expect(response.body).toEqual({ status: 'pending_email' });
      expect(mailbox.to('boss@acme.test')).toHaveLength(0);
    });
  });

  describe('unconfirmed accounts', () => {
    it('removes applications nobody confirmed after the TTL, with their tokens, and keeps fresh ones', async () => {
      await apply('old@acme.test');
      await apply('fresh@acme.test');
      const users = app.get<Repository<User>>(getRepositoryToken(User));
      await users.update({ username: 'old@acme.test' }, { createdAt: new Date(Date.now() - 10 * 24 * 3_600_000) });
      expect(await app.get(UnverifiedAccountGcService).sweep()).toBe(1);
      expect(await users.findOneBy({ username: 'old@acme.test' })).toBeNull();
      expect(await users.findOneBy({ username: 'fresh@acme.test' })).not.toBeNull();
    });

    it('never removes a confirmed application', async () => {
      await apply('boss@acme.test');
      await http()
        .post('/auth/verify-email')
        .send({ token: mailbox.latestToken('boss@acme.test', 'verifyEmail') });
      const users = app.get<Repository<User>>(getRepositoryToken(User));
      await users.update({ username: 'boss@acme.test' }, { createdAt: new Date(Date.now() - 30 * 24 * 3_600_000) });
      expect(await app.get(UnverifiedAccountGcService).sweep()).toBe(0);
    });
  });
});
