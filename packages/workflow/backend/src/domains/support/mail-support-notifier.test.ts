// oxlint-disable init-declarations, no-non-null-assertion -- test style: `let`s assigned in beforeEach.
import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailService } from '../mail/mail.service.js';
import type { User } from '../users/users/user.entity.js';
import type { UsersService } from '../users/users/users.service.js';
import { MailSupportNotifier, SUPPORT_NOTIFY_DEBOUNCE_MS } from './mail-support-notifier.js';
import type { IApiSupportMessage } from './support.types.js';

const message = (text: string): IApiSupportMessage => ({
  id: 'm1',
  userId: 'u1',
  authorRole: 'user',
  authorId: 'u1',
  text,
  createdAt: new Date().toISOString(),
  readAt: null,
});

const user = (partial: Partial<User>): User => ({ id: 'u1', username: 'alice', language: 'en', ...partial }) as User;

describe('MailSupportNotifier', () => {
  const sent: { to: string; subject: string; text: string }[] = [];
  let configured: boolean;
  let env: Record<string, string>;
  let people: Record<string, User>;
  let admins: User[];

  const build = (): MailSupportNotifier => {
    const mail = {
      get isConfigured() {
        return configured;
      },
      send: (input: { to: string; subject: string; text: string }) => {
        sent.push(input);
        return Promise.resolve({ sent: true });
      },
      buildClientLink: (path: string) => `https://app.test${path}`,
    } as unknown as MailService;
    const users = {
      findById: (id: string) => Promise.resolve(people[id] ?? null),
      findAdminEmails: () => Promise.resolve(admins),
    } as unknown as UsersService;
    const config = { get: (key: string, def?: string) => env[key] ?? def } as unknown as ConfigService;
    return new MailSupportNotifier(mail, users, config);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    sent.length = 0;
    configured = true;
    env = {};
    people = { u1: user({ email: 'alice@x.test', emailVerifiedAt: new Date() }) };
    admins = [
      user({ id: 'a1', username: 'root', email: 'root@x.test', language: 'ru' }),
      user({ id: 'a2', email: 'b@x.test' }),
    ];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mails every admin in their language with a link to /admin', async () => {
    await build().notifyAdminsOfUserMessage('u1', message('help me'));
    expect(sent.map((m) => m.to)).toEqual(['root@x.test', 'b@x.test']);
    expect(sent[0]?.subject).toContain('alice');
    expect(sent[0]?.subject).toMatch(/Новое/);
    expect(sent[1]?.subject).toMatch(/New support message/);
    expect(sent[0]?.text).toContain('https://app.test/admin');
  });

  it('uses SUPPORT_NOTIFY_EMAILS instead of admins when set', async () => {
    env.SUPPORT_NOTIFY_EMAILS = 'ops@x.test, ,team@x.test';
    await build().notifyAdminsOfUserMessage('u1', message('hi'));
    expect(sent.map((m) => m.to)).toEqual(['ops@x.test', 'team@x.test']);
  });

  it('mails the user on an admin reply only when the e-mail is verified', async () => {
    const notifier = build();
    await notifier.notifyUserOfAdminReply('u1', message('answer'));
    expect(sent.map((m) => m.to)).toEqual(['alice@x.test']);
    sent.length = 0;
    people.u1 = user({ email: 'alice@x.test', emailVerifiedAt: null });
    await build().notifyUserOfAdminReply('u1', message('answer'));
    expect(sent).toEqual([]);
  });

  it('truncates the text to 500 characters', async () => {
    await build().notifyUserOfAdminReply('u1', message('x'.repeat(900)));
    expect(sent[0]?.text).toContain('x'.repeat(500));
    expect(sent[0]?.text).not.toContain('x'.repeat(501));
  });

  it('debounces per thread and direction for 10 minutes', async () => {
    const notifier = build();
    await notifier.notifyAdminsOfUserMessage('u1', message('1'));
    await notifier.notifyUserOfAdminReply('u1', message('r'));
    const first = sent.length;
    expect(first).toBe(3);
    await notifier.notifyAdminsOfUserMessage('u1', message('2'));
    await notifier.notifyUserOfAdminReply('u1', message('r2'));
    expect(sent.length).toBe(first);
    vi.advanceTimersByTime(SUPPORT_NOTIFY_DEBOUNCE_MS + 1);
    await notifier.notifyAdminsOfUserMessage('u1', message('3'));
    expect(sent.length).toBe(first + 2);
  });

  it('sends nothing when mail is not configured', async () => {
    configured = false;
    const notifier = build();
    await notifier.notifyAdminsOfUserMessage('u1', message('1'));
    await notifier.notifyUserOfAdminReply('u1', message('r'));
    expect(sent).toEqual([]);
  });
});
