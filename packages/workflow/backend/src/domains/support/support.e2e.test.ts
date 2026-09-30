// oxlint-disable init-declarations, no-await-expression-member, no-non-null-assertion, no-promise-executor-return -- e2e suite style: `let`s assigned in beforeEach, terse request/response assertions.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';

describe('support chat (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let aliceToken: string;
  let aliceId: string;
  let bobToken: string;

  const http = () => request(app.getHttpServer());

  const registerUser = async (username: string): Promise<string> => {
    await http().post('/auth/register').send({ username, password: 'password123' });
    return login(app, username, 'password123');
  };

  beforeEach(async () => {
    app = await createTestApp();
    adminToken = await login(app);
    aliceToken = await registerUser('alice');
    bobToken = await registerUser('bob');
    const users = await http().get('/admin/users').set(auth(adminToken));
    aliceId = (users.body as { id: string; username: string }[]).find((u) => u.username === 'alice')!.id;
  });

  afterEach(async () => {
    await app.close();
  });

  it('runs a full user -> admin -> user conversation with unread counters', async () => {
    const sent = await http().post('/support/messages').set(auth(aliceToken)).send({ text: '  Hello there  ' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ text: 'Hello there', authorRole: 'user', userId: aliceId, readAt: null });

    const threads = await http().get('/admin/support/threads').set(auth(adminToken));
    expect(threads.status).toBe(200);
    expect(threads.body).toEqual([
      expect.objectContaining({
        userId: aliceId,
        username: 'alice',
        email: null,
        lastMessagePreview: 'Hello there',
        unreadCount: 1,
      }),
    ]);
    expect((await http().get('/admin/support/unread').set(auth(adminToken))).body).toEqual({ count: 1 });

    const adminView = await http().get(`/admin/support/threads/${aliceId}/messages`).set(auth(adminToken));
    expect(adminView.body).toHaveLength(1);
    expect((await http().post(`/admin/support/threads/${aliceId}/read`).set(auth(adminToken))).status).toBe(204);
    expect((await http().get('/admin/support/unread').set(auth(adminToken))).body).toEqual({ count: 0 });

    const reply = await http()
      .post(`/admin/support/threads/${aliceId}/messages`)
      .set(auth(adminToken))
      .send({ text: 'Hi Alice' });
    expect(reply.status).toBe(201);
    expect(reply.body.authorRole).toBe('admin');

    const mine = await http().get('/support/messages').set(auth(aliceToken));
    expect((mine.body as { text: string }[]).map((m) => m.text)).toEqual(['Hello there', 'Hi Alice']);
    expect((await http().get('/support/unread').set(auth(aliceToken))).body).toEqual({ count: 1 });
    expect((await http().post('/support/messages/read').set(auth(aliceToken))).status).toBe(204);
    expect((await http().get('/support/unread').set(auth(aliceToken))).body).toEqual({ count: 0 });
  });

  it('filters by `after`', async () => {
    const first = await http().post('/support/messages').set(auth(aliceToken)).send({ text: 'one' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await http().post('/support/messages').set(auth(aliceToken)).send({ text: 'two' });
    const response = await http().get('/support/messages').query({ after: first.body.createdAt }).set(auth(aliceToken));
    expect((response.body as { text: string }[]).map((m) => m.text)).toEqual(['two']);
  });

  it("does not expose one user's thread to another", async () => {
    await http().post('/support/messages').set(auth(aliceToken)).send({ text: 'private' });
    const bob = await http().get('/support/messages').set(auth(bobToken));
    expect(bob.body).toEqual([]);
    expect((await http().get('/support/unread').set(auth(bobToken))).body).toEqual({ count: 0 });
  });

  it('403s a non-admin on /admin/support/*', async () => {
    expect((await http().get('/admin/support/threads').set(auth(aliceToken))).status).toBe(403);
    expect((await http().get('/admin/support/unread').set(auth(aliceToken))).status).toBe(403);
    expect(
      (await http().post(`/admin/support/threads/${aliceId}/messages`).set(auth(aliceToken)).send({ text: 'x' }))
        .status,
    ).toBe(403);
  });

  it('rejects empty, whitespace-only and over-long text with 400', async () => {
    const empty = await http().post('/support/messages').set(auth(aliceToken)).send({ text: '' });
    const blank = await http().post('/support/messages').set(auth(aliceToken)).send({ text: '   \n ' });
    expect(empty.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(
      (
        await http()
          .post('/support/messages')
          .set(auth(aliceToken))
          .send({ text: 'a'.repeat(4001) })
      ).status,
    ).toBe(400);
    expect(
      (
        await http()
          .post('/support/messages')
          .set(auth(aliceToken))
          .send({ text: 'a'.repeat(4000) })
      ).status,
    ).toBe(201);
  });
});
