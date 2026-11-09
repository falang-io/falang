// oxlint-disable init-declarations, unicorn/consistent-function-scoping, unicorn/no-await-expression-member -- test scaffolding.
// oxlint-disable max-lines-per-function, no-await-in-loop -- scenario-style e2e over one fake messenger.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, login } from '../../test-utils/e2e-app.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  SANDBOX_MESSAGES_PER_HOUR,
  SANDBOX_UNREACHABLE_PER_HOUR,
  SandboxAbuseService,
} from './sandbox-abuse.service.js';
import { SandboxBindingsService } from './sandbox-bindings.service.js';
import { SandboxBotMessage } from './sandbox-bot-message.entity.js';
import { SandboxBotsService } from './sandbox-bots.service.js';
import { SandboxRelayService } from './sandbox-relay.service.js';
import {
  createFakeMessenger,
  createProjectWithInstance,
  createSandboxApp,
  registerUser,
  type TFakeMessenger,
} from './sandbox-bots-test-harness.js';

const CRED = 'cred-1';
const INTERNAL = 'x-internal-project-token';

describe('sandbox bots: credential resolver and outbound relay', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let fake: TFakeMessenger;
  // oxlint-disable-next-line init-declarations
  let adminToken: string;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.internal:3001/');
    fake = await createFakeMessenger();
    app = await createSandboxApp(fake.integration);
    adminToken = await login(app);
  });

  afterEach(async () => {
    await app.close();
    fake.close();
    vi.unstubAllEnvs();
  });

  const server = () => app.getHttpServer();
  const configureBot = () =>
    request(server())
      .put('/admin/settings/sandbox-bots/fakegram')
      .set(auth(adminToken))
      .send({ token: 'real-bot-token' });
  const projectToken = (projectId: string) => app.get(ProjectTokenService).getOrCreateToken(projectId);
  const resolve = (projectId: string, env: 'dev' | 'prod' = 'dev') =>
    request(server())
      .post('/internal/credentials/resolve')
      .set(INTERNAL, projectToken(projectId))
      .send({ credentialId: CRED, projectId, vendor: 'fakegram', field: 'botToken', env });

  const setup = async (devSandbox = true) => {
    const alice = await registerUser(app, 'alice');
    const projectId = await createProjectWithInstance(app, alice, { id: CRED, devSandbox });
    await configureBot();
    return { alice, projectId };
  };

  const bindChat = async (alice: string, projectId: string, chat: string, user?: string) => {
    const link = await request(server())
      .post(`/projects/${projectId}/integrations/${CRED}/sandbox-link`)
      .set(auth(alice));
    await app
      .get(SandboxBotsService)
      .handleUpdate('fakegram', { chat, user, payload: (link.body.url as string).split('start=')[1] });
  };

  const relayPath = (projectId: string, token: string, method = 'sendMessage') =>
    `/internal/sandbox-bots/fakegram/${projectId}/bot${token}/${method}`;

  describe('resolver', () => {
    it('answers a sandbox dev instance with the project token and the relay base URL, never the real token', async () => {
      const { projectId } = await setup();
      const response = await resolve(projectId).expect(201);
      expect(response.body).toEqual({
        value: projectToken(projectId),
        apiBaseUrl: `http://backend.internal:3001/internal/sandbox-bots/fakegram/${projectId}`,
      });
      expect(JSON.stringify(response.body)).not.toContain('real-bot-token');
    });

    it('answers 412 sandbox_not_configured when the test bot is missing', async () => {
      const alice = await registerUser(app, 'alice');
      const projectId = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      const response = await resolve(projectId);
      expect(response.status).toBe(412);
      expect(response.body).toMatchObject({ code: 'sandbox_not_configured' });
    });

    it('leaves prod and a non-sandbox instance on their own token path', async () => {
      const { projectId } = await setup();
      // Own token is empty for the fake instance, so the normal path says "not configured" (404) — not the relay.
      expect((await resolve(projectId, 'prod')).status).toBe(404);
      const alice = await registerUser(app, 'bob');
      const plain = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: false });
      expect((await resolve(plain)).status).toBe(404);
    });
  });

  describe('relay', () => {
    it('forwards an allowed call for a bound chat with the real token and passes the upstream answer through', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      const response = await request(server())
        .post(relayPath(projectId, projectToken(projectId)))
        .send({ chat_id: '42', text: 'hi' });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true, result: 'from-upstream' });
      expect(fake.upstreamCalls).toHaveLength(1);
      expect(fake.upstreamCalls[0]).toMatchObject({
        method: 'POST',
        url: '/botreal-bot-token/sendMessage',
        headers: expect.objectContaining({ 'x-real-token': 'real-bot-token' }),
      });
      expect(fake.upstreamCalls[0]?.body).toBe(JSON.stringify({ chat_id: '42', text: 'hi' }));
      expect(fake.upstreamCalls[0]?.headers[INTERNAL]).toBeUndefined();
    });

    it('relays a send by user id when that user’s chat is bound to the project, and refuses other users', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42', 'u7');
      const sendTo = (user: string, project = projectId) =>
        request(server())
          .post(relayPath(project, projectToken(project), 'sendToUser'))
          .send({ user_id: user, text: 'hi' });
      expect((await sendTo('u7')).status).toBe(200);
      expect(fake.upstreamCalls[0]?.body).toBe(JSON.stringify({ user_id: 'u7', text: 'hi' }));
      const unknown = await sendTo('u8');
      expect(unknown.status).toBe(403);
      expect(unknown.body.description).toContain('user is not connected');
      // The same user's chat bound to someone else's project is not this project's.
      const bob = await registerUser(app, 'bob');
      const other = await createProjectWithInstance(app, bob, { id: CRED, devSandbox: true });
      expect((await sendTo('u7', other)).status).toBe(403);
      expect(fake.upstreamCalls).toHaveLength(1);
    });

    it('learns the user of a chat bound before users were stored from its next message', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      const send = () =>
        request(server())
          .post(relayPath(projectId, projectToken(projectId), 'sendToUser'))
          .send({ user_id: 'u7', text: 'hi' });
      expect((await send()).status).toBe(403);
      await app.get(SandboxBotsService).handleUpdate('fakegram', { chat: '42', user: 'u7', text: 'hello' });
      expect((await send()).status).toBe(200);
    });

    it('passes an upstream error status through', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      fake.state.upstreamStatus = 429;
      const response = await request(server())
        .post(relayPath(projectId, projectToken(projectId)))
        .send({ chat_id: '42', text: 'hi' });
      expect(response.status).toBe(429);
    });

    it('refuses methods outside the adapter allowlist with a 400 in the vendor error shape', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      const response = await request(server())
        .post(relayPath(projectId, projectToken(projectId), 'deleteWebhook'))
        .send({});
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ ok: false, error_code: 400 });
      expect(fake.upstreamCalls).toHaveLength(0);
    });

    it('refuses a call with a token that is not the project’s (a pod cannot use another project’s relay)', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      const otherToken = projectToken('00000000-0000-4000-8000-000000000000');
      const response = await request(server())
        .post(relayPath(projectId, otherToken))
        .send({ chat_id: '42', text: 'x' });
      expect(response.status).toBe(403);
      expect(fake.upstreamCalls).toHaveLength(0);
    });

    it('refuses a recipient that is not bound to the calling project, expired, or unbound', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      const other = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      await bindChat(alice, other, '77');

      // Chat 77 belongs to the other project.
      const foreign = await request(server())
        .post(relayPath(projectId, projectToken(projectId)))
        .send({ chat_id: '77', text: 'x' });
      expect(foreign.status).toBe(403);
      expect(foreign.body.description).toContain('not connected');
      // Unknown chat.
      const unknown = await request(server())
        .post(relayPath(projectId, projectToken(projectId)))
        .send({ chat_id: '999', text: 'x' });
      expect(unknown.status).toBe(403);
      expect(fake.upstreamCalls).toHaveLength(0);
    });

    it('refuses an expired binding', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      (app.get(SandboxBotsService) as unknown as { bindings: { now: () => Date } }).bindings.now = () =>
        new Date(Date.now() + 16 * 60_000);
      const response = await request(server())
        .post(relayPath(projectId, projectToken(projectId)))
        .send({ chat_id: '42', text: 'x' });
      expect(response.status).toBe(403);
    });

    it('rate-limits per chat (burst, then 429 with retry_after) and per project', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      const relay = app.get(SandboxRelayService);
      let now = 1_000_000;
      relay.now = () => now;
      const call = (chat: string) =>
        request(server())
          .post(relayPath(projectId, projectToken(projectId)))
          .send({ chat_id: chat, text: 'x' });

      for (let i = 0; i < 3; i += 1) expect((await call('42')).status).toBe(200);
      const limited = await call('42');
      expect(limited.status).toBe(429);
      expect(limited.body.parameters.retry_after).toBeGreaterThanOrEqual(1);
      now += 1100;
      expect((await call('42')).status).toBe(200);

      // Project window: 60 calls per minute across chats.
      for (let i = 0; i < 40; i += 1) {
        await bindChat(alice, projectId, `c${i}`);
      }
      let accepted = 0;
      let projectLimited: number | undefined;
      for (let i = 0; i < 70; i += 1) {
        const response = await call(`c${i % 40}`);
        if (response.status === 200) accepted += 1;
        else {
          projectLimited = response.status;
          break;
        }
      }
      expect(projectLimited).toBe(429);
      expect(accepted).toBeLessThan(70);
    });

    it('answers 412 when no test bot is configured, and relays a refreshed activity timestamp on success', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      await request(server()).delete('/admin/settings/sandbox-bots/fakegram').set(auth(adminToken)).expect(204);
      const response = await request(server())
        .post(relayPath(projectId, projectToken(projectId)))
        .send({ chat_id: '42', text: 'x' });
      expect(response.status).toBe(412);
    });

    it('forwards a multipart body byte for byte', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      // The fake adapter reads JSON only; make it multipart-aware for this call.
      fake.adapter.relay.inspect = async (req) => {
        const form = await req.formData();
        return {
          method: 'sendMessage',
          recipients: [String(form.get('chat_id'))],
          relayToken: projectToken(projectId),
        };
      };
      const response = await request(server())
        .post(relayPath(projectId, projectToken(projectId)))
        .field('chat_id', '42')
        .attach('document', Buffer.from([0, 1, 2, 250, 251]), 'f.bin');
      expect(response.status).toBe(200);
      expect(fake.upstreamCalls[0]?.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
      expect(fake.upstreamCalls[0]?.body).toContain('name="chat_id"');
      expect(fake.upstreamCalls[0]?.body).toContain('filename="f.bin"');
    });
  });

  describe('headers, unaddressed calls and message ids', () => {
    const post = (projectId: string, method: string, body: object, token = projectToken(projectId)) =>
      request(server())
        .post(relayPath(projectId, token, method))
        .send(body);
    const messages = () => app.get<Repository<SandboxBotMessage>>(getRepositoryToken(SandboxBotMessage));

    it('shows the pod authorization headers to the adapter but never forwards them upstream', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      await request(server())
        .post(relayPath(projectId, projectToken(projectId)))
        .set('authorization', 'pod-secret')
        .set('cookie', 'a=b')
        .send({ chat_id: '42', text: 'hi' })
        .expect(200);
      expect(fake.state.inspectHeaders?.get('authorization')).toBe('pod-secret');
      expect(fake.state.inspectHeaders?.get(INTERNAL)).toBeNull();
      expect(fake.state.inspectHeaders?.get('cookie')).toBeNull();
      expect(fake.upstreamCalls[0]?.headers.authorization).toBeUndefined();
      expect(fake.upstreamCalls[0]?.headers[INTERNAL]).toBeUndefined();
      expect(fake.upstreamCalls[0]?.headers.cookie).toBeUndefined();
    });

    it('lets an unaddressed call through (project limit only) and refuses empty or mixed decisions', async () => {
      const { projectId } = await setup();
      await post(projectId, 'upload', {}).expect(200);
      expect(fake.upstreamCalls).toHaveLength(1);
      const empty = await post(projectId, 'nothing', {});
      expect(empty.status).toBe(400);
      expect(empty.body).toMatchObject({ ok: false, error_code: 400 });
      expect((await post(projectId, 'mixed', { chat_id: '42' })).status).toBe(400);
      expect(fake.upstreamCalls).toHaveLength(1);
    });

    it('limits unaddressed calls per project', async () => {
      const { projectId } = await setup();
      let status = 200;
      for (let i = 0; i < 70 && status === 200; i += 1) status = (await post(projectId, 'upload', {})).status;
      expect(status).toBe(429);
    });

    it('records a sent message after a 2xx and allows an id-only call for it', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      await post(projectId, 'sendMessage', { chat_id: '42', text: 'hi' }).expect(200);
      const rows = await messages().find();
      expect(rows).toMatchObject([{ vendor: 'fakegram', messageId: 'm-1', projectId, chatId: '42' }]);
      await post(projectId, 'editMessage', { message_id: 'm-1' }).expect(200);
      expect(fake.upstreamCalls).toHaveLength(2);
    });

    it('does not record messages after an upstream error, nor for a chat the call did not address', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      fake.state.upstreamStatus = 500;
      await post(projectId, 'sendMessage', { chat_id: '42', text: 'hi' }).expect(500);
      fake.state.upstreamStatus = 400;
      await post(projectId, 'sendMessage', { chat_id: '42', text: 'hi' }).expect(400);
      expect(await messages().count()).toBe(0);
      fake.state.upstreamStatus = 200;
      fake.state.sentOverride = [{ messageId: 'x-1', chatId: '999' }];
      await post(projectId, 'sendMessage', { chat_id: '42', text: 'hi' }).expect(200);
      expect(await messages().count()).toBe(0);
    });

    it('refuses an unknown message id and another project’s message id', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      const other = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      await bindChat(alice, other, '77');
      await post(other, 'sendMessage', { chat_id: '77', text: 'hi' }).expect(200);
      const foreign = await post(projectId, 'editMessage', { message_id: 'm-1' });
      expect(foreign.status).toBe(403);
      expect(foreign.body.description).toContain('does not belong');
      expect((await post(projectId, 'editMessage', { message_id: 'nope' })).status).toBe(403);
      expect(fake.upstreamCalls).toHaveLength(1);
    });

    it('refuses a message whose chat binding expired or moved to another project', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      await post(projectId, 'sendMessage', { chat_id: '42', text: 'hi' }).expect(200);
      // Rebound to another project.
      const other = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      await bindChat(alice, other, '42');
      expect((await post(projectId, 'editMessage', { message_id: 'm-1' })).status).toBe(403);
      // Disconnected altogether.
      await bindChat(alice, projectId, '42');
      await post(projectId, 'editMessage', { message_id: 'm-1' }).expect(200);
      const bindings = app.get(SandboxBindingsService);
      const binding = await bindings.findBinding('fakegram', '42');
      await bindings.remove(binding as NonNullable<typeof binding>);
      expect((await post(projectId, 'editMessage', { message_id: 'm-1' })).status).toBe(403);
    });

    it('refuses a message whose binding expired', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      await post(projectId, 'sendMessage', { chat_id: '42', text: 'hi' }).expect(200);
      app.get(SandboxBindingsService).now = () => new Date(Date.now() + 16 * 60_000);
      expect((await post(projectId, 'editMessage', { message_id: 'm-1' })).status).toBe(403);
    });

    it('sweeps messages older than 30 days and those whose chat has no binding after a day, keeping live ones', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      const repo = messages();
      const day = 24 * 60 * 60_000;
      const row = (messageId: string, chatId: string, ageMs: number) =>
        repo.save(
          repo.create({ vendor: 'fakegram', messageId, projectId, chatId, createdAt: new Date(Date.now() - ageMs) }),
        );
      await row('live-new', '42', 1000);
      await row('live-old', '42', 10 * day);
      await row('too-old', '42', 31 * day);
      await row('orphan-old', '500', 2 * day);
      await row('orphan-new', '500', 1000);
      await app.get(SandboxBindingsService).sweep();
      const left = (await repo.find()).map((r) => r.messageId).toSorted();
      expect(left).toEqual(['live-new', 'live-old', 'orphan-new']);
    });
  });
  describe('abuse protection', () => {
    const HOUR = 60 * 60_000;
    /** One clock for the relay's limiters and the abuse windows (bindings keep the real clock, so they stay live). */
    const clock = () => {
      const state = { now: 1_000_000 };
      app.get(SandboxRelayService).now = () => state.now;
      app.get(SandboxAbuseService).now = () => state.now;
      return state;
    };
    const send = (projectId: string, chat = '42') =>
      request(server())
        .post(relayPath(projectId, projectToken(projectId)))
        .send({ chat_id: chat, text: 'x' });
    /** Sends `count` messages a little more than a second apart, so the per-chat and per-project limits never bite. */
    const sendSpaced = async (projectId: string, count: number, time: { now: number }) => {
      const statuses: number[] = [];
      for (let i = 0; i < count; i += 1) {
        time.now += 1100;
        statuses.push((await send(projectId)).status);
      }
      return statuses;
    };

    it(`lets an account send ${SANDBOX_MESSAGES_PER_HOUR} messages per hour, counting sends only`, async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      const time = clock();
      const statuses = await sendSpaced(projectId, SANDBOX_MESSAGES_PER_HOUR, time);
      expect(statuses.every((status) => status === 200)).toBe(true);
      // Calls that create no message are not counted.
      expect(
        (
          await request(server())
            .post(relayPath(projectId, projectToken(projectId), 'upload'))
            .send({})
        ).status,
      ).toBe(200);
      time.now += 1100;
      const limited = await send(projectId);
      expect(limited.status).toBe(429);
      expect(limited.body.description).toMatch(/per hour/);
      expect(limited.body.parameters.retry_after).toBeGreaterThan(60);
      expect(fake.upstreamCalls).toHaveLength(SANDBOX_MESSAGES_PER_HOUR + 1);

      // Another project of the same owner shares the limit.
      const second = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      await bindChat(alice, second, '43');
      time.now += 1100;
      expect((await send(second, '43')).status).toBe(429);

      time.now += HOUR;
      expect((await send(projectId)).status).toBe(200);
    });

    it(`blocks the test bot for the owner after ${SANDBOX_UNREACHABLE_PER_HOUR} undeliverable messages within an hour`, async () => {
      const { alice, projectId } = await setup();
      const second = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      const bob = await registerUser(app, 'bob');
      const bobProject = await createProjectWithInstance(app, bob, { id: CRED, devSandbox: true });
      await bindChat(alice, projectId, '42');
      await bindChat(bob, bobProject, '77');
      const time = clock();

      fake.state.upstreamStatus = 403;
      const statuses = await sendSpaced(projectId, SANDBOX_UNREACHABLE_PER_HOUR, time);
      expect(statuses.every((status) => status === 403)).toBe(true);
      expect(fake.upstreamCalls).toHaveLength(SANDBOX_UNREACHABLE_PER_HOUR);
      fake.state.upstreamStatus = 200;

      time.now += 1100;
      const blocked = await send(projectId);
      expect(blocked.status).toBe(403);
      expect(blocked.body.description).toMatch(/sandbox_blocked/);
      expect(fake.upstreamCalls).toHaveLength(SANDBOX_UNREACHABLE_PER_HOUR);

      // Every project of the owner loses new links; incoming messages get the "blocked" reply instead of the stand.
      const link = await request(server())
        .post(`/projects/${second}/integrations/${CRED}/sandbox-link`)
        .set(auth(alice));
      expect(link.status).toBe(403);
      expect(link.body.code).toBe('sandbox_blocked');
      await app.get(SandboxBotsService).handleUpdate('fakegram', { chat: '42', text: 'hello' });
      expect(fake.sent.at(-1)).toMatchObject({ chatId: '42', text: expect.stringMatching(/blocked/i) });

      // Another account is not affected.
      time.now += 1100;
      expect((await send(bobProject, '77')).status).toBe(200);

      const list = await request(server()).get('/admin/settings/sandbox-bots/blocks').set(auth(adminToken));
      expect(list.status).toBe(200);
      expect(list.body).toEqual([
        expect.objectContaining({ vendor: 'fakegram', username: 'alice', reason: 'unreachable_chats', projectId }),
      ]);
      await request(server()).get('/admin/settings/sandbox-bots/blocks').set(auth(alice)).expect(403);
      await request(server())
        .delete(`/admin/settings/sandbox-bots/blocks/${list.body[0].id as string}`)
        .set(auth(adminToken))
        .expect(204);
      await request(server())
        .delete(`/admin/settings/sandbox-bots/blocks/${list.body[0].id as string}`)
        .set(auth(adminToken))
        .expect(404);

      time.now += 1100;
      expect((await send(projectId)).status).toBe(200);
      // The counter starts afresh after the unblock: one more error doesn't block again.
      fake.state.upstreamStatus = 403;
      time.now += 1100;
      await send(projectId);
      fake.state.upstreamStatus = 200;
      time.now += 1100;
      expect((await send(projectId)).status).toBe(200);
    });

    it('forgets undeliverable messages older than an hour', async () => {
      const { alice, projectId } = await setup();
      await bindChat(alice, projectId, '42');
      const time = clock();
      fake.state.upstreamStatus = 403;
      await sendSpaced(projectId, SANDBOX_UNREACHABLE_PER_HOUR - 1, time);
      time.now += HOUR;
      await sendSpaced(projectId, SANDBOX_UNREACHABLE_PER_HOUR - 1, time);
      fake.state.upstreamStatus = 200;
      time.now += 1100;
      expect((await send(projectId)).status).toBe(200);
      const list = await request(server()).get('/admin/settings/sandbox-bots/blocks').set(auth(adminToken));
      expect(list.body).toEqual([]);
    });
  });
});
