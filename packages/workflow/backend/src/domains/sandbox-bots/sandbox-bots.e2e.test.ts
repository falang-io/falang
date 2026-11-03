// oxlint-disable no-inline-comments, require-await, no-non-null-assertion, unicorn/consistent-function-scoping, unicorn/no-await-expression-member, unicorn/no-useless-undefined -- test scaffolding.
// oxlint-disable max-lines-per-function, no-await-in-loop, no-undefined -- scenario-style e2e over one fake messenger.
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getEgressVendor } from '@falang/workflow-egress';
import { IntegrationsRuntimeService } from '@falang/workflow-gateway';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, login } from '../../test-utils/e2e-app.js';
import { RunJournalService } from '../run-journal/run-journal.service.js';
import { SandboxBotBinding } from './sandbox-bot-binding.entity.js';
import { SandboxBotsService } from './sandbox-bots.service.js';
import {
  addTriggerDocument,
  createFakeMessenger,
  createProjectWithInstance,
  createSandboxApp,
  registerUser,
  type IFakeUpdate,
  type TFakeMessenger,
} from './sandbox-bots-test-harness.js';

const CRED = 'cred-1';

describe('sandbox bots: settings, link codes, routing', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let fake: TFakeMessenger;
  // oxlint-disable-next-line init-declarations
  let adminToken: string;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
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
  const configureBot = async (token = 'good-token') =>
    request(server()).put('/admin/settings/sandbox-bots/fakegram').set(auth(adminToken)).send({ token });
  const service = () => app.get(SandboxBotsService);
  const send = (update: IFakeUpdate) => service().handleUpdate('fakegram', update);
  const lastText = () => fake.sent.at(-1)?.text ?? '';
  const makeLink = async (token: string, projectId: string) =>
    request(server()).post(`/projects/${projectId}/integrations/${CRED}/sandbox-link`).set(auth(token));
  const codeOf = (url: string): string => url.split('start=')[1] ?? '';

  describe('admin settings', () => {
    it('lists one row per sandbox vendor; saving a token checks it and exposes only the identity', async () => {
      const initial = await request(server()).get('/admin/settings/sandbox-bots').set(auth(adminToken)).expect(200);
      expect(initial.body).toEqual({
        bindingTtlMinutes: 15,
        platforms: [{ vendor: 'fakegram', configured: false, username: null, title: null, commandName: 'falang' }],
      });

      const saved = await configureBot().then((r) => r);
      expect(saved.status).toBe(200);
      expect(saved.body).toEqual({
        vendor: 'fakegram',
        configured: true,
        username: 'fake_bot',
        title: 'Fake Bot',
        commandName: 'falang',
      });
      expect(JSON.stringify(saved.body)).not.toContain('good-token');
      expect(fake.state.ingress?.token).toBe('good-token');
      expect(service().getBotFields('fakegram')).toEqual({ botToken: 'good-token' });
    });

    it('rejects a bad token, a missing first token, an unknown vendor and a bad command name', async () => {
      const bad = await configureBot('bad-token');
      expect(bad.status).toBe(400);
      expect(bad.body).toMatchObject({ code: 'invalid_token' });
      await request(server()).put('/admin/settings/sandbox-bots/fakegram').set(auth(adminToken)).send({}).expect(400);
      await request(server())
        .put('/admin/settings/sandbox-bots/nope')
        .set(auth(adminToken))
        .send({ token: 'x' })
        .expect(404);
      await configureBot();
      await request(server())
        .put('/admin/settings/sandbox-bots/fakegram')
        .set(auth(adminToken))
        .send({ commandName: 'Bad Name' })
        .expect(400);
    });

    it('keeps the stored token when only the command name changes, and restarts the ingress on a new token', async () => {
      await configureBot();
      const renamed = await request(server())
        .put('/admin/settings/sandbox-bots/fakegram')
        .set(auth(adminToken))
        .send({ commandName: 'steps' })
        .expect(200);
      expect(renamed.body.commandName).toBe('steps');
      expect(service().getBot('fakegram')?.token).toBe('good-token');
      await configureBot('second-token');
      expect(service().getBot('fakegram')?.token).toBe('second-token');
      expect(fake.state.disposed).toBeGreaterThanOrEqual(2);
    });

    it('sets the binding TTL, runs the check, deletes the bot and stops the ingress', async () => {
      await configureBot();
      const ttl = await request(server())
        .put('/admin/settings/sandbox-bots')
        .set(auth(adminToken))
        .send({ bindingTtlMinutes: 30 })
        .expect(200);
      expect(ttl.body.bindingTtlMinutes).toBe(30);
      await request(server())
        .put('/admin/settings/sandbox-bots')
        .set(auth(adminToken))
        .send({ bindingTtlMinutes: 0 })
        .expect(400);

      const check = await request(server()).post('/admin/settings/sandbox-bots/fakegram/check').set(auth(adminToken));
      expect(check.body).toEqual({ ok: true, username: 'fake_bot', title: 'Fake Bot' });

      await request(server()).delete('/admin/settings/sandbox-bots/fakegram').set(auth(adminToken)).expect(204);
      expect(service().getBot('fakegram')).toBeUndefined();
      const after = await request(server()).post('/admin/settings/sandbox-bots/fakegram/check').set(auth(adminToken));
      expect(after.body).toMatchObject({ ok: false });
    });

    it('is admin-only', async () => {
      const alice = await registerUser(app, 'alice');
      await request(server()).get('/admin/settings/sandbox-bots').set(auth(alice)).expect(403);
    });
  });

  describe('user routes', () => {
    it('lists only configured platforms', async () => {
      const alice = await registerUser(app, 'alice');
      expect((await request(server()).get('/sandbox-bots').set(auth(alice))).body).toEqual({ platforms: [] });
      await configureBot();
      expect((await request(server()).get('/sandbox-bots').set(auth(alice))).body).toEqual({
        platforms: [{ vendor: 'fakegram', username: 'fake_bot', title: 'Fake Bot' }],
      });
    });

    it('builds a link only for an existing sandbox instance with a configured bot', async () => {
      const alice = await registerUser(app, 'alice');
      const off = await createProjectWithInstance(app, alice, { id: CRED });
      const on = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });

      await makeLink(alice, on).then((r) => expect(r.status).toBe(412));
      await configureBot();
      const unknown = await request(server())
        .post(`/projects/${on}/integrations/missing/sandbox-link`)
        .set(auth(alice));
      expect(unknown.status).toBe(404);
      const offResponse = await makeLink(alice, off);
      expect(offResponse.status).toBe(409);
      expect(offResponse.body).toMatchObject({ code: 'sandbox_off' });

      const ok = await makeLink(alice, on);
      expect(ok.status).toBe(201);
      expect(ok.body.url).toMatch(/^https:\/\/fake\.example\/fake_bot\?start=fl_[\w-]{16,}$/);
      expect(new Date(ok.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('requires edit access to the project for links and deletion, read access for the list', async () => {
      const alice = await registerUser(app, 'alice');
      const bob = await registerUser(app, 'bob');
      const projectId = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      await configureBot();
      await makeLink(bob, projectId).then((r) => expect(r.status).toBe(404));
      await request(server())
        .get(`/projects/${projectId}/integrations/${CRED}/sandbox-bindings`)
        .set(auth(bob))
        .expect(404);
      // An admin may read other users' projects but not change them.
      await request(server())
        .get(`/projects/${projectId}/integrations/${CRED}/sandbox-bindings`)
        .set(auth(adminToken))
        .expect(200);
      await makeLink(adminToken, projectId).then((r) => expect(r.status).toBe(404));
    });

    it('lists live bindings with their expiry and deletes one, telling the chat', async () => {
      const alice = await registerUser(app, 'alice');
      const projectId = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      await configureBot();
      const link = await makeLink(alice, projectId);
      await send({ chat: '42', title: 'Alice', payload: codeOf(link.body.url) });

      const listed = await request(server())
        .get(`/projects/${projectId}/integrations/${CRED}/sandbox-bindings`)
        .set(auth(alice))
        .expect(200);
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0]).toMatchObject({ chatTitle: 'Alice' });
      const expires = new Date(listed.body[0].expiresAt).getTime();
      expect(expires - new Date(listed.body[0].lastActivityAt).getTime()).toBe(15 * 60_000);

      await request(server())
        .delete(`/projects/${projectId}/integrations/${CRED}/sandbox-bindings/${listed.body[0].id}`)
        .set(auth(alice))
        .expect(204);
      expect(fake.sent.at(-1)).toMatchObject({ chatId: '42', token: 'good-token' });
      expect(lastText()).toContain('disconnected');
      const after = await request(server())
        .get(`/projects/${projectId}/integrations/${CRED}/sandbox-bindings`)
        .set(auth(alice));
      expect(after.body).toEqual([]);
      await request(server())
        .delete(`/projects/${projectId}/integrations/${CRED}/sandbox-bindings/${listed.body[0].id}`)
        .set(auth(alice))
        .expect(404);
    });
  });

  describe('routing', () => {
    const bind = async (chat = '42') => {
      const alice = await registerUser(app, 'alice');
      const projectId = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      await configureBot();
      const link = await makeLink(alice, projectId);
      await send({ chat, payload: codeOf(link.body.url) });
      return { alice, projectId };
    };

    it('redeems a link code once: confirms the project, rejects a second use', async () => {
      const alice = await registerUser(app, 'alice');
      const projectId = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      await configureBot();
      const link = await makeLink(alice, projectId);
      const payload = codeOf(link.body.url);

      await send({ chat: '42', payload });
      expect(lastText()).toContain('«Bot project»');
      await send({ chat: '43', payload });
      expect(fake.sent.at(-1)).toMatchObject({ chatId: '43' });
      expect(lastText()).toContain('invalid');
      await send({ chat: '44', payload: 'fl_unknown-code' });
      expect(lastText()).toContain('invalid');
      await send({ chat: '45', payload: 'my-own-start-param' });
      expect(lastText()).toContain('not connected');
    });

    it('treats a repeated used link from the chat bound to the same project as a plain message', async () => {
      const alice = await registerUser(app, 'alice');
      const projectId = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      await configureBot();
      const link = await makeLink(alice, projectId);
      const payload = codeOf(link.body.url);
      await send({ chat: '42', payload });
      const handler = vi.fn().mockResolvedValue(undefined);
      service().subscribe({ vendor: 'fakegram', projectId, credentialId: CRED }, handler);
      const sentBefore = fake.sent.length;

      const repeat = { chat: '42', payload, text: 'Start' };
      await send(repeat);
      expect(handler).toHaveBeenCalledWith(repeat);
      expect(fake.sent.length).toBe(sentBefore);

      // The same used code from another, unbound chat is still invalid.
      await send({ chat: '43', payload });
      expect(lastText()).toContain('invalid');
    });

    it('rejects an expired code', async () => {
      const alice = await registerUser(app, 'alice');
      const projectId = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
      await configureBot();
      const link = await makeLink(alice, projectId);
      app.get(SandboxBotsService); // booted
      const bindings = service() as unknown as { bindings: { now: () => Date } };
      bindings.bindings.now = () => new Date(Date.now() + 16 * 60_000);
      await send({ chat: '42', payload: codeOf(link.body.url) });
      expect(lastText()).toContain('invalid');
    });

    it('answers the service command with the status and disconnects on "off"', async () => {
      await bind();
      await send({ chat: '42', text: '/falang' });
      expect(lastText()).toContain('«Bot project»');
      await send({ chat: '42', text: '/falang off' });
      expect(lastText()).toContain('disconnected');
      await send({ chat: '42', text: '/falang' });
      expect(lastText()).toContain('not connected');
    });

    it('honours a custom command name and leaves other commands (incl. /start) to the project', async () => {
      await bind();
      await request(server())
        .put('/admin/settings/sandbox-bots/fakegram')
        .set(auth(adminToken))
        .send({ commandName: 'steps' })
        .expect(200);
      const handler = vi.fn().mockResolvedValue(undefined);
      const projectId = (await app.get<Repository<SandboxBotBinding>>(getRepositoryToken(SandboxBotBinding)).find())[0]!
        .projectId;
      service().subscribe({ vendor: 'fakegram', projectId, credentialId: CRED }, handler);

      await send({ chat: '42', text: '/falang' }); // the old name is now the project's
      await send({ chat: '42', text: '/start' });
      expect(handler).toHaveBeenCalledTimes(2);
      await send({ chat: '42', text: '/steps' });
      expect(handler).toHaveBeenCalledTimes(2);
      expect(lastText()).toContain('«Bot project»');
    });

    describe('chat command menu', () => {
      const lastMenu = () => fake.menus.at(-1);
      const names = (menu: (typeof fake.menus)[number] | undefined) => menu?.commands.map((entry) => entry.command);

      it('sets the project commands plus the service command right after the link is redeemed', async () => {
        const alice = await registerUser(app, 'alice');
        const projectId = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
        await addTriggerDocument(app, projectId, 'help');
        await configureBot();
        const link = await makeLink(alice, projectId);
        await send({ chat: '42', payload: codeOf(link.body.url) });
        expect(lastMenu()).toMatchObject({ token: 'good-token', chatId: '42' });
        expect(names(lastMenu())).toEqual(['falang', 'help']);
        expect(lastMenu()?.commands[0]?.description).toBe('Test bot connection status');
      });

      it('refreshes every live chat of the project when its stand subscribes', async () => {
        const { projectId } = await bind();
        await addTriggerDocument(app, projectId, 'later');
        fake.menus.length = 0;
        service().subscribe({ vendor: 'fakegram', projectId, credentialId: CRED }, vi.fn());
        await vi.waitFor(() => expect(fake.menus).toHaveLength(1));
        expect(names(lastMenu())).toEqual(['falang', 'later']);
      });

      it('resets the menu to the service command on "/falang off" and on a disconnect from the editor', async () => {
        const { alice, projectId } = await bind();
        await send({ chat: '42', text: '/falang off' });
        expect(names(lastMenu())).toEqual(['falang']);

        const link = await makeLink(alice, projectId);
        await send({ chat: '43', payload: codeOf(link.body.url) });
        const bindingId = (
          await request(server())
            .get(`/projects/${projectId}/integrations/${CRED}/sandbox-bindings`)
            .set(auth(alice))
            .expect(200)
        ).body[0].id as string;
        await request(server())
          .delete(`/projects/${projectId}/integrations/${CRED}/sandbox-bindings/${bindingId}`)
          .set(auth(alice))
          .expect(204);
        expect(lastMenu()).toMatchObject({ chatId: '43' });
        expect(names(lastMenu())).toEqual(['falang']);
      });

      it('rebinding a chat to another project shows the other project commands', async () => {
        const { alice } = await bind();
        const second = await createProjectWithInstance(app, alice, { id: CRED, devSandbox: true });
        await addTriggerDocument(app, second, 'other');
        const link = await makeLink(alice, second);
        await send({ chat: '42', payload: codeOf(link.body.url) });
        expect(names(lastMenu())).toEqual(['falang', 'other']);
      });

      it('a failing menu call never breaks binding or routing', async () => {
        fake.state.menuFails = true;
        const { projectId } = await bind();
        expect(lastText()).toContain('«Bot project»');
        const handler = vi.fn().mockResolvedValue(undefined);
        service().subscribe({ vendor: 'fakegram', projectId, credentialId: CRED }, handler);
        await send({ chat: '42', text: 'hello' });
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });

    it('delivers updates of a bound chat to the subscriber and refreshes its activity', async () => {
      const { projectId } = await bind();
      const handler = vi.fn().mockResolvedValue(undefined);
      const unsubscribe = service().subscribe({ vendor: 'fakegram', projectId, credentialId: CRED }, handler);
      const repo = app.get<Repository<SandboxBotBinding>>(getRepositoryToken(SandboxBotBinding));
      await repo.update({ vendor: 'fakegram' }, { lastActivityAt: new Date(Date.now() - 10 * 60_000) });

      const update = { chat: '42', text: 'hello' };
      await send(update);
      expect(handler).toHaveBeenCalledWith(update);
      expect(Date.now() - (await repo.find())[0]!.lastActivityAt.getTime()).toBeLessThan(5000);

      unsubscribe();
      await send(update);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('runs the subscriber and the messenger calls inside the vendor egress scope', async () => {
      const { projectId } = await bind();
      let seen: string | undefined = 'unset';
      service().subscribe({ vendor: 'fakegram', projectId, credentialId: CRED }, () => {
        seen = getEgressVendor();
        return Promise.resolve();
      });
      await send({ chat: '42', text: 'hello' });
      expect(seen).toBe('fakegram');
    });

    it('survives a throwing subscriber', async () => {
      const { projectId } = await bind();
      service().subscribe({ vendor: 'fakegram', projectId, credentialId: CRED }, () =>
        Promise.reject(new Error('boom')),
      );
      await expect(send({ chat: '42', text: 'hi' })).resolves.toBeUndefined();
    });

    it('answers "stand stopped" and journals the input when nothing subscribes', async () => {
      const { projectId } = await bind();
      const recordProblem = vi.spyOn(app.get(RunJournalService), 'recordProblem').mockResolvedValue(undefined);
      await send({ chat: '42', text: 'hello' });
      expect(lastText()).toContain('«Bot project»');
      expect(lastText()).toContain('stopped');
      expect(recordProblem).toHaveBeenCalledWith(
        expect.objectContaining({ projectId, env: 'dev', vendor: 'fakegram', workflowId: 'sandbox-fakegram-42' }),
      );
    });

    it('treats an expired binding as absent and says so; an unbound chat is told to connect', async () => {
      await bind();
      const repo = app.get<Repository<SandboxBotBinding>>(getRepositoryToken(SandboxBotBinding));
      await repo.update({ vendor: 'fakegram' }, { lastActivityAt: new Date(Date.now() - 16 * 60_000) });
      await send({ chat: '42', text: 'hello' });
      expect(lastText()).toContain('expired');
      await send({ chat: '99', text: 'hello' });
      expect(fake.sent.at(-1)).toMatchObject({ chatId: '99' });
      expect(lastText()).toContain('not connected');
    });

    it('does not support groups: one service reply, then silence', async () => {
      await configureBot();
      await send({ chat: '-100', private: false, text: 'hi' });
      await send({ chat: '-100', private: false, text: 'hi again' });
      expect(fake.sent.filter((entry) => entry.chatId === '-100')).toHaveLength(1);
      expect(lastText()).toContain('Groups are not supported');
    });

    it('ignores updates the adapter does not describe', async () => {
      await configureBot();
      await service().handleUpdate('fakegram', { unrelated: true });
      expect(fake.sent).toHaveLength(0);
    });

    it('re-binding a chat with a new code moves it', async () => {
      const { alice } = await bind();
      const other = await createProjectWithInstance(app, alice, { id: 'cred-2', devSandbox: true });
      const link = await request(server()).post(`/projects/${other}/integrations/cred-2/sandbox-link`).set(auth(alice));
      await send({ chat: '42', payload: codeOf(link.body.url) });
      const rows = await app.get<Repository<SandboxBotBinding>>(getRepositoryToken(SandboxBotBinding)).find();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ projectId: other, credentialId: 'cred-2' });
    });
  });

  describe('webhook and runtime wiring', () => {
    it('mounts the webhook handler at /webhooks/sandbox-bots/:vendor when the host has a public URL', async () => {
      vi.stubEnv('GATEWAY_PUBLIC_HOST', 'https://bots.example.test');
      await configureBot('second-token');
      expect(fake.state.ingress?.webhookUrl).toBe('https://bots.example.test/webhooks/sandbox-bots/fakegram');
      expect(fake.state.ingress?.secret).toMatch(/^[\w-]{20,}$/);
      const seen: string[] = [];
      fake.state.ingress?.registerWebHook(async (req) => {
        seen.push(await req.text());
        return new Response(null, { status: 200 });
      });
      await request(server()).post('/webhooks/sandbox-bots/fakegram').send({ chat: '1' }).expect(201);
      expect(seen).toEqual([JSON.stringify({ chat: '1' })]);
      await request(server()).post('/webhooks/sandbox-bots/nope').send({}).expect(404);
    });

    it('polls (no webhook URL) without a public host', async () => {
      await configureBot();
      expect(fake.state.ingress?.webhookUrl).toBeNull();
    });

    it('registers itself as the gateway runtime sandbox port', async () => {
      await configureBot();
      const restart = vi.spyOn(app.get(IntegrationsRuntimeService), 'restartSandboxTargets');
      await configureBot('another-token');
      expect(restart).toHaveBeenCalledWith('fakegram');
    });
  });
});
